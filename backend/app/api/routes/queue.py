import logging
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db_connection
from app.core.deps import (
    CurrentReceptionist,
    CurrentUser,
    get_current_receptionist,
    get_current_staff,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/queue", tags=["queue"])


# ── Schemas ─────────────────────────────────────────────────────────────

class CheckInRequest(BaseModel):
    roll_number: str = Field(..., description="Student roll number")
    doctor_id: int = Field(..., description="Target doctor ID")
    complaint: Optional[str] = Field("General Consultation", description="Chief complaint / reason for visit")


class DispenseRequest(BaseModel):
    remarks: Optional[str] = Field(None, description="Dispensing notes or pharmacy remarks")


# ── Receptionist-Only Endpoints ─────────────────────────────────────────

@router.post("/checkin")
def check_in_student(
    payload: CheckInRequest,
    receptionist: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist-only operation: Checks a student into the clinic OPD queue.
    Rejects doctors and students with 403 Forbidden.
    Identity recorded in audit events comes strictly from the validated receptionist token.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # 1. Verify student exists
            cursor.execute(
                "SELECT roll_number, full_name, status FROM STUDENT WHERE roll_number = %s",
                (payload.roll_number,),
            )
            student = cursor.fetchone()
            if not student:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Student with roll number '{payload.roll_number}' was not found in directory.",
                )
            if student["status"] != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This student account is marked inactive.",
                )

            # 2. Verify doctor exists and is active
            cursor.execute(
                "SELECT d.doctor_id, ua.email FROM DOCTOR d JOIN STAFF s ON s.staff_id = d.staff_id JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id WHERE d.doctor_id = %s",
                (payload.doctor_id,),
            )
            doctor = cursor.fetchone()
            if not doctor:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Doctor #{payload.doctor_id} not found.",
                )

            # 3. Check for existing active visit for this student today
            cursor.execute(
                """
                SELECT visit_id, status FROM VISIT
                WHERE roll_number = %s AND status IN ('CHECKED_IN', 'WAITING_FOR_DOCTOR', 'CALLED', 'IN_CONSULTATION', 'WAITING_FOR_MEDICINE')
                ORDER BY checked_in_at DESC LIMIT 1
                """,
                (payload.roll_number,),
            )
            active_visit = cursor.fetchone()
            if active_visit:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Student '{payload.roll_number}' already has an active visit in progress (Status: {active_visit['status']}).",
                )

            # 4. Create new visit
            cursor.execute(
                """
                INSERT INTO VISIT (roll_number, doctor_id, status, checked_in_at)
                VALUES (%s, %s, 'CHECKED_IN', NOW())
                """,
                (payload.roll_number, payload.doctor_id),
            )
            visit_id = cursor.lastrowid

            # 5. Compute next queue sequence number for this doctor today
            cursor.execute(
                """
                SELECT COALESCE(MAX(queue_sequence), 0) + 1 AS next_seq
                FROM QUEUE_ENTRY
                WHERE doctor_id = %s AND DATE(entered_at) = CURDATE()
                """,
                (payload.doctor_id,),
            )
            seq_row = cursor.fetchone()
            sequence = seq_row["next_seq"] if seq_row else 1

            # 6. Insert Queue Entry
            cursor.execute(
                """
                INSERT INTO QUEUE_ENTRY (visit_id, doctor_id, queue_sequence, status, entered_at, queue_data, entry_reason)
                VALUES (%s, %s, %s, 'WAITING', NOW(), NOW(), 'INITIAL_CHECKIN')
                """,
                (visit_id, payload.doctor_id, sequence),
            )
            queue_entry_id = cursor.lastrowid

            # 7. Audit log in VISIT_EVENT with receptionist user_id FROM TOKEN
            cursor.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
                VALUES (%s, 'CHECK_IN', %s, %s)
                """,
                (visit_id, receptionist.user_id, f"Check-in by receptionist ({receptionist.email}): {payload.complaint}"),
            )

            connection.commit()
            return {
                "status": "checked_in",
                "visitId": visit_id,
                "queueEntryId": queue_entry_id,
                "sequence": sequence,
                "doctorId": payload.doctor_id,
                "rollNumber": payload.roll_number,
                "studentName": student["full_name"],
            }
    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        logger.error("Queue checkin transaction failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check in student to queue: {exc}",
        )
    finally:
        connection.close()


@router.post("/{visit_id}/dispense")
def dispense_medicine(
    visit_id: int,
    payload: Optional[DispenseRequest] = None,
    receptionist: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist-only operation: Confirms medication dispensing and finalizes the student visit.
    Rejects doctors and students with 403 Forbidden.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT visit_id, roll_number, status FROM VISIT WHERE visit_id = %s",
                (visit_id,),
            )
            visit = cursor.fetchone()
            if not visit:
                raise HTTPException(status_code=404, detail=f"Visit #{visit_id} not found.")

            if visit["status"] == "COMPLETED":
                return {"status": "already_completed", "visitId": visit_id}

            # Update visit to COMPLETED
            cursor.execute(
                """
                UPDATE VISIT
                SET status = 'COMPLETED', completed_at = NOW()
                WHERE visit_id = %s
                """,
                (visit_id,),
            )

            # Record audit event with receptionist user_id from token
            remarks = payload.remarks if payload and payload.remarks else "Medicines dispensed at front desk"
            cursor.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
                VALUES (%s, 'DISPENSING_COMPLETED', %s, %s)
                """,
                (visit_id, receptionist.user_id, remarks),
            )

            connection.commit()
            return {
                "status": "dispensed",
                "visitId": visit_id,
                "rollNumber": visit["roll_number"],
            }
    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        logger.error("Dispense transaction failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record dispensing for visit #{visit_id}: {exc}",
        )
    finally:
        connection.close()


# ── Staff-Only Endpoints (Doctors & Receptionists) ──────────────────────

@router.get("/live")
def get_live_queue(
    staff: CurrentUser = Depends(get_current_staff),
):
    """
    Staff-only endpoint: Returns live OPD queue status across all active doctors.
    Rejects students with 403 Forbidden.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    qe.queue_entry_id,
                    qe.queue_sequence,
                    qe.status AS queue_status,
                    qe.entered_at,
                    qe.called_at,
                    v.visit_id,
                    v.roll_number,
                    st.full_name,
                    st.blood_group,
                    d.doctor_id,
                    sp.name AS specialty_name,
                    ua.email AS doctor_email
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                JOIN DOCTOR d ON d.doctor_id = qe.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                WHERE qe.status IN ('WAITING', 'IN_CONSULTATION')
                ORDER BY qe.doctor_id, qe.queue_sequence ASC
                """
            )
            rows = cursor.fetchall()

            return [
                {
                    "queueEntryId": r["queue_entry_id"],
                    "sequence": r["queue_sequence"],
                    "status": r["queue_status"],
                    "enteredAt": str(r["entered_at"]) if r["entered_at"] else None,
                    "calledAt": str(r["called_at"]) if r["called_at"] else None,
                    "visitId": r["visit_id"],
                    "rollNumber": r["roll_number"],
                    "patientName": r["full_name"],
                    "bloodGroup": r["blood_group"],
                    "doctorId": r["doctor_id"],
                    "doctorSpecialty": r["specialty_name"] or "General",
                    "doctorEmail": r["doctor_email"],
                }
                for r in rows
            ]
    finally:
        connection.close()

