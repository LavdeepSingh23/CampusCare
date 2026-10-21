"""
API Routes for Student Portal and Telemetry (SD-1).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import CurrentUser, get_current_user, get_current_student
from app.core.database import get_db_connection
from app.schemas.student import StudentMeResponse, StudentProfileHistoryItem
from app.services.student_service import get_student_me_telemetry

router = APIRouter(prefix="/student", tags=["Student"])


@router.get("/me", response_model=StudentMeResponse)
def get_current_student_profile(
    current: CurrentUser = Depends(get_current_student),
):
    """
    Returns the authenticated student's full profile, verified clinical alerts,
    emergency contacts, and active OPD queue status.
    Strictly restricted to verified STUDENT accounts.
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )
    return get_student_me_telemetry(current.user_id, current.roll_number)


@router.get("/{roll_number}", response_model=StudentMeResponse)
def get_student_profile(
    roll_number: str,
    current: CurrentUser = Depends(get_current_user),
):
    """
    Retrieves student profile by roll number.
    Strictly prevents students from accessing other students' records:
    a student may ONLY request their own roll number. Medical staff and receptionists
    may access any student record.
    """
    clean_roll = roll_number.strip().upper()
    if current.role == "STUDENT":
        if (current.roll_number or "").upper() != clean_roll:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: You are not authorized to view other students' records.",
            )

    return get_student_me_telemetry(current.user_id, clean_roll)


@router.get("/{roll_number}/history", response_model=List[StudentProfileHistoryItem])
def get_student_visit_history(
    roll_number: str,
    current: CurrentUser = Depends(get_current_user),
):
    """
    Retrieves completed consultations and prescription history for a student.
    Strictly prevents students from accessing other students' medical histories.
    """
    clean_roll = roll_number.strip().upper()
    if current.role == "STUDENT":
        if (current.roll_number or "").upper() != clean_roll:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: You cannot view medical history belonging to another student.",
            )

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.visit_id, v.doctor_id, v.status AS visit_status,
                       v.checked_in_at, v.completed_at,
                       co.diagnosis, co.clinical_notes, pr.prescription_id,
                       ua_doc.email AS doc_email
                FROM VISIT v
                JOIN DOCTOR d ON d.doctor_id = v.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua_doc ON ua_doc.user_id = s.user_id
                LEFT JOIN CONSULTATION co ON co.visit_id = v.visit_id
                LEFT JOIN PRESCRIPTION pr ON pr.consultation_id = co.consultation_id
                WHERE v.roll_number = %s AND v.status = 'COMPLETED'
                ORDER BY v.completed_at DESC, v.visit_id DESC
                """,
                (clean_roll,),
            )
            rows = cur.fetchall()

            history = []
            for r in rows:
                doc_email = r.get("doc_email") or ""
                doc_name = doc_email.split("@")[0].replace(".", " ").title()
                if not doc_name.startswith("Dr"):
                    doc_name = f"Dr. {doc_name}"

                meds = []
                if r.get("prescription_id"):
                    cur.execute(
                        """
                        SELECT medicine_name, special_instructions
                        FROM PRESCRIPTION_ITEM
                        WHERE prescription_id = %s
                        """,
                        (r["prescription_id"],),
                    )
                    item_rows = cur.fetchall()
                    meds = [
                        f"{it['medicine_name']} ({it['special_instructions']})" if it.get("special_instructions") else it["medicine_name"]
                        for it in item_rows
                    ]

                history.append({
                    "visitId": r["visit_id"],
                    "doctorId": r["doctor_id"],
                    "doctorName": doc_name,
                    "status": r["visit_status"],
                    "diagnosis": r.get("diagnosis"),
                    "clinicalNotes": r.get("clinical_notes"),
                    "prescriptionId": r.get("prescription_id"),
                    "checkedInAt": r["checked_in_at"].isoformat() if r.get("checked_in_at") else None,
                    "completedAt": r["completed_at"].isoformat() if r.get("completed_at") else None,
                    "medicines": meds,
                })

            return history
    finally:
        conn.close()

