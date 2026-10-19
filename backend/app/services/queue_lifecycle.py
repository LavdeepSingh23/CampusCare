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


def dispense_medication(
    conn,
    visit_id: int,
    performed_by_user_id: int,
    remarks: str = "Medicines dispensed at front desk",
) -> Dict[str, Any]:
    """
    Confirms medicine dispensing for a visit in WAITING_FOR_MEDICINE,
    transitioning the visit to COMPLETED.
    Idempotent: if visit is already COMPLETED, returns already_completed.
    """
    with conn.cursor() as cur:
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"SELECT visit_id, roll_number, status FROM VISIT WHERE visit_id = %s{lock_clause}",
            (visit_id,),
        )
        visit = cur.fetchone()
        if not visit:
            raise ResourceNotFoundError(f"Visit #{visit_id} not found.")

        if visit["status"] == "COMPLETED":
            return {"status": "already_completed", "visitId": visit_id, "rollNumber": visit["roll_number"]}

        if visit["status"] != "WAITING_FOR_MEDICINE":
            raise InvalidTransitionError(
                f"Cannot dispense visit #{visit_id} in status '{visit['status']}'. Visit must be in WAITING_FOR_MEDICINE."
            )

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
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'MEDICINE_DISPENSED', %s, %s)
            """,
            (visit_id, performed_by_user_id, remarks[:500]),
        )

        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'COMPLETED', %s, %s)
            """,
            (visit_id, performed_by_user_id, "OPD visit finished and discharged"),
        )

    return {
        "status": "dispensed",
        "visitId": visit_id,
        "rollNumber": visit["roll_number"],
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

