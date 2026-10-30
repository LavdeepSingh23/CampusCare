import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.database import get_db_connection
from app.core.deps import CurrentFaculty, get_current_faculty
from app.services.faculty_service import (
    add_faculty_family_member,
    list_faculty_family_members,
    verify_patient_access_for_faculty,
    FamilyMemberAccessDeniedError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/faculty", tags=["faculty"])


class AddFamilyMemberRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    relationship_type: str = Field(..., description="SPOUSE, CHILD, PARENT, OTHER")
    age: Optional[int] = Field(None, ge=0, le=120)
    gender: str = Field("OTHER", description="MALE, FEMALE, OTHER")
    blood_group: Optional[str] = None


@router.get("/me")
def get_faculty_profile(current: CurrentFaculty = Depends(get_current_faculty)):
    """
    Returns the authenticated faculty member's profile and patient identity.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT f.faculty_id, f.user_id, f.patient_id, f.employee_id, f.department, f.designation,
                       f.status, p.full_name, p.age, p.gender, p.blood_group, ua.email
                FROM FACULTY f
                JOIN USER_ACCOUNT ua ON ua.user_id = f.user_id
                JOIN PATIENT p ON p.patient_id = f.patient_id
                WHERE f.faculty_id = %s
                """,
                (current.faculty_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Faculty profile not found")
            return {
                "status": "success",
                "data": row,
            }
    finally:
        connection.close()


@router.get("/records")
def get_own_medical_records(current: CurrentFaculty = Depends(get_current_faculty)):
    """
    Returns the authenticated faculty member's own OPD visits, consultations, and prescriptions.
    Reuses existing VISIT + CONSULTATION + PRESCRIPTION tables via patient_id.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT v.visit_id, v.checked_in_at, v.status,
                       c.diagnosis, c.clinical_notes,
                       s.staff_id, d.doctor_id,
                       pr.prescription_id, pr.created_at as prescription_date
                FROM VISIT v
                LEFT JOIN CONSULTATION c ON c.visit_id = v.visit_id
                LEFT JOIN DOCTOR d ON d.doctor_id = c.doctor_id
                LEFT JOIN STAFF s ON s.staff_id = d.staff_id
                LEFT JOIN PRESCRIPTION pr ON pr.consultation_id = c.consultation_id
                WHERE v.patient_id = %s
                ORDER BY v.checked_in_at DESC
                """,
                (current.patient_id,),
            )
            visits = cursor.fetchall()
            return {
                "status": "success",
                "data": {
                    "patient_id": current.patient_id,
                    "visits": visits,
                },
            }
    finally:
        connection.close()


@router.get("/family")
def get_family_members(current: CurrentFaculty = Depends(get_current_faculty)):
    """
    Lists all active family-member patient profiles linked to this faculty account.
    """
    family = list_faculty_family_members(current.faculty_id)
    return {
        "status": "success",
        "data": family,
    }


@router.post("/family", status_code=status.HTTP_201_CREATED)
def create_family_member(
    payload: AddFamilyMemberRequest,
    current: CurrentFaculty = Depends(get_current_faculty),
):
    """
    Registers a new family-member patient profile linked to this faculty account.
    """
    try:
        result = add_faculty_family_member(
            faculty_id=current.faculty_id,
            full_name=payload.full_name,
            relationship_type=payload.relationship_type.upper(),
            age=payload.age,
            gender=payload.gender.upper(),
            blood_group=payload.blood_group,
        )
        return {
            "status": "success",
            "message": "Family member added successfully",
            "data": result,
        }
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))


@router.get("/family/{target_patient_id}/records")
def get_family_member_records(
    target_patient_id: int,
    current: CurrentFaculty = Depends(get_current_faculty),
):
    """
    Retrieves medical records for an authorized linked family member.
    STRICT AUTHORIZATION: Verifies active relationship.
    Rejects unauthorized or arbitrary patient IDs with 403 Forbidden.
    """
    try:
        access_grant = verify_patient_access_for_faculty(current.faculty_id, target_patient_id)
    except FamilyMemberAccessDeniedError as denied_err:
        logger.warning(
            "Unauthorized family record access attempt by faculty %d on patient %d",
            current.faculty_id, target_patient_id
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(denied_err),
        )

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # Get patient info
            cursor.execute(
                "SELECT patient_id, full_name, age, gender, blood_group FROM PATIENT WHERE patient_id = %s",
                (target_patient_id,),
            )
            patient_info = cursor.fetchone()

            # Get visits and prescriptions
            cursor.execute(
                """
                SELECT v.visit_id, v.checked_in_at, v.status,
                       c.diagnosis, c.clinical_notes,
                       pr.prescription_id, pr.created_at as prescription_date
                FROM VISIT v
                LEFT JOIN CONSULTATION c ON c.visit_id = v.visit_id
                LEFT JOIN PRESCRIPTION pr ON pr.consultation_id = c.consultation_id
                WHERE v.patient_id = %s
                ORDER BY v.checked_in_at DESC
                """,
                (target_patient_id,),
            )
            visits = cursor.fetchall()

            return {
                "status": "success",
                "data": {
                    "access": access_grant,
                    "patient": patient_info,
                    "visits": visits,
                },
            }
    finally:
        connection.close()
