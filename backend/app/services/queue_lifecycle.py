"""
CampusCare Queue Lifecycle & State Transition Engine.

Enforces:
1. Strict State Machine transitions across VISIT and QUEUE_ENTRY.
2. Concurrency-safe queue sequence number allocation via doctor row locking.
3. Conflict prevention: single active visit per student rule.
4. Comprehensive immutable audit logging into VISIT_EVENT with server-validated user IDs.
"""

from datetime import date
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Active visit states that prohibit concurrent check-in
ACTIVE_VISIT_STATES = (
    "CHECKED_IN",
    "WAITING_FOR_DOCTOR",
    "CALLED",
    "IN_CONSULTATION",
    "WAITING_FOR_MEDICINE",
)

TERMINAL_VISIT_STATES = (
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
)


class QueueLifecycleError(Exception):
    """Base exception for queue lifecycle domain errors."""
    pass


class ResourceNotFoundError(QueueLifecycleError):
    """Raised when a visit, student, or doctor cannot be found."""
    pass


class ActiveVisitConflictError(QueueLifecycleError):
    """Raised when attempting to check in a student who already has an active visit."""
    pass


class DoctorUnavailableError(QueueLifecycleError):
    """Raised when assigned doctor is marked unavailable today."""
    pass


class InvalidTransitionError(QueueLifecycleError):
    """Raised when an illegal status transition is attempted."""
    pass


class UnauthorizedActionError(QueueLifecycleError):
    """Raised when an actor is not permitted to perform the action on this visit/queue entry."""
    pass


def _is_mysql(conn) -> bool:
    """Helper to detect MySQL vs SQLite wrapper."""
    return not conn.__class__.__name__.startswith("SQLite")


def get_active_visit_for_student(cursor, roll_number: str, for_update: bool = False) -> Optional[Dict[str, Any]]:
    """Checks if a student already has an active visit in progress."""
    placeholders = ",".join(["%s"] * len(ACTIVE_VISIT_STATES))
    lock_clause = " FOR UPDATE" if for_update and hasattr(cursor, "execute") else ""
    cursor.execute(
        f"""
        SELECT visit_id, roll_number, doctor_id, status, checked_in_at
        FROM VISIT
        WHERE roll_number = %s AND status IN ({placeholders})
        ORDER BY checked_in_at DESC
        LIMIT 1{lock_clause}
        """,
        (roll_number, *ACTIVE_VISIT_STATES),
    )
    return cursor.fetchone()


def allocate_next_queue_sequence(cursor, doctor_id: int, conn) -> int:
    """
    Safely allocates the next queue sequence number for a doctor on CURDATE().
    MUST be called while an exclusive lock is held on the doctor's record to prevent race conditions.
    """
    cursor.execute(
        """
        SELECT COALESCE(MAX(queue_sequence), 0) + 1 AS next_seq
        FROM QUEUE_ENTRY
        WHERE doctor_id = %s AND DATE(entered_at) = CURDATE()
        """,
        (doctor_id,),
    )
    row = cursor.fetchone()
    return int(row["next_seq"]) if row and row.get("next_seq") is not None else 1


def check_in_student(
    conn,
    roll_number: str,
    doctor_id: int,
    performed_by_user_id: int,
    complaint: Optional[str] = None,
    via: str = "MANUAL",
) -> Dict[str, Any]:
    """
    Checks a student into a doctor's queue.
    Prevents conflicting active visits by locking the student record.
    Allocates sequence number safely by locking the doctor record.
    """
    roll_number = roll_number.strip()
    with conn.cursor() as cur:
        # 1. Lock doctor record first to serialize sequence allocation and queue modifications
        if _is_mysql(conn):
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s FOR UPDATE", (doctor_id,))
        else:
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (doctor_id,))
        doctor = cur.fetchone()
        if not doctor:
            raise ResourceNotFoundError(f"Doctor #{doctor_id} not found.")

        lock_avail = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT status FROM DOCTOR_AVAILABILITY
            WHERE doctor_id = %s AND availability_date = CURDATE()
            LIMIT 1{lock_avail}
            """,
            (doctor_id,),
        )
        avail = cur.fetchone()
        if avail and avail.get("status") == "UNAVAILABLE":
            raise DoctorUnavailableError(f"Doctor #{doctor_id} is marked unavailable today.")

        # 2. Lock student record to serialize concurrent check-in attempts
        if _is_mysql(conn):
            cur.execute("SELECT roll_number, full_name, status FROM STUDENT WHERE roll_number = %s FOR UPDATE", (roll_number,))
        else:
            cur.execute("SELECT roll_number, full_name, status FROM STUDENT WHERE roll_number = %s", (roll_number,))
        student = cur.fetchone()
        if not student:
            raise ResourceNotFoundError(f"Student with roll number '{roll_number}' not found.")
        if student.get("status") == "INACTIVE":
            raise InvalidTransitionError("Student account is inactive.")

        # 3. Check for active visit
        active_visit = get_active_visit_for_student(cur, roll_number, for_update=True)
        if active_visit:
            raise ActiveVisitConflictError(
                f"Student '{roll_number}' already has an active visit in progress (Status: {active_visit['status']})."
            )

        # 4. Create new visit
        cur.execute(
            """
            INSERT INTO VISIT (roll_number, doctor_id, status, checked_in_at)
            VALUES (%s, %s, 'WAITING_FOR_DOCTOR', NOW())
            """,
            (roll_number, doctor_id),
        )
        visit_id = cur.lastrowid

        # 5. Allocate sequence safely under doctor lock
        seq = allocate_next_queue_sequence(cur, doctor_id, conn)

        # 6. Insert Queue Entry
        cur.execute(
            """
            INSERT INTO QUEUE_ENTRY
                (visit_id, doctor_id, queue_sequence, status, entered_at, queue_data, entry_reason)
            VALUES (%s, %s, %s, 'WAITING', NOW(), NOW(), 'INITIAL_CHECKIN')
            """,
            (visit_id, doctor_id, seq),
        )
        queue_entry_id = cur.lastrowid

        # 7. Audit log in VISIT_EVENT
        note = f"{via} check-in" + (f" - {complaint}" if complaint else "")
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'CHECKED_IN', %s, %s)
            """,
            (visit_id, performed_by_user_id, note[:500]),
        )

        # 8. Compute current line position
        cur.execute(
            "SELECT COUNT(*) AS n FROM QUEUE_ENTRY WHERE doctor_id = %s AND status = 'WAITING'",
            (doctor_id,),
        )
        pos_row = cur.fetchone()
        position = pos_row["n"] if pos_row else 1

    return {
        "visitId": visit_id,
        "queueEntryId": queue_entry_id,
        "queueNo": seq,
        "position": position,
        "doctorId": doctor_id,
        "rollNumber": roll_number,
        "name": student["full_name"],
        "status": "WAITING_FOR_DOCTOR",
    }


def call_next_patient(
    conn,
    doctor_id: int,
    performed_by_user_id: int,
) -> Dict[str, Any]:
    """
    Called by a doctor to advance their queue and start consultation.
    If the doctor already has a patient in consultation, returns existing session (idempotent).
    Safe against concurrent requests via doctor row locking.
    """
    with conn.cursor() as cur:
        # 1. Lock doctor row first to serialize call-next operations for this doctor
        if _is_mysql(conn):
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s FOR UPDATE", (doctor_id,))
        else:
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (doctor_id,))
        doctor_row = cur.fetchone()
        if not doctor_row:
            raise ResourceNotFoundError(f"Doctor #{doctor_id} not found.")

        # 2. Check if already in consultation
        cur.execute(
            """
            SELECT qe.queue_entry_id, qe.queue_sequence, v.visit_id, v.roll_number, st.full_name
            FROM QUEUE_ENTRY qe
            JOIN VISIT v ON v.visit_id = qe.visit_id
            JOIN STUDENT st ON st.roll_number = v.roll_number
            WHERE qe.doctor_id = %s AND qe.status = 'IN_CONSULTATION'
            LIMIT 1
            """,
            (doctor_id,),
        )
        existing = cur.fetchone()
        if existing:
            return {
                "status": "already_in_consultation",
                "queueEntryId": existing["queue_entry_id"],
                "queue_entry_id": existing["queue_entry_id"],
                "visitId": existing["visit_id"],
                "visit_id": existing["visit_id"],
                "rollNumber": existing["roll_number"],
                "roll_number": existing["roll_number"],
                "name": existing["full_name"],
                "sequence": existing["queue_sequence"],
                "queueNo": existing["queue_sequence"],
                "queue_number": existing["queue_sequence"],
                "doctorId": doctor_id,
                "doctor_id": doctor_id,
            }

        # 3. Fetch next waiting patient in line
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT qe.queue_entry_id, qe.queue_sequence, v.visit_id, v.roll_number, st.full_name
            FROM QUEUE_ENTRY qe
            JOIN VISIT v ON v.visit_id = qe.visit_id
            JOIN STUDENT st ON st.roll_number = v.roll_number
            WHERE qe.doctor_id = %s AND qe.status = 'WAITING'
            ORDER BY qe.queue_sequence ASC, qe.entered_at ASC
            LIMIT 1{lock_clause}
            """,
            (doctor_id,),
        )
        next_patient = cur.fetchone()
        if not next_patient:
            raise ResourceNotFoundError("No patients currently waiting in queue.")

        queue_entry_id = next_patient["queue_entry_id"]
        visit_id = next_patient["visit_id"]

        # Lock the visit row
        if _is_mysql(conn):
            cur.execute("SELECT visit_id, status FROM VISIT WHERE visit_id = %s FOR UPDATE", (visit_id,))

        # Advance QUEUE_ENTRY to IN_CONSULTATION
        cur.execute(
            """
            UPDATE QUEUE_ENTRY
            SET status = 'IN_CONSULTATION', called_at = NOW()
            WHERE queue_entry_id = %s
            """,
            (queue_entry_id,),
        )

        # Advance VISIT to IN_CONSULTATION
        cur.execute(
            """
            UPDATE VISIT
            SET status = 'IN_CONSULTATION', consultation_started_at = NOW()
            WHERE visit_id = %s
            """,
            (visit_id,),
        )

        # Audit log in VISIT_EVENT
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'CONSULTATION_STARTED', %s, %s)
            """,
            (visit_id, performed_by_user_id, f"Called by Doctor #{doctor_id}"),
        )

    return {
        "status": "called",
        "queueEntryId": queue_entry_id,
        "queue_entry_id": queue_entry_id,
        "visitId": visit_id,
        "visit_id": visit_id,
        "rollNumber": next_patient["roll_number"],
        "roll_number": next_patient["roll_number"],
        "name": next_patient["full_name"],
        "sequence": next_patient["queue_sequence"],
        "queueNo": next_patient["queue_sequence"],
        "queue_number": next_patient["queue_sequence"],
        "doctorId": doctor_id,
        "doctor_id": doctor_id,
    }


