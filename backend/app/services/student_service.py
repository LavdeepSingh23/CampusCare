"""
Service layer for Student identity, profile telemetry, account linking, and onboarding (SD-1 & SD-2).
"""

import logging
import re
from datetime import date, datetime
from typing import Optional, Dict, Any, List

from fastapi import HTTPException, status
from app.core.database import get_db_connection

logger = logging.getLogger(__name__)

VALID_BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
VALID_SEX_OPTIONS = {"MALE", "FEMALE", "OTHER"}
VALID_SEVERITY_OPTIONS = {"MILD", "MODERATE", "SEVERE", "UNKNOWN"}


def derive_academic_info(roll_number: str) -> Dict[str, Any]:
    """Infers program, branch, department, and estimated semester from student roll number."""
    rn = roll_number.strip().upper()
    program = "B.E."
    branch = "Computer Engineering"
    department = "Computer Science & Engineering"
    semester = 6

    if "EC" in rn or rn.startswith("102203"):
        branch = "Computer Science and Business Systems"
        department = "Computer Science & Engineering"
    elif "ME" in rn:
        branch = "Mechanical Engineering"
        department = "Mechanical Engineering"
    elif "CE" in rn:
        branch = "Civil Engineering"
        department = "Civil Engineering"
    elif "EE" in rn or "ELE" in rn:
        branch = "Electrical Engineering"
        department = "Electrical & Instrumentation Engineering"
    elif "BT" in rn:
        program = "B.Tech"
        branch = "Biotechnology"
        department = "Biotechnology"
    elif "BE" in rn:
        program = "B.E."
        branch = "Computer Engineering"

    # Infer semester if roll number contains admission year (e.g., 1024xxx -> 2nd year -> Sem 4)
    if len(rn) >= 4 and rn[:4].isdigit():
        adm_year = int(rn[2:4])
        # Approximate assuming current year 2026: (26 - adm_year) * 2
        approx_sem = max(1, min(8, (26 - adm_year) * 2))
        semester = approx_sem

    return {
        "program": program,
        "branch": branch,
        "department": department,
        "semester": semester,
    }


def calculate_profile_completion(
    identity: Dict[str, Any],
    emergency_contacts: List[Dict[str, Any]],
    medical_status: Dict[str, str],
) -> Dict[str, Any]:
    """
    Computes checklist items, completion percentage, and completion status.
    Checklist (8 items total, each 12.5%):
    1. Personal Phone Number
    2. Date of Birth
    3. Gender Identity
    4. Blood Group
    5. Emergency Contact
    6. Allergy Status Declaration
    7. Chronic Condition Status Declaration
    8. Current Medication Status Declaration
    """
    completed_fields = []
    missing_fields = []

    # 1. Phone Number
    phone = identity.get("phoneNumber")
    if phone and len(re.sub(r"\D", "", str(phone))) >= 10:
        completed_fields.append("Phone Number")
    else:
        missing_fields.append("Phone Number")

    # 2. Date of Birth
    dob = identity.get("dateOfBirth")
    if dob:
        completed_fields.append("Date of Birth")
    else:
        missing_fields.append("Date of Birth")

    # 3. Gender / Sex
    sex = identity.get("sex")
    if sex and sex in VALID_SEX_OPTIONS:
        completed_fields.append("Gender Identity")
    else:
        missing_fields.append("Gender Identity")

    # 4. Blood Group
    bg = identity.get("bloodGroup")
    if bg and bg.strip().upper() in VALID_BLOOD_GROUPS:
        completed_fields.append("Blood Group")
    else:
        missing_fields.append("Blood Group")

    # 5. Emergency Contact
    if emergency_contacts and len(emergency_contacts) > 0:
        c = emergency_contacts[0]
        if c.get("name") and c.get("phoneNumber") and c.get("relationship"):
            completed_fields.append("Emergency Contact")
        else:
            missing_fields.append("Emergency Contact")
    else:
        missing_fields.append("Emergency Contact")

    # 6. Allergy Declaration
    allergy_stat = medical_status.get("allergy_status", "NOT_REPORTED")
    if allergy_stat in ("NONE_REPORTED", "HAS_RECORDS"):
        completed_fields.append("Allergy Declaration")
    else:
        missing_fields.append("Allergy Declaration")

    # 7. Chronic Condition Declaration
    cond_stat = medical_status.get("condition_status", "NOT_REPORTED")
    if cond_stat in ("NONE_REPORTED", "HAS_RECORDS"):
        completed_fields.append("Chronic Condition Declaration")
    else:
        missing_fields.append("Chronic Condition Declaration")

    # 8. Medication Declaration
    med_stat = medical_status.get("medication_status", "NOT_REPORTED")
    if med_stat in ("NONE_REPORTED", "HAS_RECORDS"):
        completed_fields.append("Medication Declaration")
    else:
        missing_fields.append("Medication Declaration")

    total_checks = 8
    passed_checks = len(completed_fields)
    percentage = int(round((passed_checks / float(total_checks)) * 100))
    is_complete = (passed_checks == total_checks)
    status_label = "COMPLETED" if is_complete else "INCOMPLETE"

    return {
        "isComplete": is_complete,
        "percentage": percentage,
        "status": status_label,
        "missingFields": missing_fields,
        "completedFields": completed_fields,
    }


