"""
NFC-2 Verification Suite: Card-to-Student Database Mapping & Lifecycle Rules

Tests verify:
1. Normalized UID storage & consistency (e.g., '04:a2:b3:c4:d5:e6:f7' -> '04A2B3C4D5E6F7').
2. Mapping persistence in MySQL.
3. Rapid lookup via GET /api/reception/rfid/lookup/{card_uid} with normalized and raw queries.
4. Student card details and history via GET /api/reception/rfid/student/{roll_number}.
5. Cross-student duplicate protection: 409 Conflict if card is actively assigned to another student.
6. Card replacement: assigning a new card automatically marks previous card as REPLACED.
7. Card revocation: POST /api/reception/rfid/revoke marks card as LOST or DEACTIVATED and logs staff user.
8. Revoked card lookup returns 404 with descriptive inactive status.
9. Inactive card reactivation / reassignment reuses the unique card record without DB collision.
10. Unauthorized requests are blocked with 401.
"""

import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_ROLL_1 = "102409981"
TEST_ROLL_2 = "102409982"
TEST_EMAIL_1 = "nfc_test_student1@thapar.edu"
TEST_EMAIL_2 = "nfc_test_student2@thapar.edu"
TEST_STAFF_EMAIL = "nfc_receptionist@thapar.edu"
STAFF_USER_ID = 88881

RAW_UID_1 = "04:a2:b3:c4:d5:e6:f7"
NORM_UID_1 = "04A2B3C4D5E6F7"
RAW_UID_2 = "04-f8-e7-d6-c5-b4-a3"
NORM_UID_2 = "04F8E7D6C5B4A3"


def make_staff_token():
    return create_access_token({
        "sub": str(STAFF_USER_ID),
        "email": TEST_STAFF_EMAIL,
        "role": "RECEPTIONIST",
        "account_type": "STAFF",
        "user_id": STAFF_USER_ID,
        "staff_id": STAFF_USER_ID,
    })


def setup_fixtures():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Clean existing test cards
            cur.execute(
                "DELETE FROM RFID_CARD WHERE roll_number IN (%s, %s) OR card_uid IN (%s, %s)",
                (TEST_ROLL_1, TEST_ROLL_2, NORM_UID_1, NORM_UID_2),
            )
            # Ensure staff user
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE user_id = %s", (STAFF_USER_ID,))
            if not cur.fetchone():
                cur.execute(
                    """
                    INSERT INTO USER_ACCOUNT (user_id, email, account_type, status)
                    VALUES (%s, %s, 'STAFF', 'ACTIVE')
                    ON DUPLICATE KEY UPDATE email = VALUES(email)
                    """,
                    (STAFF_USER_ID, TEST_STAFF_EMAIL),
                )
                cur.execute(
                    """
                    INSERT INTO STAFF (staff_id, user_id, role, status)
                    VALUES (%s, %s, 'RECEPTIONIST', 'ACTIVE')
                    ON DUPLICATE KEY UPDATE role = 'RECEPTIONIST'
                    """,
                    (STAFF_USER_ID, STAFF_USER_ID),
                )

            # Ensure student 1
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_EMAIL_1,))
            row1 = cur.fetchone()
            if not row1:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (TEST_EMAIL_1,),
                )
                u1_id = cur.lastrowid
            else:
                u1_id = row1["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, 'NFC Test Student One', '2003-01-01', 'O+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC Test Student One', blood_group = 'O+', status = 'ACTIVE'
                """,
                (TEST_ROLL_1, u1_id),
            )

            # Ensure student 2
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_EMAIL_2,))
            row2 = cur.fetchone()
            if not row2:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (TEST_EMAIL_2,),
                )
                u2_id = cur.lastrowid
            else:
                u2_id = row2["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, 'NFC Test Student Two', '2003-02-02', 'B-', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC Test Student Two', blood_group = 'B-', status = 'ACTIVE'
                """,
                (TEST_ROLL_2, u2_id),
            )

        conn.commit()
    finally:
        conn.close()


def clean_fixtures():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM RFID_CARD WHERE roll_number IN (%s, %s) OR card_uid IN (%s, %s)",
                (TEST_ROLL_1, TEST_ROLL_2, NORM_UID_1, NORM_UID_2),
            )
            cur.execute("DELETE FROM STUDENT WHERE roll_number IN (%s, %s)", (TEST_ROLL_1, TEST_ROLL_2))
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email IN (%s, %s)", (TEST_EMAIL_1, TEST_EMAIL_2))
        conn.commit()
    finally:
        conn.close()


