from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.database import get_db_connection
from app.core.deps import (
    CurrentDoctor,
    CurrentUser,
    get_current_doctor,
    get_current_staff,
    get_current_user,
    require_own_doctor_id,
)
from app.core.util import display_name_from_email
from app.schemas.doctor import (
    CompleteConsultationRequest,
    CompleteConsultationResponse,
    UpdateValueRequest,
)
from app.services import queue_lifecycle as ql

router = APIRouter(tags=["doctor"])

OTHER_CONDITION_NAME = "Other / Unspecified"


# ── small shared helpers ────────────────────────────────────────────────

def _calculate_age(date_of_birth) -> int:
    if date_of_birth is None:
        return None
    today = date.today()
    return today.year - date_of_birth.year - (
        (today.month, today.day) < (date_of_birth.month, date_of_birth.day)
    )


def _get_or_create_other_condition_id(cursor) -> int:
    cursor.execute("SELECT condition_id FROM `CONDITION` WHERE name = %s", (OTHER_CONDITION_NAME,))
    row = cursor.fetchone()
    if row:
        return row["condition_id"]
    cursor.execute(
        "INSERT INTO `CONDITION` (name, description, is_active) VALUES (%s, %s, TRUE)",
        (OTHER_CONDITION_NAME, "Catch-all for conditions entered as free text from the doctor dashboard"),
    )
    return cursor.lastrowid


def _fetch_summary(cursor, roll_number: str) -> dict:
    cursor.execute(
        """
        SELECT allergen, severity
        FROM ALLERGY
        WHERE roll_number = %s AND ended_at IS NULL
        ORDER BY recorded_at
        """,
        (roll_number,),
    )
    allergy_rows = cursor.fetchall()
    if allergy_rows:
        allergies = ", ".join(
            f"{r['allergen']} ({r['severity'].title()})" if r["severity"] != "UNKNOWN" else r["allergen"]
            for r in allergy_rows
        )
    else:
        allergies = "None recorded"

    cursor.execute(
        """
        SELECT c.name, sc.other_description
        FROM STUDENT_CONDITION sc
        JOIN `CONDITION` c ON c.condition_id = sc.condition_id
        WHERE sc.roll_number = %s AND sc.ended_at IS NULL
        ORDER BY sc.recorded_at
        """,
        (roll_number,),
    )
    condition_rows = cursor.fetchall()
    if condition_rows:
        conditions = ", ".join(
            r["other_description"] if r["name"] == OTHER_CONDITION_NAME and r["other_description"] else r["name"]
            for r in condition_rows
        )
    else:
        conditions = "None recorded"

    cursor.execute(
        """
        SELECT medicine_name, strength, dose
        FROM STUDENT_MEDICATION
        WHERE roll_number = %s AND ended_at IS NULL
        ORDER BY started_at
        """,
        (roll_number,),
    )
    medication_rows = cursor.fetchall()
    if medication_rows:
        parts = []
        for r in medication_rows:
            label = r["medicine_name"]
            if r["strength"]:
                label += f" {r['strength']}"
            if r["dose"]:
                label += f" ({r['dose']})"
            parts.append(label)
        medication = "; ".join(parts)
    else:
        medication = "None recorded"

    return {"conditions": conditions, "allergies": allergies, "medication": medication}


# ── doctor profile / queue / stats ──────────────────────────────────────

