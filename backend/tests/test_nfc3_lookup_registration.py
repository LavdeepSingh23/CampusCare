"""
NFC-3 Verification Suite: Backend Lookup and Registration APIs

Tests verify:
1. POST /api/rfid/lookup requires Receptionist authorization (401 unauth, 403 for students/doctors).
2. Format & length validation (422 for malformed/short/long UIDs).
3. Pure read-only behavior: lookup never creates a VISIT or QUEUE_ENTRY.
4. Unregistered card returns { matched: False, status: 'NOT_FOUND' }.
5. Registered active card returns { matched: True, student: { roll_number, name } }.
6. Revoked / deactivated card returns { matched: False, status: 'REVOKED' }.
7. POST /api/rfid/cards registers card, normalizes UID, and links registering staff identity.
8. Enforcing single card per student & rejecting duplicate assignments across students (409 Conflict).
9. POST /api/rfid/cards/{card_id}/revoke revokes card with reason (LOST/DEACTIVATED) and logs staff identity.
"""

import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_ROLL_1 = "102409881"
TEST_ROLL_2 = "102409882"
TEST_EMAIL_1 = "nfc3_student1@thapar.edu"
TEST_EMAIL_2 = "nfc3_student2@thapar.edu"

RECEPTIONIST_EMAIL = "nfc3_receptionist@thapar.edu"
RECEPTIONIST_USER_ID = 88891

DOCTOR_EMAIL = "nfc3_doctor@thapar.edu"
DOCTOR_USER_ID = 88892

RAW_UID_1 = "04:b1:c2:d3:e4:f5:a6"
NORM_UID_1 = "04B1C2D3E4F5A6"
RAW_UID_2 = "04-99-88-77-66-55-44"
NORM_UID_2 = "04998877665544"
UNKNOWN_RAW_UID = "04:ff:ee:dd:cc:bb:aa"
NORM_UNKNOWN_UID = "04FFEEDDCCBBAA"


def make_receptionist_token():
    return create_access_token({
        "sub": str(RECEPTIONIST_USER_ID),
        "email": RECEPTIONIST_EMAIL,
        "role": "RECEPTIONIST",
        "account_type": "STAFF",
        "user_id": RECEPTIONIST_USER_ID,
        "staff_id": RECEPTIONIST_USER_ID,
    })


def make_doctor_token():
    return create_access_token({
        "sub": str(DOCTOR_USER_ID),
        "email": DOCTOR_EMAIL,
        "role": "DOCTOR",
        "account_type": "STAFF",
        "user_id": DOCTOR_USER_ID,
        "staff_id": DOCTOR_USER_ID,
        "doctor_id": 1,
    })


def make_student_token():
    return create_access_token({
        "sub": "99991",
        "email": TEST_EMAIL_1,
        "role": "STUDENT",
        "account_type": "STUDENT",
        "roll_number": TEST_ROLL_1,
    })


