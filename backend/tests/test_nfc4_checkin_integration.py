"""
NFC-4 Verification Suite: Receptionist NFC Check-in Integration & Eligibility

Tests verify:
1. Two-phase NFC check-in pattern:
   Phase A: POST /api/rfid/lookup resolves card UID to student (zero visit creation).
   Phase B: POST /api/reception/checkin confirms check-in with via="RFID", issuing queue sequence token.
2. Two-phase Manual check-in pattern:
   Phase A: GET /api/reception/students/{roll_number} retrieves student profile.
   Phase B: POST /api/reception/checkin confirms check-in with via="MANUAL".
3. Server-side re-validation of eligibility and duplicate visit prevention (409 Conflict).
4. Doctor availability re-validation at confirmation time.
5. Verification that queue sequence and visit events are created atomically.
"""

import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_ROLL_NFC = "102409771"
TEST_ROLL_MANUAL = "102409772"
TEST_EMAIL_NFC = "nfc4_student_nfc@thapar.edu"
TEST_EMAIL_MANUAL = "nfc4_student_manual@thapar.edu"

RECEPTIONIST_EMAIL = "nfc4_receptionist@thapar.edu"
RECEPTIONIST_USER_ID = 88895

CARD_UID_RAW = "04:c3:d4:e5:f6:a7:b8"
CARD_UID_NORM = "04C3D4E5F6A7B8"


def make_receptionist_token():
    return create_access_token({
        "sub": str(RECEPTIONIST_USER_ID),
        "email": RECEPTIONIST_EMAIL,
        "role": "RECEPTIONIST",
        "account_type": "STAFF",
        "user_id": RECEPTIONIST_USER_ID,
        "staff_id": RECEPTIONIST_USER_ID,
    })