@router.get("/doctor/{doctor_id}/profile")
def get_doctor_profile(doctor_id: int, current: CurrentDoctor = Depends(get_current_doctor)):
    require_own_doctor_id(doctor_id, current)

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT d.doctor_id, d.license_number, sp.name AS specialty_name, ua.email
                FROM DOCTOR d
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                WHERE d.doctor_id = %s
                """,
                (doctor_id,),
            )
            doctor_row = cursor.fetchone()
            if not doctor_row:
                raise HTTPException(status_code=404, detail="Doctor not found")

            cursor.execute(
                """
                SELECT start_time, end_time
                FROM DOCTOR_AVAILABILITY
                WHERE doctor_id = %s AND availability_date = CURDATE() AND status = 'AVAILABLE'
                LIMIT 1
                """,
                (doctor_id,),
            )
            availability_row = cursor.fetchone()
    finally:
        connection.close()

    if availability_row and availability_row["start_time"] and availability_row["end_time"]:
        shift = f"{availability_row['start_time']} - {availability_row['end_time']}"
    else:
        shift = "Not set"

    return {
        "doctorId": doctor_row["doctor_id"],
        "name": display_name_from_email(doctor_row["email"]),
        "specialization": doctor_row["specialty_name"] or "General",
        "shift": shift,
        "email": doctor_row["email"],
    }


@router.get("/doctor/{doctor_id}/queue")
def get_doctor_queue(
    doctor_id: int,
    current: CurrentUser = Depends(get_current_staff),
):
    """
    Doctor queue endpoint:
    - Doctors are strictly authorized to view only their own queue line (cross-doctor access is 403 Forbidden).
    - Receptionists are authorized to view any doctor's queue line to assist with coordination and triage.
    - Students are rejected with 403 Forbidden; unauthenticated callers receive 401 Unauthorized.
    """
    if current.role == "DOCTOR":
        if current.doctor_id != doctor_id:
            raise HTTPException(
                status_code=403,
                detail="Access forbidden: You are not authorized to view or modify another doctor's workstation.",
            )
    elif current.role == "RECEPTIONIST":
        # Receptionists have permission to view any doctor's queue
        pass
    else:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden: Medical staff or receptionist privileges required.",
        )

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT qe.queue_entry_id, qe.doctor_id, qe.queue_sequence, qe.status AS queue_status,
                       qe.entered_at, qe.called_at, qe.entry_reason,
                       v.visit_id, v.roll_number, v.patient_id, v.status AS visit_status, v.checked_in_at,
                       COALESCE(st.full_name, p.full_name) AS full_name,
                       COALESCE(st.date_of_birth, p.date_of_birth) AS date_of_birth,
                       COALESCE(st.blood_group, p.blood_group) AS blood_group,
                       cp.community_code, cp.category AS community_category,
                       p.patient_type, p.age AS patient_age,
                       (SELECT ve.notes FROM VISIT_EVENT ve
                        WHERE ve.visit_id = v.visit_id AND ve.event_type = 'CHECKED_IN'
                        ORDER BY ve.event_id DESC LIMIT 1) AS checkin_notes
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                LEFT JOIN PATIENT p ON p.patient_id = v.patient_id
                LEFT JOIN STUDENT st ON st.roll_number = v.roll_number
                LEFT JOIN COMMUNITY_PROFILE cp ON cp.patient_id = p.patient_id
                WHERE qe.doctor_id = %s AND qe.status IN ('IN_CONSULTATION', 'WAITING')
                ORDER BY FIELD(qe.status, 'IN_CONSULTATION', 'WAITING'), qe.queue_sequence ASC, qe.entered_at ASC
                """,
                (doctor_id,),
            )
            rows = cursor.fetchall()
    finally:
        connection.close()

    result = []
    for r in rows:
        # Extract chief complaint if recorded at check-in
        complaint = ""
        notes = r.get("checkin_notes")
        if notes:
            if " - " in notes:
                complaint = notes.split(" - ", 1)[1].strip()
            elif not any(term in notes.lower() for term in ("check-in", "checkin")):
                complaint = notes.strip()
        if not complaint and r.get("entry_reason") and r["entry_reason"] != "INITIAL_CHECKIN":
            complaint = r["entry_reason"]

        chk_time = r.get("checked_in_at") or r.get("entered_at")
        chk_iso = chk_time.isoformat() if chk_time else None
        entered_iso = r["entered_at"].isoformat() if r.get("entered_at") else None
        called_iso = r["called_at"].isoformat() if r.get("called_at") else None
        waiting_since = r["entered_at"].strftime("%I:%M %p") if r.get("entered_at") else None
        called_at = r["called_at"].strftime("%I:%M %p") if r.get("called_at") else None

        result.append({
            # Identifiers
            "queueEntryId": r["queue_entry_id"],
            "queue_entry_id": r["queue_entry_id"],
            "visitId": r["visit_id"],
            "visit_id": r["visit_id"],
            "doctorId": doctor_id,
            "doctor_id": doctor_id,
            "rollNumber": r["roll_number"] or r.get("community_code") or f"PAT-{r.get('patient_id')}",
            "roll_number": r["roll_number"] or r.get("community_code") or f"PAT-{r.get('patient_id')}",
            "rollNo": r["roll_number"] or r.get("community_code") or f"PAT-{r.get('patient_id')}",
            "communityCode": r.get("community_code"),
            "category": r.get("community_category") or "Student",
            "patientType": r.get("patient_type") or ("COMMUNITY" if not r["roll_number"] else "STUDENT"),
            "name": r["full_name"],
            "student_name": r["full_name"],
            "bloodGroup": r.get("blood_group"),
            "blood_group": r.get("blood_group"),
            "age": _calculate_age(r.get("date_of_birth")) or r.get("patient_age") or 30,

            # Status & Queue sequence
            "status": "In Consultation" if r["queue_status"] == "IN_CONSULTATION" else "Waiting",
            "statusCode": r["queue_status"],
            "status_code": r["queue_status"],
            "queueStatus": r["queue_status"],
            "queue_status": r["queue_status"],
            "visitStatus": r["visit_status"],
            "visit_status": r["visit_status"],
            "queueNo": r["queue_sequence"],
            "queue_number": r["queue_sequence"],
            "queue_sequence": r["queue_sequence"],

            # Timing
            "checkInTime": chk_iso,
            "check_in_time": chk_iso,
            "checkedInAt": chk_iso,
            "checked_in_at": chk_iso,
            "enteredAt": entered_iso,
            "entered_at": entered_iso,
            "waitingSince": waiting_since,
            "calledAt": called_at,
            "called_at": called_iso,

            # Clinical details
            "complaint": complaint,
        })

    return result