def start_consultation(
    conn,
    doctor_id: int,
    visit_id: int,
    performed_by_user_id: int,
) -> Dict[str, Any]:
    """
    Explicitly starts consultation for a specific visit assigned to the doctor.
    Safe against concurrent requests via doctor and visit row-locking.
    """
    with conn.cursor() as cur:
        # 1. Lock doctor row first to serialize transitions for this doctor
        if _is_mysql(conn):
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s FOR UPDATE", (doctor_id,))
        else:
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (doctor_id,))
        doctor_row = cur.fetchone()
        if not doctor_row:
            raise ResourceNotFoundError(f"Doctor #{doctor_id} not found.")

        # 2. Check if this doctor currently has ANY active consultation
        cur.execute(
            """
            SELECT qe.queue_entry_id, qe.queue_sequence, v.visit_id, v.roll_number, st.full_name
            FROM QUEUE_ENTRY qe
            JOIN VISIT v ON v.visit_id = qe.visit_id
            JOIN STUDENT st ON st.roll_number = v.roll_number
            WHERE qe.doctor_id = %s AND qe.status = 'IN_CONSULTATION'
            LIMIT 1
            """,
            (doctor_id,),
        )
        active_consult = cur.fetchone()
        if active_consult:
            if active_consult["visit_id"] == visit_id:
                # Idempotent call for the same consultation session
                return {
                    "status": "already_in_consultation",
                    "queueEntryId": active_consult["queue_entry_id"],
                    "queue_entry_id": active_consult["queue_entry_id"],
                    "visitId": active_consult["visit_id"],
                    "visit_id": active_consult["visit_id"],
                    "rollNumber": active_consult["roll_number"],
                    "roll_number": active_consult["roll_number"],
                    "name": active_consult["full_name"],
                    "sequence": active_consult["queue_sequence"],
                    "queueNo": active_consult["queue_sequence"],
                    "queue_number": active_consult["queue_sequence"],
                    "doctorId": doctor_id,
                    "doctor_id": doctor_id,
                }
            else:
                raise InvalidTransitionError(
                    f"Doctor #{doctor_id} already has an active consultation with visit #{active_consult['visit_id']}. "
                    "Complete or finalize the active consultation before starting another."
                )

        # 3. Lock target visit and its active queue entry
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT v.visit_id, v.roll_number, v.doctor_id, v.status AS visit_status,
                   qe.queue_entry_id, qe.queue_sequence, qe.status AS queue_status, st.full_name
            FROM VISIT v
            JOIN STUDENT st ON st.roll_number = v.roll_number
            LEFT JOIN QUEUE_ENTRY qe ON qe.visit_id = v.visit_id AND qe.status IN ('WAITING', 'IN_CONSULTATION')
            WHERE v.visit_id = %s{lock_clause}
            """,
            (visit_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ResourceNotFoundError(f"Visit #{visit_id} not found.")

        if row["doctor_id"] != doctor_id:
            raise InvalidTransitionError(
                f"Cannot start consultation: Visit #{visit_id} is assigned to Doctor #{row['doctor_id']}, not Doctor #{doctor_id}."
            )

        if row["visit_status"] in ("COMPLETED", "CANCELLED", "NO_SHOW", "WAITING_FOR_MEDICINE"):
            raise InvalidTransitionError(
                f"Cannot start consultation for visit #{visit_id} in status '{row['visit_status']}'."
            )

        if not row.get("queue_entry_id"):
            raise InvalidTransitionError(f"Visit #{visit_id} has no active waiting queue entry.")

        queue_entry_id = row["queue_entry_id"]

        # 4. Advance QUEUE_ENTRY to IN_CONSULTATION
        cur.execute(
            """
            UPDATE QUEUE_ENTRY
            SET status = 'IN_CONSULTATION', called_at = NOW()
            WHERE queue_entry_id = %s
            """,
            (queue_entry_id,),
        )

        # 5. Advance VISIT to IN_CONSULTATION
        cur.execute(
            """
            UPDATE VISIT
            SET status = 'IN_CONSULTATION', consultation_started_at = NOW()
            WHERE visit_id = %s
            """,
            (visit_id,),
        )

        # 6. Audit log in VISIT_EVENT
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'CONSULTATION_STARTED', %s, %s)
            """,
            (visit_id, performed_by_user_id, f"Consultation explicitly started by Doctor #{doctor_id}"),
        )

    return {
        "status": "in_consultation",
        "queueEntryId": queue_entry_id,
        "queue_entry_id": queue_entry_id,
        "visitId": visit_id,
        "visit_id": visit_id,
        "rollNumber": row["roll_number"],
        "roll_number": row["roll_number"],
        "name": row["full_name"],
        "sequence": row["queue_sequence"],
        "queueNo": row["queue_sequence"],
        "queue_number": row["queue_sequence"],
        "doctorId": doctor_id,
        "doctor_id": doctor_id,
    }


def mark_no_show(
    conn,
    visit_id: int,
    doctor_id: Optional[int],
    performed_by_user_id: int,
    reason: str = "Patient did not report to cabin when called",
) -> Dict[str, Any]:
    """
    Marks a visit and active queue entry as NO_SHOW.
    Allowed only from WAITING_FOR_DOCTOR, CALLED, or IN_CONSULTATION.
    """
    with conn.cursor() as cur:
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT v.visit_id, v.doctor_id, v.status as visit_status, v.roll_number,
                   qe.queue_entry_id, qe.status as queue_status
            FROM VISIT v
            LEFT JOIN QUEUE_ENTRY qe ON qe.visit_id = v.visit_id AND qe.status IN ('WAITING', 'IN_CONSULTATION')
            WHERE v.visit_id = %s{lock_clause}
            """,
            (visit_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ResourceNotFoundError(f"Visit #{visit_id} not found.")

        if row["visit_status"] == "NO_SHOW":
            return {
                "status": "already_no_show",
                "visitId": visit_id,
                "visit_id": visit_id,
                "rollNumber": row["roll_number"],
                "roll_number": row["roll_number"],
            }

        if row["visit_status"] in ("COMPLETED", "CANCELLED", "WAITING_FOR_MEDICINE"):
            raise InvalidTransitionError(
                f"Cannot mark visit in status '{row['visit_status']}' as no-show."
            )

        if doctor_id is not None and row["doctor_id"] != doctor_id:
            raise InvalidTransitionError("Cannot mark no-show for a patient assigned to another doctor.")

        # Update active queue entry if one exists
        if row.get("queue_entry_id"):
            cur.execute(
                """
                UPDATE QUEUE_ENTRY
                SET status = 'NO_SHOW', exited_at = NOW(), exit_reason = 'NO_SHOW'
                WHERE queue_entry_id = %s
                """,
                (row["queue_entry_id"],),
            )

        # Update VISIT
        cur.execute(
            "UPDATE VISIT SET status = 'NO_SHOW' WHERE visit_id = %s",
            (visit_id,),
        )

        # Audit event
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'NO_SHOW', %s, %s)
            """,
            (visit_id, performed_by_user_id, reason[:500]),
        )

    return {
        "status": "no_show",
        "visitId": visit_id,
        "visit_id": visit_id,
        "rollNumber": row["roll_number"],
        "roll_number": row["roll_number"],
        "doctorId": row["doctor_id"],
        "doctor_id": row["doctor_id"],
    }


