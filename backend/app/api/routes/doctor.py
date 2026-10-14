from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db_connection
from app.core.deps import (
    CurrentDoctor,
    CurrentUser,
    get_current_doctor,
    get_current_user,
    require_own_doctor_id,
)
from app.core.util import display_name_from_email
from app.schemas.doctor import CompleteConsultationRequest, UpdateValueRequest

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
def get_doctor_queue(doctor_id: int, current: CurrentDoctor = Depends(get_current_doctor)):
    require_own_doctor_id(doctor_id, current)

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT qe.queue_entry_id, qe.entered_at, v.visit_id, v.roll_number,
                       st.full_name, st.date_of_birth, st.blood_group
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                WHERE qe.doctor_id = %s AND qe.status = 'WAITING'
                ORDER BY qe.queue_sequence ASC
                """,
                (doctor_id,),
            )
            rows = cursor.fetchall()
    finally:
        connection.close()

    return [
        {
            "queueEntryId": r["queue_entry_id"],
            "visitId": r["visit_id"],
            "rollNumber": r["roll_number"],
            "name": r["full_name"],
            "waitingSince": r["entered_at"].strftime("%I:%M %p") if r["entered_at"] else None,
            "age": _calculate_age(r["date_of_birth"]),
            "bloodGroup": r["blood_group"],
        }
        for r in rows
    ]


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
                raise HTTPException(status_code=404, detail="Student profile not found")

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
            cursor.execute("SELECT 1 FROM STUDENT WHERE roll_number = %s", (roll_number,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Patient not found")
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
                WHERE v.roll_number = %s
                ORDER BY v.checked_in_at DESC
                """,
                (roll_number,),
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
        with connection.cursor() as cursor:
            # Check if doctor already has an active consultation
            cursor.execute(
                """
                SELECT qe.queue_entry_id, v.visit_id, v.roll_number, st.full_name
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                WHERE qe.doctor_id = %s AND qe.status = 'IN_CONSULTATION'
                LIMIT 1
                """,
                (doctor_id,),
            )
            in_consult = cursor.fetchone()
            if in_consult:
                return {
                    "status": "already_in_consultation",
                    "queueEntryId": in_consult["queue_entry_id"],
                    "visitId": in_consult["visit_id"],
                    "rollNumber": in_consult["roll_number"],
                    "name": in_consult["full_name"],
                }

            # Fetch next waiting patient in sequence
            cursor.execute(
                """
                SELECT qe.queue_entry_id, qe.queue_sequence, v.visit_id, v.roll_number, st.full_name
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                WHERE qe.doctor_id = %s AND qe.status = 'WAITING'
                ORDER BY qe.queue_sequence ASC, qe.entered_at ASC
                LIMIT 1
                """,
                (doctor_id,),
            )
            next_patient = cursor.fetchone()
            if not next_patient:
                raise HTTPException(status_code=404, detail="No patients currently waiting in queue.")

            queue_entry_id = next_patient["queue_entry_id"]
            visit_id = next_patient["visit_id"]

            cursor.execute(
                """
                UPDATE QUEUE_ENTRY
                SET status = 'IN_CONSULTATION', called_at = NOW()
                WHERE queue_entry_id = %s
                """,
                (queue_entry_id,),
            )

            cursor.execute(
                """
                UPDATE VISIT
                SET status = 'IN_CONSULTATION', consultation_started_at = NOW()
                WHERE visit_id = %s
                """,
                (visit_id,),
            )

            cursor.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
                VALUES (%s, 'CONSULTATION_STARTED', %s, %s)
                """,
                (visit_id, current.user_id, f"Called by Doctor #{doctor_id}"),
            )

            connection.commit()
            return {
                "status": "called",
                "queueEntryId": queue_entry_id,
                "visitId": visit_id,
                "rollNumber": next_patient["roll_number"],
                "name": next_patient["full_name"],
                "sequence": next_patient["queue_sequence"],
            }
    except HTTPException:
        connection.rollback()
        raise
    except Exception as exc:
        connection.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to call next patient: {exc}")
    finally:
        connection.close()


# ── complete consultation ───────────────────────────────────────────────

@router.post("/doctor/{doctor_id}/complete")
def complete_consultation(
    doctor_id: int,
    payload: CompleteConsultationRequest,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    require_own_doctor_id(doctor_id, current)

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT qe.queue_entry_id, v.visit_id
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                WHERE qe.doctor_id = %s AND v.roll_number = %s
                  AND qe.status IN ('WAITING', 'IN_CONSULTATION')
                ORDER BY qe.entered_at DESC
                LIMIT 1
                """,
                (doctor_id, payload.roll_number),
            )
            active = cursor.fetchone()
            if not active:
                raise HTTPException(
                    status_code=404,
                    detail="No active visit found for this patient with this doctor",
                )
            visit_id = active["visit_id"]
            queue_entry_id = active["queue_entry_id"]

            cursor.execute(
                """
                INSERT INTO CONSULTATION (visit_id, doctor_id, reason_for_visit, diagnosis, clinical_notes)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (visit_id, doctor_id, payload.diagnosis, payload.diagnosis, payload.general or None),
            )
            consultation_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO PRESCRIPTION (consultation_id, general_instructions, finalized_at)
                VALUES (%s, %s, NOW())
                """,
                (consultation_id, payload.general or None),
            )
            prescription_id = cursor.lastrowid

            for med in payload.medicines:
                name = (med.name or "").strip()
                if not name:
                    continue
                cursor.execute(
                    """
                    INSERT INTO PRESCRIPTION_ITEM (prescription_id, medicine_name, special_instructions)
                    VALUES (%s, %s, %s)
                    """,
                    (prescription_id, name, med.note or None),
                )
                prescription_item_id = cursor.lastrowid

                for flag, time_of_day in ((med.morning, "MORNING"), (med.evening, "EVENING"), (med.night, "NIGHT")):
                    if flag:
                        cursor.execute(
                            """
                            INSERT INTO PRESCRIPTION_DOSE (prescription_item_id, time_of_day, dose_quantity, dose_unit)
                            VALUES (%s, %s, %s, %s)
                            """,
                            (prescription_item_id, time_of_day, 1, "dose"),
                        )

            cursor.execute(
                """
                UPDATE QUEUE_ENTRY
                SET status = 'COMPLETED', exited_at = NOW(), exit_reason = 'COMPLETED'
                WHERE queue_entry_id = %s
                """,
                (queue_entry_id,),
            )

            cursor.execute(
                """
                UPDATE VISIT
                SET status = 'WAITING_FOR_MEDICINE', consultation_completed_at = NOW()
                WHERE visit_id = %s
                """,
                (visit_id,),
            )

            cursor.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
                VALUES (%s, 'CONSULTATION_COMPLETED', %s, NULL)
                """,
                (visit_id, current.user_id),
            )

            connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Failed to save consultation")
    finally:
        connection.close()

    return {"status": "ok", "visitId": visit_id, "consultationId": consultation_id}

