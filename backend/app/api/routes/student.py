"""
API Routes for Student Portal, Telemetry, and Onboarding (SD-1 & SD-2).
"""

from typing import List, Optional, Dict, Any
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
    StudentEmergencyDirectoryResponse,
    StudentPrescriptionMedicineDetail,
    StudentPrescriptionItemDetail,
    StudentHomeSummaryResponse,
    StudentHealthSummaryDetail,
    StudentStatisticsDetail,
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
@router.get("/medical-profile", response_model=StudentMedicalProfileResponse)
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
@router.put("/medical-profile", response_model=StudentMedicalProfileResponse)
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


# ==========================================
# SD-4: Visit History & Emergency Directory
# ==========================================

def fetch_student_history_records(clean_roll: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.visit_id, v.doctor_id, v.status AS visit_status,
                       v.checked_in_at, v.completed_at,
                       co.diagnosis, co.clinical_notes, pr.prescription_id, pr.general_instructions,
                       ua_doc.email AS doc_email, sp.name AS specialty
                FROM VISIT v
                JOIN DOCTOR d ON d.doctor_id = v.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua_doc ON ua_doc.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
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
                medicines = []
                if presc_id:
                    cur.execute(
                        """
                        SELECT pi.prescription_item_id, pi.medicine_name, pi.strength, pi.dosage_form,
                               pi.duration_value, pi.duration_unit, pi.meal_relation, pi.special_instructions
                        FROM PRESCRIPTION_ITEM pi
                        WHERE pi.prescription_id = %s
                        ORDER BY pi.prescription_item_id ASC
                        """,
                        (presc_id,),
                    )
                    med_rows = cur.fetchall()
                    for m in med_rows:
                        cur.execute(
                            """
                            SELECT time_of_day, dose_quantity, dose_unit
                            FROM PRESCRIPTION_DOSE
                            WHERE prescription_item_id = %s
                            ORDER BY FIELD(time_of_day, 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT')
                            """,
                            (m["prescription_item_id"],),
                        )
                        doses = cur.fetchall()
                        timing = ", ".join(d["time_of_day"].lower() for d in doses) or "as needed"

                        meal_desc = ""
                        if m.get("meal_relation") == "AFTER_MEAL":
                            meal_desc = "after food"
                        elif m.get("meal_relation") == "BEFORE_MEAL":
                            meal_desc = "before food"
                        elif m.get("meal_relation") == "WITH_MEAL":
                            meal_desc = "with food"
                        elif m.get("meal_relation") == "ANY_TIME":
                            meal_desc = "any time"

                        instr = m.get("special_instructions") or ""
                        note_parts = [meal_desc, instr]
                        note = " — ".join([p for p in note_parts if p])

                        medicines.append(
                            {
                                "prescriptionItemId": m["prescription_item_id"],
                                "name": f"{m['medicine_name']} {m.get('strength') or ''}".strip(),
                                "timing": timing,
                                "note": note,
                                "mealRelation": m.get("meal_relation"),
                                "dosageForm": m.get("dosage_form"),
                                "duration": f"{m['duration_value']} {m['duration_unit'].lower()}s" if m.get("duration_value") else None,
                                "specialInstructions": instr,
                            }
                        )

                dt = r.get("completed_at") or r.get("checked_in_at")
                date_str = dt.strftime("%d %b %Y") if dt else "Recent visit"

                history.append(
                    {
                        "visitId": r["visit_id"],
                        "doctorId": r["doctor_id"],
                        "doctorName": doc_name,
                        "specialty": r.get("specialty") or "General Physician",
                        "status": r["visit_status"],
                        "date": date_str,
                        "diagnosis": r.get("diagnosis") or "General Consultation",
                        "clinicalNotes": r.get("clinical_notes"),
                        "notes": r.get("clinical_notes") or r.get("general_instructions") or "",
                        "generalInstructions": r.get("general_instructions") or "",
                        "prescriptionId": presc_id,
                        "checkedInAt": r["checked_in_at"].isoformat() if r.get("checked_in_at") else None,
                        "completedAt": r["completed_at"].isoformat() if r.get("completed_at") else None,
                        "medicines": medicines,
                    }
                )

            return history
    finally:
        conn.close()


def fetch_student_emergency_directory(clean_roll: str) -> Dict[str, Any]:
    conn = get_db_connection()
    personal_contacts = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT emergency_contact_id, name, relationship, phone_number
                FROM EMERGENCY_CONTACT
                WHERE roll_number = %s
                ORDER BY emergency_contact_id ASC
                """,
                (clean_roll,),
            )
            rows = cur.fetchall()
            for r in rows:
                personal_contacts.append(
                    {
                        "contactId": r["emergency_contact_id"],
                        "name": r["name"],
                        "relationship": r["relationship"],
                        "phoneNumber": r["phone_number"],
                    }
                )
    finally:
        conn.close()

    campus_services = [
        {
            "label": "Campus Health Centre (Dispensary)",
            "sub": "24×7 Campus Emergency Medical Desk & Ambulance",
            "number": "+91-175-2393108",
            "priority": True,
        },
        {
            "label": "Campus Security Control Room",
            "sub": "Main Gate 24×7 Security Desk & Campus Patrol",
            "number": "+91-175-2393110",
            "priority": False,
        },
        {
            "label": "Hostel Warden / Student Affairs",
            "sub": "Hostel Emergency & Resident Scholar Assistance",
            "number": "+91-175-2393112",
            "priority": False,
        },
        {
            "label": "Campus Ambulance Driver on Duty",
            "sub": "Emergency Patient Transfer to Rajindra Hospital",
            "number": "+91-987-654-3108",
            "priority": True,
        },
    ]

    national_helplines = [
        {
            "label": "Ambulance",
            "sub": "Medical emergencies (National)",
            "number": "108",
            "priority": True,
        },
        {
            "label": "Tele-MANAS",
            "sub": "Mental health support, 24×7 toll-free",
            "number": "14416",
            "priority": True,
        },
        {
            "label": "National Emergency Helpline",
            "sub": "Police, Fire, Disaster Services",
            "number": "112",
            "priority": False,
        },
    ]

    return {
        "personalContacts": personal_contacts,
        "campusServices": campus_services,
        "nationalHelplines": national_helplines,
    }


@router.get("/emergency-contacts", response_model=StudentEmergencyDirectoryResponse)
@router.get("/me/emergency-contacts", response_model=StudentEmergencyDirectoryResponse)
def get_student_emergency_contacts_endpoint(
    current: CurrentUser = Depends(get_current_student),
):
    """
    SD-4: Returns verified campus emergency contacts, national emergency numbers,
    and the student's own registered personal emergency contacts.
    """
    if not current.roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing roll number.")
    return fetch_student_emergency_directory(current.roll_number.strip().upper())


@router.get("/me/history", response_model=List[StudentProfileHistoryItem])
@router.get("/history", response_model=List[StudentProfileHistoryItem])
@router.get("/visits", response_model=List[StudentProfileHistoryItem])
def get_current_student_visit_history(
    current: CurrentUser = Depends(get_current_student),
):
    """
    SD-4: Retrieves completed consultations and visit history for the current authenticated student.
    Includes rich prescription item details, duration, meal relation, and dose schedules from PRESCRIPTION_DOSE.
    Strictly isolated to the authenticated student's session.
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )
    return fetch_student_history_records(current.roll_number.strip().upper())


