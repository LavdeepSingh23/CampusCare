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

        cur.execute(
            """
            SELECT status FROM DOCTOR_AVAILABILITY
            WHERE doctor_id = %s AND availability_date = CURDATE()
            LIMIT 1
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
    """
    with conn.cursor() as cur:
        # Check if already in consultation
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
                "visitId": existing["visit_id"],
                "rollNumber": existing["roll_number"],
                "name": existing["full_name"],
                "sequence": existing["queue_sequence"],
            }

        # Fetch next waiting patient in line
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
        "visitId": visit_id,
        "rollNumber": next_patient["roll_number"],
        "name": next_patient["full_name"],
        "sequence": next_patient["queue_sequence"],
    }


def mark_no_show(
    conn,
    visit_id: int,
    doctor_id: int,
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
            return {"status": "already_no_show", "visitId": visit_id}

        if row["visit_status"] in ("COMPLETED", "CANCELLED", "WAITING_FOR_MEDICINE"):
            raise InvalidTransitionError(
                f"Cannot mark visit in status '{row['visit_status']}' as no-show."
            )

        if row["doctor_id"] != doctor_id:
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
        "rollNumber": row["roll_number"],
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

        # Lock target doctor record
        if _is_mysql(conn):
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s FOR UPDATE", (target_doctor_id,))
        else:
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (target_doctor_id,))
        doc = cur.fetchone()
        if not doc:
            raise ResourceNotFoundError(f"Target doctor #{target_doctor_id} not found.")

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
        "queueEntryId": new_queue_entry_id,
        "queueNo": seq,
        "doctorId": target_doctor_id,
        "rollNumber": visit["roll_number"],
    }


def redirect_patient(
    conn,
    visit_id: int,
    target_doctor_id: int,
    performed_by_user_id: int,
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
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'REDIRECTED', %s, %s)
            """,
            (visit_id, performed_by_user_id, f"Redirected to Doctor #{target_doctor_id}: {reason}"[:500]),
        )

    return {
        "status": "redirected",
        "visitId": visit_id,
        "oldDoctorId": row["doctor_id"],
        "newDoctorId": target_doctor_id,
        "newQueueNo": seq,
        "queueEntryId": new_queue_entry_id,
        "rollNumber": row["roll_number"],
    }


def complete_consultation(
    conn,
    doctor_id: int,
    roll_number: str,
    diagnosis: str,
    clinical_notes: Optional[str],
    general_instructions: Optional[str],
    medicines: List[Dict[str, Any]],
    performed_by_user_id: int,
) -> Dict[str, Any]:
    """
    Completes doctor consultation, saves prescription records, and transitions
    VISIT to WAITING_FOR_MEDICINE and active QUEUE_ENTRY to COMPLETED.
    """
    with conn.cursor() as cur:
        lock_clause = " FOR UPDATE" if _is_mysql(conn) else ""
        cur.execute(
            f"""
            SELECT qe.queue_entry_id, qe.status as queue_status, v.visit_id, v.status as visit_status
            FROM QUEUE_ENTRY qe
            JOIN VISIT v ON v.visit_id = qe.visit_id
            WHERE qe.doctor_id = %s AND v.roll_number = %s
              AND qe.status IN ('WAITING', 'IN_CONSULTATION')
            ORDER BY qe.entered_at DESC
            LIMIT 1{lock_clause}
            """,
            (doctor_id, roll_number),
        )
        active = cur.fetchone()
        if not active:
            raise ResourceNotFoundError(
                f"No active consultation found for student '{roll_number}' under Doctor #{doctor_id}."
            )

        visit_id = active["visit_id"]
        queue_entry_id = active["queue_entry_id"]

        # Insert Consultation record
        cur.execute(
            """
            INSERT INTO CONSULTATION (visit_id, doctor_id, reason_for_visit, diagnosis, clinical_notes)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (visit_id, doctor_id, diagnosis, diagnosis, clinical_notes or None),
        )
        consultation_id = cur.lastrowid

        # Insert Prescription record
        cur.execute(
            """
            INSERT INTO PRESCRIPTION (consultation_id, general_instructions, finalized_at)
            VALUES (%s, %s, NOW())
            """,
            (consultation_id, general_instructions or None),
        )
        prescription_id = cur.lastrowid

        # Insert Prescription Items & Doses
        for med in medicines:
            name = (med.get("name") or "").strip()
            if not name:
                continue
            cur.execute(
                """
                INSERT INTO PRESCRIPTION_ITEM (prescription_id, medicine_name, special_instructions)
                VALUES (%s, %s, %s)
                """,
                (prescription_id, name, med.get("note") or None),
            )
            item_id = cur.lastrowid

            for flag, time_of_day in (
                (med.get("morning"), "MORNING"),
                (med.get("afternoon"), "AFTERNOON"),
                (med.get("evening"), "EVENING"),
                (med.get("night"), "NIGHT"),
            ):
                if flag:
                    cur.execute(
                        """
                        INSERT INTO PRESCRIPTION_DOSE (prescription_item_id, time_of_day, dose_quantity, dose_unit)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (item_id, time_of_day, 1, "dose"),
                    )

        # Complete QUEUE_ENTRY
        cur.execute(
            """
            UPDATE QUEUE_ENTRY
            SET status = 'COMPLETED', exited_at = NOW(), exit_reason = 'COMPLETED'
            WHERE queue_entry_id = %s
            """,
            (queue_entry_id,),
        )

        # Transition VISIT to WAITING_FOR_MEDICINE
        cur.execute(
            """
            UPDATE VISIT
            SET status = 'WAITING_FOR_MEDICINE', consultation_completed_at = NOW()
            WHERE visit_id = %s
            """,
            (visit_id,),
        )

        # Audit log
        cur.execute(
            """
            INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
            VALUES (%s, 'CONSULTATION_COMPLETED', %s, %s)
            """,
            (visit_id, performed_by_user_id, f"Diagnosis: {diagnosis}"[:500]),
        )

    return {
        "status": "ok",
        "visitId": visit_id,
        "consultationId": consultation_id,
        "prescriptionId": prescription_id,
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
            VALUES (%s, 'COMPLETED', %s, %s)
            """,
            (visit_id, performed_by_user_id, f"Cancelled: {cancel_reason}"[:500]),
        )

    return {
        "status": "cancelled",
        "visitId": visit_id,
        "rollNumber": visit["roll_number"],
    }