@router.get("/doctor/{doctor_id}/active-consultation")
def get_active_consultation(
    doctor_id: int,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    """
    Doctor-only endpoint: Returns the single student currently in active consultation with this doctor.
    Returns active=False when no consultation is in progress.
    """
    require_own_doctor_id(doctor_id, current)

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT qe.queue_entry_id, qe.called_at, qe.queue_sequence,
                       v.visit_id, v.roll_number, v.patient_id,
                       COALESCE(st.full_name, p.full_name) AS full_name,
                       st.date_of_birth,
                       COALESCE(st.blood_group, p.blood_group) AS blood_group,
                       p.age AS patient_age,
                       cp.community_code
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                LEFT JOIN PATIENT p ON p.patient_id = v.patient_id
                LEFT JOIN STUDENT st ON st.roll_number = v.roll_number
                LEFT JOIN COMMUNITY_PROFILE cp ON cp.patient_id = p.patient_id
                WHERE qe.doctor_id = %s AND qe.status = 'IN_CONSULTATION'
                LIMIT 1
                """,
                (doctor_id,),
            )
            row = cursor.fetchone()
            if not row:
                return {"active": False, "patient": None}

            roll_disp = row["roll_number"] or row.get("community_code") or (f"PAT-{row['patient_id']}" if row.get("patient_id") else None)
            age = _calculate_age(row["date_of_birth"]) if row.get("date_of_birth") else row.get("patient_age")
            return {
                "active": True,
                "patient": {
                    "queueEntryId": row["queue_entry_id"],
                    "visitId": row["visit_id"],
                    "rollNumber": roll_disp,
                    "name": row["full_name"],
                    "queueNo": row["queue_sequence"],
                    "calledAt": row["called_at"].strftime("%I:%M %p") if row.get("called_at") else None,
                    "age": age,
                    "bloodGroup": row["blood_group"],
                },
            }
    finally:
        connection.close()


@router.get("/doctor/{doctor_id}/stats")
def get_doctor_stats(doctor_id: int, current: CurrentDoctor = Depends(get_current_doctor)):
    require_own_doctor_id(doctor_id, current)

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COUNT(*) AS n FROM QUEUE_ENTRY WHERE doctor_id = %s AND status = 'WAITING'",
                (doctor_id,),
            )
            waiting = cursor.fetchone()["n"]

            cursor.execute(
                """
                SELECT COUNT(*) AS n FROM QUEUE_ENTRY
                WHERE doctor_id = %s AND status = 'COMPLETED' AND DATE(exited_at) = CURDATE()
                """,
                (doctor_id,),
            )
            seen_today = cursor.fetchone()["n"]
    finally:
        connection.close()

    return {"waiting": waiting, "seenToday": seen_today, "totalToday": waiting + seen_today}


# ── patient profile / summary / history ──────────────────────────────────

def _verify_patient_read_access(roll_number: str, current: CurrentUser) -> None:
    """Doctors and staff can view any patient. Students can only view their own record."""
    if current.role in ("DOCTOR", "RECEPTIONIST"):
        return
    if current.role == "STUDENT" and (current.roll_number or "").upper() == roll_number.upper():
        return
    raise HTTPException(
        status_code=403,
        detail="You are not authorized to view this patient's medical records",
    )


@router.get("/patient/{roll_number}/profile")
def get_patient_profile(roll_number: str, current: CurrentUser = Depends(get_current_user)):
    _verify_patient_read_access(roll_number, current)
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT st.roll_number, st.full_name, st.date_of_birth, st.sex,
                       st.phone_number, st.blood_group, st.status, ua.email
                FROM STUDENT st
                JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id
                WHERE st.roll_number = %s
                """,
                (roll_number,),
            )
            row = cursor.fetchone()
            if not row:
                # Check COMMUNITY_PROFILE / PATIENT
                cursor.execute(
                    """
                    SELECT cp.community_code AS roll_number, cp.full_name, p.date_of_birth, p.gender AS sex,
                           p.phone_number, cp.blood_group, 'ACTIVE' AS status, NULL AS email, cp.category
                    FROM COMMUNITY_PROFILE cp
                    JOIN PATIENT p ON p.patient_id = cp.patient_id
                    WHERE cp.community_code = %s
                    """,
                    (roll_number,),
                )
                comm_row = cursor.fetchone()
                if comm_row:
                    return {
                        "name": comm_row["full_name"],
                        "rollNumber": comm_row["roll_number"],
                        "course": "Community",
                        "branch": comm_row["category"] or "Campus Community",
                        "bloodGroup": comm_row["blood_group"] or "Not recorded",
                        "email": "community@thapar.edu",
                        "contact": comm_row["phone_number"] or "Not on file",
                        "dateOfBirth": str(comm_row["date_of_birth"]) if comm_row["date_of_birth"] else None,
                        "sex": comm_row["sex"] or "Not specified",
                        "status": "ACTIVE",
                    }
                raise HTTPException(status_code=404, detail="Patient profile not found")

            # Format course and branch
            course = "B.E."
            branch = "Computer Engineering"
            rn = roll_number.upper()
            if "EC" in rn:
                branch = "Electronics & Communication Engineering"
            elif "ME" in rn:
                branch = "Mechanical Engineering"
            elif "CE" in rn:
                branch = "Civil Engineering"

            return {
                "name": row["full_name"],
                "rollNumber": row["roll_number"],
                "course": course,
                "branch": branch,
                "bloodGroup": row["blood_group"] or "Not recorded",
                "email": row["email"],
                "contact": row["phone_number"] or "Not on file",
                "dateOfBirth": str(row["date_of_birth"]) if row["date_of_birth"] else None,
                "sex": row["sex"],
                "status": row["status"],
            }
    finally:
        connection.close()


