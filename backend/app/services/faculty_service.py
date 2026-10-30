import logging
from typing import Any, Dict, List, Optional
import pymysql

from app.core.database import get_db_connection

logger = logging.getLogger(__name__)


class FacultyServiceError(Exception):
    """Base exception for faculty service failures."""
    pass


class FacultyNotEligibleError(FacultyServiceError):
    """Raised when an institutional email is not in the approved directory."""
    pass


class FacultyAccountDisabledError(FacultyServiceError):
    """Raised when a faculty account or directory record is deactivated."""
    pass


class FamilyMemberAccessDeniedError(FacultyServiceError):
    """Raised when attempting to access a patient without an active relationship."""
    pass


def resolve_or_create_faculty_account(
    email: str,
    name: str,
    google_sub: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Deterministically resolves an existing Faculty account or provisions a new one.
    STRICT AUTHORIZATION: Checked against the Admin-maintained FACULTY_DIRECTORY.
    ATOMIC TRANSACTION: USER_ACCOUNT + PATIENT + FACULTY are created together.
    """
    clean_email = email.strip().lower()
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # 1. Authoritative Eligibility Check against FACULTY_DIRECTORY
            cursor.execute(
                """
                SELECT faculty_dir_id, full_name, department, designation, is_active
                FROM FACULTY_DIRECTORY
                WHERE institutional_email = %s
                """,
                (clean_email,),
            )
            dir_entry = cursor.fetchone()

            if not dir_entry:
                logger.warning("Faculty login attempt rejected: %s not in FACULTY_DIRECTORY", clean_email)
                raise FacultyNotEligibleError(
                    f"Institutional account '{clean_email}' is not registered in the approved Faculty directory. "
                    "Please contact the University Health Centre Administration."
                )

            if not dir_entry["is_active"]:
                logger.warning("Faculty login attempt rejected: %s directory record is inactive", clean_email)
                raise FacultyAccountDisabledError(
                    "Your faculty eligibility record is currently deactivated. Please contact Administration."
                )

            effective_name = dir_entry["full_name"] or name
            department = dir_entry["department"]
            designation = dir_entry["designation"] or "Faculty Member"

            # 2. Check if USER_ACCOUNT already exists for this email
            cursor.execute(
                """
                SELECT ua.user_id, ua.status, ua.account_type,
                       f.faculty_id, f.patient_id, f.department, f.designation, f.status as faculty_status
                FROM USER_ACCOUNT ua
                LEFT JOIN FACULTY f ON f.user_id = ua.user_id
                WHERE ua.email = %s
                """,
                (clean_email,),
            )
            row = cursor.fetchone()

            if row:
                if row["status"] != "ACTIVE" or (row.get("faculty_status") and row["faculty_status"] != "ACTIVE"):
                    raise FacultyAccountDisabledError("This faculty account has been disabled.")

                user_id = row["user_id"]
                faculty_id = row["faculty_id"]
                patient_id = row["patient_id"]

                # If for any reason faculty profile or patient profile is missing on an existing user, repair it
                if not faculty_id or not patient_id:
                    if not patient_id:
                        cursor.execute(
                            """
                            INSERT INTO PATIENT (patient_type, full_name, gender)
                            VALUES ('FACULTY', %s, 'OTHER')
                            """,
                            (effective_name,),
                        )
                        patient_id = cursor.lastrowid

                    if not faculty_id:
                        cursor.execute(
                            """
                            INSERT INTO FACULTY (user_id, patient_id, department, designation, status)
                            VALUES (%s, %s, %s, %s, 'ACTIVE')
                            """,
                            (user_id, patient_id, department, designation),
                        )
                        faculty_id = cursor.lastrowid
                    connection.commit()

                # Update google_subject if provided
                if google_sub:
                    cursor.execute(
                        "UPDATE USER_ACCOUNT SET google_subject = %s, last_login_at = NOW() WHERE user_id = %s",
                        (google_sub, user_id),
                    )
                    connection.commit()

                return {
                    "user_id": user_id,
                    "faculty_id": faculty_id,
                    "patient_id": patient_id,
                    "email": clean_email,
                    "name": effective_name,
                    "department": department,
                    "designation": designation,
                }

            # 3. First-Time Atomic Provisioning
            # A) Create USER_ACCOUNT
            cursor.execute(
                """
                INSERT INTO USER_ACCOUNT (email, google_subject, account_type, status, last_login_at)
                VALUES (%s, %s, 'FACULTY', 'ACTIVE', NOW())
                """,
                (clean_email, google_sub),
            )
            user_id = cursor.lastrowid

            # B) Create Common PATIENT record for medical visits
            cursor.execute(
                """
                INSERT INTO PATIENT (patient_type, full_name, gender)
                VALUES ('FACULTY', %s, 'OTHER')
                """,
                (effective_name,),
            )
            patient_id = cursor.lastrowid

            # C) Create FACULTY Profile
            cursor.execute(
                """
                INSERT INTO FACULTY (user_id, patient_id, department, designation, status)
                VALUES (%s, %s, %s, %s, 'ACTIVE')
                """,
                (user_id, patient_id, department, designation),
            )
            faculty_id = cursor.lastrowid

            # D) Update directory entry to flag account_created = TRUE
            cursor.execute(
                "UPDATE FACULTY_DIRECTORY SET account_created = TRUE, updated_at = NOW() WHERE faculty_dir_id = %s",
                (dir_entry["faculty_dir_id"],),
            )

            connection.commit()
            logger.info("Successfully provisioned new Faculty account: %s (Faculty ID: %d, Patient ID: %d)", clean_email, faculty_id, patient_id)

            return {
                "user_id": user_id,
                "faculty_id": faculty_id,
                "patient_id": patient_id,
                "email": clean_email,
                "name": effective_name,
                "department": department,
                "designation": designation,
            }
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def add_faculty_family_member(
    faculty_id: int,
    full_name: str,
    relationship_type: str,
    age: Optional[int] = None,
    gender: str = "OTHER",
    blood_group: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a new family-member dependent patient profile linked to the authenticated faculty member.
    """
    clean_name = full_name.strip()
    valid_relations = ('SPOUSE', 'CHILD', 'PARENT', 'OTHER')
    if relationship_type not in valid_relations:
        raise ValueError(f"Invalid relationship_type. Must be one of: {valid_relations}")

    valid_genders = ('MALE', 'FEMALE', 'OTHER')
    clean_gender = gender if gender in valid_genders else 'OTHER'

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # 1. Create dependent PATIENT profile
            cursor.execute(
                """
                INSERT INTO PATIENT (patient_type, full_name, age, gender, blood_group)
                VALUES ('FACULTY_DEPENDENT', %s, %s, %s, %s)
                """,
                (clean_name, age, clean_gender, blood_group),
            )
            dependent_patient_id = cursor.lastrowid

            # 2. Link via FACULTY_FAMILY_MEMBER
            cursor.execute(
                """
                INSERT INTO FACULTY_FAMILY_MEMBER (faculty_id, patient_id, relationship_type, relationship_status)
                VALUES (%s, %s, %s, 'ACTIVE')
                """,
                (faculty_id, dependent_patient_id, relationship_type),
            )
            family_member_id = cursor.lastrowid
            connection.commit()

            return {
                "family_member_id": family_member_id,
                "faculty_id": faculty_id,
                "patient_id": dependent_patient_id,
                "full_name": clean_name,
                "relationship_type": relationship_type,
                "relationship_status": "ACTIVE",
                "age": age,
                "gender": clean_gender,
                "blood_group": blood_group,
            }
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def list_faculty_family_members(faculty_id: int) -> List[Dict[str, Any]]:
    """
    Lists all active family-member patient profiles linked to the authenticated faculty member.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT ffm.family_member_id, ffm.faculty_id, ffm.relationship_type, ffm.relationship_status,
                       p.patient_id, p.full_name, p.age, p.gender, p.blood_group, ffm.created_at
                FROM FACULTY_FAMILY_MEMBER ffm
                JOIN PATIENT p ON p.patient_id = ffm.patient_id
                WHERE ffm.faculty_id = %s AND ffm.relationship_status = 'ACTIVE'
                ORDER BY ffm.created_at ASC
                """,
                (faculty_id,),
            )
            return cursor.fetchall()
    finally:
        connection.close()