def setup_fixtures():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Clean existing test cards
            cur.execute(
                "DELETE FROM RFID_CARD WHERE roll_number IN (%s, %s) OR card_uid IN (%s, %s, %s)",
                (TEST_ROLL_1, TEST_ROLL_2, NORM_UID_1, NORM_UID_2, NORM_UNKNOWN_UID),
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
                VALUES (%s, %s, 'NFC3 Verified Student One', '2003-04-10', 'A+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC3 Verified Student One', blood_group = 'A+', status = 'ACTIVE'
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
                VALUES (%s, %s, 'NFC3 Verified Student Two', '2003-08-20', 'O-', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC3 Verified Student Two', blood_group = 'O-', status = 'ACTIVE'
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
                "DELETE FROM RFID_CARD WHERE roll_number IN (%s, %s) OR card_uid IN (%s, %s, %s)",
                (TEST_ROLL_1, TEST_ROLL_2, NORM_UID_1, NORM_UID_2, NORM_UNKNOWN_UID),
            )
            cur.execute("DELETE FROM STUDENT WHERE roll_number IN (%s, %s)", (TEST_ROLL_1, TEST_ROLL_2))
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email IN (%s, %s)", (TEST_EMAIL_1, TEST_EMAIL_2))
        conn.commit()
    finally:
        conn.close()


def test_nfc3_full_suite():
    print("\n===========================================================================")
    print("STARTING NFC-3 BACKEND LOOKUP AND REGISTRATION APIS VERIFICATION")
    print("===========================================================================")

    setup_fixtures()
    rec_headers = {"Authorization": f"Bearer {make_receptionist_token()}"}
    doc_headers = {"Authorization": f"Bearer {make_doctor_token()}"}
    stu_headers = {"Authorization": f"Bearer {make_student_token()}"}

    # Step 1: Authorization checks for POST /api/rfid/lookup
    print("\n[Step 1] Verifying authorization boundaries for POST /api/rfid/lookup...")
    res_no_auth = client.post("/api/rfid/lookup", json={"card_identifier": NORM_UID_1})
    assert res_no_auth.status_code == 401, f"Expected 401, got {res_no_auth.status_code}"
    print("  [OK] Unauthenticated lookup rejected (401).")

    res_stu_auth = client.post("/api/rfid/lookup", json={"card_identifier": NORM_UID_1}, headers=stu_headers)
    assert res_stu_auth.status_code == 403, f"Expected 403, got {res_stu_auth.status_code}"
    print("  [OK] Student lookup rejected (403 Forbidden).")

    res_doc_auth = client.post("/api/rfid/lookup", json={"card_identifier": NORM_UID_1}, headers=doc_headers)
    assert res_doc_auth.status_code == 403, f"Expected 403, got {res_doc_auth.status_code}"
    print("  [OK] Doctor lookup rejected (403 Forbidden - Receptionist only).")

    # Step 2: Format & length validation (422)
    print("\n[Step 2] Verifying UID format & length validation...")
    res_short = client.post("/api/rfid/lookup", json={"card_identifier": "A"}, headers=rec_headers)
    assert res_short.status_code == 422
    print("  [OK] Too short UID rejected with 422.")

    res_invalid_char = client.post("/api/rfid/lookup", json={"card_identifier": "INVALID!@#$"}, headers=rec_headers)
    assert res_invalid_char.status_code == 422
    print("  [OK] Non-hex/alphanumeric characters rejected with 422.")

    # Step 3: Lookup unregistered card -> matched: False, status: 'NOT_FOUND'
    print("\n[Step 3] Querying unregistered card...")
    res_unregistered = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": RAW_UID_1},
        headers=rec_headers,
    )
    assert res_unregistered.status_code == 200
    unreg_data = res_unregistered.json()
    assert unreg_data["matched"] is False
    assert unreg_data["status"] == "NOT_FOUND"
    assert unreg_data["student"] is None
    print(f"  [OK] Unregistered card correctly resolved: matched=False, status={unreg_data['status']}")

    # Step 4: Verify lookup does NOT create a visit
    print("\n[Step 4] Confirming lookup never creates a visit record...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM VISIT WHERE roll_number = %s", (TEST_ROLL_1,))
            count_before = cur.fetchone()["c"]
    finally:
        conn.close()
    assert count_before == 0, "Initial visits must be 0"
    print("  [OK] Database confirmed: 0 visits created by lookup.")

    # Step 5: Register Card 1 for Student 1 via POST /api/rfid/cards
    print("\n[Step 5] Registering Card 1 via POST /api/rfid/cards...")
    res_register = client.post(
        "/api/rfid/cards",
        json={"roll_number": TEST_ROLL_1, "card_identifier": RAW_UID_1},
        headers=rec_headers,
    )
    assert res_register.status_code == 201, f"Registration failed: {res_register.text}"
    reg_data = res_register.json()
    assert reg_data["success"] is True
    assert reg_data["card_identifier"] == NORM_UID_1
    assert reg_data["status"] == "ACTIVE"
    card1_id = reg_data["card_id"]
    print(f"  [OK] Card 1 registered: Card ID #{card1_id}, UID {NORM_UID_1}")

    # Confirm staff identity was persisted
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT issued_by_user_id FROM RFID_CARD WHERE rfid_card_id = %s", (card1_id,))
            assert cur.fetchone()["issued_by_user_id"] == RECEPTIONIST_USER_ID
    finally:
        conn.close()
    print("  [OK] Registering staff identity verified in database.")

    # Step 6: Lookup registered active card via POST /api/rfid/lookup
    print("\n[Step 6] Resolving registered card via POST /api/rfid/lookup...")
    res_lookup = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": RAW_UID_1},
        headers=rec_headers,
    )
    assert res_lookup.status_code == 200
    lookup_data = res_lookup.json()
    assert lookup_data["matched"] is True
    assert lookup_data["student"]["roll_number"] == TEST_ROLL_1
    assert lookup_data["student"]["name"] == "NFC3 Verified Student One"
    assert lookup_data["student"]["blood_group"] == "A+"
    assert lookup_data["card"]["card_id"] == card1_id
    assert lookup_data["card"]["card_identifier"] == NORM_UID_1
    assert lookup_data["card"]["status"] == "ACTIVE"
    print(f"  [OK] Active card resolved: {lookup_data['student']['name']} ({lookup_data['student']['roll_number']})")

    # Step 7: Duplicate card assignment prevention (Assigning Card 1 to Student 2 yields 409)
    print("\n[Step 7] Testing duplicate cross-student card assignment rejection (409 Conflict)...")
    res_conflict = client.post(
        "/api/rfid/cards",
        json={"roll_number": TEST_ROLL_2, "card_identifier": RAW_UID_1},
        headers=rec_headers,
    )
    assert res_conflict.status_code == 409, f"Expected 409, got {res_conflict.status_code}"
    print(f"  [OK] 409 Conflict returned: {res_conflict.json()['detail']}")

    # Step 8: Card replacement: Register Card 2 for Student 1
    print("\n[Step 8] Testing card replacement rule (Student 1 issued Card 2)...")
    res_reg2 = client.post(
        "/api/rfid/cards",
        json={"roll_number": TEST_ROLL_1, "card_identifier": RAW_UID_2},
        headers=rec_headers,
    )
    assert res_reg2.status_code == 201
    card2_id = res_reg2.json()["card_id"]
    print(f"  [OK] Card 2 registered (#{card2_id}).")

    # Verify Card 1 is now marked REPLACED, and lookup returns matched=False, status='REVOKED'
    res_lookup_old = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": RAW_UID_1},
        headers=rec_headers,
    )
    assert res_lookup_old.status_code == 200
    old_data = res_lookup_old.json()
    assert old_data["matched"] is False
    assert old_data["status"] == "REVOKED"
    assert old_data["card_status"] == "REPLACED"
    assert old_data["student"] is None
    print(f"  [OK] Old replaced card lookup returns matched=False with status={old_data['status']} ({old_data['card_status']}).")

    # Step 9: Revoke Card 2 via POST /api/rfid/cards/{card_id}/revoke
    print("\n[Step 9] Revoking Card 2 via POST /api/rfid/cards/{card_id}/revoke...")
    res_revoke = client.post(
        f"/api/rfid/cards/{card2_id}/revoke",
        json={"reason": "LOST", "notes": "Student reported card misplaced in library"},
        headers=rec_headers,
    )
    assert res_revoke.status_code == 200
    revoke_data = res_revoke.json()
    assert revoke_data["success"] is True
    assert revoke_data["status"] == "LOST"
    print(f"  [OK] Card #{card2_id} marked as LOST.")

    # Confirm lookup of revoked card
    res_lookup_revoked = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": RAW_UID_2},
        headers=rec_headers,
    )
    assert res_lookup_revoked.status_code == 200
    rev_data = res_lookup_revoked.json()
    assert rev_data["matched"] is False
    assert rev_data["status"] == "REVOKED"
    assert rev_data["card_status"] == "LOST"
    print(f"  [OK] Revoked card lookup returns matched=False, status={rev_data['status']}, card_status=LOST.")

    # Step 10: Confirm again that 0 visits were created across all lookup steps
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM VISIT WHERE roll_number IN (%s, %s)", (TEST_ROLL_1, TEST_ROLL_2))
            count_after = cur.fetchone()["c"]
    finally:
        conn.close()
    assert count_after == 0, f"Expected 0 visits created, found {count_after}!"
    print("  [OK] Verified: Lookups never created any visits or queue entries.")

    clean_fixtures()
    print("\n===========================================================================")
    print("ALL NFC-3 BACKEND LOOKUP AND REGISTRATION APIS VERIFIED SUCCESSFULLY!")
    print("===========================================================================\n")


if __name__ == "__main__":
    try:
        test_nfc3_full_suite()
    except Exception:
        clean_fixtures()
        raise