def resolve_or_create_student_account(
    email: str,
    google_sub: str,
    name: str,
) -> Dict[str, Any]:
    """
    Deterministically resolves or provisions a Student identity and links the Google Subject.
    1. Match USER_ACCOUNT by google_subject (primary link).
    2. Match USER_ACCOUNT by email (link google_subject on first OAuth login).
    3. If no USER_ACCOUNT exists, check if pre-seeded STUDENT exists by derived roll number:
       - Insert USER_ACCOUNT and link STUDENT.user_id.
    4. If neither exists, insert USER_ACCOUNT and STUDENT atomically.
    5. Rejects DISABLED or INACTIVE accounts with 403 Forbidden.
    """
    clean_email = email.strip().lower()
    match = re.search(r"\d{6,10}", clean_email)
    derived_roll = match.group(0) if match else clean_email.split("@")[0].upper()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Search for existing USER_ACCOUNT by google_subject or email
            cur.execute(
                """
                SELECT user_id, email, google_subject, account_type, status
                FROM USER_ACCOUNT
                WHERE google_subject = %s OR email = %s
                LIMIT 1
                FOR UPDATE
                """,
                (google_sub, clean_email),
            )
            user_row = cur.fetchone()

            if user_row:
                user_id = user_row["user_id"]
                if user_row["status"] == "DISABLED":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Student user account has been disabled. Please contact the campus health administrator.",
                    )

                # Link or refresh google_subject and last_login_at
                cur.execute(
                    """
                    UPDATE USER_ACCOUNT
                    SET google_subject = %s, last_login_at = NOW()
                    WHERE user_id = %s
                    """,
                    (google_sub, user_id),
                )

                # Check linked STUDENT profile
                cur.execute(
                    """
                    SELECT roll_number, full_name, status
                    FROM STUDENT
                    WHERE user_id = %s
                    LIMIT 1
                    FOR UPDATE
                    """,
                    (user_id,),
                )
                student_row = cur.fetchone()

                if student_row:
                    if student_row["status"] == "INACTIVE":
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Student academic record is currently inactive.",
                        )
                    roll_number = student_row["roll_number"]
                    full_name = student_row["full_name"] or name
                else:
                    # Check if pre-seeded by derived_roll
                    cur.execute(
                        "SELECT roll_number, status, full_name FROM STUDENT WHERE roll_number = %s FOR UPDATE",
                        (derived_roll,),
                    )
                    pre_seeded = cur.fetchone()
                    if pre_seeded:
                        cur.execute(
                            "UPDATE STUDENT SET user_id = %s, full_name = COALESCE(full_name, %s) WHERE roll_number = %s",
                            (user_id, name, derived_roll),
                        )
                        roll_number = derived_roll
                        full_name = pre_seeded["full_name"] or name
                    else:
                        cur.execute(
                            """
                            INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, status)
                            VALUES (%s, %s, %s, '2004-01-01', 'OTHER', 'ACTIVE')
                            """,
                            (derived_roll, user_id, name),
                        )
                        roll_number = derived_roll
                        full_name = name
            else:
                # 2. No USER_ACCOUNT exists: check for pre-seeded student by derived_roll
                cur.execute(
                    "SELECT roll_number, status, full_name FROM STUDENT WHERE roll_number = %s FOR UPDATE",
                    (derived_roll,),
                )
                pre_seeded = cur.fetchone()
                if pre_seeded and pre_seeded["status"] == "INACTIVE":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Student academic record is inactive.",
                    )

                # Insert new USER_ACCOUNT
                cur.execute(
                    """
                    INSERT INTO USER_ACCOUNT (email, google_subject, account_type, status, last_login_at)
                    VALUES (%s, %s, 'STUDENT', 'ACTIVE', NOW())
                    """,
                    (clean_email, google_sub),
                )
                user_id = cur.lastrowid

                if pre_seeded:
                    cur.execute(
                        """
                        UPDATE STUDENT
                        SET user_id = %s, full_name = COALESCE(full_name, %s)
                        WHERE roll_number = %s
                        """,
                        (user_id, name, derived_roll),
                    )
                    roll_number = derived_roll
                    full_name = pre_seeded["full_name"] or name
                else:
                    cur.execute(
                        """
                        INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, status)
                        VALUES (%s, %s, %s, '2004-01-01', 'OTHER', 'ACTIVE')
                        """,
                        (derived_roll, user_id, name),
                    )
                    roll_number = derived_roll
                    full_name = name

            # Ensure default MEDICAL_PROFILE_STATUS row exists
            cur.execute(
                """
                INSERT IGNORE INTO MEDICAL_PROFILE_STATUS (roll_number, allergy_status, condition_status, medication_status, updated_at)
                VALUES (%s, 'NOT_REPORTED', 'NOT_REPORTED', 'NOT_REPORTED', NOW())
                """,
                (roll_number,),
            )

        conn.commit()
    except HTTPException:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.error("Failed to link student account for %s: %s", clean_email, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error during student account linking: {exc}",
        )
    finally:
        conn.close()

    return {
        "user_id": user_id,
        "roll_number": roll_number,
        "full_name": full_name,
        "email": clean_email,
    }


