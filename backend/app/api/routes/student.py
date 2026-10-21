"""
API Routes for Student Portal, Telemetry, and Onboarding (SD-1 & SD-2).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import CurrentUser, get_current_user, get_current_student
from app.core.database import get_db_connection
from app.schemas.student import (
    StudentMeResponse,
    StudentProfileHistoryItem,
    StudentProfileUpdateRequest,
    StudentProfileUpdateResponse,
)
from app.services.student_service import (
    get_student_me_telemetry,
    update_student_profile,
)

router = APIRouter(prefix="/student", tags=["Student"])


@router.get("/me", response_model=StudentMeResponse)
@router.get("/profile", response_model=StudentMeResponse)
def get_current_student_profile(
    current: CurrentUser = Depends(get_current_student),
):
    """
    Returns the authenticated student's full profile, verified clinical alerts,
    emergency contacts, profile completion status, and active OPD queue status.
    Strictly restricted to verified STUDENT accounts.
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )
    return get_student_me_telemetry(current.user_id, current.roll_number)


@router.put("/me", response_model=StudentProfileUpdateResponse)
@router.put("/profile", response_model=StudentProfileUpdateResponse)
def update_current_student_profile(
    payload: StudentProfileUpdateRequest,
    current: CurrentUser = Depends(get_current_student),
):
    """
    SD-2: Updates the authenticated student's editable demographics (phone, DOB, sex, blood group),
    primary emergency contact, and declared clinical alerts (allergies, chronic conditions, medications).
    Computes and returns the updated profile completion percentage and status.
    Authoritative institutional fields (roll_number, user_id, email, status) are strictly immutable.
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )

    updated_data = update_student_profile(
        user_id=current.user_id,
        roll_number=current.roll_number,
        payload=payload.dict(exclude_unset=True),
    )

    return StudentProfileUpdateResponse(
        success=True,
        message="Student profile updated successfully.",
        profileCompletion=updated_data["profileCompletion"],
        data=updated_data,
    )


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

                presc_id = r.get("prescription_id")
                meds = []
                if presc_id:
                    cur.execute(
                        """
                        SELECT m.name AS med_name, pi.dose, pi.frequency, pi.duration
                        FROM PRESCRIPTION_ITEM pi
                        JOIN MEDICINE m ON m.medicine_id = pi.medicine_id
                        WHERE pi.prescription_id = %s
                        """,
                        (presc_id,),
                    )
                    med_rows = cur.fetchall()
                    meds = [
                        f"{m['med_name']} ({m.get('dose') or ''} {m.get('frequency') or ''} for {m.get('duration') or ''})".strip()
                        for m in med_rows
                    ]

                history.append(
                    {
                        "visitId": r["visit_id"],
                        "doctorId": r["doctor_id"],
                        "doctorName": doc_name,
                        "status": r["visit_status"],
                        "diagnosis": r.get("diagnosis"),
                        "clinicalNotes": r.get("clinical_notes"),
                        "prescriptionId": presc_id,
                        "checkedInAt": r["checked_in_at"].isoformat() if r.get("checked_in_at") else None,
                        "completedAt": r["completed_at"].isoformat() if r.get("completed_at") else None,
                        "medicines": meds,
                    }
                )

            return history
    finally:
        conn.close()
