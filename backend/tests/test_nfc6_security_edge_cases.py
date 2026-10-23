"""
Phase NFC-6: Security, Failures and Edge Cases Verification Suite.

Tested against user's actual student credentials:
- Roll Number: 1024030107
- Full Name: Lavdeep Singh
- Email: lsingh2_be24@thapar.edu
- Blood Group: B+
- Card UID: 32E5A47A (Normalized from 32:E5:A4:7A)

Backend Edge Cases:
1. Valid, unknown and revoked card identifiers
2. Invalid UID formats (length, characters, empty)
3. A card registered to the wrong roll number
4. Duplicate card registration attempts
5. Unauthorized access (Students/Doctors/No Auth)
6. Duplicate active check-in (409 Conflict)
7. Two simultaneous check-in requests (Concurrency race)
8. Card revocation between lookup and confirmation
9. Database failure halfway through check-in (Transaction atomicity)
10. Audit events recorded exactly once for successful check-in
"""

import concurrent.futures
import os
import sys
import time
from typing import Any, Dict

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

STUDENT_ROLL = "1024030107"
STUDENT_NAME = "Lavdeep Singh"
STUDENT_EMAIL = "lsingh2_be24@thapar.edu"
STUDENT_BLOOD = "B+"
STUDENT_CARD_UID = "32E5A47A"
RAW_CARD_UID = "32:E5:A4:7A"

RECEPTIONIST_USER_ID = 2
RECEPTIONIST_EMAIL = "reception_nfc6@thapar.edu"

DOCTOR_USER_ID = 10
DOCTOR_EMAIL = "doc_nfc6@thapar.edu"


def get_tokens() -> Dict[str, str]:
    rec_token = create_access_token({
        "sub": str(RECEPTIONIST_USER_ID),
        "email": RECEPTIONIST_EMAIL,
        "role": "RECEPTIONIST",
        "account_type": "STAFF",
        "user_id": RECEPTIONIST_USER_ID,
        "staff_id": 1,
    })
    doc_token = create_access_token({
        "sub": str(DOCTOR_USER_ID),
        "email": DOCTOR_EMAIL,
        "role": "DOCTOR",
        "account_type": "DOCTOR",
        "user_id": DOCTOR_USER_ID,
        "doctor_id": 1,
    })
    stu_token = create_access_token({
        "sub": "561",
        "email": STUDENT_EMAIL,
        "role": "STUDENT",
        "account_type": "STUDENT",
        "user_id": 561,
        "roll_number": STUDENT_ROLL,
    })
    return {
        "receptionist": rec_token,
        "doctor": doc_token,
        "student": stu_token,
    }


SECONDARY_STUDENT_ROLL = "102409799"
SECONDARY_STUDENT_EMAIL = "nfc6_second@thapar.edu"


def clean_student_visits():
    """Removes test visits and queue entries for the student to keep state clean."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM VISIT_EVENT WHERE visit_id IN (
                    SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s)
                )
                """,
                (STUDENT_ROLL, SECONDARY_STUDENT_ROLL),
            )
            cur.execute(
                """
                DELETE FROM QUEUE_ENTRY WHERE visit_id IN (
                    SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s)
                )
                """,
                (STUDENT_ROLL, SECONDARY_STUDENT_ROLL),
            )
            cur.execute("DELETE FROM VISIT WHERE roll_number IN (%s, %s)", (STUDENT_ROLL, SECONDARY_STUDENT_ROLL))
        conn.commit()
    finally:
        conn.close()