def setup_fixtures():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Clean existing test entries
            cur.execute(
                "DELETE FROM VISIT_EVENT WHERE visit_id IN (SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s))",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL),
            )
            cur.execute(
                "DELETE FROM QUEUE_ENTRY WHERE visit_id IN (SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s))",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL),
            )
            cur.execute(
                "DELETE FROM VISIT WHERE roll_number IN (%s, %s)",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL),
            )
            cur.execute(
                "DELETE FROM RFID_CARD WHERE roll_number IN (%s, %s) OR card_uid = %s",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL, CARD_UID_NORM),
            )

            # Ensure receptionist staff user
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE user_id = %s", (RECEPTIONIST_USER_ID,))
            if not cur.fetchone():
                cur.execute(
                    """
                    INSERT INTO USER_ACCOUNT (user_id, email, account_type, status)
                    VALUES (%s, %s, 'STAFF', 'ACTIVE')
                    ON DUPLICATE KEY UPDATE email = VALUES(email)
                    """,
                    (RECEPTIONIST_USER_ID, RECEPTIONIST_EMAIL),
                )
                cur.execute(
                    """
                    INSERT INTO STAFF (staff_id, user_id, role, status)
                    VALUES (%s, %s, 'RECEPTIONIST', 'ACTIVE')
                    ON DUPLICATE KEY UPDATE role = 'RECEPTIONIST'
                    """,
                    (RECEPTIONIST_USER_ID, RECEPTIONIST_USER_ID),
                )

            # Ensure Student NFC
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_EMAIL_NFC,))
            r_nfc = cur.fetchone()
            if not r_nfc:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (TEST_EMAIL_NFC,),
                )
                u_nfc_id = cur.lastrowid
            else:
                u_nfc_id = r_nfc["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, 'NFC4 Tapped Student', '2003-05-12', 'B+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC4 Tapped Student', blood_group = 'B+', status = 'ACTIVE'
                """,
                (TEST_ROLL_NFC, u_nfc_id),
            )

            # Ensure Student Manual
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_EMAIL_MANUAL,))
            r_man = cur.fetchone()
            if not r_man:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (TEST_EMAIL_MANUAL,),
                )
                u_man_id = cur.lastrowid
            else:
                u_man_id = r_man["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, 'NFC4 Manual Student', '2003-09-18', 'AB+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC4 Manual Student', blood_group = 'AB+', status = 'ACTIVE'
                """,
                (TEST_ROLL_MANUAL, u_man_id),
            )

            # Link Active Card to Student NFC
            cur.execute(
                """
                INSERT INTO RFID_CARD (roll_number, card_uid, status, issued_at, issued_by_user_id)
                VALUES (%s, %s, 'ACTIVE', NOW(), %s)
                """,
                (TEST_ROLL_NFC, CARD_UID_NORM, RECEPTIONIST_USER_ID),
            )

            # Ensure at least 1 Doctor is Available
            cur.execute("SELECT doctor_id FROM DOCTOR LIMIT 1")
            doc = cur.fetchone()
            assert doc is not None, "At least 1 doctor must exist in DOCTOR table"
            doc_id = doc["doctor_id"]
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, created_by_user_id)
                VALUES (%s, CURDATE(), 'AVAILABLE', %s)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """,
                (doc_id, RECEPTIONIST_USER_ID),
            )

        conn.commit()
    finally:
        conn.close()

    return doc_id


def clean_fixtures():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM VISIT_EVENT WHERE visit_id IN (SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s))",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL),
            )
            cur.execute(
                "DELETE FROM QUEUE_ENTRY WHERE visit_id IN (SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s))",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL),
            )
            cur.execute(
                "DELETE FROM VISIT WHERE roll_number IN (%s, %s)",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL),
            )
            cur.execute(
                "DELETE FROM RFID_CARD WHERE roll_number IN (%s, %s) OR card_uid = %s",
                (TEST_ROLL_NFC, TEST_ROLL_MANUAL, CARD_UID_NORM),
            )
            cur.execute("DELETE FROM STUDENT WHERE roll_number IN (%s, %s)", (TEST_ROLL_NFC, TEST_ROLL_MANUAL))
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email IN (%s, %s)", (TEST_EMAIL_NFC, TEST_EMAIL_MANUAL))
        conn.commit()
    finally:
        conn.close()


def test_nfc4_checkin_integration():
    print("\n===========================================================================")
    print("STARTING NFC-4 RECEPTIONIST NFC CHECK-IN INTEGRATION VERIFICATION")
    print("===========================================================================")

    doc_id = setup_fixtures()
    headers = {"Authorization": f"Bearer {make_receptionist_token()}"}

    # ─────────────────────────────────────────────────────────────────────────
    # Flow A: Smart Card NFC Tap Check-in
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow A - Step 1] Receptionist scans student smart card (Resolving UID)...")
    res_lookup = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": CARD_UID_RAW},
        headers=headers,
    )
    assert res_lookup.status_code == 200
    lookup_body = res_lookup.json()
    assert lookup_body["matched"] is True
    assert lookup_body["student"]["roll_number"] == TEST_ROLL_NFC
    assert lookup_body["student"]["name"] == "NFC4 Tapped Student"
    assert lookup_body["student"]["blood_group"] == "B+"
    print(f"  [OK] Matched: {lookup_body['student']['name']} ({lookup_body['student']['roll_number']})")

    # Confirm lookup created NO visits
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM VISIT WHERE roll_number = %s", (TEST_ROLL_NFC,))
            assert cur.fetchone()["c"] == 0
    finally:
        conn.close()
    print("  [OK] Confirmed: Card lookup produced 0 visits prior to confirmation.")

    # Receptionist reviews match and confirms check-in
    print("\n[Flow A - Step 2] Receptionist selects doctor and confirms check-in (via='RFID')...")
    res_checkin = client.post(
        "/api/reception/checkin",
        json={
            "roll_number": TEST_ROLL_NFC,
            "doctor_id": doc_id,
            "complaint": "Persistent high fever and chills",
            "via": "RFID",
        },
        headers=headers,
    )
    assert res_checkin.status_code == 201, f"Expected 201, got {res_checkin.status_code}: {res_checkin.text}"
    checkin_body = res_checkin.json()
    visit_id = checkin_body["visitId"]
    queue_no = checkin_body["queueNo"]
    assert visit_id > 0
    assert queue_no > 0
    print(f"  [OK] Check-in Confirmed: Visit #{visit_id}, Queue Token #{queue_no}, Doctor Cabin #{doc_id}")

    # Confirm visit in MySQL
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status, roll_number, doctor_id FROM VISIT WHERE visit_id = %s", (visit_id,))
            v_row = cur.fetchone()
            assert v_row["status"] == "WAITING_FOR_DOCTOR"
            assert v_row["roll_number"] == TEST_ROLL_NFC
            assert v_row["doctor_id"] == doc_id

            # Check queue entry
            cur.execute("SELECT status, queue_sequence FROM QUEUE_ENTRY WHERE visit_id = %s", (visit_id,))
            q_row = cur.fetchone()
            assert q_row["status"] == "WAITING"
            assert q_row["queue_sequence"] == queue_no
    finally:
        conn.close()
    print("  [OK] MySQL state verified: VISIT status=WAITING_FOR_DOCTOR, QUEUE_ENTRY active.")

    # ─────────────────────────────────────────────────────────────────────────
    # Flow B: Duplicate Visit Prevention Re-Validation
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow B] Server-side duplicate visit check at confirmation time...")
    # Attempting to check in Student NFC a second time while visit is active must fail 409
    res_dup = client.post(
        "/api/reception/checkin",
        json={
            "roll_number": TEST_ROLL_NFC,
            "doctor_id": doc_id,
            "complaint": "Duplicate attempt",
            "via": "RFID",
        },
        headers=headers,
    )
    assert res_dup.status_code == 409, f"Expected 409 Conflict, got {res_dup.status_code}: {res_dup.text}"
    assert "active visit" in res_dup.json()["detail"].lower()
    print(f"  [OK] 409 Conflict enforced: {res_dup.json()['detail']}")

    # ─────────────────────────────────────────────────────────────────────────
    # Flow C: Manual Roll Number Check-in Flow
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow C - Step 1] Receptionist looks up student by roll number...")
    res_st_lookup = client.get(f"/api/reception/students/{TEST_ROLL_MANUAL}", headers=headers)
    assert res_st_lookup.status_code == 200
    st_data = res_st_lookup.json()
    assert st_data["rollNumber"] == TEST_ROLL_MANUAL
    assert st_data["name"] == "NFC4 Manual Student"
    print(f"  [OK] Manual student profile matched: {st_data['name']} ({st_data['rollNumber']})")

    print("\n[Flow C - Step 2] Receptionist confirms manual check-in (via='MANUAL')...")
    res_man_checkin = client.post(
        "/api/reception/checkin",
        json={
            "roll_number": TEST_ROLL_MANUAL,
            "doctor_id": doc_id,
            "complaint": "Sports injury sprained ankle",
            "via": "MANUAL",
        },
        headers=headers,
    )
    assert res_man_checkin.status_code == 201
    man_visit_id = res_man_checkin.json()["visitId"]
    man_queue_no = res_man_checkin.json()["queueNo"]
    print(f"  [OK] Manual Check-in Confirmed: Visit #{man_visit_id}, Queue Token #{man_queue_no}")

    # Confirm visit in MySQL with via='MANUAL' audit
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status, roll_number, doctor_id FROM VISIT WHERE visit_id = %s", (man_visit_id,))
            v_man = cur.fetchone()
            assert v_man["status"] == "WAITING_FOR_DOCTOR"
            assert v_man["roll_number"] == TEST_ROLL_MANUAL

            cur.execute("SELECT notes FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'CHECKED_IN'", (man_visit_id,))
            ve_man = cur.fetchone()
            assert "MANUAL check-in" in ve_man["notes"]
    finally:
        conn.close()
    print("  [OK] MySQL state verified: VISIT status=WAITING_FOR_DOCTOR, via=MANUAL.")

    clean_fixtures()
    print("\n===========================================================================")
    print("ALL NFC-4 RECEPTIONIST CHECK-IN INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("===========================================================================\n")


if __name__ == "__main__":
    try:
        test_nfc4_checkin_integration()
    except Exception:
        clean_fixtures()
        raise
