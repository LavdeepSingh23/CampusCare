"""
Comprehensive Integration Test Suite for SD-1:
Student Authentication, Account Linking, and Cross-Student Boundary Protection.
"""

import os
import sys
from unittest.mock import patch
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core import config
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_STUDENT_EMAIL = "sd1_student102203999@thapar.edu"
TEST_STUDENT_ROLL = "102203999"
TEST_STUDENT_NAME = "SD1 Test Student"
TEST_STUDENT_SUB = "google_sub_sd1_999999"

OTHER_STUDENT_EMAIL = "sd1_other102203888@thapar.edu"
OTHER_STUDENT_ROLL = "102203888"
OTHER_STUDENT_NAME = "SD1 Other Student"
OTHER_STUDENT_SUB = "google_sub_sd1_888888"


def clean_fixtures():
    """Removes test artifacts from the live database."""
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

            # 2. Clean allergies, conditions, contacts
            cur.execute("DELETE FROM ALLERGY WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM STUDENT_CONDITION WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM STUDENT_MEDICATION WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM EMERGENCY_CONTACT WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))

            # 3. Clean student and user accounts
            cur.execute("DELETE FROM STUDENT WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email IN (%s, %s, 'pre_seeded_temp@thapar.edu') OR google_subject IN (%s, %s)",
                        (TEST_STUDENT_EMAIL, OTHER_STUDENT_EMAIL, TEST_STUDENT_SUB, OTHER_STUDENT_SUB))
        conn.commit()
    finally:
        conn.close()


def setup_telemetry_fixtures(user_id: int):
    """Sets up allergies, chronic conditions, emergency contacts, and an active queue visit."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Insert allergy
            cur.execute(
                """
                INSERT INTO ALLERGY (roll_number, allergen, reaction, severity, recorded_by_user_id)
                VALUES (%s, 'Amoxicillin', 'Urticaria and facial rash', 'MODERATE', 1)
                """,
                (TEST_STUDENT_ROLL,),
            )

            # Insert emergency contact
            cur.execute(
                """
                INSERT INTO EMERGENCY_CONTACT (roll_number, name, relationship, phone_number)
                VALUES (%s, 'Col. R.S. Sodhi', 'Father', '+91-9876500011')
                """,
                (TEST_STUDENT_ROLL,),
            )

            # Insert an active OPD visit
            cur.execute(
                """
                INSERT INTO VISIT (roll_number, doctor_id, status, checked_in_at)
                VALUES (%s, 1, 'WAITING_FOR_DOCTOR', NOW())
                """,
                (TEST_STUDENT_ROLL,),
            )
            vis_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO QUEUE_ENTRY (visit_id, doctor_id, queue_sequence, status, entered_at, queue_data, entry_reason)
                VALUES (%s, 1, 42, 'WAITING', NOW(), NOW(), 'INITIAL_CHECKIN')
                """,
                (vis_id,),
            )
            cur.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
                VALUES (%s, 'CHECKED_IN', 5, 'Check-in - Acute sinus headache')
                """,
                (vis_id,),
            )
        conn.commit()
    finally:
        conn.close()


def test_google_token_rejections():
    print("\n--- Test 1: Google Token Signature & Email Verification Rejections ---")
    clean_fixtures()

    # 1.1 Unsigned/malformed token rejected with 401
    res = client.post("/api/auth/google/student", json={"credential": "raw.invalid.token"})
    assert res.status_code == 401, f"Expected 401 for malformed token, got {res.status_code}"
    print("PASS: Malformed/unsigned token rejected with 401.")

    # 1.2 Untrusted Issuer rejected with 401
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "untrusted-issuer.com",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res_bad_iss = client.post("/api/auth/google/student", json={"credential": "mocked.token"})
        assert res_bad_iss.status_code == 401, f"Expected 401 for untrusted issuer, got {res_bad_iss.status_code}"
        assert "issuer" in res_bad_iss.json().get("detail", "").lower()
    print("PASS: Untrusted issuer rejected with 401.")

    # 1.3 Unverified Google email rejected with 401
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": False,
        }
        res_unverified = client.post("/api/auth/google/student", json={"credential": "mocked.token"})
        assert res_unverified.status_code == 401, f"Expected 401 for unverified email, got {res_unverified.status_code}"
        assert "not verified" in res_unverified.json().get("detail", "").lower()
    print("PASS: Unverified Google email (email_verified=false) rejected with 401.")

    # 1.4 Non-university domain rejected with 403
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": "personal.account@gmail.com",
            "name": "Personal Account",
            "sub": "sub_gmail_001",
            "email_verified": True,
        }
        res_gmail = client.post("/api/auth/google/student", json={"credential": "mocked.token"})
        assert res_gmail.status_code == 403, f"Expected 403 for non-thapar email, got {res_gmail.status_code}"
        assert "thapar.edu" in res_gmail.json().get("detail", "").lower()
    print("PASS: Non-university domain rejected with 403.")


def test_student_login_and_account_linking():
    print("\n--- Test 2: Successful Google Student Login & Account Linking ---")
    clean_fixtures()

    # Step 1: First login for brand new student
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res1 = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        assert res1.status_code == 200, f"Expected 200, got {res1.text}"
        data1 = res1.json()
        assert data1["email"] == TEST_STUDENT_EMAIL
        assert data1["roll_number"] == TEST_STUDENT_ROLL
        assert data1["name"] == TEST_STUDENT_NAME
        assert "access_token" in data1
        user_id_1 = data1["user_id"]
        assert user_id_1 is not None

    print(f"PASS: Brand new student provisioned and authenticated (user_id={user_id_1}, roll={TEST_STUDENT_ROLL}).")

    # Step 2: Verify database records were created and linked correctly
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, email, google_subject, account_type, status FROM USER_ACCOUNT WHERE user_id = %s", (user_id_1,))
            u = cur.fetchone()
            assert u is not None
            assert u["email"] == TEST_STUDENT_EMAIL
            assert u["google_subject"] == TEST_STUDENT_SUB
            assert u["account_type"] == "STUDENT"
            assert u["status"] == "ACTIVE"

            cur.execute("SELECT roll_number, user_id, full_name, status FROM STUDENT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            st = cur.fetchone()
            assert st is not None
            assert st["user_id"] == user_id_1
            assert st["full_name"] == TEST_STUDENT_NAME
            assert st["status"] == "ACTIVE"
    finally:
        conn.close()

    print("PASS: Database USER_ACCOUNT and STUDENT records atomically persisted and linked.")

    # Step 3: Re-login for existing student (should reuse same user_id and roll)
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res2 = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["user_id"] == user_id_1
        assert data2["roll_number"] == TEST_STUDENT_ROLL

    print("PASS: Subsequent login successfully matches linked account without duplicate insertion.")


def test_pre_seeded_roster_account_linking():
    print("\n--- Test 3: Pre-seeded Student Roster Account Linking ---")
    clean_fixtures()

    # Pre-seed a STUDENT record without a USER_ACCOUNT
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # We insert a temporary placeholder user_id to satisfy foreign key or nullability
            # First create placeholder user
            cur.execute(
                """
                INSERT INTO USER_ACCOUNT (email, account_type, status)
                VALUES ('pre_seeded_temp@thapar.edu', 'STUDENT', 'ACTIVE')
                """
            )
            temp_uid = cur.lastrowid
            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, status)
                VALUES (%s, %s, %s, '2004-05-15', 'FEMALE', 'ACTIVE')
                """,
                (TEST_STUDENT_ROLL, temp_uid, "Roster Preseeded Student"),
            )
        conn.commit()
    finally:
        conn.close()

    # When student logs in via Google with matching email
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": "Google Name",
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        assert res.status_code == 200
        data = res.json()
        assert data["roll_number"] == TEST_STUDENT_ROLL
        assert data["name"] == "Roster Preseeded Student"  # Preserves official roster name

    # Verify student was re-linked to real user_id
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))
            real_uid = cur.fetchone()["user_id"]
            cur.execute("SELECT user_id FROM STUDENT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            st_uid = cur.fetchone()["user_id"]
            assert st_uid == real_uid
    finally:
        conn.close()

    print("PASS: Pre-seeded student roster row linked to authenticated user account.")


def test_disabled_account_rejection():
    print("\n--- Test 4: Disabled Student Account Rejection ---")
    clean_fixtures()

    # 1. Create student account
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        assert res.status_code == 200
        uid = res.json()["user_id"]

    # 2. Disable the user account
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE USER_ACCOUNT SET status = 'DISABLED' WHERE user_id = %s", (uid,))
        conn.commit()
    finally:
        conn.close()

    # 3. Next login attempt should be rejected with 403
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res_dis = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        assert res_dis.status_code == 403
        assert "disabled" in res_dis.json().get("detail", "").lower()

    print("PASS: Disabled student account correctly rejected with 403 Forbidden.")


def test_get_student_me_telemetry():
    print("\n--- Test 5: GET /api/student/me Telemetry & Active OPD Queue ---")
    clean_fixtures()

    # 1. Authenticate student
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        token = res.json()["access_token"]
        uid = res.json()["user_id"]

    # 2. Add clinical allergies, emergency contacts, and active OPD visit
    setup_telemetry_fixtures(uid)

    # 3. Call GET /api/student/me with valid student token
    headers = {"Authorization": f"Bearer {token}"}
    res_me = client.get("/api/student/me", headers=headers)
    assert res_me.status_code == 200, f"Failed: {res_me.text}"
    telemetry = res_me.json()

    # Verify student identity & academic derivation
    student = telemetry["student"]
    assert student["rollNumber"] == TEST_STUDENT_ROLL
    assert student["fullName"] == TEST_STUDENT_NAME
    assert student["email"] == TEST_STUDENT_EMAIL
    assert student["department"] is not None
    assert student["program"] in ("B.E.", "B.Tech")

    # Verify clinical allergies
    allergies = telemetry["allergies"]
    assert len(allergies) >= 1
    assert any(a["allergen"] == "Amoxicillin" for a in allergies)

    # Verify emergency contacts
    contacts = telemetry["emergencyContacts"]
    assert len(contacts) >= 1
    assert contacts[0]["name"] == "Col. R.S. Sodhi"
    assert contacts[0]["relationship"] == "Father"

    # Verify live active OPD visit
    active_visit = telemetry["activeVisit"]
    assert active_visit is not None
    assert active_visit["status"] in ("WAITING", "WAITING_FOR_DOCTOR")
    assert active_visit["queueSequence"] == 42
    assert active_visit["doctorName"] is not None
    assert "headache" in active_visit["complaint"].lower()

    print("PASS: Full student profile telemetry, allergies, contacts, and active OPD queue returned.")


def test_cross_student_record_protection():
    print("\n--- Test 6: Cross-Student Record Protection & Boundary Enforcement ---")
    clean_fixtures()

    # Authenticate Student A
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": TEST_STUDENT_EMAIL,
            "name": TEST_STUDENT_NAME,
            "sub": TEST_STUDENT_SUB,
            "email_verified": True,
        }
        res_a = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        token_a = res_a.json()["access_token"]

    # Authenticate Student B
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": OTHER_STUDENT_EMAIL,
            "name": OTHER_STUDENT_NAME,
            "sub": OTHER_STUDENT_SUB,
            "email_verified": True,
        }
        res_b = client.post("/api/auth/google/student", json={"credential": "mocked.valid.token"})
        token_b = res_b.json()["access_token"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. Student A accessing own record -> 200 OK
    res_own = client.get(f"/api/student/{TEST_STUDENT_ROLL}", headers=headers_a)
    assert res_own.status_code == 200

    # 2. Student A accessing Student B's record -> 403 Forbidden!
    res_other = client.get(f"/api/student/{OTHER_STUDENT_ROLL}", headers=headers_a)
    assert res_other.status_code == 403, f"Expected 403, got {res_other.status_code}"
    assert "not authorized" in res_other.json().get("detail", "").lower()
    print("PASS: Cross-student profile access blocked with 403 Forbidden.")

    # 3. Student A accessing Student B's history -> 403 Forbidden!
    res_other_hist = client.get(f"/api/student/{OTHER_STUDENT_ROLL}/history", headers=headers_a)
    assert res_other_hist.status_code == 403
    print("PASS: Cross-student medical history access blocked with 403 Forbidden.")

    # 4. Student A accessing /api/patient/{other_roll}/profile -> 403 Forbidden!
    res_patient_other = client.get(f"/api/patient/{OTHER_STUDENT_ROLL}/profile", headers=headers_a)
    assert res_patient_other.status_code == 403
    print("PASS: Doctor patient profile endpoint enforces student boundaries (403 Forbidden).")

    # 5. Student attempting to access Staff routes -> 403 Forbidden!
    res_rec = client.get("/api/reception/visits/completed", headers=headers_a)
    assert res_rec.status_code == 403

    res_doc = client.get("/api/doctor/1/queue", headers=headers_a)
    assert res_doc.status_code == 403

    res_emg = client.get("/api/emergency/logs", headers=headers_a)
    assert res_emg.status_code == 403
    print("PASS: Staff, Doctor, and Receptionist endpoints strictly reject student tokens with 403.")

    # 6. Unauthenticated request to /api/student/me -> 401 Unauthorized
    res_anon = client.get("/api/student/me")
    assert res_anon.status_code == 401
    print("PASS: Unauthenticated request to /api/student/me rejected with 401 Unauthorized.")


if __name__ == "__main__":
    print("===========================================================================")
    print("RUNNING CAMPUSCARE SD-1: STUDENT AUTH & RECORD PROTECTION TEST SUITE")
    print("===========================================================================")
    try:
        test_google_token_rejections()
        test_student_login_and_account_linking()
        test_pre_seeded_roster_account_linking()
        test_disabled_account_rejection()
        test_get_student_me_telemetry()
        test_cross_student_record_protection()
        print("===========================================================================")
        print("ALL SD-1 STUDENT AUTHENTICATION TESTS PASSED SUCCESSFULLY!")
        print("===========================================================================")
    finally:
        clean_fixtures()