@router.get("/prescriptions", response_model=List[StudentPrescriptionItemDetail])
def get_current_student_prescriptions(
    current: CurrentUser = Depends(get_current_student),
):
    """
    Retrieves authorized prescription history and medication instructions
    for the current authenticated student. Strictly isolated to the verified session.
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )
    records = fetch_student_history_records(current.roll_number.strip().upper())
    prescriptions = []
    for r in records:
        if r.get("prescriptionId"):
            prescriptions.append({
                "visitId": r["visitId"],
                "prescriptionId": r["prescriptionId"],
                "date": r.get("date") or "",
                "doctorName": r.get("doctorName") or "Attending Physician",
                "specialty": r.get("specialty") or "General Physician",
                "diagnosis": r.get("diagnosis") or "General Consultation",
                "generalInstructions": r.get("generalInstructions") or r.get("notes") or "",
                "medicines": r.get("medicines") or [],
                "completedAt": r.get("completedAt"),
            })
    return prescriptions


@router.get("/summary", response_model=StudentHomeSummaryResponse)
def get_current_student_home_summary(
    current: CurrentUser = Depends(get_current_student),
):
    """
    Returns home-page dashboard summary for the authenticated student:
    verified identity, health summary declarations, visit statistics,
    live OPD queue status, and recent prescription dose instructions.
    """
    if not current.roll_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current student account does not have a linked roll number.",
        )
    clean_roll = current.roll_number.strip().upper()
    telemetry = get_student_me_telemetry(current.user_id, clean_roll)
    history = fetch_student_history_records(clean_roll)
    med_profile = get_student_medical_profile(current.user_id, clean_roll)

    total_visits = len(history)
    latest_visit = history[0] if history else None
    stats = {
        "totalVisits": total_visits,
        "lastVisitDate": latest_visit.get("date") if latest_visit else None,
        "lastVisitDiagnosis": latest_visit.get("diagnosis") if latest_visit else None,
    }

    cond_text = "None recorded"
    if telemetry.get("chronicConditions"):
        cond_text = ", ".join(telemetry["chronicConditions"])

    allg_text = "None recorded"
    if telemetry.get("allergies"):
        allg_parts = []
        for a in telemetry["allergies"]:
            sev = a.get("severity")
            allg_parts.append(f"{a['allergen']} ({sev})" if sev else a["allergen"])
        allg_text = ", ".join(allg_parts)

    med_text = "None recorded"
    if telemetry.get("currentMedications"):
        med_text = ", ".join(telemetry["currentMedications"])

    health_summary = {
        "bloodGroup": telemetry["student"].get("bloodGroup") or med_profile.get("bloodGroup"),
        "conditions": cond_text,
        "allergies": allg_text,
        "medication": med_text,
        "hasSevereAllergyAlert": med_profile.get("summary", {}).get("hasSevereAllergyAlert", False),
    }

    recent_presc = None
    if latest_visit and latest_visit.get("prescriptionId"):
        recent_presc = {
            "visitId": latest_visit["visitId"],
            "prescriptionId": latest_visit["prescriptionId"],
            "date": latest_visit.get("date") or "",
            "doctorName": latest_visit.get("doctorName") or "Attending Physician",
            "specialty": latest_visit.get("specialty") or "General Physician",
            "diagnosis": latest_visit.get("diagnosis") or "General Consultation",
            "generalInstructions": latest_visit.get("generalInstructions") or latest_visit.get("notes") or "",
            "medicines": latest_visit.get("medicines") or [],
            "completedAt": latest_visit.get("completedAt"),
        }

    return {
        "student": telemetry["student"],
        "healthSummary": health_summary,
        "statistics": stats,
        "activeVisit": telemetry.get("activeVisit"),
        "profileCompletion": telemetry.get("profileCompletion"),
        "recentPrescription": recent_presc,
    }


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

    return fetch_student_history_records(clean_roll)