def verify_patient_access_for_faculty(faculty_id: int, target_patient_id: int) -> Dict[str, Any]:
    """
    Strict authorization gate: Ensures a faculty member can ONLY access:
    1. Their own patient record (target_patient_id == faculty.patient_id)
    2. An actively linked family member's patient record.
    Rejects any arbitrary patient ID access with FamilyMemberAccessDeniedError.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # Check own patient id
            cursor.execute("SELECT patient_id FROM FACULTY WHERE faculty_id = %s", (faculty_id,))
            fac_row = cursor.fetchone()
            if fac_row and fac_row["patient_id"] == target_patient_id:
                return {"is_self": True, "patient_id": target_patient_id}

            # Check authorized family member
            cursor.execute(
                """
                SELECT family_member_id, relationship_type
                FROM FACULTY_FAMILY_MEMBER
                WHERE faculty_id = %s AND patient_id = %s AND relationship_status = 'ACTIVE'
                """,
                (faculty_id, target_patient_id),
            )
            rel_row = cursor.fetchone()
            if rel_row:
                return {
                    "is_self": False,
                    "patient_id": target_patient_id,
                    "family_member_id": rel_row["family_member_id"],
                    "relationship_type": rel_row["relationship_type"],
                }

            raise FamilyMemberAccessDeniedError(
                f"Unauthorized: Faculty ID {faculty_id} is not authorized to access patient record {target_patient_id}."
            )
    finally:
        connection.close()