def test_nfc2_full_lifecycle():
    print("\n===========================================================================")
    print("STARTING NFC-2 CARD-TO-STUDENT DATABASE MAPPING VERIFICATION")
    print("===========================================================================")

    setup_fixtures()
    token = make_staff_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Unauthenticated request rejected
    print("\n[Step 1] Verifying unauthenticated enroll request is rejected (401)...")
    res_unauth = client.post("/api/reception/rfid/enroll", json={"roll_number": TEST_ROLL_1, "card_uid": RAW_UID_1})
    assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"
    print("  [OK] 401 Unauthorized enforced.")

    # 2. Successful enrollment with raw UID containing colons
    print("\n[Step 2] Enrolling Card 1 with formatted UID (04:a2:b3:c4:d5:e6:f7)...")
    res_enroll = client.post(
        "/api/reception/rfid/enroll",
        json={"roll_number": TEST_ROLL_1, "card_uid": RAW_UID_1},
        headers=headers,
    )
    assert res_enroll.status_code == 201, f"Expected 201, got {res_enroll.status_code}: {res_enroll.text}"
    enroll_data = res_enroll.json()
    assert enroll_data["card_uid"] == NORM_UID_1, f"Expected normalized UID {NORM_UID_1}, got {enroll_data['card_uid']}"
    assert enroll_data["roll_number"] == TEST_ROLL_1
    assert enroll_data["status"] == "ACTIVE"
    print(f"  [OK] Card enrolled. Normalized UID stored: {enroll_data['card_uid']}")

    # 3. Verify mapping directly in MySQL database
    print("\n[Step 3] Verifying MySQL persistence and staff audit...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT rfid_card_id, roll_number, card_uid, status, issued_by_user_id FROM RFID_CARD WHERE card_uid = %s",
                (NORM_UID_1,),
            )
            db_row = cur.fetchone()
            assert db_row is not None, "Card not found in MySQL RFID_CARD table!"
            assert db_row["roll_number"] == TEST_ROLL_1
            assert db_row["status"] == "ACTIVE"
            assert db_row["issued_by_user_id"] == STAFF_USER_ID
            card1_id = db_row["rfid_card_id"]
    finally:
        conn.close()
    print(f"  [OK] MySQL record verified: PK={card1_id}, Roll={TEST_ROLL_1}, Staff={STAFF_USER_ID}")

    # 4. Lookup by raw UID (with colons) and by normalized UID
    print("\n[Step 4] Verifying rapid lookup via GET /api/reception/rfid/lookup/...")
    # Lookup using raw UID with colons
    res_lookup_raw = client.get(f"/api/reception/rfid/lookup/{RAW_UID_1}", headers=headers)
    assert res_lookup_raw.status_code == 200, f"Expected 200, got {res_lookup_raw.status_code}: {res_lookup_raw.text}"
    lookup_data = res_lookup_raw.json()
    assert lookup_data["rollNumber"] == TEST_ROLL_1
    assert lookup_data["studentName"] == "NFC Test Student One"
    assert lookup_data["bloodGroup"] == "O+"
    print(f"  [OK] Lookup with raw colon UID succeeded: {lookup_data['studentName']} ({lookup_data['rollNumber']})")

    # Lookup using normalized UID
    res_lookup_norm = client.get(f"/api/reception/rfid/lookup/{NORM_UID_1}", headers=headers)
    assert res_lookup_norm.status_code == 200
    assert res_lookup_norm.json()["rollNumber"] == TEST_ROLL_1
    print("  [OK] Lookup with normalized UID succeeded.")

    # 5. Query student card details and history via GET /api/reception/rfid/student/{roll}
    print("\n[Step 5] Checking student card status via GET /api/reception/rfid/student/{roll}...")
    res_student_card = client.get(f"/api/reception/rfid/student/{TEST_ROLL_1}", headers=headers)
    assert res_student_card.status_code == 200
    st_card_data = res_student_card.json()
    assert st_card_data["activeCard"]["cardUid"] == NORM_UID_1
    assert st_card_data["activeCard"]["status"] == "ACTIVE"
    print(f"  [OK] Active card returned for student: {st_card_data['activeCard']['cardUid']}")

    # 6. Cross-student duplicate prevention (Assigning Card 1 to Student 2 must fail 409)
    print("\n[Step 6] Testing cross-student duplicate card prevention...")
    res_dup = client.post(
        "/api/reception/rfid/enroll",
        json={"roll_number": TEST_ROLL_2, "card_uid": RAW_UID_1},
        headers=headers,
    )
    assert res_dup.status_code == 409, f"Expected 409 Conflict, got {res_dup.status_code}: {res_dup.text}"
    assert "currently actively assigned to student" in res_dup.json()["detail"]
    print("  [OK] 409 Conflict correctly prevented assigning already-active card to another student.")

    # 7. Card replacement (Student 1 is issued Card 2)
    print("\n[Step 7] Testing card replacement rule (Student 1 issued Card 2)...")
    res_replace = client.post(
        "/api/reception/rfid/enroll",
        json={"roll_number": TEST_ROLL_1, "card_uid": RAW_UID_2},
        headers=headers,
    )
    assert res_replace.status_code == 201
    print(f"  [OK] Card 2 enrolled for Student 1: {res_replace.json()['card_uid']}")

    # Verify Card 1 was marked REPLACED and Card 2 is ACTIVE
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT card_uid, status, deactivated_at FROM RFID_CARD WHERE card_uid = %s", (NORM_UID_1,))
            card1 = cur.fetchone()
            assert card1["status"] == "REPLACED", f"Expected REPLACED, got {card1['status']}"
            assert card1["deactivated_at"] is not None

            cur.execute("SELECT card_uid, status FROM RFID_CARD WHERE card_uid = %s", (NORM_UID_2,))
            card2 = cur.fetchone()
            assert card2["status"] == "ACTIVE"
    finally:
        conn.close()
    print("  [OK] Database confirmed: Card 1 is REPLACED, Card 2 is ACTIVE.")

    # 8. Replaced card lookup must return 404 (with informative message)
    print("\n[Step 8] Verifying lookup of replaced card returns 404...")
    res_lookup_old = client.get(f"/api/reception/rfid/lookup/{NORM_UID_1}", headers=headers)
    assert res_lookup_old.status_code == 404
    assert "REPLACED" in res_lookup_old.json()["detail"]
    print(f"  [OK] Inactive card lookup rejected with 404: {res_lookup_old.json()['detail']}")

    # 9. Card revocation workflow (Revoking Card 2 as LOST)
    print("\n[Step 9] Testing card revocation (POST /api/reception/rfid/revoke)...")
    res_revoke = client.post(
        "/api/reception/rfid/revoke",
        json={"card_uid": NORM_UID_2, "reason": "LOST"},
        headers=headers,
    )
    assert res_revoke.status_code == 200
    revoke_data = res_revoke.json()
    assert revoke_data["status"] == "LOST"
    assert revoke_data["success"] is True
    print(f"  [OK] Card revoked: {revoke_data['message']}")

    # Confirm revocation in MySQL
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status, revoked_by_user_id FROM RFID_CARD WHERE card_uid = %s", (NORM_UID_2,))
            row = cur.fetchone()
            assert row["status"] == "LOST"
            assert row["revoked_by_user_id"] == STAFF_USER_ID
    finally:
        conn.close()
    print(f"  [OK] Database confirmed: Card 2 status is LOST, revoked_by_user_id={STAFF_USER_ID}.")

    # 10. Reactivation / Re-assignment of a revoked card
    print("\n[Step 10] Testing re-enrollment of a previously revoked card...")
    # Student 2 can now enroll Card 2 because Card 2 is no longer actively assigned to Student 1
    res_reassign = client.post(
        "/api/reception/rfid/enroll",
        json={"roll_number": TEST_ROLL_2, "card_uid": RAW_UID_2},
        headers=headers,
    )
    assert res_reassign.status_code == 201
    assert res_reassign.json()["roll_number"] == TEST_ROLL_2
    assert res_reassign.json()["status"] == "ACTIVE"
    print(f"  [OK] Previously revoked card successfully reassigned to Student 2 without collision.")

    # Clean up
    clean_fixtures()
    print("\n===========================================================================")
    print("ALL NFC-2 BACKEND DATA CONTRACTS AND LIFECYCLE RULES VERIFIED SUCCESSFULLY!")
    print("===========================================================================\n")


if __name__ == "__main__":
    try:
        test_nfc2_full_lifecycle()
    except Exception:
        clean_fixtures()
        raise
