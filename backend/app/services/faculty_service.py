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


def deduce_gender_from_relationship(relationship: str) -> str:
    """
    Deduces biological gender automatically from a family relationship term.
    Enforces that receptionists do not need to manually fill gender.
    """
    rel = (relationship or "").strip().lower()
    female_terms = {"wife", "mother", "daughter", "sister", "grandmother", "aunt", "niece", "mom", "didi"}
    male_terms = {"husband", "father", "son", "brother", "grandfather", "uncle", "nephew", "dad", "bhaiya"}
    if rel in female_terms:
        return "FEMALE"
    if rel in male_terms:
        return "MALE"
    return "OTHER"


def lookup_faculty_by_code_or_email(identifier: str) -> Optional[Dict[str, Any]]:
    """
    Looks up a faculty member by their unique employee code (e.g. 260111) or institutional email.
    If the faculty is in FACULTY_DIRECTORY but has not yet logged in, auto-provisions their
    FACULTY and PATIENT profile on the fly so they can be checked in immediately.
    """
    clean_id = (identifier or "").strip()
    if not clean_id:
        return None

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # 1. Search existing FACULTY profile by employee_id or email
            cursor.execute(
                """
                SELECT f.faculty_id, f.user_id, f.patient_id, f.employee_id, f.department, f.designation, f.status,
                       ua.email as institutional_email, p.full_name
                FROM FACULTY f
                JOIN USER_ACCOUNT ua ON ua.user_id = f.user_id
                JOIN PATIENT p ON p.patient_id = f.patient_id
                WHERE f.employee_id = %s OR ua.email = %s
                LIMIT 1
                """,
                (clean_id, clean_id.lower()),
            )
            fac_row = cursor.fetchone()

            # 2. If not found in FACULTY table, check approved FACULTY_DIRECTORY
            if not fac_row:
                cursor.execute(
                    """
                    SELECT faculty_dir_id, institutional_email, full_name, department, designation, employee_id, is_active
                    FROM FACULTY_DIRECTORY
                    WHERE employee_id = %s OR institutional_email = %s
                    LIMIT 1
                    """,
                    (clean_id, clean_id.lower()),
                )
                dir_row = cursor.fetchone()
                if not dir_row:
                    return None

                if not dir_row["is_active"]:
                    raise FacultyAccountDisabledError(f"Faculty record for '{clean_id}' is marked inactive.")

                # Provision faculty profile & patient on the fly
                created = resolve_or_create_faculty_account(
                    email=dir_row["institutional_email"],
                    name=dir_row["full_name"],
                )
                # Ensure employee_id is synced to FACULTY
                if dir_row.get("employee_id"):
                    cursor.execute(
                        "UPDATE FACULTY SET employee_id = %s WHERE faculty_id = %s",
                        (dir_row["employee_id"], created["faculty_id"]),
                    )
                    connection.commit()

                cursor.execute(
                    """
                    SELECT f.faculty_id, f.user_id, f.patient_id, f.employee_id, f.department, f.designation, f.status,
                           ua.email as institutional_email, p.full_name
                    FROM FACULTY f
                    JOIN USER_ACCOUNT ua ON ua.user_id = f.user_id
                    JOIN PATIENT p ON p.patient_id = f.patient_id
                    WHERE f.faculty_id = %s
                    """,
                    (created["faculty_id"],),
                )
                fac_row = cursor.fetchone()

            if not fac_row:
                return None

            # 3. Check for active visit on faculty member
            active_states = ("CHECKED_IN", "WAITING_FOR_DOCTOR", "CALLED", "IN_CONSULTATION", "WAITING_FOR_MEDICINE")
            placeholders = ",".join(["%s"] * len(active_states))
            cursor.execute(
                f"""
                SELECT visit_id, status FROM VISIT
                WHERE patient_id = %s AND status IN ({placeholders})
                ORDER BY checked_in_at DESC LIMIT 1
                """,
                (fac_row["patient_id"], *active_states),
            )
            active_visit = cursor.fetchone()

            # 4. Fetch linked family members
            cursor.execute(
                """
                SELECT ffm.family_member_id, ffm.faculty_id, ffm.relationship_type, ffm.relationship_status,
                       p.patient_id, p.full_name, p.age, p.gender, p.blood_group, ffm.created_at
                FROM FACULTY_FAMILY_MEMBER ffm
                JOIN PATIENT p ON p.patient_id = ffm.patient_id
                WHERE ffm.faculty_id = %s AND ffm.relationship_status = 'ACTIVE'
                ORDER BY ffm.created_at ASC
                """,
                (fac_row["faculty_id"],),
            )
            family_rows = cursor.fetchall()

            # Also check active visits for each family member
            family_members = []
            for fam in family_rows:
                cursor.execute(
                    f"""
                    SELECT visit_id, status FROM VISIT
                    WHERE patient_id = %s AND status IN ({placeholders})
                    ORDER BY checked_in_at DESC LIMIT 1
                    """,
                    (fam["patient_id"], *active_states),
                )
                fam_active = cursor.fetchone()
                family_members.append({
                    "familyMemberId": fam["family_member_id"],
                    "patientId": fam["patient_id"],
                    "fullName": fam["full_name"],
                    "relationshipType": fam["relationship_type"],
                    "age": fam["age"],
                    "gender": fam["gender"],
                    "bloodGroup": fam["blood_group"],
                    "alreadyInQueue": fam_active is not None,
                    "activeVisitStatus": fam_active["status"] if fam_active else None,
                    "activeVisitId": fam_active["visit_id"] if fam_active else None,
                })

            return {
                "facultyId": fac_row["faculty_id"],
                "patientId": fac_row["patient_id"],
                "employeeId": fac_row["employee_id"],
                "name": fac_row["full_name"],
                "department": fac_row["department"],
                "designation": fac_row["designation"],
                "institutionalEmail": fac_row["institutional_email"],
                "alreadyInQueue": active_visit is not None,
                "activeVisitStatus": active_visit["status"] if active_visit else None,
                "activeVisitId": active_visit["visit_id"] if active_visit else None,
                "familyMembers": family_members,
            }
    finally:
        connection.close()