def requeue_patient(
    conn,
    visit_id: int,
    target_doctor_id: int,
    performed_by_user_id: int,
    reason: str = "Patient reported after no-show; requeued",
) -> Dict[str, Any]:
    """
    Requeues a patient whose visit was in NO_SHOW status back into a doctor's waiting line.
    Creates a new QUEUE_ENTRY with entry_reason = 'NO_SHOW_RESCHEDULE'.
    """
    with conn.cursor() as cur:
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"SELECT visit_id, roll_number, status, doctor_id FROM VISIT WHERE visit_id = %s{lock_clause}",
            (visit_id,),
        )
        visit = cur.fetchone()
        if not visit:
            raise ResourceNotFoundError(f"Visit #{visit_id} not found.")

        if visit["status"] != "NO_SHOW":
            raise InvalidTransitionError(
                f"Only visits in NO_SHOW status can be requeued. Current status is '{visit['status']}'."
            )

        # Lock student record to ensure no other active visit was started in the interim
        if _is_mysql(conn):
            cur.execute("SELECT roll_number FROM STUDENT WHERE roll_number = %s FOR UPDATE", (visit["roll_number"],))

        # Check for any active visit conflicts
        active_conflict = get_active_visit_for_student(cur, visit["roll_number"], for_update=True)
        if active_conflict and active_conflict["visit_id"] != visit_id:
            raise ActiveVisitConflictError(
                f"Cannot requeue: Student '{visit['roll_number']}' already has an active visit in progress (Visit #{active_conflict['visit_id']}, Status: {active_conflict['status']})."
            )

        # Lock target doctor record
        if _is_mysql(conn):
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s FOR UPDATE", (target_doctor_id,))
        else:
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (target_doctor_id,))
        doc = cur.fetchone()
        if not doc:
            raise ResourceNotFoundError(f"Target doctor #{target_doctor_id} not found.")

        # Check target doctor availability
        lock_avail = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT availability_id, status FROM DOCTOR_AVAILABILITY
            WHERE doctor_id = %s AND availability_date = CURDATE()
            LIMIT 1{lock_avail}
            """,
            (target_doctor_id,),
        )
        avail = cur.fetchone()
        if avail and avail.get("status") and avail["status"].upper() == "UNAVAILABLE":
            raise DoctorUnavailableError(f"Doctor #{target_doctor_id} is marked UNAVAILABLE today.")

        # Allocate sequence under doctor lock
        seq = allocate_next_queue_sequence(cur, target_doctor_id, conn)

        # Insert new QUEUE_ENTRY
        cur.execute(
            """
            INSERT INTO QUEUE_ENTRY
                (visit_id, doctor_id, queue_sequence, status, entered_at, queue_data, entry_reason)
            VALUES (%s, %s, %s, 'WAITING', NOW(), NOW(), 'NO_SHOW_RESCHEDULE')
            """,
            (visit_id, target_doctor_id, seq),
        )
        new_queue_entry_id = cur.lastrowid

        # Update VISIT back to WAITING_FOR_DOCTOR
        cur.execute(
            """
            UPDATE VISIT
            SET status = 'WAITING_FOR_DOCTOR', doctor_id = %s
            WHERE visit_id = %s
            """,
            (target_doctor_id, visit_id),
        )

        # Audit log in VISIT_EVENT
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'QUEUED_JOINED_PATIENT', %s, %s)
            """,
            (visit_id, performed_by_user_id, reason[:500]),
        )

    return {
        "status": "requeued",
        "visitId": visit_id,
        "visit_id": visit_id,
        "queueEntryId": new_queue_entry_id,
        "queue_entry_id": new_queue_entry_id,
        "queueNo": seq,
        "queue_number": seq,
        "sequence": seq,
        "doctorId": target_doctor_id,
        "doctor_id": target_doctor_id,
        "rollNumber": visit["roll_number"],
        "roll_number": visit["roll_number"],
    }