@router.get("/patient/{roll_number}/summary")
def get_patient_summary(roll_number: str, current: CurrentUser = Depends(get_current_user)):
    _verify_patient_read_access(roll_number, current)
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1 FROM STUDENT WHERE roll_number = %s
                UNION
                SELECT 1 FROM COMMUNITY_PROFILE WHERE community_code = %s
                """,
                (roll_number, roll_number),
            )
            if not cursor.fetchone():
                return {"conditions": "None recorded", "allergies": "None recorded", "medication": "None recorded"}
            return _fetch_summary(cursor, roll_number)
    finally:
        connection.close()


@router.get("/patient/{roll_number}/history")
def get_patient_history(roll_number: str, current: CurrentUser = Depends(get_current_user)):
    _verify_patient_read_access(roll_number, current)
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT v.visit_id, v.checked_in_at, co.consultation_id, co.diagnosis,
                       co.clinical_notes, pr.prescription_id, pr.general_instructions
                FROM VISIT v
                JOIN CONSULTATION co ON co.visit_id = v.visit_id
                LEFT JOIN PRESCRIPTION pr ON pr.consultation_id = co.consultation_id
                LEFT JOIN COMMUNITY_PROFILE cp ON cp.patient_id = v.patient_id
                WHERE v.roll_number = %s OR cp.community_code = %s
                ORDER BY v.checked_in_at DESC
                """,
                (roll_number, roll_number),
            )
            visits = cursor.fetchall()

            history = []
            for v in visits:
                medicines = []
                if v["prescription_id"]:
                    cursor.execute(
                        """
                        SELECT pi.prescription_item_id, pi.medicine_name, pi.special_instructions
                        FROM PRESCRIPTION_ITEM pi
                        WHERE pi.prescription_id = %s
                        """,
                        (v["prescription_id"],),
                    )
                    items = cursor.fetchall()
                    for item in items:
                        cursor.execute(
                            """
                            SELECT time_of_day FROM PRESCRIPTION_DOSE
                            WHERE prescription_item_id = %s
                            ORDER BY FIELD(time_of_day, 'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT')
                            """,
                            (item["prescription_item_id"],),
                        )
                        doses = cursor.fetchall()
                        timing = ", ".join(d["time_of_day"].lower() for d in doses) or "as needed"
                        medicines.append(
                            {
                                "name": item["medicine_name"],
                                "timing": timing,
                                "note": item["special_instructions"] or "",
                            }
                        )

                history.append(
                    {
                        "date": v["checked_in_at"].strftime("%d %b %Y") if v["checked_in_at"] else "",
                        "diagnosis": v["diagnosis"],
                        "notes": v["clinical_notes"] or v["general_instructions"] or "",
                        "medicines": medicines,
                    }
                )
    finally:
        connection.close()

    return history