def check_in_faculty_patient(
    faculty_id: int,
    doctor_id: int,
    performed_by_user_id: int,
    check_in_for: str = "SELF",
    family_member_patient_id: Optional[int] = None,
    new_family_member: Optional[Dict[str, Any]] = None,
    complaint: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Atomically queues a faculty member or their family dependent for OPD consultation:
    1. Resolves target patient_id (Self vs Family Member).
    2. Provisions new dependent if specified, with auto-deduced gender from relationship.
    3. Serializes under doctor row lock to avoid race conditions.
    4. Validates doctor availability on CURDATE().
    5. Enforces single active visit constraint for the target patient.
    6. Inserts VISIT, QUEUE_ENTRY, and VISIT_EVENT.
    7. Computes line position and returns complete token payload.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            # 1. Fetch Faculty Profile
            cursor.execute(
                """
                SELECT f.faculty_id, f.patient_id, f.employee_id, f.department, p.full_name as faculty_name
                FROM FACULTY f
                JOIN PATIENT p ON p.patient_id = f.patient_id
                WHERE f.faculty_id = %s AND f.status = 'ACTIVE'
                """,
                (faculty_id,),
            )
            fac = cursor.fetchone()
            if not fac:
                raise FacultyServiceError(f"Active faculty member #{faculty_id} not found.")

            target_patient_id = None
            target_name = None
            target_type = None
            relationship_label = "Self"

            # 2. Determine target patient
            if check_in_for.upper() == "SELF":
                target_patient_id = fac["patient_id"]
                target_name = fac["faculty_name"]
                target_type = "FACULTY"
                relationship_label = "Self"

            elif check_in_for.upper() == "FAMILY_MEMBER":
                target_type = "FACULTY_DEPENDENT"

                # Case A: Existing linked family member
                if family_member_patient_id:
                    cursor.execute(
                        """
                        SELECT ffm.family_member_id, ffm.relationship_type, p.patient_id, p.full_name
                        FROM FACULTY_FAMILY_MEMBER ffm
                        JOIN PATIENT p ON p.patient_id = ffm.patient_id
                        WHERE ffm.faculty_id = %s AND ffm.patient_id = %s AND ffm.relationship_status = 'ACTIVE'
                        """,
                        (faculty_id, family_member_patient_id),
                    )
                    fam_row = cursor.fetchone()
                    if not fam_row:
                        raise FamilyMemberAccessDeniedError("Selected family member is not linked to this faculty account.")

                    target_patient_id = fam_row["patient_id"]
                    target_name = fam_row["full_name"]
                    relationship_label = fam_row["relationship_type"].title()

                # Case B: Create new family member on the fly
                elif new_family_member:
                    raw_name = str(new_family_member.get("full_name") or new_family_member.get("name") or "").strip()
                    if not raw_name or len(raw_name) < 2:
                        raise ValueError("Family member name is required (minimum 2 characters).")

                    rel = str(new_family_member.get("relationship") or "Other").strip()
                    rel_type = str(new_family_member.get("relationship_type") or "").strip().upper()
                    
                    # Map relationship text to relationship_type ENUM ('SPOUSE', 'CHILD', 'PARENT', 'OTHER')
                    rel_lower = rel.lower()
                    if rel_lower in ("wife", "husband", "spouse"):
                        rel_type = "SPOUSE"
                    elif rel_lower in ("son", "daughter", "child"):
                        rel_type = "CHILD"
                    elif rel_lower in ("mother", "father", "parent"):
                        rel_type = "PARENT"
                    elif rel_type not in ("SPOUSE", "CHILD", "PARENT", "OTHER"):
                        rel_type = "OTHER"

                    # DEDUCE GENDER automatically - receptionist does not fill gender
                    deduced_gender = deduce_gender_from_relationship(rel)

                    age = new_family_member.get("age")
                    if age is not None:
                        try:
                            age = int(age)
                        except (ValueError, TypeError):
                            age = None

                    blood_group = str(new_family_member.get("blood_group") or "").strip().upper() or None

                    # Insert dependent PATIENT
                    cursor.execute(
                        """
                        INSERT INTO PATIENT (patient_type, full_name, age, gender, blood_group)
                        VALUES ('FACULTY_DEPENDENT', %s, %s, %s, %s)
                        """,
                        (raw_name, age, deduced_gender, blood_group),
                    )
                    target_patient_id = cursor.lastrowid
                    target_name = raw_name
                    relationship_label = rel.title()

                    # Link via FACULTY_FAMILY_MEMBER
                    cursor.execute(
                        """
                        INSERT INTO FACULTY_FAMILY_MEMBER (faculty_id, patient_id, relationship_type, relationship_status)
                        VALUES (%s, %s, %s, 'ACTIVE')
                        """,
                        (faculty_id, target_patient_id, rel_type),
                    )
                else:
                    raise ValueError("Either an existing family_member_patient_id or new_family_member details must be provided.")

            else:
                raise ValueError(f"Invalid check_in_for option '{check_in_for}'. Must be 'SELF' or 'FAMILY_MEMBER'.")

            # 3. Doctor validation under row lock
            cursor.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s FOR UPDATE", (doctor_id,))
            doc_row = cursor.fetchone()
            if not doc_row:
                raise ValueError(f"Doctor #{doctor_id} not found.")

            cursor.execute(
                """
                SELECT status FROM DOCTOR_AVAILABILITY
                WHERE doctor_id = %s AND availability_date = CURDATE()
                LIMIT 1 FOR UPDATE
                """,
                (doctor_id,),
            )
            avail = cursor.fetchone()
            if avail and avail.get("status") == "UNAVAILABLE":
                raise ValueError(f"Doctor #{doctor_id} is marked unavailable today.")

            # 4. Check for active visit on target patient
            active_states = ("CHECKED_IN", "WAITING_FOR_DOCTOR", "CALLED", "IN_CONSULTATION", "WAITING_FOR_MEDICINE")
            placeholders = ",".join(["%s"] * len(active_states))
            cursor.execute(
                f"""
                SELECT visit_id, status FROM VISIT
                WHERE patient_id = %s AND status IN ({placeholders})
                FOR UPDATE
                """,
                (target_patient_id, *active_states),
            )
            active_v = cursor.fetchone()
            if active_v:
                raise ValueError(
                    f"Patient '{target_name}' already has an active visit in progress (Status: {active_v['status']})."
                )

            # 5. Insert VISIT
            cursor.execute(
                """
                INSERT INTO VISIT (patient_id, roll_number, doctor_id, status, checked_in_at)
                VALUES (%s, NULL, %s, 'WAITING_FOR_DOCTOR', NOW())
                """,
                (target_patient_id, doctor_id),
            )
            visit_id = cursor.lastrowid

            # 6. Allocate Sequence
            from app.services.queue_lifecycle import allocate_next_queue_sequence
            seq = allocate_next_queue_sequence(cursor, doctor_id, connection)

            # 7. Insert QUEUE_ENTRY
            cursor.execute(
                """
                INSERT INTO QUEUE_ENTRY
                    (visit_id, doctor_id, queue_sequence, status, entered_at, queue_data, entry_reason)
                VALUES (%s, %s, %s, 'WAITING', NOW(), NOW(), 'INITIAL_CHECKIN')
                """,
                (visit_id, doctor_id, seq),
            )
            queue_entry_id = cursor.lastrowid

            # 8. Record audit log in VISIT_EVENT
            emp_badge = fac["employee_id"] or f"FAC-{fac['faculty_id']}"
            if check_in_for.upper() == "SELF":
                note = f"Faculty check-in (Self • EMP: {emp_badge})"
            else:
                note = f"Faculty Dependent check-in ({relationship_label} of {fac['faculty_name']} • EMP: {emp_badge})"
            if complaint:
                note += f" - Complaint: {complaint}"

            cursor.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
                VALUES (%s, 'CHECKED_IN', %s, %s)
                """,
                (visit_id, performed_by_user_id, note[:500]),
            )

            # 9. Compute line position
            cursor.execute(
                "SELECT COUNT(*) AS n FROM QUEUE_ENTRY WHERE doctor_id = %s AND status = 'WAITING'",
                (doctor_id,),
            )
            pos_row = cursor.fetchone()
            position = pos_row["n"] if pos_row else 1

            connection.commit()

            return {
                "visit_id": visit_id,
                "visitId": visit_id,
                "queue_number": seq,
                "queueNo": seq,
                "sequence": seq,
                "doctor_id": doctor_id,
                "doctorId": doctor_id,
                "status": "WAITING_FOR_DOCTOR",
                "position": position,
                "name": target_name,
                "patient_type": target_type,
                "relationship": relationship_label,
                "faculty_name": fac["faculty_name"],
                "employee_id": fac["employee_id"],
                "queue_entry_id": queue_entry_id,
                "queueEntryId": queue_entry_id,
            }
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