def redirect_patient(
    conn,
    visit_id: int,
    target_doctor_id: int,
    performed_by_user_id: int,
    current_doctor_id: Optional[int] = None,
    reason: str = "Doctor referral / triage redirect",
) -> Dict[str, Any]:
    """
    Redirects a patient from one doctor to another.
    Exits old QUEUE_ENTRY as REDIRECTED, inserts new QUEUE_ENTRY under target doctor as DOCTOR_REDIRECT.
    """
    with conn.cursor() as cur:
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT v.visit_id, v.doctor_id, v.status, v.roll_number,
                   qe.queue_entry_id, qe.status as queue_status
            FROM VISIT v
            JOIN QUEUE_ENTRY qe ON qe.visit_id = v.visit_id AND qe.status IN ('WAITING', 'IN_CONSULTATION')
            WHERE v.visit_id = %s{lock_clause}
            """,
            (visit_id,),
        )
        row = cur.fetchone()
        if not row:
            raise InvalidTransitionError(f"No active queue entry found for visit #{visit_id} to redirect.")

        if current_doctor_id is not None and row["doctor_id"] != current_doctor_id:
            raise InvalidTransitionError("Doctor can only redirect visits assigned to their own clinic.")

        if row["doctor_id"] == target_doctor_id:
            raise InvalidTransitionError("Target doctor cannot be the same as current doctor.")

        # Lock target doctor
        if _is_mysql(conn):
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s FOR UPDATE", (target_doctor_id,))
        else:
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (target_doctor_id,))
        target_doc = cur.fetchone()
        if not target_doc:
            raise ResourceNotFoundError(f"Target doctor #{target_doctor_id} not found.")

        # Check target doctor availability
        lock_avail = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT availability_id, status FROM DOCTOR_AVAILABILITY
            WHERE doctor_id = %s AND availability_date = CURDATE()
            LIMIT 1{lock_avail}
            """,
            (target_doctor_id,),
        )
        avail = cur.fetchone()
        if avail and avail.get("status") and avail["status"].upper() == "UNAVAILABLE":
            raise DoctorUnavailableError(f"Doctor #{target_doctor_id} is marked UNAVAILABLE today.")

        # Exit old queue entry
        cur.execute(
            """
            UPDATE QUEUE_ENTRY
            SET status = 'REDIRECTED', exited_at = NOW(), exit_reason = 'REDIRECTED'
            WHERE queue_entry_id = %s
            """,
            (row["queue_entry_id"],),
        )

        # Allocate sequence under target doctor
        seq = allocate_next_queue_sequence(cur, target_doctor_id, conn)

        # Insert new QUEUE_ENTRY for target doctor
        cur.execute(
            """
            INSERT INTO QUEUE_ENTRY
                (visit_id, doctor_id, queue_sequence, status, entered_at, queue_data, entry_reason)
            VALUES (%s, %s, %s, 'WAITING', NOW(), NOW(), 'DOCTOR_REDIRECT')
            """,
            (visit_id, target_doctor_id, seq),
        )
        new_queue_entry_id = cur.lastrowid

        # Update VISIT assigned doctor and state
        cur.execute(
            """
            UPDATE VISIT
            SET doctor_id = %s, status = 'WAITING_FOR_DOCTOR'
            WHERE visit_id = %s
            """,
            (target_doctor_id, visit_id),
        )

        # Audit log in VISIT_EVENT
        if row.get("queue_status") == "IN_CONSULTATION":
            audit_note = f"Redirected during consultation from Doctor #{row['doctor_id']} to Doctor #{target_doctor_id}: {reason}"
        else:
            audit_note = f"Redirected from Doctor #{row['doctor_id']} to Doctor #{target_doctor_id}: {reason}"

        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'REDIRECTED', %s, %s)
            """,
            (visit_id, performed_by_user_id, audit_note[:500]),
        )

    return {
        "status": "redirected",
        "visitId": visit_id,
        "visit_id": visit_id,
        "oldDoctorId": row["doctor_id"],
        "old_doctor_id": row["doctor_id"],
        "newDoctorId": target_doctor_id,
        "new_doctor_id": target_doctor_id,
        "doctorId": target_doctor_id,
        "doctor_id": target_doctor_id,
        "newQueueNo": seq,
        "new_queue_no": seq,
        "queueNo": seq,
        "queue_number": seq,
        "queueEntryId": new_queue_entry_id,
        "queue_entry_id": new_queue_entry_id,
        "rollNumber": row["roll_number"],
        "roll_number": row["roll_number"],
    }


def complete_consultation(
    conn,
    doctor_id: int,
    visit_id: Optional[int] = None,
    roll_number: Optional[str] = None,
    diagnosis: str = "",
    reason_for_visit: Optional[str] = None,
    clinical_notes: Optional[str] = None,
    general_instructions: Optional[str] = None,
    medicines: Optional[List[Dict[str, Any]]] = None,
    performed_by_user_id: int = 1,
) -> Dict[str, Any]:
    """
    Completes doctor consultation, saves prescription records, and transitions
    VISIT to WAITING_FOR_MEDICINE and active QUEUE_ENTRY to COMPLETED.
    Enforces:
    - Accurate visit resolution via visit_id or roll_number.
    - Verified doctor assignment ownership (prevents doctor mismatch).
    - Status validation: VISIT must be in active consultation.
    - Duplicate finalization prevention: rejects re-finalizing existing prescriptions.
    - Atomic persistence: CONSULTATION, PRESCRIPTION, PRESCRIPTION_ITEM, PRESCRIPTION_DOSE in one transaction.
    - State transition: VISIT moves to WAITING_FOR_MEDICINE only after successful save.
    - Full canonical return payload with identifiers and structured item/dose lists.
    """
    clean_diagnosis = (diagnosis or "").strip()
    if not clean_diagnosis:
        raise InvalidTransitionError("Diagnosis is required and cannot be empty.")

    lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
    with conn.cursor() as cur:
        # 1. Resolve visit & queue entry
        if visit_id is not None:
            cur.execute(
                f"""
                SELECT v.visit_id, v.roll_number, v.doctor_id AS visit_doctor_id, v.status AS visit_status,
                       qe.queue_entry_id, qe.doctor_id AS qe_doctor_id, qe.status AS qe_status
                FROM VISIT v
                LEFT JOIN QUEUE_ENTRY qe ON qe.visit_id = v.visit_id
                    AND qe.status IN ('IN_CONSULTATION', 'WAITING')
                WHERE v.visit_id = %s{lock_clause}
                """,
                (visit_id,),
            )
            row = cur.fetchone()
            if not row:
                raise ResourceNotFoundError(f"Visit #{visit_id} not found.")
        elif roll_number:
            clean_roll = roll_number.strip()
            cur.execute(
                f"""
                SELECT v.visit_id, v.roll_number, v.doctor_id AS visit_doctor_id, v.status AS visit_status,
                       qe.queue_entry_id, qe.doctor_id AS qe_doctor_id, qe.status AS qe_status
                FROM VISIT v
                JOIN QUEUE_ENTRY qe ON qe.visit_id = v.visit_id
                WHERE qe.doctor_id = %s AND v.roll_number = %s
                  AND qe.status IN ('WAITING', 'IN_CONSULTATION')
                ORDER BY qe.entered_at DESC
                LIMIT 1{lock_clause}
                """,
                (doctor_id, clean_roll),
            )
            row = cur.fetchone()
            if not row:
                raise ResourceNotFoundError(
                    f"No active consultation found for student '{clean_roll}' under Doctor #{doctor_id}."
                )
        else:
            cur.execute(
                f"""
                SELECT v.visit_id, v.roll_number, v.doctor_id AS visit_doctor_id, v.status AS visit_status,
                       qe.queue_entry_id, qe.doctor_id AS qe_doctor_id, qe.status AS qe_status
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                WHERE qe.doctor_id = %s AND qe.status = 'IN_CONSULTATION'
                ORDER BY qe.entered_at DESC
                LIMIT 1{lock_clause}
                """,
                (doctor_id,),
            )
            row = cur.fetchone()
            if not row:
                raise ResourceNotFoundError(f"No active consultation found for Doctor #{doctor_id}.")

        actual_visit_id = row["visit_id"]
        actual_roll_number = row["roll_number"]
        queue_entry_id = row["queue_entry_id"]
        visit_doctor_id = row["visit_doctor_id"]
        qe_doctor_id = row["qe_doctor_id"]
        visit_status = row["visit_status"]
        qe_status = row["qe_status"]

        # 2. Verify Doctor Assignment
        assigned_doctor = visit_doctor_id or qe_doctor_id
        if assigned_doctor is not None and assigned_doctor != doctor_id:
            raise UnauthorizedActionError(
                f"Doctor #{doctor_id} is not assigned to Visit #{actual_visit_id} (assigned to Doctor #{assigned_doctor})."
            )

        # 3. Status validation & duplicate prevention
        if visit_status in ("WAITING_FOR_MEDICINE", "COMPLETED"):
            raise InvalidTransitionError(
                f"Visit #{actual_visit_id} has already been completed/finalized (current status: '{visit_status}')."
            )

        if visit_status in ("NO_SHOW", "CANCELLED", "CHECKED_IN", "WAITING_FOR_DOCTOR"):
            raise InvalidTransitionError(
                f"Cannot complete consultation for Visit #{actual_visit_id} in status '{visit_status}'. Expected 'IN_CONSULTATION'."
            )

        cur.execute(
            f"SELECT consultation_id FROM CONSULTATION WHERE visit_id = %s{lock_clause}",
            (actual_visit_id,),
        )
        existing_consult = cur.fetchone()
        if existing_consult:
            raise InvalidTransitionError(
                f"Visit #{actual_visit_id} already has a finalized consultation #{existing_consult['consultation_id']}. Overwriting or duplicate finalization is prohibited."
            )

        # 4. Insert Consultation record
        resolved_reason = (reason_for_visit or "").strip() or clean_diagnosis or "General Consultation"
        cur.execute(
            """
            INSERT INTO CONSULTATION (visit_id, doctor_id, reason_for_visit, diagnosis, clinical_notes)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (actual_visit_id, doctor_id, resolved_reason, clean_diagnosis, (clinical_notes or "").strip() or None),
        )
        consultation_id = cur.lastrowid

        # 5. Insert Prescription record
        cur.execute(
            """
            INSERT INTO PRESCRIPTION (consultation_id, general_instructions, finalized_at)
            VALUES (%s, %s, NOW())
            """,
            (consultation_id, (general_instructions or "").strip() or None),
        )
        prescription_id = cur.lastrowid

        # 6. Insert Prescription Items & Doses
        import re
        saved_items = []
        medicines_list = medicines or []

        for med in medicines_list:
            name = (med.get("name") or med.get("medicine_name") or med.get("medicineName") or "").strip()
            if not name:
                continue

            strength = med.get("strength")
            if not strength:
                st_match = re.search(r"(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|%))", name, re.IGNORECASE)
                if st_match:
                    strength = st_match.group(1)

            dosage_form = med.get("dosage_form") or med.get("dosageForm") or med.get("category")
            if not dosage_form:
                nl = name.lower()
                if "tablet" in nl or "tab" in nl:
                    dosage_form = "Tablet"
                elif "capsule" in nl or "cap" in nl:
                    dosage_form = "Capsule"
                elif "syrup" in nl or "syp" in nl:
                    dosage_form = "Syrup"
                elif "inhaler" in nl:
                    dosage_form = "Inhaler"
                elif "ointment" in nl or "cream" in nl or "gel" in nl:
                    dosage_form = "Ointment"
                elif "drop" in nl:
                    dosage_form = "Drops"
                elif "inj" in nl:
                    dosage_form = "Injection"
                else:
                    dosage_form = "Tablet"

            route = med.get("route")
            if not route:
                if dosage_form in ("Tablet", "Capsule", "Syrup"):
                    route = "Oral"
                elif dosage_form in ("Ointment", "Gel"):
                    route = "Topical"
                elif dosage_form in ("Inhaler",):
                    route = "Inhalation"
                elif dosage_form in ("Drops",):
                    route = "Ophthalmic/Otic"
                else:
                    route = "Oral"

            duration_val = med.get("duration_value") if med.get("duration_value") is not None else med.get("durationValue")
            duration_unit = med.get("duration_unit") or med.get("durationUnit")
            if duration_val is None and med.get("duration"):
                d_str = str(med.get("duration")).strip().lower()
                dur_match = re.search(r"(\d+)\s*(day|week|month)s?", d_str)
                if dur_match:
                    duration_val = int(dur_match.group(1))
                    duration_unit = dur_match.group(2).upper()

            if duration_val is not None and not duration_unit:
                duration_unit = "DAY"
            if duration_unit:
                duration_unit = duration_unit.upper()
                if duration_unit not in ("DAY", "WEEK", "MONTH"):
                    duration_unit = "DAY"

            meal_rel = med.get("meal_relation") or med.get("mealRelation")
            if meal_rel:
                meal_rel = meal_rel.upper().replace(" ", "_")
                if meal_rel not in ("BEFORE_MEAL", "AFTER_MEAL", "WITH_MEAL", "ANY_TIME", "NOT_APPLICABLE"):
                    meal_rel = "AFTER_MEAL"
            else:
                check_text = (str(med.get("special_instructions") or "") + " " +
                              str(med.get("specialInstructions") or "") + " " +
                              str(med.get("instructions") or "") + " " +
                              str(med.get("note") or "")).lower()
                if "after" in check_text:
                    meal_rel = "AFTER_MEAL"
                elif "before" in check_text or "empty" in check_text:
                    meal_rel = "BEFORE_MEAL"
                elif "with" in check_text:
                    meal_rel = "WITH_MEAL"
                elif "bedtime" in check_text:
                    meal_rel = "AFTER_MEAL"
                else:
                    meal_rel = "AFTER_MEAL"

            special_inst = (med.get("special_instructions") or
                            med.get("specialInstructions") or
                            med.get("instructions") or
                            med.get("note") or "").strip() or None

            cur.execute(
                """
                INSERT INTO PRESCRIPTION_ITEM (
                    prescription_id, medicine_name, strength, dosage_form, route,
                    duration_value, duration_unit, meal_relation, special_instructions
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    prescription_id,
                    name[:150],
                    strength[:50] if strength else None,
                    dosage_form[:50] if dosage_form else None,
                    route[:50] if route else None,
                    duration_val,
                    duration_unit,
                    meal_rel,
                    special_inst,
                ),
            )
            item_id = cur.lastrowid

            doses_to_insert = []
            explicit_doses = med.get("doses")

            if explicit_doses and isinstance(explicit_doses, list):
                for d in explicit_doses:
                    tod = str(d.get("time_of_day") or d.get("timeOfDay") or "").strip().upper()
                    if tod in ("MORNING", "AFTERNOON", "EVENING", "NIGHT"):
                        qty = float(d.get("dose_quantity") if d.get("dose_quantity") is not None else (d.get("doseQuantity") or 1.0))
                        unit = str(d.get("dose_unit") or d.get("doseUnit") or "dose")
                        doses_to_insert.append((tod, qty, unit))
            else:
                flag_morning = bool(med.get("morning"))
                flag_afternoon = bool(med.get("afternoon"))
                flag_evening = bool(med.get("evening"))
                flag_night = bool(med.get("night"))

                dosage_str = str(med.get("dosage") or "").strip().lower()
                if not (flag_morning or flag_afternoon or flag_evening or flag_night) and dosage_str:
                    if dosage_str in ("od", "1-0-0", "once daily"):
                        flag_morning = True
                    elif dosage_str in ("bd", "bid", "1-0-1", "twice daily"):
                        flag_morning = True
                        flag_night = True
                    elif dosage_str in ("tid", "1-1-1", "thrice daily"):
                        flag_morning = True
                        flag_afternoon = True
                        flag_night = True
                    elif dosage_str in ("qid", "1-1-1-1", "four times daily"):
                        flag_morning = True
                        flag_afternoon = True
                        flag_evening = True
                        flag_night = True
                    elif dosage_str in ("0-0-1", "hs", "night", "bedtime"):
                        flag_night = True
                    elif "1-0-1" in dosage_str:
                        flag_morning = True
                        flag_night = True
                    elif "1-1-1" in dosage_str:
                        flag_morning = True
                        flag_afternoon = True
                        flag_night = True

                dose_qty = float(med.get("dose_quantity") if med.get("dose_quantity") is not None else (med.get("doseQuantity") or 1.0))
                dose_unit = str(med.get("dose_unit") or med.get("doseUnit") or "dose")

                if flag_morning:
                    doses_to_insert.append(("MORNING", dose_qty, dose_unit))
                if flag_afternoon:
                    doses_to_insert.append(("AFTERNOON", dose_qty, dose_unit))
                if flag_evening:
                    doses_to_insert.append(("EVENING", dose_qty, dose_unit))
                if flag_night:
                    doses_to_insert.append(("NIGHT", dose_qty, dose_unit))

            seen_tod = set()
            saved_doses = []
            for tod, qty, unit in doses_to_insert:
                if tod in seen_tod:
                    continue
                seen_tod.add(tod)
                cur.execute(
                    """
                    INSERT INTO PRESCRIPTION_DOSE (prescription_item_id, time_of_day, dose_quantity, dose_unit)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (item_id, tod, qty, unit[:30]),
                )
                saved_doses.append({
                    "time_of_day": tod,
                    "timeOfDay": tod,
                    "dose_quantity": qty,
                    "doseQuantity": qty,
                    "dose_unit": unit,
                    "doseUnit": unit,
                })

            saved_items.append({
                "prescription_item_id": item_id,
                "prescriptionItemId": item_id,
                "medicine_name": name,
                "medicineName": name,
                "strength": strength,
                "dosage_form": dosage_form,
                "dosageForm": dosage_form,
                "route": route,
                "duration_value": duration_val,
                "durationValue": duration_val,
                "duration_unit": duration_unit,
                "durationUnit": duration_unit,
                "meal_relation": meal_rel,
                "mealRelation": meal_rel,
                "special_instructions": special_inst,
                "specialInstructions": special_inst,
                "doses": saved_doses,
            })

        # 7. Complete QUEUE_ENTRY
        if queue_entry_id:
            cur.execute(
                """
                UPDATE QUEUE_ENTRY
                SET status = 'COMPLETED', exited_at = NOW(), exit_reason = 'COMPLETED'
                WHERE queue_entry_id = %s
                """,
                (queue_entry_id,),
            )

        # 8. Transition VISIT to WAITING_FOR_MEDICINE
        cur.execute(
            """
            UPDATE VISIT
            SET status = 'WAITING_FOR_MEDICINE', consultation_completed_at = NOW()
            WHERE visit_id = %s
            """,
            (actual_visit_id,),
        )

        # 9. Audit event
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'CONSULTATION_COMPLETED', %s, %s)
            """,
            (actual_visit_id, performed_by_user_id, f"Diagnosis: {clean_diagnosis}"[:500]),
        )

        # 10. Fetch finalized timestamp
        cur.execute("SELECT finalized_at FROM PRESCRIPTION WHERE prescription_id = %s", (prescription_id,))
        presc_row = cur.fetchone()
        finalized_str = presc_row["finalized_at"].isoformat() if presc_row and presc_row["finalized_at"] else ""

    return {
        "status": "ok",
        "prescription_id": prescription_id,
        "prescriptionId": prescription_id,
        "consultation_id": consultation_id,
        "consultationId": consultation_id,
        "visit_id": actual_visit_id,
        "visitId": actual_visit_id,
        "roll_number": actual_roll_number,
        "rollNumber": actual_roll_number,
        "doctor_id": doctor_id,
        "doctorId": doctor_id,
        "diagnosis": clean_diagnosis,
        "reason_for_visit": resolved_reason,
        "reasonForVisit": resolved_reason,
        "clinical_notes": (clinical_notes or "").strip() or None,
        "clinicalNotes": (clinical_notes or "").strip() or None,
        "general_instructions": (general_instructions or "").strip() or None,
        "generalInstructions": (general_instructions or "").strip() or None,
        "finalized_at": finalized_str,
        "finalizedAt": finalized_str,
        "visit_status": "WAITING_FOR_MEDICINE",
        "visitStatus": "WAITING_FOR_MEDICINE",
        "queue_status": "COMPLETED",
        "queueStatus": "COMPLETED",
        "medicines": saved_items,
        "items": saved_items,
    }


def _calculate_prescription_item_qty(
    dosage_form: Optional[str],
    duration_value: Optional[int],
    duration_unit: Optional[str],
    doses: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Computes expected total quantity, formatted frequency string, and duration days.
    """
    cat = (dosage_form or "").strip().lower()
    is_container = any(k in cat for k in ("syrup", "syp", "inhaler", "ointment", "cream", "gel", "drop", "spray", "liquid", "bottle"))

    # Calculate days
    d_val = duration_value if duration_value is not None and duration_value > 0 else 3
    d_unit = (duration_unit or "DAY").strip().upper()
    if d_unit == "WEEK":
        days = d_val * 7
        duration_text = f"{d_val} week{'s' if d_val > 1 else ''}"
    elif d_unit == "MONTH":
        days = d_val * 30
        duration_text = f"{d_val} month{'s' if d_val > 1 else ''}"
    else:
        days = d_val
        duration_text = f"{d_val} day{'s' if d_val > 1 else ''}"

    # Determine frequency & daily dose sum
    if doses:
        daily_doses = sum(float(d.get("dose_quantity") or 1.0) for d in doses)
        times = [d.get("time_of_day") for d in doses]
        m = 1 if "MORNING" in times else 0
        a = 1 if "AFTERNOON" in times else 0
        n = 1 if ("NIGHT" in times or "EVENING" in times) else 0
        freq_str = f"{m}-{a}-{n}"
    else:
        daily_doses = 1.0
        freq_str = "1-0-0"

    if is_container:
        calc_qty = 1.0
    else:
        calc_qty = float(round(daily_doses * days, 2))

    return {
        "calc_qty": calc_qty,
        "days": days,
        "duration_text": duration_text,
        "frequency": freq_str,
    }


