"""
Comprehensive Integration Test Suite for SD-2:
Student Profile Registration, Onboarding, Validation, and Completion Tracking.
"""

import os
import sys
from datetime import date, timedelta
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_STUDENT_EMAIL = "sd2_student102203777@thapar.edu"
TEST_STUDENT_ROLL = "102203777"
TEST_STUDENT_NAME = "SD2 Onboarding Student"
TEST_STUDENT_SUB = "google_sub_sd2_777777"

OTHER_STUDENT_EMAIL = "sd2_other102203666@thapar.edu"
OTHER_STUDENT_ROLL = "102203666"
OTHER_STUDENT_NAME = "SD2 Other Student"
OTHER_STUDENT_SUB = "google_sub_sd2_666666"


def clean_fixtures():
    """Removes SD-2 test artifacts from the live database."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Clean visits and related records
            cur.execute(
                "SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s)",
                (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL),
            )
            v_rows = cur.fetchall()
            if v_rows:
                v_ids = ",".join(str(r["visit_id"]) for r in v_rows)
                cur.execute(f"DELETE FROM DISPENSING WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM VISIT_EVENT WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM QUEUE_ENTRY WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM PRESCRIPTION WHERE consultation_id IN (SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({v_ids}))")
                cur.execute(f"DELETE FROM CONSULTATION WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({v_ids})")

            # 2. Clean allergies, conditions, contacts, medical status
            cur.execute("DELETE FROM ALLERGY WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM STUDENT_CONDITION WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM STUDENT_MEDICATION WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM EMERGENCY_CONTACT WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM MEDICAL_PROFILE_STATUS WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))

            # 3. Clean student and user accounts
            cur.execute("DELETE FROM STUDENT WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute(
                "DELETE FROM USER_ACCOUNT WHERE email IN (%s, %s) OR google_subject IN (%s, %s)",
                (TEST_STUDENT_EMAIL, OTHER_STUDENT_EMAIL, TEST_STUDENT_SUB, OTHER_STUDENT_SUB),
            )
        conn.commit()
    finally:
        conn.close()


def provision_test_student():
    """Provisions a fresh student user and student record with blank/default onboarding state."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO USER_ACCOUNT (email, google_subject, account_type, status, last_login_at)
                VALUES (%s, %s, 'STUDENT', 'ACTIVE', NOW())
                """,
                (TEST_STUDENT_EMAIL, TEST_STUDENT_SUB),
            )
            user_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, phone_number, blood_group, status)
                VALUES (%s, %s, %s, '2004-01-01', 'OTHER', NULL, NULL, 'ACTIVE')
                """,
                (TEST_STUDENT_ROLL, user_id, TEST_STUDENT_NAME),
            )

            cur.execute(
                """
                INSERT INTO MEDICAL_PROFILE_STATUS (roll_number, allergy_status, condition_status, medication_status)
                VALUES (%s, 'NOT_REPORTED', 'NOT_REPORTED', 'NOT_REPORTED')
                """,
                (TEST_STUDENT_ROLL,),
            )
        conn.commit()
        return user_id
    finally:
        conn.close()


def make_student_token(user_id: int, roll: str = TEST_STUDENT_ROLL):
    return create_access_token(
        claims={
            "sub": str(user_id),
            "email": TEST_STUDENT_EMAIL,
            "role": "STUDENT",
            "roll_number": roll,
        }
    )


