"""
Service layer for Student identity, profile telemetry, and account linking (SD-1).
"""

import logging
import re
from typing import Optional, Dict, Any, List

from fastapi import HTTPException, status
from app.core.database import get_db_connection

logger = logging.getLogger(__name__)


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
                        "SELECT roll_number, status FROM STUDENT WHERE roll_number = %s FOR UPDATE",
                        (derived_roll,),
                    )
                    pre_seeded = cur.fetchone()
                    if pre_seeded:
                        cur.execute(
                            "UPDATE STUDENT SET user_id = %s, full_name = COALESCE(full_name, %s) WHERE roll_number = %s",
                            (user_id, name, derived_roll),
                        )
                        roll_number = derived_roll
                        full_name = name
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
    and active OPD visit status for the current student.
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

            # 6. Active OPD Consultation / Queue Entry (if any)
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
            }
    finally:
        conn.close()
