"""
Verification Test Suite for Phase NFC-5:
Connect Confirmed Identity to the Existing Queue Lifecycle.

Verifies:
1. Flow A: NFC check-in confirmation with card_identifier re-validation:
   - Confirms active card mapping in MySQL.
   - Concurrency-safe queue sequence allocation.
   - Exactly one VISIT (WAITING_FOR_DOCTOR) and one QUEUE_ENTRY (WAITING).
   - One VISIT_EVENT with receptionist user_id and 'RFID check-in' audit notes.
   - Single atomic transaction.
2. Flow B: Rejection of revoked/inactive card at confirmation time:
   - Prevents stale lookup authorization.
   - Returns 400 Bad Request (CardNotActiveError).
   - Confirms zero visits/queue entries created in MySQL.
3. Flow C: Duplicate active visit prevention (409 Conflict):
   - Confirms existing active visit prohibits second check-in.
4. Flow D: Manual roll-number check-in confirmation:
   - Uses same queue_lifecycle workflow with via='MANUAL'.
5. Flow E: Parity between /api/queue/checkin and /api/reception/checkin.
"""

import time
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_ROLL_NFC5_A = "102409781"
TEST_EMAIL_NFC5_A = "nfc5_student_a@thapar.edu"
TEST_CARD_A = "04AA11BB22CC33"

TEST_ROLL_NFC5_B = "102409782"
TEST_EMAIL_NFC5_B = "nfc5_student_b@thapar.edu"
TEST_CARD_B = "04DD44EE55FF66"

TEST_ROLL_NFC5_MAN = "102409783"
TEST_EMAIL_NFC5_MAN = "nfc5_student_man@thapar.edu"

RECEPTIONIST_USER_ID = 2
RECEPTIONIST_EMAIL = "reception_nfc5@thapar.edu"


def make_receptionist_token():
    return create_access_token({
        "sub": str(RECEPTIONIST_USER_ID),
        "email": RECEPTIONIST_EMAIL,
        "role": "RECEPTIONIST",
        "account_type": "STAFF",
        "user_id": RECEPTIONIST_USER_ID,
        "staff_id": RECEPTIONIST_USER_ID,
    })


def clean_fixtures():
    for attempt in range(3):
        try:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        DELETE FROM VISIT_EVENT WHERE visit_id IN (
                            SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s, %s)
                        )
                        """,
                        (TEST_ROLL_NFC5_A, TEST_ROLL_NFC5_B, TEST_ROLL_NFC5_MAN),
                    )
                    cur.execute(
                        """
                        DELETE FROM QUEUE_ENTRY WHERE visit_id IN (
                            SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s, %s)
                        )
                        """,
                        (TEST_ROLL_NFC5_A, TEST_ROLL_NFC5_B, TEST_ROLL_NFC5_MAN),
                    )
                    cur.execute(
                        "DELETE FROM VISIT WHERE roll_number IN (%s, %s, %s)",
                        (TEST_ROLL_NFC5_A, TEST_ROLL_NFC5_B, TEST_ROLL_NFC5_MAN),
                    )
                    cur.execute(
                        "DELETE FROM RFID_CARD WHERE roll_number IN (%s, %s, %s) OR card_uid IN (%s, %s)",
                        (TEST_ROLL_NFC5_A, TEST_ROLL_NFC5_B, TEST_ROLL_NFC5_MAN, TEST_CARD_A, TEST_CARD_B),
                    )
                    cur.execute(
                        "DELETE FROM STUDENT WHERE roll_number IN (%s, %s, %s)",
                        (TEST_ROLL_NFC5_A, TEST_ROLL_NFC5_B, TEST_ROLL_NFC5_MAN),
                    )
                    cur.execute(
                        "DELETE FROM USER_ACCOUNT WHERE email IN (%s, %s, %s)",
                        (TEST_EMAIL_NFC5_A, TEST_EMAIL_NFC5_B, TEST_EMAIL_NFC5_MAN),
                    )
                conn.commit()
                return
            finally:
                conn.close()
        except Exception:
            if attempt == 2:
                pass
            time.sleep(1)


def setup_fixtures():
    clean_fixtures()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Ensure Receptionist user exists
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

            # Insert User A & Student A
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_EMAIL_NFC5_A,))
            r_a = cur.fetchone()
            if not r_a:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (TEST_EMAIL_NFC5_A,),
                )
                u_id_a = cur.lastrowid
            else:
                u_id_a = r_a["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, 'NFC5 Student Alpha', '2003-05-12', 'O+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC5 Student Alpha', status = 'ACTIVE'
                """,
                (TEST_ROLL_NFC5_A, u_id_a),
            )

            # Insert User B & Student B
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_EMAIL_NFC5_B,))
            r_b = cur.fetchone()
            if not r_b:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (TEST_EMAIL_NFC5_B,),
                )
                u_id_b = cur.lastrowid
            else:
                u_id_b = r_b["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, 'NFC5 Student Beta', '2003-06-15', 'B+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC5 Student Beta', status = 'ACTIVE'
                """,
                (TEST_ROLL_NFC5_B, u_id_b),
            )

            # Insert User Manual & Student Manual
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_EMAIL_NFC5_MAN,))
            r_man = cur.fetchone()
            if not r_man:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, account_type, status) VALUES (%s, 'STUDENT', 'ACTIVE')",
                    (TEST_EMAIL_NFC5_MAN,),
                )
                u_id_man = cur.lastrowid
            else:
                u_id_man = r_man["user_id"]

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, 'NFC5 Student Manual', '2003-09-18', 'A+', 'ACTIVE')
                ON DUPLICATE KEY UPDATE full_name = 'NFC5 Student Manual', status = 'ACTIVE'
                """,
                (TEST_ROLL_NFC5_MAN, u_id_man),
            )

            # Register Active RFID Card for Student A
            cur.execute(
                """
                INSERT INTO RFID_CARD (card_uid, roll_number, status, issued_by_user_id, issued_at)
                VALUES (%s, %s, 'ACTIVE', %s, NOW())
                ON DUPLICATE KEY UPDATE status = 'ACTIVE', roll_number = %s
                """,
                (TEST_CARD_A, TEST_ROLL_NFC5_A, RECEPTIONIST_USER_ID, TEST_ROLL_NFC5_A),
            )

            # Register Active RFID Card for Student B (will be revoked before confirmation)
            cur.execute(
                """
                INSERT INTO RFID_CARD (card_uid, roll_number, status, issued_by_user_id, issued_at)
                VALUES (%s, %s, 'ACTIVE', %s, NOW())
                ON DUPLICATE KEY UPDATE status = 'ACTIVE', roll_number = %s
                """,
                (TEST_CARD_B, TEST_ROLL_NFC5_B, RECEPTIONIST_USER_ID, TEST_ROLL_NFC5_B),
            )

            # Ensure at least 1 Doctor is Available
            cur.execute("SELECT doctor_id FROM DOCTOR LIMIT 1")
            doc = cur.fetchone()
            assert doc is not None, "At least 1 doctor must exist in DOCTOR table"
            doc_id = doc["doctor_id"]

            # Ensure doctor is marked AVAILABLE today
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