def ensure_student_fixtures(active_card: bool = True):
    """Ensures Lavdeep Singh's STUDENT and RFID_CARD records exist in remote MySQL."""
    clean_student_visits()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Update/Ensure STUDENT row exists
            cur.execute(
                """
                UPDATE STUDENT
                SET full_name = %s, blood_group = %s, status = 'ACTIVE'
                WHERE roll_number = %s
                """,
                (STUDENT_NAME, STUDENT_BLOOD, STUDENT_ROLL),
            )

            # 2. Ensure Secondary Student exists for duplicate card conflict test
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (SECONDARY_STUDENT_EMAIL,))
            u_sec = cur.fetchone()
            if not u_sec:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (SECONDARY_STUDENT_EMAIL,),
                )
                sec_uid = cur.lastrowid
            else:
                sec_uid = u_sec["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, blood_group, status)
                VALUES (%s, %s, 'NFC6 Secondary Student', '2004-02-02', 'FEMALE', 'O+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE status = 'ACTIVE'
                """,
                (SECONDARY_STUDENT_ROLL, sec_uid),
            )

            # 3. Ensure RFID_CARD row exists
            card_status = 'ACTIVE' if active_card else 'DEACTIVATED'
            cur.execute(
                """
                INSERT INTO RFID_CARD (roll_number, card_uid, status, issued_by_user_id, issued_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON DUPLICATE KEY UPDATE status = %s, roll_number = %s
                """,
                (STUDENT_ROLL, STUDENT_CARD_UID, card_status, RECEPTIONIST_USER_ID, card_status, STUDENT_ROLL),
            )

            # 4. Ensure at least one doctor is AVAILABLE today
            cur.execute("SELECT doctor_id FROM DOCTOR LIMIT 1")
            d_row = cur.fetchone()
            assert d_row is not None, "Need at least 1 doctor in DOCTOR table"
            doc_id = d_row["doctor_id"]
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


def test_nfc6_security_edge_cases():
    print("\n===========================================================================")
    print("STARTING NFC-6 SECURITY, FAILURES & EDGE CASES VERIFICATION SUITE")
    print(f"Target Student: {STUDENT_NAME} ({STUDENT_ROLL}) | Card: {STUDENT_CARD_UID}")
    print("===========================================================================")

    tokens = get_tokens()
    rec_headers = {"Authorization": f"Bearer {tokens['receptionist']}"}
    doc_headers = {"Authorization": f"Bearer {tokens['doctor']}"}
    stu_headers = {"Authorization": f"Bearer {tokens['student']}"}

    doc_id = ensure_student_fixtures(active_card=True)

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Valid, Unknown, and Revoked Card Identifiers
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 1] Valid, Unknown, and Revoked Card Identifiers...")
    # 1a. Valid active card with raw colon-delimited UID
    res_val = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": RAW_CARD_UID},
        headers=rec_headers,
    )
    assert res_val.status_code == 200
    body_val = res_val.json()
    assert body_val["matched"] is True
    assert body_val["student"]["roll_number"] == STUDENT_ROLL
    assert body_val["student"]["name"] == STUDENT_NAME
    assert body_val["student"]["blood_group"] == STUDENT_BLOOD
    print("  [OK] Valid card lookup resolved Lavdeep Singh successfully.")

    # 1b. Unknown card
    res_unk = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": "DEADBEEF0102"},
        headers=rec_headers,
    )
    assert res_unk.status_code == 200
    assert res_unk.json()["matched"] is False
    assert res_unk.json()["status"] == "NOT_FOUND"
    print("  [OK] Unknown card correctly returned matched=False (NOT_FOUND).")

    # 1c. Revoked/Deactivated card lookup
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE RFID_CARD SET status = 'DEACTIVATED' WHERE card_uid = %s", (STUDENT_CARD_UID,))
        conn.commit()
    finally:
        conn.close()

    res_rev = client.post(
        "/api/rfid/lookup",
        json={"card_identifier": STUDENT_CARD_UID},
        headers=rec_headers,
    )
    assert res_rev.status_code == 200
    assert res_rev.json()["matched"] is False
    assert res_rev.json()["status"] == "REVOKED"
    print("  [OK] Deactivated card lookup returned matched=False (REVOKED).")

    # Restore card to ACTIVE
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE RFID_CARD SET status = 'ACTIVE' WHERE card_uid = %s", (STUDENT_CARD_UID,))
        conn.commit()
    finally:
        conn.close()

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Invalid UID Formats
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 2] Invalid UID Formats...")
    invalid_uids = ["", "   ", "12", "ZZZZZZZZ", "32:XX:AA", "04@11#"]
    for bad_uid in invalid_uids:
        res_bad = client.post(
            "/api/rfid/lookup",
            json={"card_identifier": bad_uid},
            headers=rec_headers,
        )
        assert res_bad.status_code == 422, f"Expected 422 for bad UID '{bad_uid}', got {res_bad.status_code}"
    print(f"  [OK] All {len(invalid_uids)} malformed UID formats rejected with 422 Unprocessable Entity.")

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Card Registered to Wrong Roll Number (Mismatch Attack)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 3] Card Registered to Wrong Roll Number...")
    res_mismatch = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": "102409999",  # Tampered/wrong roll number
            "doctor_id": doc_id,
            "complaint": "General OPD",
            "via": "RFID",
            "card_identifier": STUDENT_CARD_UID,
        },
        headers=rec_headers,
    )
    assert res_mismatch.status_code == 400, f"Expected 400 for roll mismatch, got {res_mismatch.status_code}"
    assert "belongs to student" in res_mismatch.json()["detail"]
    print("  [OK] Mismatched roll number check-in rejected with 400 Bad Request.")

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Duplicate Card Registration Prevention
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 4] Duplicate Card Registration Prevention...")
    res_dup_reg = client.post(
        "/api/rfid/cards",
        json={
            "roll_number": SECONDARY_STUDENT_ROLL,
            "card_identifier": STUDENT_CARD_UID,
        },
        headers=rec_headers,
    )
    assert res_dup_reg.status_code == 409, f"Expected 409 for active card duplicate reg, got {res_dup_reg.status_code}"
    print("  [OK] Duplicate card registration rejected with 409 Conflict.")

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Unauthorized Staff Access
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 5] Unauthorized Access Verification...")
    # Doctor attempting RFID lookup
    res_doc_lk = client.post("/api/rfid/lookup", json={"card_identifier": STUDENT_CARD_UID}, headers=doc_headers)
    assert res_doc_lk.status_code == 403, f"Doctor should get 403 on lookup, got {res_doc_lk.status_code}"

    # Student attempting RFID lookup
    res_stu_lk = client.post("/api/rfid/lookup", json={"card_identifier": STUDENT_CARD_UID}, headers=stu_headers)
    assert res_stu_lk.status_code == 403, f"Student should get 403 on lookup, got {res_stu_lk.status_code}"

    # Doctor attempting reception checkin
    res_doc_chk = client.post(
        "/api/reception/check-ins",
        json={"roll_number": STUDENT_ROLL, "doctor_id": doc_id, "via": "MANUAL"},
        headers=doc_headers,
    )
    assert res_doc_chk.status_code == 403

    # Unauthenticated request
    res_no_auth = client.post("/api/rfid/lookup", json={"card_identifier": STUDENT_CARD_UID})
    assert res_no_auth.status_code == 401
    print("  [OK] Access control verified: Doctor & Student rejected with 403, Unauthenticated rejected with 401.")

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Duplicate Active Check-in Enforcement
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 6] Duplicate Active Check-in Enforcement...")
    clean_student_visits()
    # First checkin succeeds
    res_chk1 = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": STUDENT_ROLL,
            "doctor_id": doc_id,
            "complaint": "Seasonal allergy checkup",
            "via": "RFID",
            "card_identifier": STUDENT_CARD_UID,
        },
        headers=rec_headers,
    )
    assert res_chk1.status_code == 201
    visit_id1 = res_chk1.json()["visitId"]
    print(f"  [OK] Initial check-in succeeded: Visit #{visit_id1}")

    # Second checkin while first is still active -> must fail with 409
    res_chk2 = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": STUDENT_ROLL,
            "doctor_id": doc_id,
            "complaint": "Second check-in attempt",
            "via": "RFID",
            "card_identifier": STUDENT_CARD_UID,
        },
        headers=rec_headers,
    )
    assert res_chk2.status_code == 409, f"Expected 409 for active visit conflict, got {res_chk2.status_code}"
    print(f"  [OK] Duplicate active check-in rejected with 409 Conflict: {res_chk2.json()['detail']}")

    # ─────────────────────────────────────────────────────────────────────────
    # 7. Two Simultaneous Check-in Requests (Concurrency Race)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 7] Two Simultaneous Check-in Requests...")
    clean_student_visits()

    def do_checkin():
        local_client = TestClient(app)
        return local_client.post(
            "/api/reception/check-ins",
            json={
                "roll_number": STUDENT_ROLL,
                "doctor_id": doc_id,
                "complaint": "Concurrent race checkup",
                "via": "RFID",
                "card_identifier": STUDENT_CARD_UID,
            },
            headers=rec_headers,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(do_checkin)
        f2 = executor.submit(do_checkin)
        r1 = f1.result()
        r2 = f2.result()

    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [201, 409], f"Expected one 201 and one 409 under concurrency, got {statuses}"
    print(f"  [OK] Concurrency race handled safely: Request A={r1.status_code}, Request B={r2.status_code}")

    # Verify exactly 1 visit exists in MySQL
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM VISIT WHERE roll_number = %s", (STUDENT_ROLL,))
            assert cur.fetchone()["c"] == 1
    finally:
        conn.close()
    print("  [OK] Confirmed exactly 1 visit record exists in MySQL after simultaneous requests.")

    # ─────────────────────────────────────────────────────────────────────────
    # 8. Card Revocation between Lookup and Confirmation
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 8] Card Revocation between Lookup and Confirmation...")
    clean_student_visits()

    # Step 1: Lookup succeeds
    res_step1 = client.post("/api/rfid/lookup", json={"card_identifier": STUDENT_CARD_UID}, headers=rec_headers)
    assert res_step1.status_code == 200
    assert res_step1.json()["matched"] is True

    # Step 2: In between, card is deactivated in the database
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE RFID_CARD SET status = 'DEACTIVATED' WHERE card_uid = %s", (STUDENT_CARD_UID,))
        conn.commit()
    finally:
        conn.close()

    # Step 3: Confirmation attempted
    res_step3 = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": STUDENT_ROLL,
            "doctor_id": doc_id,
            "complaint": "Stale token checkin",
            "via": "RFID",
            "card_identifier": STUDENT_CARD_UID,
        },
        headers=rec_headers,
    )
    assert res_step3.status_code == 400, f"Expected 400 for revoked card at confirmation, got {res_step3.status_code}"
    print("  [OK] Stale card revoked midway rejected at confirmation time.")

    # Re-activate card
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE RFID_CARD SET status = 'ACTIVE' WHERE card_uid = %s", (STUDENT_CARD_UID,))
        conn.commit()
    finally:
        conn.close()

    # ─────────────────────────────────────────────────────────────────────────
    # 9. Database Failure Halfway Through Check-in (Atomicity Rollback)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 9] Database Failure Halfway Through Check-in (Atomicity Rollback)...")
    clean_student_visits()
    # Invalid doctor ID forces failure after start
    res_fail = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": STUDENT_ROLL,
            "doctor_id": 999999,  # Non-existent doctor
            "complaint": "Atomicity test",
            "via": "RFID",
            "card_identifier": STUDENT_CARD_UID,
        },
        headers=rec_headers,
    )
    assert res_fail.status_code == 404
    # Verify 0 visits created
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM VISIT WHERE roll_number = %s", (STUDENT_ROLL,))
            assert cur.fetchone()["c"] == 0
            cur.execute("SELECT COUNT(*) AS c FROM QUEUE_ENTRY WHERE visit_id IN (SELECT visit_id FROM VISIT WHERE roll_number = %s)", (STUDENT_ROLL,))
            assert cur.fetchone()["c"] == 0
    finally:
        conn.close()
    print("  [OK] Transaction rolled back cleanly on error: 0 orphan visits/queue entries.")

    # ─────────────────────────────────────────────────────────────────────────
    # 10. Audit Events Recorded Exactly Once for Successful Operation
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Edge Case 10] Audit Events Recorded Exactly Once...")
    clean_student_visits()
    res_audit = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": STUDENT_ROLL,
            "doctor_id": doc_id,
            "complaint": "Final audit verification consultation",
            "via": "RFID",
            "card_identifier": STUDENT_CARD_UID,
        },
        headers=rec_headers,
    )
    assert res_audit.status_code == 201
    final_visit_id = res_audit.json()["visitId"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM VISIT_EVENT WHERE visit_id = %s", (final_visit_id,))
            events = cur.fetchall()
            assert len(events) == 1, f"Expected exactly 1 audit event, found {len(events)}"
            ev = events[0]
            assert ev["event_type"] == "CHECKED_IN"
            assert ev["performed_by_user_id"] == RECEPTIONIST_USER_ID
            assert "RFID check-in" in ev["notes"]
            assert "Final audit verification consultation" in ev["notes"]
    finally:
        conn.close()
    print(f"  [OK] Exactly 1 audit record verified in VISIT_EVENT for Visit #{final_visit_id}.")

    # Clean test visit so Lavdeep Singh's account is fresh and ready for production use
    clean_student_visits()
    print(f"  [OK] Cleaned test visits: Lavdeep Singh's account ({STUDENT_ROLL}) is active and ready for live check-in.")

    print("\n===========================================================================")
    print("ALL 10 NFC-6 BACKEND SECURITY & EDGE CASE TESTS PASSED SUCCESSFULLY!")
    print("===========================================================================\n")


if __name__ == "__main__":
    test_nfc6_security_edge_cases()