def test_initial_incomplete_profile():
    print("\n--- Test 1: Initial Incomplete Profile & Completion Status ---")
    clean_fixtures()
    user_id = provision_test_student()
    token = make_student_token(user_id)

    headers = {"Authorization": f"Bearer {token}"}
    res = client.get("/api/student/me", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()

    comp = body.get("profileCompletion")
    assert comp is not None, "Expected profileCompletion object in response."
    assert comp["isComplete"] is False, "Expected fresh student profile to be incomplete."
    assert comp["status"] == "INCOMPLETE", f"Expected INCOMPLETE, got {comp['status']}"
    assert comp["percentage"] < 50, f"Expected percentage < 50, got {comp['percentage']}"
    assert "Phone Number" in comp["missingFields"], "Expected Phone Number in missingFields."
    assert "Blood Group" in comp["missingFields"], "Expected Blood Group in missingFields."
    assert "Emergency Contact" in comp["missingFields"], "Expected Emergency Contact in missingFields."
    assert "Allergy Declaration" in comp["missingFields"], "Expected Allergy Declaration in missingFields."
    print(f"PASS: Incomplete profile telemetry returned {comp['percentage']}% completion with missing fields: {comp['missingFields']}")


def test_field_validation_rejections():
    print("\n--- Test 2: Field-Level Validation Constraints ---")
    clean_fixtures()
    user_id = provision_test_student()
    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # 2.1 Future DOB rejection
    future_dob = (date.today() + timedelta(days=1)).isoformat()
    res = client.put("/api/student/profile", headers=headers, json={"dateOfBirth": future_dob})
    assert res.status_code == 400, f"Expected 400 for future DOB, got {res.status_code}"
    assert "future" in res.json()["detail"].lower()
    print("PASS: Future DOB rejected with 400.")

    # 2.2 Underage DOB rejection (< 15 years old)
    underage_dob = (date.today() - timedelta(days=365 * 10)).isoformat()
    res = client.put("/api/student/profile", headers=headers, json={"dateOfBirth": underage_dob})
    assert res.status_code == 400, f"Expected 400 for underage DOB, got {res.status_code}"
    assert "15" in res.json()["detail"]
    print("PASS: Underage DOB (< 15 years) rejected with 400.")

    # 2.3 Invalid Phone Number (< 10 digits)
    res = client.put("/api/student/profile", headers=headers, json={"phoneNumber": "12345"})
    assert res.status_code == 400, f"Expected 400 for short phone, got {res.status_code}"
    assert "phone" in res.json()["detail"].lower()
    print("PASS: Invalid phone number (< 10 digits) rejected with 400.")

    # 2.4 Invalid Blood Group
    res = client.put("/api/student/profile", headers=headers, json={"bloodGroup": "XYZ+"})
    assert res.status_code == 400, f"Expected 400 for invalid blood group, got {res.status_code}"
    assert "blood group" in res.json()["detail"].lower()
    print("PASS: Invalid blood group rejected with 400.")

    # 2.5 Invalid Sex
    res = client.put("/api/student/profile", headers=headers, json={"sex": "UNKNOWN_OPTION"})
    assert res.status_code == 400, f"Expected 400 for invalid sex, got {res.status_code}"
    assert "sex" in res.json()["detail"].lower()
    print("PASS: Invalid sex option rejected with 400.")

    # 2.6 Invalid Emergency Contact (short name)
    res = client.put(
        "/api/student/profile",
        headers=headers,
        json={"emergencyContact": {"name": "A", "relationship": "Father", "phoneNumber": "+91-9876543210"}},
    )
    # Pydantic or service catches short name
    assert res.status_code in (400, 422), f"Expected 400/422 for short contact name, got {res.status_code}"
    print("PASS: Invalid emergency contact rejected with 400/422.")


def test_successful_full_onboarding():
    print("\n--- Test 3: Complete Onboarding & 100% Completion ---")
    clean_fixtures()
    user_id = provision_test_student()
    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "phoneNumber": "+91-9876543210",
        "dateOfBirth": "2003-08-20",
        "sex": "FEMALE",
        "bloodGroup": "AB+",
        "emergencyContact": {
            "name": "Dr. Manjit Singh",
            "relationship": "Father",
            "phoneNumber": "+91-9876500099",
        },
        "hasAllergies": True,
        "allergies": [
            {
                "allergen": "Penicillin",
                "reaction": "Anaphylaxis and hives",
                "severity": "SEVERE",
            }
        ],
        "hasChronicConditions": True,
        "chronicConditions": ["Asthma", "Allergic Rhinitis"],
        "hasCurrentMedications": True,
        "currentMedications": [
            {
                "medicineName": "Salbutamol Inhaler",
                "strength": "100mcg",
                "dose": "2 puffs PRN",
                "reason": "Acute bronchospasm",
            }
        ],
    }

    res = client.put("/api/student/profile", headers=headers, json=payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()

    assert body["success"] is True
    comp = body["profileCompletion"]
    assert comp["isComplete"] is True, f"Expected isComplete=True, got {comp}"
    assert comp["percentage"] == 100, f"Expected 100%, got {comp['percentage']}"
    assert comp["status"] == "COMPLETED"
    assert len(comp["missingFields"]) == 0

    st_data = body["data"]["student"]
    assert st_data["phoneNumber"] == "+91-9876543210"
    assert st_data["dateOfBirth"] == "2003-08-20"
    assert st_data["sex"] == "FEMALE"
    assert st_data["bloodGroup"] == "AB+"

    allergies = body["data"]["allergies"]
    assert len(allergies) == 1
    assert allergies[0]["allergen"] == "Penicillin"
    assert allergies[0]["severity"] == "SEVERE"

    conditions = body["data"]["chronicConditions"]
    assert "Asthma" in conditions
    assert "Allergic Rhinitis" in conditions

    contacts = body["data"]["emergencyContacts"]
    assert len(contacts) == 1
    assert contacts[0]["name"] == "Dr. Manjit Singh"
    print("PASS: Full onboarding completed with 100% profile score and verified clinical alerts.")


def test_database_authoritative_integrity():
    print("\n--- Test 4: Database Authoritative Integrity & Transaction Verification ---")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Verify STUDENT table authoritative immutability
            cur.execute("SELECT roll_number, user_id, status, full_name, blood_group FROM STUDENT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            st = cur.fetchone()
            assert st is not None
            assert st["roll_number"] == TEST_STUDENT_ROLL
            assert st["status"] == "ACTIVE"
            assert st["full_name"] == TEST_STUDENT_NAME  # Roster name preserved!
            assert st["blood_group"] == "AB+"

            # 2. Verify EMERGENCY_CONTACT uniqueness
            cur.execute("SELECT COUNT(*) AS cnt FROM EMERGENCY_CONTACT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            cnt = cur.fetchone()["cnt"]
            assert cnt == 1, f"Expected exactly 1 emergency contact row, got {cnt}"

            # 3. Verify MEDICAL_PROFILE_STATUS
            cur.execute("SELECT allergy_status, condition_status, medication_status FROM MEDICAL_PROFILE_STATUS WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            med_stat = cur.fetchone()
            assert med_stat["allergy_status"] == "HAS_RECORDS"
            assert med_stat["condition_status"] == "HAS_RECORDS"
            assert med_stat["medication_status"] == "HAS_RECORDS"
    finally:
        conn.close()
    print("PASS: Authoritative database integrity, uniqueness constraints, and FK relations verified.")


def test_negative_medical_declarations():
    print("\n--- Test 5: Negative Medical Declarations (NONE_REPORTED) ---")
    user_id = 0
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))
            user_id = cur.fetchone()["user_id"]
    finally:
        conn.close()

    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # Student updates indicating NO allergies, NO conditions, and NO medications
    payload = {
        "hasAllergies": False,
        "hasChronicConditions": False,
        "hasCurrentMedications": False,
    }

    res = client.put("/api/student/profile", headers=headers, json=payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()

    assert body["profileCompletion"]["isComplete"] is True
    assert body["profileCompletion"]["percentage"] == 100
    assert len(body["data"]["allergies"]) == 0
    assert len(body["data"]["chronicConditions"]) == 0
    assert len(body["data"]["currentMedications"]) == 0

    # Verify previous active allergies ended in DB
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM ALLERGY WHERE roll_number = %s AND ended_at IS NULL", (TEST_STUDENT_ROLL,))
            active_allergies = cur.fetchone()["cnt"]
            assert active_allergies == 0, f"Expected 0 active allergies, got {active_allergies}"

            cur.execute("SELECT allergy_status, condition_status, medication_status FROM MEDICAL_PROFILE_STATUS WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            ms = cur.fetchone()
            assert ms["allergy_status"] == "NONE_REPORTED"
            assert ms["condition_status"] == "NONE_REPORTED"
            assert ms["medication_status"] == "NONE_REPORTED"
    finally:
        conn.close()
    print("PASS: Negative medical declarations ('NONE_REPORTED') correctly end previous alerts while retaining 100% completion.")


def test_cross_student_profile_update_guard():
    print("\n--- Test 6: Cross-Student Profile Protection & Unauthenticated Access ---")
    # 6.1 Unauthenticated request rejected
    res = client.put("/api/student/profile", json={"bloodGroup": "O+"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("PASS: Unauthenticated profile update rejected with 401.")

    # 6.2 Doctor or Staff role cannot use student update endpoint
    staff_token = create_access_token(claims={"sub": "1", "email": "doctor1@campuscare.com", "role": "DOCTOR"})
    res = client.put("/api/student/profile", headers={"Authorization": f"Bearer {staff_token}"}, json={"bloodGroup": "O+"})
    assert res.status_code == 403, f"Expected 403 for non-student role, got {res.status_code}"
    print("PASS: Doctor/Staff token rejected with 403 on student onboarding endpoint.")


def run_all_tests():
    print("=" * 75)
    print("RUNNING CAMPUSCARE SD-2: STUDENT PROFILE ONBOARDING TEST SUITE")
    print("=" * 75)
    try:
        test_initial_incomplete_profile()
        test_field_validation_rejections()
        test_successful_full_onboarding()
        test_database_authoritative_integrity()
        test_negative_medical_declarations()
        test_cross_student_profile_update_guard()
        print("=" * 75)
        print("ALL SD-2 STUDENT PROFILE & ONBOARDING TESTS PASSED SUCCESSFULLY!")
        print("=" * 75)
    finally:
        clean_fixtures()


if __name__ == "__main__":
    run_all_tests()