def get_student_me_telemetry(user_id: int, roll_number: str) -> Dict[str, Any]:
    """
    Fetches full student profile telemetry, medical summary, emergency contacts,
    profile completion status, and active OPD visit status for the current student.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Identity & Demographics
            cur.execute(
                """
                SELECT st.roll_number, st.user_id, st.full_name, st.date_of_birth, st.sex,
                       st.phone_number, st.blood_group, st.status, ua.email
                FROM STUDENT st
                JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id
                WHERE st.roll_number = %s
                LIMIT 1
                """,
                (roll_number,),
            )
            student_row = cur.fetchone()
            if not student_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Student record '{roll_number}' not found.",
                )

            academic = derive_academic_info(roll_number)

            identity = {
                "userId": student_row["user_id"],
                "rollNumber": student_row["roll_number"],
                "fullName": student_row["full_name"],
                "email": student_row["email"],
                "dateOfBirth": str(student_row["date_of_birth"]) if student_row.get("date_of_birth") else None,
                "sex": student_row.get("sex"),
                "phoneNumber": student_row.get("phone_number"),
                "bloodGroup": student_row.get("blood_group") or "Not recorded",
                "status": student_row.get("status", "ACTIVE"),
                "program": academic["program"],
                "branch": academic["branch"],
                "department": academic["department"],
                "semester": academic["semester"],
            }

            # 2. Allergies
            cur.execute(
                """
                SELECT allergy_id, allergen, reaction, severity
                FROM ALLERGY
                WHERE roll_number = %s AND ended_at IS NULL
                ORDER BY recorded_at DESC
                """,
                (roll_number,),
            )
            allergy_rows = cur.fetchall()
            allergies = [
                {
                    "allergyId": r.get("allergy_id"),
                    "allergen": r["allergen"],
                    "reaction": r.get("reaction"),
                    "severity": r.get("severity") or "MILD",
                }
                for r in allergy_rows
            ]

            # 3. Chronic Conditions
            cur.execute(
                """
                SELECT c.name, sc.other_description
                FROM STUDENT_CONDITION sc
                JOIN `CONDITION` c ON c.condition_id = sc.condition_id
                WHERE sc.roll_number = %s AND sc.ended_at IS NULL
                ORDER BY sc.recorded_at DESC
                """,
                (roll_number,),
            )
            cond_rows = cur.fetchall()
            conditions = [
                r["other_description"] if r["name"] == "Other" and r.get("other_description") else r["name"]
                for r in cond_rows
            ]

            # 4. Current Medications
            cur.execute(
                """
                SELECT medicine_name, strength, dose
                FROM STUDENT_MEDICATION
                WHERE roll_number = %s AND ended_at IS NULL
                ORDER BY started_at DESC
                """,
                (roll_number,),
            )
            med_rows = cur.fetchall()
            medications = [
                f"{r['medicine_name']} ({r['strength'] or ''} {r['dose'] or ''})".strip()
                for r in med_rows
            ]

            # 5. Emergency Contacts
            cur.execute(
                """
                SELECT emergency_contact_id, name, relationship, phone_number
                FROM EMERGENCY_CONTACT
                WHERE roll_number = %s
                ORDER BY emergency_contact_id ASC
                """,
                (roll_number,),
            )
            contact_rows = cur.fetchall()
            contacts = [
                {
                    "contactId": r.get("emergency_contact_id"),
                    "name": r["name"],
                    "relationship": r["relationship"],
                    "phoneNumber": r["phone_number"],
                }
                for r in contact_rows
            ]

            # 6. Medical Profile Status (Onboarding completeness tracking)
            cur.execute(
                """
                SELECT allergy_status, condition_status, medication_status
                FROM MEDICAL_PROFILE_STATUS
                WHERE roll_number = %s
                LIMIT 1
                """,
                (roll_number,),
            )
            med_stat_row = cur.fetchone() or {
                "allergy_status": "NOT_REPORTED",
                "condition_status": "NOT_REPORTED",
                "medication_status": "NOT_REPORTED",
            }

            profile_completion = calculate_profile_completion(
                identity=identity,
                emergency_contacts=contacts,
                medical_status=med_stat_row,
            )

            # 7. Active OPD Consultation / Queue Entry (if any)
            cur.execute(
                """
                SELECT v.visit_id, v.doctor_id, v.status AS visit_status, v.checked_in_at,
                       qe.queue_entry_id, qe.queue_sequence, qe.called_at,
                       d.doctor_id, ua_doc.email AS doc_email, sp.name AS specialty,
                       (SELECT notes FROM VISIT_EVENT ve WHERE ve.visit_id = v.visit_id ORDER BY ve.event_id ASC LIMIT 1) AS checkin_note
                FROM VISIT v
                LEFT JOIN QUEUE_ENTRY qe ON qe.visit_id = v.visit_id AND qe.status IN ('WAITING', 'IN_CONSULTATION')
                JOIN DOCTOR d ON d.doctor_id = v.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua_doc ON ua_doc.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                WHERE v.roll_number = %s AND v.status IN ('CHECKED_IN', 'WAITING_FOR_DOCTOR', 'CALLED', 'IN_CONSULTATION', 'WAITING_FOR_MEDICINE')
                ORDER BY v.checked_in_at DESC
                LIMIT 1
                """,
                (roll_number,),
            )
            active_row = cur.fetchone()
            active_visit = None
            if active_row:
                doc_email = active_row.get("doc_email") or ""
                doc_name = doc_email.split("@")[0].replace(".", " ").title()
                if not doc_name.startswith("Dr"):
                    doc_name = f"Dr. {doc_name}"

                complaint = active_row.get("checkin_note") or "Routine Consultation"
                if " - " in complaint:
                    complaint = complaint.split(" - ", 1)[1]

                active_visit = {
                    "visitId": active_row["visit_id"],
                    "queueEntryId": active_row.get("queue_entry_id"),
                    "doctorId": active_row["doctor_id"],
                    "doctorName": doc_name,
                    "specialty": active_row.get("specialty") or "General Physician",
                    "queueSequence": active_row.get("queue_sequence") or 1,
                    "status": active_row["visit_status"],
                    "checkedInAt": active_row["checked_in_at"].isoformat() if active_row.get("checked_in_at") else None,
                    "calledAt": active_row["called_at"].isoformat() if active_row.get("called_at") else None,
                    "complaint": complaint,
                }

            return {
                "student": identity,
                "allergies": allergies,
                "chronicConditions": conditions,
                "currentMedications": medications,
                "emergencyContacts": contacts,
                "activeVisit": active_visit,
                "profileCompletion": profile_completion,
            }
    finally:
        conn.close()


def update_student_profile(
    user_id: int,
    roll_number: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    SD-2: Atomically updates student demographic data, primary emergency contact,
    and medical declaration status (allergies, chronic conditions, medications).
    
    Guarantees:
    - Strictly preserves authoritative institutional fields (roll_number, user_id, status, email, roster full_name).
    - Enforces demographic validation (DOB reasonable age, Blood Group enum, Phone length).
    - Fully transactional: updates STUDENT, EMERGENCY_CONTACT, and MEDICAL_PROFILE_STATUS atomically.
    """
    clean_roll = roll_number.strip().upper()

    # 1. Field-level validation
    # Phone number validation
    phone_number = payload.get("phoneNumber")
    if phone_number is not None:
        clean_phone = phone_number.strip()
        phone_digits = re.sub(r"\D", "", clean_phone)
        if len(phone_digits) < 10 or len(phone_digits) > 15:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid phone number: must contain between 10 and 15 digits.",
            )
        phone_number = clean_phone

    # Date of birth validation
    dob_str = payload.get("dateOfBirth")
    if dob_str is not None:
        try:
            dob_date = datetime.strptime(dob_str.strip(), "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date of birth format. Must be YYYY-MM-DD.",
            )
        today = date.today()
        if dob_date > today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Date of birth cannot be in the future.",
            )
        age = (today - dob_date).days // 365
        if age < 15 or age > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date of birth: student age must be between 15 and 100 years (calculated: {age}).",
            )
        dob_str = dob_date.isoformat()

    # Sex validation
    sex = payload.get("sex")
    if sex is not None:
        sex = sex.strip().upper()
        if sex not in VALID_SEX_OPTIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid sex: must be one of {sorted(list(VALID_SEX_OPTIONS))}.",
            )

    # Blood group validation
    blood_group = payload.get("bloodGroup")
    if blood_group is not None:
        blood_group = blood_group.strip().upper()
        if blood_group not in VALID_BLOOD_GROUPS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid blood group: must be one of {sorted(list(VALID_BLOOD_GROUPS))}.",
            )

    # Emergency Contact validation
    emergency_contact = payload.get("emergencyContact")
    if emergency_contact is not None:
        c_name = (emergency_contact.get("name") or "").strip()
        c_rel = (emergency_contact.get("relationship") or "").strip()
        c_phone = (emergency_contact.get("phoneNumber") or "").strip()

        if len(c_name) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Emergency contact name must be at least 2 characters.",
            )
        if len(c_rel) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Emergency contact relationship must be at least 2 characters.",
            )
        c_digits = re.sub(r"\D", "", c_phone)
        if len(c_digits) < 7 or len(c_digits) > 15:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Emergency contact phone number must contain between 7 and 15 digits.",
            )
        emergency_contact = {
            "name": c_name,
            "relationship": c_rel,
            "phoneNumber": c_phone,
        }

    # Declarations extraction
    has_allergies = payload.get("hasAllergies")
    allergies = payload.get("allergies")
    if has_allergies is True and allergies:
        for al in allergies:
            if not (al.get("allergen") or "").strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Allergen name cannot be empty.",
                )
            sev = (al.get("severity") or "MILD").strip().upper()
            if sev not in VALID_SEVERITY_OPTIONS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid allergy severity: must be one of {sorted(list(VALID_SEVERITY_OPTIONS))}.",
                )

    has_conditions = payload.get("hasChronicConditions")
    chronic_conditions = payload.get("chronicConditions")

    has_medications = payload.get("hasCurrentMedications")
    current_medications = payload.get("currentMedications")
    if has_medications is True and current_medications:
        for med in current_medications:
            if not (med.get("medicineName") or "").strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Medication medicine name cannot be empty.",
                )

    # 2. Database Atomic Execution
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check student exists and lock row
            cur.execute(
                "SELECT roll_number, user_id, status FROM STUDENT WHERE roll_number = %s LIMIT 1 FOR UPDATE",
                (clean_roll,),
            )
            st_row = cur.fetchone()
            if not st_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Student record '{clean_roll}' not found.",
                )
            if st_row["status"] == "INACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Student record is inactive. Cannot update profile.",
                )

            # 2.1 Update STUDENT demographic columns
            student_cols = []
            student_vals = []
            if phone_number is not None:
                student_cols.append("phone_number = %s")
                student_vals.append(phone_number)
            if dob_str is not None:
                student_cols.append("date_of_birth = %s")
                student_vals.append(dob_str)
            if sex is not None:
                student_cols.append("sex = %s")
                student_vals.append(sex)
            if blood_group is not None:
                student_cols.append("blood_group = %s")
                student_vals.append(blood_group)

            if student_cols:
                student_cols.append("updated_at = NOW()")
                sql_update_student = f"UPDATE STUDENT SET {', '.join(student_cols)} WHERE roll_number = %s"
                student_vals.append(clean_roll)
                cur.execute(sql_update_student, tuple(student_vals))

            # 2.2 Upsert EMERGENCY_CONTACT
            if emergency_contact is not None:
                cur.execute(
                    """
                    INSERT INTO EMERGENCY_CONTACT (roll_number, name, relationship, phone_number, updated_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        relationship = VALUES(relationship),
                        phone_number = VALUES(phone_number),
                        updated_at = NOW()
                    """,
                    (
                        clean_roll,
                        emergency_contact["name"],
                        emergency_contact["relationship"],
                        emergency_contact["phoneNumber"],
                    ),
                )

            # 2.3 Fetch existing medical profile status
            cur.execute(
                """
                SELECT allergy_status, condition_status, medication_status
                FROM MEDICAL_PROFILE_STATUS
                WHERE roll_number = %s
                FOR UPDATE
                """,
                (clean_roll,),
            )
            med_row = cur.fetchone() or {
                "allergy_status": "NOT_REPORTED",
                "condition_status": "NOT_REPORTED",
                "medication_status": "NOT_REPORTED",
            }

            new_allergy_status = med_row["allergy_status"]
            new_condition_status = med_row["condition_status"]
            new_medication_status = med_row["medication_status"]

            # Process Allergies
            if has_allergies is not None:
                if has_allergies:
                    new_allergy_status = "HAS_RECORDS"
                    if allergies is not None:
                        # Soft-end previous student allergies
                        cur.execute(
                            "UPDATE ALLERGY SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                            (clean_roll,),
                        )
                        for al in allergies:
                            cur.execute(
                                """
                                INSERT INTO ALLERGY (roll_number, allergen, reaction, severity, recorded_at, recorded_by_user_id)
                                VALUES (%s, %s, %s, %s, NOW(), %s)
                                """,
                                (
                                    clean_roll,
                                    al["allergen"].strip(),
                                    al.get("reaction"),
                                    (al.get("severity") or "MILD").strip().upper(),
                                    user_id,
                                ),
                            )
                else:
                    new_allergy_status = "NONE_REPORTED"
                    cur.execute(
                        "UPDATE ALLERGY SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                        (clean_roll,),
                    )

            # Process Chronic Conditions
            if has_conditions is not None:
                if has_conditions:
                    new_condition_status = "HAS_RECORDS"
                    if chronic_conditions is not None:
                        cur.execute(
                            "UPDATE STUDENT_CONDITION SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                            (clean_roll,),
                        )
                        for c_name in chronic_conditions:
                            c_clean = (c_name or "").strip()
                            if not c_clean:
                                continue
                            cur.execute("SELECT condition_id FROM `CONDITION` WHERE name = %s LIMIT 1", (c_clean,))
                            cond_row = cur.fetchone()
                            if cond_row:
                                cond_id = cond_row["condition_id"]
                            else:
                                cur.execute(
                                    "INSERT INTO `CONDITION` (name, description, is_active) VALUES (%s, %s, 1)",
                                    (c_clean, f"Self-reported condition: {c_clean}"),
                                )
                                cond_id = cur.lastrowid

                            cur.execute(
                                """
                                INSERT INTO STUDENT_CONDITION (roll_number, condition_id, other_description, recorded_at, recorded_by_user_id)
                                VALUES (%s, %s, %s, NOW(), %s)
                                """,
                                (clean_roll, cond_id, c_clean, user_id),
                            )
                else:
                    new_condition_status = "NONE_REPORTED"
                    cur.execute(
                        "UPDATE STUDENT_CONDITION SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                        (clean_roll,),
                    )

            # Process Medications
            if has_medications is not None:
                if has_medications:
                    new_medication_status = "HAS_RECORDS"
                    if current_medications is not None:
                        cur.execute(
                            "UPDATE STUDENT_MEDICATION SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                            (clean_roll,),
                        )
                        for med in current_medications:
                            cur.execute(
                                """
                                INSERT INTO STUDENT_MEDICATION (roll_number, medicine_name, strength, dose, reason, started_at, recorded_by_user_id)
                                VALUES (%s, %s, %s, %s, %s, CURDATE(), %s)
                                """,
                                (
                                    clean_roll,
                                    med["medicineName"].strip(),
                                    med.get("strength"),
                                    med.get("dose"),
                                    med.get("reason"),
                                    user_id,
                                ),
                            )
                else:
                    new_medication_status = "NONE_REPORTED"
                    cur.execute(
                        "UPDATE STUDENT_MEDICATION SET ended_at = NOW() WHERE roll_number = %s AND ended_at IS NULL",
                        (clean_roll,),
                    )

            # 2.4 Upsert MEDICAL_PROFILE_STATUS
            cur.execute(
                """
                INSERT INTO MEDICAL_PROFILE_STATUS (roll_number, allergy_status, condition_status, medication_status, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON DUPLICATE KEY UPDATE
                    allergy_status = VALUES(allergy_status),
                    condition_status = VALUES(condition_status),
                    medication_status = VALUES(medication_status),
                    updated_at = NOW()
                """,
                (clean_roll, new_allergy_status, new_condition_status, new_medication_status),
            )

        conn.commit()
    except HTTPException:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    except Exception as exc:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.error("Failed to update student profile for %s: %s", clean_roll, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error during student profile update: {exc}",
        )
    finally:
        conn.close()

    # Return refreshed telemetry
    return get_student_me_telemetry(user_id, clean_roll)