def _resolve_staff_id(cur, user_id: int) -> int:
    cur.execute("SELECT staff_id FROM STAFF WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if row:
        return row["staff_id"]
    # If not in staff, look up user role
    cur.execute("SELECT role FROM USER_ACCOUNT WHERE user_id = %s", (user_id,))
    u = cur.fetchone()
    role = u["role"] if u and u.get("role") in ("ADMIN", "DOCTOR", "RECEPTIONIST") else "RECEPTIONIST"
    cur.execute("INSERT INTO STAFF (user_id, role, status) VALUES (%s, %s, 'ACTIVE')", (user_id, role))
    return cur.lastrowid


def dispense_medication(
    conn,
    visit_id: int,
    performed_by_user_id: int,
    remarks: Optional[str] = "Medicines dispensed at front desk",
    dispensing_status: Optional[str] = None,
    change_reason: Optional[str] = None,
    items: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Confirms medicine dispensing for a visit in WAITING_FOR_MEDICINE,
    transitioning the visit to COMPLETED.
    Persists:
    - DISPENSING record with staff actor, fulfillment status, and variation flags.
    - DISPENSING_ITEM records for each dispensed medicine with verified quantities.
    - VISIT status to COMPLETED with completed_at = NOW().
    - Immutable VISIT_EVENT audit records.
    Idempotent: if visit is already COMPLETED, safely returns already_completed.
    """
    with conn.cursor() as cur:
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"SELECT visit_id, roll_number, doctor_id, status FROM VISIT WHERE visit_id = %s{lock_clause}",
            (visit_id,),
        )
        visit = cur.fetchone()
        if not visit:
            raise ResourceNotFoundError(f"Visit #{visit_id} not found.")

        # Idempotency check: if visit is already COMPLETED, return without error or duplicate records
        if visit["status"] == "COMPLETED":
            cur.execute(
                """
                SELECT dispensing_id, status, was_changed, change_reason, dispensed_by_staff_id
                FROM DISPENSING WHERE visit_id = %s
                """,
                (visit_id,),
            )
            disp_row = cur.fetchone()
            disp_id = disp_row["dispensing_id"] if disp_row else None
            disp_status = disp_row["status"] if disp_row else "DISPENSED"

            existing_items = []
            if disp_id:
                cur.execute(
                    """
                    SELECT dispensing_item_id, prescription_item_id, dispensed_medicine_name,
                           dispensed_strength, dispensed_quantity, was_changed, change_reason
                    FROM DISPENSING_ITEM WHERE dispensing_id = %s
                    ORDER BY dispensing_item_id ASC
                    """,
                    (disp_id,),
                )
                for r in cur.fetchall():
                    qty_val = float(r["dispensed_quantity"]) if r["dispensed_quantity"] is not None else None
                    existing_items.append({
                        "dispensing_item_id": r["dispensing_item_id"],
                        "dispensingItemId": r["dispensing_item_id"],
                        "dispensing_id": disp_id,
                        "dispensingId": disp_id,
                        "prescription_item_id": r["prescription_item_id"],
                        "prescriptionItemId": r["prescription_item_id"],
                        "dispensed_medicine_name": r["dispensed_medicine_name"],
                        "dispensedMedicineName": r["dispensed_medicine_name"],
                        "medicine_name": r["dispensed_medicine_name"],
                        "medicineName": r["dispensed_medicine_name"],
                        "med": r["dispensed_medicine_name"],
                        "dispensed_strength": r["dispensed_strength"],
                        "dispensedStrength": r["dispensed_strength"],
                        "strength": r["dispensed_strength"],
                        "dispensed_quantity": qty_val,
                        "dispensedQuantity": qty_val,
                        "quantity": qty_val,
                        "qty": qty_val,
                        "was_changed": bool(r["was_changed"]),
                        "wasChanged": bool(r["was_changed"]),
                        "change_reason": r["change_reason"],
                        "changeReason": r["change_reason"],
                    })

            return {
                "status": "already_completed",
                "visitId": visit_id,
                "visit_id": visit_id,
                "rollNumber": visit["roll_number"],
                "roll_number": visit["roll_number"],
                "dispensingId": disp_id,
                "dispensing_id": disp_id,
                "dispensingStatus": disp_status,
                "dispensing_status": disp_status,
                "items": existing_items,
            }

        # Status validation: visit MUST be in WAITING_FOR_MEDICINE
        if visit["status"] != "WAITING_FOR_MEDICINE":
            raise InvalidTransitionError(
                f"Cannot dispense visit #{visit_id} in status '{visit['status']}'. Visit must be in WAITING_FOR_MEDICINE."
            )

        # Resolve staff ID
        staff_id = _resolve_staff_id(cur, performed_by_user_id)

        # Fetch consultation and prescription records
        cur.execute(
            """
            SELECT c.consultation_id, p.prescription_id, p.general_instructions
            FROM CONSULTATION c
            LEFT JOIN PRESCRIPTION p ON p.consultation_id = c.consultation_id
            WHERE c.visit_id = %s
            ORDER BY c.consultation_id DESC
            LIMIT 1
            """,
            (visit_id,),
        )
        consult_row = cur.fetchone()
        prescription_id = consult_row["prescription_id"] if consult_row else None

        prescribed_map = {}
        if prescription_id:
            cur.execute(
                """
                SELECT prescription_item_id, medicine_name, strength, dosage_form, route,
                       duration_value, duration_unit, meal_relation, special_instructions
                FROM PRESCRIPTION_ITEM
                WHERE prescription_id = %s
                ORDER BY prescription_item_id ASC
                """,
                (prescription_id,),
            )
            p_items = cur.fetchall()
            for pi in p_items:
                cur.execute(
                    """
                    SELECT time_of_day, dose_quantity, dose_unit
                    FROM PRESCRIPTION_DOSE
                    WHERE prescription_item_id = %s
                    """,
                    (pi["prescription_item_id"],),
                )
                doses = cur.fetchall()
                meta = _calculate_prescription_item_qty(
                    pi.get("dosage_form"),
                    pi.get("duration_value"),
                    pi.get("duration_unit"),
                    doses,
                )
                prescribed_map[pi["prescription_item_id"]] = {
                    "item": pi,
                    "doses": doses,
                    "calc_qty": meta["calc_qty"],
                    "medicine_name": pi["medicine_name"],
                    "strength": pi.get("strength"),
                    "dosage_form": pi.get("dosage_form"),
                }

        # Determine normalized status, changes and variation flags
        norm_status = "DISPENSED"
        was_changed_flag = 0

        raw_status = (dispensing_status or "").strip()
        raw_remarks = (remarks or "").strip()
        raw_change_reason = (change_reason or "").strip()

        if "partial" in raw_status.lower() or raw_status.upper() == "PARTIALLY_DISPENSED":
            norm_status = "PARTIALLY_DISPENSED"
            was_changed_flag = 1
        elif "substitut" in raw_status.lower():
            norm_status = "DISPENSED"
            was_changed_flag = 1

        items_to_save = []
        if items:
            for it in items:
                p_id = it.get("prescription_item_id") or it.get("prescriptionItemId")
                m_name = (it.get("dispensed_medicine_name") or it.get("medicine_name") or it.get("medicineName") or "").strip()
                m_strength = it.get("dispensed_strength") or it.get("dispensedStrength") or it.get("strength")
                q_val = it.get("dispensed_quantity") if it.get("dispensed_quantity") is not None else (it.get("dispensedQuantity") if it.get("dispensedQuantity") is not None else it.get("quantity"))
                it_changed = bool(it.get("was_changed") or it.get("wasChanged"))
                it_reason = (it.get("change_reason") or it.get("changeReason") or "").strip() or None

                if p_id and p_id in prescribed_map:
                    p_info = prescribed_map[p_id]
                    if not m_name:
                        m_name = p_info["medicine_name"]
                    if not m_strength:
                        m_strength = p_info["strength"]
                    expected_qty = p_info["calc_qty"]
                    if q_val is None:
                        q_val = expected_qty
                    else:
                        q_val = float(q_val)
                        if q_val < expected_qty:
                            norm_status = "PARTIALLY_DISPENSED"
                            it_changed = True
                            was_changed_flag = 1
                else:
                    if not m_name:
                        m_name = "Dispensed Medicine"
                    if q_val is None:
                        q_val = 1.0
                    else:
                        q_val = float(q_val)

                if it_changed:
                    was_changed_flag = 1
                if it_reason:
                    was_changed_flag = 1

                items_to_save.append({
                    "prescription_item_id": p_id,
                    "dispensed_medicine_name": m_name,
                    "dispensed_strength": m_strength,
                    "dispensed_quantity": q_val,
                    "was_changed": 1 if it_changed else 0,
                    "change_reason": it_reason,
                })
        else:
            # Full dispensing of all prescribed items
            if prescribed_map:
                for p_id, p_info in prescribed_map.items():
                    items_to_save.append({
                        "prescription_item_id": p_id,
                        "dispensed_medicine_name": p_info["medicine_name"],
                        "dispensed_strength": p_info["strength"],
                        "dispensed_quantity": p_info["calc_qty"],
                        "was_changed": 0,
                        "change_reason": None,
                    })

        # Resolve change reason
        if was_changed_flag:
            final_change_reason = raw_change_reason
            if not final_change_reason and raw_remarks and raw_remarks not in ("Medicines dispensed at front desk", "Medicines dispensed"):
                final_change_reason = raw_remarks
            if norm_status == "PARTIALLY_DISPENSED" and not final_change_reason:
                raise InvalidTransitionError("A reason is required when partially dispensing medications.")
            if not final_change_reason:
                final_change_reason = "Dispensed with substitution / variation"
        else:
            final_change_reason = None

        # Insert DISPENSING record
        cur.execute(
            """
            INSERT INTO DISPENSING (visit_id, dispensed_by_staff_id, status, was_changed, change_reason)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (visit_id, staff_id, norm_status, was_changed_flag, (final_change_reason[:255] if final_change_reason else None)),
        )
        dispensing_id = cur.lastrowid

        # Insert DISPENSING_ITEM records
        saved_item_details = []
        for item_rec in items_to_save:
            cur.execute(
                """
                INSERT INTO DISPENSING_ITEM
                    (dispensing_id, prescription_item_id, dispensed_medicine_name, dispensed_strength, dispensed_quantity, was_changed, change_reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    dispensing_id,
                    item_rec["prescription_item_id"],
                    item_rec["dispensed_medicine_name"][:150],
                    (item_rec["dispensed_strength"][:50] if item_rec["dispensed_strength"] else None),
                    item_rec["dispensed_quantity"],
                    item_rec["was_changed"],
                    (item_rec["change_reason"][:255] if item_rec["change_reason"] else (final_change_reason[:255] if item_rec["was_changed"] and final_change_reason else None)),
                ),
            )
            item_pk = cur.lastrowid
            saved_item_details.append({
                "dispensing_item_id": item_pk,
                "dispensingItemId": item_pk,
                "dispensing_id": dispensing_id,
                "dispensingId": dispensing_id,
                "prescription_item_id": item_rec["prescription_item_id"],
                "prescriptionItemId": item_rec["prescription_item_id"],
                "dispensed_medicine_name": item_rec["dispensed_medicine_name"],
                "dispensedMedicineName": item_rec["dispensed_medicine_name"],
                "medicine_name": item_rec["dispensed_medicine_name"],
                "medicineName": item_rec["dispensed_medicine_name"],
                "med": item_rec["dispensed_medicine_name"],
                "dispensed_strength": item_rec["dispensed_strength"],
                "dispensedStrength": item_rec["dispensed_strength"],
                "strength": item_rec["dispensed_strength"],
                "dispensed_quantity": item_rec["dispensed_quantity"],
                "dispensedQuantity": item_rec["dispensed_quantity"],
                "quantity": item_rec["dispensed_quantity"],
                "qty": item_rec["dispensed_quantity"],
                "was_changed": bool(item_rec["was_changed"]),
                "wasChanged": bool(item_rec["was_changed"]),
                "change_reason": item_rec["change_reason"] or (final_change_reason if item_rec["was_changed"] else None),
                "changeReason": item_rec["change_reason"] or (final_change_reason if item_rec["was_changed"] else None),
            })

        # Transition VISIT to COMPLETED
        cur.execute(
            """
            UPDATE VISIT
            SET status = 'COMPLETED', completed_at = NOW()
            WHERE visit_id = %s
            """,
            (visit_id,),
        )

        # Audit logs in VISIT_EVENT
        audit_note = (
            f"Partially dispensed: {final_change_reason}"
            if norm_status == "PARTIALLY_DISPENSED"
            else (f"Dispensed with change: {final_change_reason}" if was_changed_flag else (raw_remarks or "Medicines dispensed at front desk"))
        )
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'MEDICINE_DISPENSED', %s, %s)
            """,
            (visit_id, performed_by_user_id, audit_note[:500]),
        )

        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'COMPLETED', %s, %s)
            """,
            (visit_id, performed_by_user_id, "OPD visit finished and discharged"),
        )

        cur.execute("SELECT completed_at FROM VISIT WHERE visit_id = %s", (visit_id,))
        completed_row = cur.fetchone()
        comp_iso = completed_row["completed_at"].isoformat() if completed_row and completed_row["completed_at"] else None

    return {
        "status": "dispensed",
        "visitId": visit_id,
        "visit_id": visit_id,
        "rollNumber": visit["roll_number"],
        "roll_number": visit["roll_number"],
        "dispensingId": dispensing_id,
        "dispensing_id": dispensing_id,
        "dispensingStatus": norm_status,
        "dispensing_status": norm_status,
        "dispensedByStaffId": staff_id,
        "dispensed_by_staff_id": staff_id,
        "wasChanged": bool(was_changed_flag),
        "was_changed": bool(was_changed_flag),
        "changeReason": final_change_reason,
        "change_reason": final_change_reason,
        "completedAt": comp_iso,
        "completed_at": comp_iso,
        "items": saved_item_details,
    }


def get_prescriptions_awaiting_dispense(conn, doctor_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Returns all visits currently in WAITING_FOR_MEDICINE status, along with
    patient details, allergies, doctor information, consultation notes, and
    all prescribed medicines with dosages, timing schedules, and calculated quantities.
    """
    with conn.cursor() as cur:
        sql = """
            SELECT
                v.visit_id, v.roll_number, v.doctor_id, v.status AS visit_status,
                v.checked_in_at, v.consultation_started_at, v.consultation_completed_at,
                st.full_name AS student_name, st.blood_group,
                ua.email AS doctor_email,
                sp.name AS specialty,
                c.consultation_id, c.reason_for_visit, c.diagnosis, c.clinical_notes,
                p.prescription_id, p.general_instructions, p.finalized_at
            FROM VISIT v
            JOIN STUDENT st ON st.roll_number = v.roll_number
            JOIN DOCTOR d ON d.doctor_id = v.doctor_id
            JOIN STAFF s ON s.staff_id = d.staff_id
            JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
            LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
            LEFT JOIN CONSULTATION c ON c.visit_id = v.visit_id
            LEFT JOIN PRESCRIPTION p ON p.consultation_id = c.consultation_id
            WHERE v.status = 'WAITING_FOR_MEDICINE'
        """
        params = []
        if doctor_id is not None:
            sql += " AND v.doctor_id = %s"
            params.append(doctor_id)
        sql += " ORDER BY v.consultation_completed_at ASC, v.visit_id ASC"

        cur.execute(sql, tuple(params))
        visits = cur.fetchall()

        results = []
        for v in visits:
            roll = v["roll_number"]
            cur.execute(
                "SELECT allergen, severity FROM ALLERGY WHERE roll_number = %s AND ended_at IS NULL",
                (roll,),
            )
            allergies_list = [a["allergen"] for a in cur.fetchall()]
            allergies_str = ", ".join(allergies_list) if allergies_list else "None recorded"

            raw_email = v["doctor_email"]
            doc_name_part = raw_email.split("@")[0].replace(".", " ").title()
            doc_display = doc_name_part if doc_name_part.startswith("Dr ") else f"Dr {doc_name_part}"

            presc_id = v.get("prescription_id")
            items = []
            if presc_id:
                cur.execute(
                    """
                    SELECT prescription_item_id, medicine_name, strength, dosage_form, route,
                           duration_value, duration_unit, meal_relation, special_instructions
                    FROM PRESCRIPTION_ITEM
                    WHERE prescription_id = %s
                    ORDER BY prescription_item_id ASC
                    """,
                    (presc_id,),
                )
                raw_items = cur.fetchall()
                for item in raw_items:
                    pi_id = item["prescription_item_id"]
                    cur.execute(
                        """
                        SELECT time_of_day, dose_quantity, dose_unit
                        FROM PRESCRIPTION_DOSE
                        WHERE prescription_item_id = %s
                        """,
                        (pi_id,),
                    )
                    doses = cur.fetchall()
                    dose_dicts = [
                        {
                            "time_of_day": d["time_of_day"],
                            "timeOfDay": d["time_of_day"],
                            "dose_quantity": float(d["dose_quantity"]),
                            "doseQuantity": float(d["dose_quantity"]),
                            "dose_unit": d["dose_unit"],
                            "doseUnit": d["dose_unit"],
                        }
                        for d in doses
                    ]
                    meta = _calculate_prescription_item_qty(
                        item.get("dosage_form"),
                        item.get("duration_value"),
                        item.get("duration_unit"),
                        doses,
                    )
                    items.append({
                        "prescription_item_id": pi_id,
                        "prescriptionItemId": pi_id,
                        "id": pi_id,
                        "medicine_name": item["medicine_name"],
                        "medicineName": item["medicine_name"],
                        "name": item["medicine_name"],
                        "med": item["medicine_name"],
                        "strength": item["strength"],
                        "dosage_form": item["dosage_form"],
                        "dosageForm": item["dosage_form"],
                        "route": item["route"],
                        "duration_value": item["duration_value"],
                        "durationValue": item["duration_value"],
                        "duration_unit": item["duration_unit"],
                        "durationUnit": item["duration_unit"],
                        "duration_text": meta["duration_text"],
                        "days": meta["days"],
                        "meal_relation": item["meal_relation"],
                        "mealRelation": item["meal_relation"],
                        "special_instructions": item["special_instructions"],
                        "specialInstructions": item["special_instructions"],
                        "note": item["special_instructions"],
                        "calculated_total_quantity": meta["calc_qty"],
                        "calculatedTotalQuantity": meta["calc_qty"],
                        "quantity": meta["calc_qty"],
                        "qty": meta["calc_qty"],
                        "frequency": meta["frequency"],
                        "freq": meta["frequency"],
                        "doses": dose_dicts,
                    })

            chk_iso = v["checked_in_at"].isoformat() if v.get("checked_in_at") else None
            comp_iso = v["consultation_completed_at"].isoformat() if v.get("consultation_completed_at") else None
            final_iso = v["finalized_at"].isoformat() if v.get("finalized_at") else None

            results.append({
                "visit_id": v["visit_id"],
                "visitId": v["visit_id"],
                "id": v["visit_id"],
                "roll_number": roll,
                "rollNumber": roll,
                "rollNo": roll,
                "patient_name": v["student_name"],
                "patientName": v["student_name"],
                "name": v["student_name"],
                "blood_group": v["blood_group"],
                "bloodGroup": v["blood_group"],
                "blood": v["blood_group"],
                "allergies": allergies_str,
                "allergy": allergies_str,
                "doctor_id": v["doctor_id"],
                "doctorId": v["doctor_id"],
                "doctor_name": doc_display,
                "doctorName": doc_display,
                "doctor_email": v["doctor_email"],
                "specialty": v["specialty"] or "General Physician",
                "consultation_id": v.get("consultation_id"),
                "consultationId": v.get("consultation_id"),
                "prescription_id": presc_id,
                "prescriptionId": presc_id,
                "rx_no": presc_id,
                "rxNo": presc_id,
                "diagnosis": v.get("diagnosis"),
                "reason_for_visit": v.get("reason_for_visit"),
                "reasonForVisit": v.get("reason_for_visit"),
                "clinical_notes": v.get("clinical_notes"),
                "clinicalNotes": v.get("clinical_notes"),
                "general_instructions": v.get("general_instructions"),
                "generalInstructions": v.get("general_instructions"),
                "advice": v.get("general_instructions"),
                "finalized_at": final_iso,
                "finalizedAt": final_iso,
                "consultation_completed_at": comp_iso,
                "consultationCompletedAt": comp_iso,
                "checked_in_at": chk_iso,
                "checkedInAt": chk_iso,
                "status": "WAITING_FOR_MEDICINE",
                "visit_status": "WAITING_FOR_MEDICINE",
                "visitStatus": "WAITING_FOR_MEDICINE",
                "items": items,
                "medicines": items,
                "rx": items,
            })

        return results


