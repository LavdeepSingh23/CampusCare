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
    StudentMedicalProfileResponse,
    StudentMedicalProfileUpdateRequest,
    AllergyInput,
    ConditionInput,
    MedicationInput,
    SingleMedicalItemActionResponse,
)
from app.services.student_service import (
    get_student_me_telemetry,
    update_student_profile,
    get_student_medical_profile,
    update_student_medical_profile,
    add_student_allergy,
    delete_student_allergy,
    add_student_condition,
    delete_student_condition,
    add_student_medication,
    delete_student_medication,
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


# ==========================================
# SD-3: Student Medical Details Routes
# ==========================================

@router.get("/medical", response_model=StudentMedicalProfileResponse)
@router.get("/me/medical", response_model=StudentMedicalProfileResponse)
def get_current_student_medical_profile_endpoint(
    current: CurrentUser = Depends(get_current_student),
):
    """
    SD-3: Reads the authenticated student's own medical profile.
    Distinguishes self-reported data from clinician-verified records,
    and returns sanitized consultation history (omits internal staff triage notes).
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )
    return get_student_medical_profile(current.user_id, current.roll_number)


@router.put("/medical", response_model=StudentMedicalProfileResponse)
@router.put("/me/medical", response_model=StudentMedicalProfileResponse)
def update_current_student_medical_profile_endpoint(
    payload: StudentMedicalProfileUpdateRequest,
    current: CurrentUser = Depends(get_current_student),
):
    """
    SD-3: Updates the student's self-reported medical declarations.
    Protects clinical staff records: only self-reported entries are modified;
    records verified by clinical staff remain intact.
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )
    return update_student_medical_profile(
        user_id=current.user_id,
        roll_number=current.roll_number,
        payload=payload.dict(exclude_unset=True),
    )


@router.post("/medical/allergies", response_model=SingleMedicalItemActionResponse)
def add_student_allergy_endpoint(
    item: AllergyInput,
    current: CurrentUser = Depends(get_current_student),
):
    """SD-3: Adds a single self-reported allergy for the student."""
    if not current.roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing roll number.")
    allergy_id = add_student_allergy(current.user_id, current.roll_number, item.dict())
    return SingleMedicalItemActionResponse(
        success=True,
        message=f"Allergy '{item.allergen}' recorded successfully.",
        itemId=allergy_id,
    )


@router.delete("/medical/allergies/{allergy_id}", response_model=SingleMedicalItemActionResponse)
def delete_student_allergy_endpoint(
    allergy_id: int,
    current: CurrentUser = Depends(get_current_student),
):
    """SD-3: Soft-ends a self-reported allergy. Rejects attempts to delete clinically verified alerts."""
    if not current.roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing roll number.")
    delete_student_allergy(current.user_id, current.roll_number, allergy_id)
    return SingleMedicalItemActionResponse(
        success=True,
        message="Allergy alert removed successfully.",
        itemId=allergy_id,
    )


@router.post("/medical/conditions", response_model=SingleMedicalItemActionResponse)
def add_student_condition_endpoint(
    item: ConditionInput,
    current: CurrentUser = Depends(get_current_student),
):
    """SD-3: Adds a single self-reported chronic condition."""
    if not current.roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing roll number.")
    sc_id = add_student_condition(current.user_id, current.roll_number, item.dict())
    return SingleMedicalItemActionResponse(
        success=True,
        message=f"Chronic condition '{item.name}' recorded successfully.",
        itemId=sc_id,
    )


@router.delete("/medical/conditions/{student_condition_id}", response_model=SingleMedicalItemActionResponse)
def delete_student_condition_endpoint(
    student_condition_id: int,
    current: CurrentUser = Depends(get_current_student),
):
    """SD-3: Soft-ends a self-reported condition. Rejects attempts to delete clinically verified records."""
    if not current.roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing roll number.")
    delete_student_condition(current.user_id, current.roll_number, student_condition_id)
    return SingleMedicalItemActionResponse(
        success=True,
        message="Chronic condition record removed successfully.",
        itemId=student_condition_id,
    )


@router.post("/medical/medications", response_model=SingleMedicalItemActionResponse)
def add_student_medication_endpoint(
    item: MedicationInput,
    current: CurrentUser = Depends(get_current_student),
):
    """SD-3: Adds a single self-reported ongoing medication."""
    if not current.roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing roll number.")
    sm_id = add_student_medication(current.user_id, current.roll_number, item.dict())
    return SingleMedicalItemActionResponse(
        success=True,
        message=f"Medication '{item.medicineName}' recorded successfully.",
        itemId=sm_id,
    )


@router.delete("/medical/medications/{student_medication_id}", response_model=SingleMedicalItemActionResponse)
def delete_student_medication_endpoint(
    student_medication_id: int,
    current: CurrentUser = Depends(get_current_student),
):
    """SD-3: Soft-ends a self-reported medication. Rejects attempts to delete clinically verified records."""
    if not current.roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing roll number.")
    delete_student_medication(current.user_id, current.roll_number, student_medication_id)
    return SingleMedicalItemActionResponse(
        success=True,
        message="Ongoing medication record removed successfully.",
        itemId=student_medication_id,
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
                        SELECT pi.medicine_name, pi.strength, pi.duration_value, pi.duration_unit
                        FROM PRESCRIPTION_ITEM pi
                        WHERE pi.prescription_id = %s
                        """,
                        (presc_id,),
                    )
                    med_rows = cur.fetchall()
                    meds = [
                        f"{m['medicine_name']} {m.get('strength') or ''}".strip()
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