# ── patient summary field updates (adapter onto structured tables) ─────

@router.put("/patient/{roll_number}/allergy")
def update_allergy(
    roll_number: str, payload: UpdateValueRequest, current: CurrentDoctor = Depends(get_current_doctor)
):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM STUDENT WHERE roll_number = %s", (roll_number,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Patient not found")

            cursor.execute(
                "UPDATE ALLERGY SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                (roll_number,),
            )

            value = payload.value.strip()
            if value and value != "None recorded":
                cursor.execute(
                    """
                    INSERT INTO ALLERGY (roll_number, allergen, reaction, severity, recorded_by_user_id)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (roll_number, value, "Not specified", "UNKNOWN", current.user_id),
                )

            connection.commit()
            summary = _fetch_summary(cursor, roll_number)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    return summary


@router.put("/patient/{roll_number}/condition")
def update_condition(
    roll_number: str, payload: UpdateValueRequest, current: CurrentDoctor = Depends(get_current_doctor)
):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM STUDENT WHERE roll_number = %s", (roll_number,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Patient not found")

            cursor.execute(
                "UPDATE STUDENT_CONDITION SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                (roll_number,),
            )

            value = payload.value.strip()
            if value and value != "None recorded":
                other_condition_id = _get_or_create_other_condition_id(cursor)
                cursor.execute(
                    """
                    INSERT INTO STUDENT_CONDITION (roll_number, condition_id, other_description, recorded_by_user_id)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (roll_number, other_condition_id, value, current.user_id),
                )

            connection.commit()
            summary = _fetch_summary(cursor, roll_number)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    return summary