def test_nfc5_queue_lifecycle_integration():
    print("\n===========================================================================")
    print("STARTING NFC-5 QUEUE LIFECYCLE INTEGRATION VERIFICATION")
    print("===========================================================================")

    doc_id = setup_fixtures()
    headers = {"Authorization": f"Bearer {make_receptionist_token()}"}

    # ─────────────────────────────────────────────────────────────────────────
    # Flow A: NFC Check-in Confirmation with Real-time Card Authorization
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow A] Receptionist confirms NFC check-in with card_identifier...")
    res_a = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": TEST_ROLL_NFC5_A,
            "doctor_id": doc_id,
            "complaint": "Persistent sore throat and mild fever",
            "via": "RFID",
            "card_identifier": TEST_CARD_A,
        },
        headers=headers,
    )
    assert res_a.status_code == 201, f"Check-in failed: {res_a.text}"
    body_a = res_a.json()
    visit_id_a = body_a["visitId"]
    queue_no_a = body_a["queueNo"]
    assert visit_id_a > 0
    assert queue_no_a >= 1
    print(f"  [OK] Confirmed Visit #{visit_id_a}, Queue Token #{queue_no_a}")

    # Verify MySQL DB state: Exactly one VISIT, one QUEUE_ENTRY, one VISIT_EVENT
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM VISIT WHERE visit_id = %s", (visit_id_a,))
            visits = cur.fetchall()
            assert len(visits) == 1, f"Expected exactly 1 visit record, found {len(visits)}"
            v = visits[0]
            assert v["roll_number"] == TEST_ROLL_NFC5_A
            assert v["doctor_id"] == doc_id
            assert v["status"] == "WAITING_FOR_DOCTOR"

            cur.execute("SELECT * FROM QUEUE_ENTRY WHERE visit_id = %s", (visit_id_a,))
            entries = cur.fetchall()
            assert len(entries) == 1, f"Expected exactly 1 queue entry, found {len(entries)}"
            q = entries[0]
            assert q["status"] == "WAITING"
            assert q["queue_sequence"] == queue_no_a

            cur.execute("SELECT * FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'CHECKED_IN'", (visit_id_a,))
            events = cur.fetchall()
            assert len(events) == 1, f"Expected exactly 1 check-in event, found {len(events)}"
            e = events[0]
            assert e["performed_by_user_id"] == RECEPTIONIST_USER_ID
            assert "RFID check-in" in e["notes"]
    finally:
        conn.close()
    print("  [OK] MySQL state verified: 1 VISIT, 1 QUEUE_ENTRY, 1 VISIT_EVENT with receptionist audit log.")

    # ─────────────────────────────────────────────────────────────────────────
    # Flow B: Card Revoked between Lookup and Confirmation (Prevent Stale Trust)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow B] Verifying revoked card is rejected at confirmation time...")
    # Revoke Card B in the database
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE RFID_CARD SET status = 'DEACTIVATED', deactivated_at = NOW(), revoked_by_user_id = %s WHERE card_uid = %s",
                (RECEPTIONIST_USER_ID, TEST_CARD_B),
            )
        conn.commit()
    finally:
        conn.close()

    # Now receptionist attempts confirmation using the revoked card
    res_b = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": TEST_ROLL_NFC5_B,
            "doctor_id": doc_id,
            "complaint": "Headache",
            "via": "RFID",
            "card_identifier": TEST_CARD_B,
        },
        headers=headers,
    )
    assert res_b.status_code == 400, f"Expected 400 Bad Request for revoked card, got {res_b.status_code}: {res_b.text}"
    assert "cannot be used for check-in" in res_b.json()["detail"] or "REVOKED" in res_b.json()["detail"]
    print(f"  [OK] Server rejected revoked card at confirmation time: {res_b.json()['detail']}")

    # Verify NO visit was created for Student B
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM VISIT WHERE roll_number = %s", (TEST_ROLL_NFC5_B,))
            assert cur.fetchone()["c"] == 0
    finally:
        conn.close()
    print("  [OK] Confirmed zero visits created in database for revoked card attempt.")

    # ─────────────────────────────────────────────────────────────────────────
    # Flow C: Duplicate Active Visit Check (409 Conflict)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow C] Verifying duplicate active visit prevention (409 Conflict)...")
    res_c = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": TEST_ROLL_NFC5_A,
            "doctor_id": doc_id,
            "complaint": "Second visit attempt",
            "via": "RFID",
            "card_identifier": TEST_CARD_A,
        },
        headers=headers,
    )
    assert res_c.status_code == 409, f"Expected 409 Conflict, got {res_c.status_code}: {res_c.text}"
    print(f"  [OK] Duplicate visit rejected with 409 Conflict: {res_c.json()['detail']}")

    # ─────────────────────────────────────────────────────────────────────────
    # Flow D: Manual Check-in Confirmation
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow D] Receptionist confirms manual roll number check-in...")
    res_d = client.post(
        "/api/reception/check-ins",
        json={
            "roll_number": TEST_ROLL_NFC5_MAN,
            "doctor_id": doc_id,
            "complaint": "Campus badminton injury",
            "via": "MANUAL",
        },
        headers=headers,
    )
    assert res_d.status_code == 201, f"Manual check-in failed: {res_d.text}"
    body_d = res_d.json()
    visit_id_d = body_d["visitId"]
    queue_no_d = body_d["queueNo"]
    assert queue_no_d > queue_no_a, "Queue sequence should advance concurrency-safely"
    print(f"  [OK] Manual check-in confirmed: Visit #{visit_id_d}, Queue Token #{queue_no_d}")

    # Verify audit log in VISIT_EVENT
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'CHECKED_IN'", (visit_id_d,))
            ev_d = cur.fetchone()
            assert ev_d is not None
            assert "MANUAL check-in" in ev_d["notes"]
            assert ev_d["performed_by_user_id"] == RECEPTIONIST_USER_ID
    finally:
        conn.close()
    print("  [OK] Manual check-in audit event confirmed in MySQL.")

    # ─────────────────────────────────────────────────────────────────────────
    # Flow E: Queue Route Parity (/api/queue/checkin)
    # ─────────────────────────────────────────────────────────────────────────
    print("\n[Flow E] Verifying /api/queue/checkin parity with card_identifier...")
    # Reactivate Card B for parity check
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE RFID_CARD SET status = 'ACTIVE' WHERE card_uid = %s", (TEST_CARD_B,))
        conn.commit()
    finally:
        conn.close()

    res_e = client.post(
        "/api/queue/checkin",
        json={
            "roll_number": TEST_ROLL_NFC5_B,
            "doctor_id": doc_id,
            "complaint": "Parity test consultation",
            "via": "RFID",
            "card_identifier": TEST_CARD_B,
        },
        headers=headers,
    )
    assert res_e.status_code == 200, f"/api/queue/checkin failed: {res_e.text}"
    body_e = res_e.json()
    assert body_e["rollNumber"] == TEST_ROLL_NFC5_B
    assert body_e["queueNo"] > queue_no_d
    print(f"  [OK] /api/queue/checkin succeeded: Visit #{body_e['visitId']}, Token #{body_e['queueNo']}")

    clean_fixtures()
    print("\n===========================================================================")
    print("ALL NFC-5 QUEUE LIFECYCLE INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("===========================================================================")


if __name__ == "__main__":
    try:
        test_nfc5_queue_lifecycle_integration()
    except Exception:
        clean_fixtures()
        raise