def get_visit_prescription_detail(conn, visit_id: int) -> Dict[str, Any]:
    """
    Returns finalized prescription and clinical details for a single visit.
    Raises ResourceNotFoundError if visit or prescription not found.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                v.visit_id, v.roll_number, v.doctor_id, v.status AS visit_status,
                v.checked_in_at, v.consultation_started_at, v.consultation_completed_at, v.completed_at,
                st.full_name AS student_name, st.blood_group,
                ua.email AS doctor_email,
                sp.name AS specialty,
                c.consultation_id, c.reason_for_visit, c.diagnosis, c.clinical_notes,
                p.prescription_id, p.general_instructions, p.finalized_at
            FROM VISIT v
            JOIN STUDENT st ON st.roll_number = v.roll_number
            JOIN DOCTOR d ON d.doctor_id = v.doctor_id
            JOIN STAFF s ON s.staff_id = d.staff_id
            JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
            LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
            LEFT JOIN CONSULTATION c ON c.visit_id = v.visit_id
            LEFT JOIN PRESCRIPTION p ON p.consultation_id = c.consultation_id
            WHERE v.visit_id = %s
            """,
            (visit_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ResourceNotFoundError(f"Visit #{visit_id} not found.")

        if not row.get("prescription_id"):
            raise ResourceNotFoundError(f"No finalized prescription found for visit #{visit_id}.")

        roll = row["roll_number"]
        cur.execute(
            "SELECT allergen, severity FROM ALLERGY WHERE roll_number = %s AND ended_at IS NULL",
            (roll,),
        )
        allergies_list = [a["allergen"] for a in cur.fetchall()]
        allergies_str = ", ".join(allergies_list) if allergies_list else "None recorded"

        raw_email = row["doctor_email"]
        doc_name_part = raw_email.split("@")[0].replace(".", " ").title()
        doc_display = doc_name_part if doc_name_part.startswith("Dr ") else f"Dr {doc_name_part}"

        presc_id = row["prescription_id"]
        cur.execute(
            """
            SELECT prescription_item_id, medicine_name, strength, dosage_form, route,
                   duration_value, duration_unit, meal_relation, special_instructions
            FROM PRESCRIPTION_ITEM
            WHERE prescription_id = %s
            ORDER BY prescription_item_id ASC
            """,
            (presc_id,),
        )
        raw_items = cur.fetchall()
        items = []
        for item in raw_items:
            pi_id = item["prescription_item_id"]
            cur.execute(
                """
                SELECT time_of_day, dose_quantity, dose_unit
                FROM PRESCRIPTION_DOSE
                WHERE prescription_item_id = %s
                """,
                (pi_id,),
            )
            doses = cur.fetchall()
            dose_dicts = [
                {
                    "time_of_day": d["time_of_day"],
                    "timeOfDay": d["time_of_day"],
                    "dose_quantity": float(d["dose_quantity"]),
                    "doseQuantity": float(d["dose_quantity"]),
                    "dose_unit": d["dose_unit"],
                    "doseUnit": d["dose_unit"],
                }
                for d in doses
            ]
            meta = _calculate_prescription_item_qty(
                item.get("dosage_form"),
                item.get("duration_value"),
                item.get("duration_unit"),
                doses,
            )
            items.append({
                "prescription_item_id": pi_id,
                "prescriptionItemId": pi_id,
                "id": pi_id,
                "medicine_name": item["medicine_name"],
                "medicineName": item["medicine_name"],
                "name": item["medicine_name"],
                "med": item["medicine_name"],
                "strength": item["strength"],
                "dosage_form": item["dosage_form"],
                "dosageForm": item["dosage_form"],
                "route": item["route"],
                "duration_value": item["duration_value"],
                "durationValue": item["duration_value"],
                "duration_unit": item["duration_unit"],
                "durationUnit": item["duration_unit"],
                "duration_text": meta["duration_text"],
                "days": meta["days"],
                "meal_relation": item["meal_relation"],
                "mealRelation": item["meal_relation"],
                "special_instructions": item["special_instructions"],
                "specialInstructions": item["special_instructions"],
                "note": item["special_instructions"],
                "calculated_total_quantity": meta["calc_qty"],
                "calculatedTotalQuantity": meta["calc_qty"],
                "quantity": meta["calc_qty"],
                "qty": meta["calc_qty"],
                "frequency": meta["frequency"],
                "freq": meta["frequency"],
                "doses": dose_dicts,
            })

        chk_iso = row["checked_in_at"].isoformat() if row.get("checked_in_at") else None
        comp_iso = row["consultation_completed_at"].isoformat() if row.get("consultation_completed_at") else None
        final_iso = row["finalized_at"].isoformat() if row.get("finalized_at") else None
        completed_iso = row["completed_at"].isoformat() if row.get("completed_at") else None

        return {
            "visit_id": row["visit_id"],
            "visitId": row["visit_id"],
            "id": row["visit_id"],
            "roll_number": roll,
            "rollNumber": roll,
            "rollNo": roll,
            "patient_name": row["student_name"],
            "patientName": row["student_name"],
            "name": row["student_name"],
            "blood_group": row["blood_group"],
            "bloodGroup": row["blood_group"],
            "blood": row["blood_group"],
            "allergies": allergies_str,
            "allergy": allergies_str,
            "doctor_id": row["doctor_id"],
            "doctorId": row["doctor_id"],
            "doctor_name": doc_display,
            "doctorName": doc_display,
            "doctor_email": row["doctor_email"],
            "specialty": row["specialty"] or "General Physician",
            "consultation_id": row.get("consultation_id"),
            "consultationId": row.get("consultation_id"),
            "prescription_id": presc_id,
            "prescriptionId": presc_id,
            "rx_no": presc_id,
            "rxNo": presc_id,
            "diagnosis": row.get("diagnosis"),
            "reason_for_visit": row.get("reason_for_visit"),
            "reasonForVisit": row.get("reason_for_visit"),
            "clinical_notes": row.get("clinical_notes"),
            "clinicalNotes": row.get("clinical_notes"),
            "general_instructions": row.get("general_instructions"),
            "generalInstructions": row.get("general_instructions"),
            "advice": row.get("general_instructions"),
            "finalized_at": final_iso,
            "finalizedAt": final_iso,
            "consultation_completed_at": comp_iso,
            "consultationCompletedAt": comp_iso,
            "checked_in_at": chk_iso,
            "checkedInAt": chk_iso,
            "completed_at": completed_iso,
            "completedAt": completed_iso,
            "status": row["visit_status"],
            "visit_status": row["visit_status"],
            "visitStatus": row["visit_status"],
            "items": items,
            "medicines": items,
            "rx": items,
        }


def cancel_visit(
    conn,
    visit_id: int,
    performed_by_user_id: int,
    cancel_reason: str = "Cancelled by staff / patient departed",
) -> Dict[str, Any]:
    """
    Cancels an active visit and exits any associated active queue entry.
    """
    with conn.cursor() as cur:
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT v.visit_id, v.status, v.roll_number, qe.queue_entry_id
            FROM VISIT v
            LEFT JOIN QUEUE_ENTRY qe ON qe.visit_id = v.visit_id AND qe.status IN ('WAITING', 'IN_CONSULTATION')
            WHERE v.visit_id = %s{lock_clause}
            """,
            (visit_id,),
        )
        visit = cur.fetchone()
        if not visit:
            raise ResourceNotFoundError(f"Visit #{visit_id} not found.")

        if visit["status"] == "CANCELLED":
            return {"status": "already_cancelled", "visitId": visit_id}

        if visit["status"] == "COMPLETED":
            raise InvalidTransitionError("Cannot cancel an already completed visit.")

        # Cancel active queue entry if present
        if visit.get("queue_entry_id"):
            cur.execute(
                """
                UPDATE QUEUE_ENTRY
                SET status = 'CANCELLED', exited_at = NOW(), exit_reason = 'CANCELLED'
                WHERE queue_entry_id = %s
                """,
                (visit["queue_entry_id"],),
            )

        # Update VISIT to CANCELLED
        cur.execute(
            """
            UPDATE VISIT
            SET status = 'CANCELLED', cancelled_at = NOW(), cancel_reason = %s
            WHERE visit_id = %s
            """,
            (cancel_reason[:255], visit_id),
        )

        # Audit event
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'CANCELLED', %s, %s)
            """,
            (visit_id, performed_by_user_id, f"Cancelled: {cancel_reason}"[:500]),
        )

    return {
        "status": "cancelled",
        "visitId": visit_id,
        "rollNumber": visit["roll_number"],
    }