@router.put("/patient/{roll_number}/medication")
def update_medication(
    roll_number: str, payload: UpdateValueRequest, current: CurrentDoctor = Depends(get_current_doctor)
):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM STUDENT WHERE roll_number = %s", (roll_number,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Patient not found")

            cursor.execute(
                "UPDATE STUDENT_MEDICATION SET ended_at = CURDATE() WHERE roll_number = %s AND ended_at IS NULL",
                (roll_number,),
            )

            value = payload.value.strip()
            if value and value != "None recorded":
                cursor.execute(
                    """
                    INSERT INTO STUDENT_MEDICATION (roll_number, medicine_name, started_at, recorded_by_user_id)
                    VALUES (%s, %s, CURDATE(), %s)
                    """,
                    (roll_number, value, current.user_id),
                )

            connection.commit()
            summary = _fetch_summary(cursor, roll_number)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

# ── call next student in queue ──────────────────────────────────────────

@router.post("/doctor/{doctor_id}/call-next")
def call_next_student(
    doctor_id: int,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    require_own_doctor_id(doctor_id, current)
    connection = get_db_connection()
    try:
        res = ql.call_next_patient(
            conn=connection,
            doctor_id=doctor_id,
            performed_by_user_id=current.user_id,
        )
        connection.commit()
        return res
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to call next patient: {exc}")
    finally:
        connection.close()


# ── complete consultation ───────────────────────────────────────────────

@router.post("/doctor/{doctor_id}/complete", response_model=CompleteConsultationResponse)
@router.post("/doctor/{doctor_id}/complete/{visit_id}", response_model=CompleteConsultationResponse)
def complete_consultation(
    doctor_id: int,
    payload: CompleteConsultationRequest,
    visit_id: Optional[int] = None,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    """
    Completes a doctor consultation, persists consultation notes, prescription header,
    medicine items and dose schedules atomically in one transaction, and transitions
    the visit to WAITING_FOR_MEDICINE.
    Supports identifying visits via:
    - Path parameter: /doctor/{doctor_id}/complete/{visit_id}
    - Request body: payload.visit_id
    - Student roll: payload.roll_number (active consultation lookup)
    """
    require_own_doctor_id(doctor_id, current)
    target_visit_id = visit_id or payload.visit_id
    connection = get_db_connection()
    try:
        meds_data = [
            {
                "name": med.name,
                "strength": med.strength,
                "dosage_form": med.dosage_form,
                "route": med.route,
                "duration_value": med.duration_value,
                "duration_unit": med.duration_unit,
                "duration": med.duration,
                "meal_relation": med.meal_relation,
                "special_instructions": med.special_instructions or med.instructions or med.note,
                "note": med.note,
                "instructions": med.instructions,
                "morning": med.morning,
                "afternoon": med.afternoon,
                "evening": med.evening,
                "night": med.night,
                "dosage": med.dosage,
                "dose_quantity": med.dose_quantity,
                "dose_unit": med.dose_unit,
                "doses": [d.model_dump() for d in med.doses] if med.doses else None,
            }
            for med in payload.medicines
        ]
        res = ql.complete_consultation(
            conn=connection,
            doctor_id=doctor_id,
            visit_id=target_visit_id,
            roll_number=payload.roll_number,
            diagnosis=payload.diagnosis,
            reason_for_visit=payload.reason_for_visit,
            clinical_notes=payload.clinical_notes or payload.general,
            general_instructions=payload.general_instructions or payload.general,
            medicines=meds_data,
            performed_by_user_id=current.user_id,
        )
        connection.commit()
        return res
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except ql.UnauthorizedActionError as exc:
        connection.rollback()
        raise HTTPException(status_code=403, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to complete consultation: {exc}")
    finally:
        connection.close()


# ── mark no-show ────────────────────────────────────────────────────────

@router.post("/doctor/{doctor_id}/no-show/{visit_id}")
def mark_doctor_patient_no_show(
    doctor_id: int,
    visit_id: int,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    require_own_doctor_id(doctor_id, current)
    connection = get_db_connection()
    try:
        res = ql.mark_no_show(
            conn=connection,
            visit_id=visit_id,
            doctor_id=doctor_id,
            performed_by_user_id=current.user_id,
        )
        connection.commit()
        return res
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to mark no-show: {exc}")
    finally:
        connection.close()


# ── start consultation ──────────────────────────────────────────────────

class StartConsultationRequest(BaseModel):
    visit_id: Optional[int] = Field(None, description="Specific visit ID to start consultation for (if omitted, advances next waiting student)")


@router.post("/doctor/{doctor_id}/start-consultation")
def start_doctor_consultation(
    doctor_id: int,
    payload: Optional[StartConsultationRequest] = None,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    """
    Doctor workstation operation: Starts consultation for a specific visit or advances next.
    Safe against concurrent requests via doctor workstation locking.
    """
    require_own_doctor_id(doctor_id, current)
    connection = get_db_connection()
    try:
        if payload and payload.visit_id:
            res = ql.start_consultation(
                conn=connection,
                doctor_id=doctor_id,
                visit_id=payload.visit_id,
                performed_by_user_id=current.user_id,
            )
        else:
            res = ql.call_next_patient(
                conn=connection,
                doctor_id=doctor_id,
                performed_by_user_id=current.user_id,
            )
        connection.commit()
        return res
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start consultation: {exc}")
    finally:
        connection.close()


@router.post("/doctor/{doctor_id}/start-consultation/{visit_id}")
def start_doctor_consultation_by_id(
    doctor_id: int,
    visit_id: int,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    """
    Doctor workstation operation: Starts consultation for a specific visit by path parameter.
    """
    require_own_doctor_id(doctor_id, current)
    connection = get_db_connection()
    try:
        res = ql.start_consultation(
            conn=connection,
            doctor_id=doctor_id,
            visit_id=visit_id,
            performed_by_user_id=current.user_id,
        )
        connection.commit()
        return res
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start consultation: {exc}")
    finally:
        connection.close()


# ── redirect patient ───────────────────────────────────────────────────

class DoctorRedirectRequest(BaseModel):
    target_doctor_id: int = Field(..., description="Target doctor to redirect patient to")
    reason: Optional[str] = Field("Doctor clinical referral", description="Reason for redirect")


@router.post("/doctor/{doctor_id}/redirect/{visit_id}")
def redirect_doctor_patient(
    doctor_id: int,
    visit_id: int,
    payload: DoctorRedirectRequest,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    """
    Doctor operation: Redirects an active or waiting visit from this doctor to another doctor.
    """
    require_own_doctor_id(doctor_id, current)
    connection = get_db_connection()
    try:
        res = ql.redirect_patient(
            conn=connection,
            visit_id=visit_id,
            target_doctor_id=payload.target_doctor_id,
            performed_by_user_id=current.user_id,
            current_doctor_id=doctor_id,
            reason=payload.reason or "Doctor clinical referral",
        )
        connection.commit()
        return res
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=404, detail=str(exc))
    except (ql.InvalidTransitionError, ql.DoctorUnavailableError) as exc:
        connection.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to redirect patient: {exc}")
    finally:
        connection.close()


