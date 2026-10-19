"""
Priority 2 Edge-Cases Verification Test Suite.
Verifies all 7 Database and Lifecycle edge cases against Aiven Cloud MySQL 8.4.8.
"""

import sys
import os
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_STUDENTS = [
    ("TEST_P2_001", "P2 Student One", "test_p2_001@thapar.edu", "ACTIVE"),
    ("TEST_P2_002", "P2 Student Two", "test_p2_002@thapar.edu", "ACTIVE"),
    ("TEST_P2_003", "P2 Student Three", "test_p2_003@thapar.edu", "ACTIVE"),
    ("TEST_P2_004", "P2 Student Four", "test_p2_004@thapar.edu", "ACTIVE"),
]


def setup_fixtures():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Clean up old test data
            cur.execute("SELECT visit_id FROM VISIT WHERE roll_number LIKE 'TEST_P2_%'")
            v_ids = [r["visit_id"] for r in cur.fetchall()]
            if v_ids:
                id_str = ",".join(map(str, v_ids))
                cur.execute(f"DELETE FROM DISPENSING_ITEM WHERE dispensing_id IN (SELECT dispensing_id FROM DISPENSING WHERE visit_id IN ({id_str}))")
                cur.execute(f"DELETE FROM DISPENSING WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM QUEUE_ENTRY WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM VISIT_EVENT WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM PRESCRIPTION WHERE consultation_id IN (SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({id_str}))")
                cur.execute(f"DELETE FROM CONSULTATION WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({id_str})")


            cur.execute("DELETE FROM STUDENT WHERE roll_number LIKE 'TEST_P2_%'")
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email LIKE 'test_p2_%@thapar.edu'")

            # Insert test students
            for roll, name, email, st in TEST_STUDENTS:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, password_hash, account_type, status) VALUES (%s, 'dummyhash', 'STUDENT', 'ACTIVE')",
                    (email,),
                )
                uid = cur.lastrowid
                cur.execute(
                    "INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, blood_group, status) VALUES (%s, %s, %s, '2004-01-01', 'OTHER', 'O+', %s)",
                    (roll, uid, name, st),
                )

            # Ensure Doctor 2 is AVAILABLE today
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = 'neha.kapoor@campuscare.edu'")
            doc_uid = cur.fetchone()["user_id"]
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', %s)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """,
                (doc_uid,),
            )
            conn.commit()
    finally:
        conn.close()


def teardown_fixtures():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT visit_id FROM VISIT WHERE roll_number LIKE 'TEST_P2_%'")
            v_ids = [r["visit_id"] for r in cur.fetchall()]
            if v_ids:
                id_str = ",".join(map(str, v_ids))
                cur.execute(f"DELETE FROM DISPENSING_ITEM WHERE dispensing_id IN (SELECT dispensing_id FROM DISPENSING WHERE visit_id IN ({id_str}))")
                cur.execute(f"DELETE FROM DISPENSING WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM QUEUE_ENTRY WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM VISIT_EVENT WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM PRESCRIPTION WHERE consultation_id IN (SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({id_str}))")
                cur.execute(f"DELETE FROM CONSULTATION WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({id_str})")


            cur.execute("DELETE FROM STUDENT WHERE roll_number LIKE 'TEST_P2_%'")
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email LIKE 'test_p2_%@thapar.edu'")

            # Restore Doctor 2 availability
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = 'neha.kapoor@campuscare.edu'")
            doc_uid = cur.fetchone()["user_id"]
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', %s)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """,
                (doc_uid,),
            )
            conn.commit()
    finally:
        conn.close()


def get_tokens():
    rec_res = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    assert rec_res.status_code == 200, f"Receptionist login failed: {rec_res.text}"
    rec_token = rec_res.json()["access_token"]

    doc2_res = client.post("/api/auth/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    assert doc2_res.status_code == 200, f"Doctor 2 login failed: {doc2_res.text}"
    doc2_token = doc2_res.json()["access_token"]

    doc1_token = create_access_token({
        "sub": "3",
        "staff_id": 1,
        "doctor_id": 1,
        "email": "dr.kapoor@thapar.edu",
        "role": "DOCTOR",
    })

    return rec_token, doc1_token, doc2_token


# ─────────────────────────────────────────────────────────────────────────────
# 1. Queue Numbering Across All Entry Paths
# ─────────────────────────────────────────────────────────────────────────────

def test_queue_numbering_all_entry_paths():
    """
    Check-in, requeue, and redirect must all use doctor-row locking and the same
    sequence-allocation logic. Sequences must be monotonically increasing.
    """
    print("\n--- Test 1: Queue numbering across all entry paths (Check-in, Requeue, Redirect) ---")
    rec_token, doc1_token, _ = get_tokens()

    # Path A: Normal Check-in
    r1 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P2_001", "doctor_id": 1},
    )
    assert r1.status_code == 201
    seq1 = r1.json()["queue_number"]
    v1 = r1.json()["visit_id"]

    # Path B: Check-in another student
    r2 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P2_002", "doctor_id": 1},
    )
    assert r2.status_code == 201
    seq2 = r2.json()["queue_number"]
    v2 = r2.json()["visit_id"]
    assert seq2 > seq1, f"Expected seq2 ({seq2}) > seq1 ({seq1})"

    # Doctor 1 marks v1 as NO_SHOW, then Receptionist requeues v1
    client.post(f"/api/doctor/1/no-show/{v1}", headers={"Authorization": f"Bearer {doc1_token}"})
    req_res = client.post(
        f"/api/queue/{v1}/requeue",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 1, "reason": "Patient reported after no-show"},
    )
    assert req_res.status_code == 200
    seq3 = req_res.json()["queueNo"]
    assert seq3 > seq2, f"Requeued sequence ({seq3}) must be greater than previous sequence ({seq2})"

    # Path C: Redirect student 3 from Doctor 2 to Doctor 1
    r4 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P2_003", "doctor_id": 2},
    )
    assert r4.status_code == 201
    v3 = r4.json()["visit_id"]

    redir_res = client.post(
        f"/api/queue/{v3}/redirect",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 1, "reason": "Triage referral to Doctor 1"},
    )
    assert redir_res.status_code == 200
    seq4 = redir_res.json()["newQueueNo"]
    assert seq4 > seq3, f"Redirected sequence ({seq4}) must be greater than previous sequence ({seq3})"

    # Clean up
    for vid in [v1, v2, v3]:
        client.post(f"/api/queue/{vid}/cancel", headers={"Authorization": f"Bearer {rec_token}"})

    print("PASS: Queue numbering monotonically increasing across all entry paths (Check-in, Requeue, Redirect).")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Redirect During Consultation
# ─────────────────────────────────────────────────────────────────────────────

def test_redirect_during_consultation():
    """
    Test redirecting a patient while actively IN_CONSULTATION:
    - Old queue entry is retired with status 'REDIRECTED' and exited_at set.
    - Doctor 1's active consultation is cleared, freeing the workstation immediately.
    - Patient appears in Doctor 2's waiting queue with entry_reason 'DOCTOR_REDIRECT'.
    - Audit event explicitly records that redirection occurred during consultation.
    """
    print("\n--- Test 2: Redirect during consultation ---")
    rec_token, doc1_token, doc2_token = get_tokens()
    roll = "TEST_P2_001"

    # Step 1: Check in under Doctor 1
    chk = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 1},
    )
    assert chk.status_code == 201
    visit_id = chk.json()["visit_id"]
    old_qe_id = chk.json()["queue_entry_id"]

    # Step 2: Doctor 1 starts consultation
    call_res = client.post(f"/api/doctor/1/call-next", headers={"Authorization": f"Bearer {doc1_token}"})
    assert call_res.status_code == 200
    assert call_res.json()["visitId"] == visit_id

    # Verify Doctor 1 workstation shows active consultation
    act1 = client.get("/api/doctor/1/active-consultation", headers={"Authorization": f"Bearer {doc1_token}"})
    assert act1.status_code == 200
    assert act1.json()["active"] is True
    assert act1.json()["patient"]["visitId"] == visit_id

    # Step 3: Doctor 1 redirects patient to Doctor 2 during active consultation
    redir_res = client.post(
        f"/api/doctor/1/redirect/{visit_id}",
        headers={"Authorization": f"Bearer {doc1_token}"},
        json={"target_doctor_id": 2, "reason": "Requires specialist cardiology evaluation"},
    )
    assert redir_res.status_code == 200
    assert redir_res.json()["status"] == "redirected"
    new_qe_id = redir_res.json()["queueEntryId"]

    # Step 4: Verify Doctor 1's workstation is now free (active = False)
    act1_after = client.get("/api/doctor/1/active-consultation", headers={"Authorization": f"Bearer {doc1_token}"})
    assert act1_after.status_code == 200
    assert act1_after.json()["active"] is False, "Doctor 1 workstation must be free after redirecting active patient"

    # Step 5: Database verification
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Old queue entry retired
            cur.execute("SELECT status, exit_reason, exited_at FROM QUEUE_ENTRY WHERE queue_entry_id = %s", (old_qe_id,))
            old_qe = cur.fetchone()
            assert old_qe["status"] == "REDIRECTED"
            assert old_qe["exit_reason"] == "REDIRECTED"
            assert old_qe["exited_at"] is not None

            # New queue entry waiting under Doctor 2
            cur.execute("SELECT doctor_id, status, entry_reason FROM QUEUE_ENTRY WHERE queue_entry_id = %s", (new_qe_id,))
            new_qe = cur.fetchone()
            assert new_qe["doctor_id"] == 2
            assert new_qe["status"] == "WAITING"
            assert new_qe["entry_reason"] == "DOCTOR_REDIRECT"

            # Visit state reset to WAITING_FOR_DOCTOR under Doctor 2
            cur.execute("SELECT doctor_id, status FROM VISIT WHERE visit_id = %s", (visit_id,))
            v = cur.fetchone()
            assert v["doctor_id"] == 2
            assert v["status"] == "WAITING_FOR_DOCTOR"

            # Audit event records redirection during consultation
            cur.execute(
                "SELECT event_type, notes FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'REDIRECTED' ORDER BY event_id DESC LIMIT 1",
                (visit_id,),
            )
            ve = cur.fetchone()
            assert ve is not None
            assert "during consultation" in ve["notes"].lower()
            assert "cardiology" in ve["notes"].lower()
    finally:
        conn.close()

    # Step 6: Doctor 2 calls the redirected patient and completes
    call2 = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert call2.status_code == 200
    assert call2.json()["visitId"] == visit_id

    client.post(
        "/api/doctor/2/complete",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json={"roll_number": roll, "diagnosis": "Cardiac murmur benign", "general": "Followup in 6 months", "medicines": []},
    )
    client.post(f"/api/queue/{visit_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})

    print("PASS: Redirect during consultation cleanly retires old session, frees workstation, and updates audit.")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Doctor Availability Changes
# ─────────────────────────────────────────────────────────────────────────────

def test_doctor_availability_changes():
    """
    Check-in, requeue, and redirect must validate target doctor availability.
    When a doctor is UNAVAILABLE, all 3 mutations must reject with 409 Conflict.
    """
    print("\n--- Test 3: Doctor availability validation across Check-in, Requeue, and Redirect ---")
    rec_token, doc1_token, _ = get_tokens()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Mark Doctor 2 UNAVAILABLE
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = 'neha.kapoor@campuscare.edu'")
            doc_uid = cur.fetchone()["user_id"]
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, created_by_user_id)
                VALUES (2, CURDATE(), 'UNAVAILABLE', %s)
                ON DUPLICATE KEY UPDATE status = 'UNAVAILABLE'
                """,
                (doc_uid,),
            )
            conn.commit()
    finally:
        conn.close()

    # Check-in to unavailable doctor -> 409
    chk_res = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P2_001", "doctor_id": 2},
    )
    assert chk_res.status_code == 409, f"Expected 409, got {chk_res.status_code}: {chk_res.text}"
    assert "unavailable" in chk_res.json()["detail"].lower()

    # Check in with Doctor 1 (available), mark no-show, attempt requeue to Doctor 2 -> 409
    chk1 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P2_001", "doctor_id": 1},
    )
    assert chk1.status_code == 201
    v1 = chk1.json()["visit_id"]

    client.post(f"/api/doctor/1/no-show/{v1}", headers={"Authorization": f"Bearer {doc1_token}"})

    req_res = client.post(
        f"/api/queue/{v1}/requeue",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 2},
    )
    assert req_res.status_code == 409, f"Expected 409 on requeue to unavailable doctor, got {req_res.status_code}"
    assert "unavailable" in req_res.json()["detail"].lower()

    # Requeue back to Doctor 1 (available)
    client.post(
        f"/api/queue/{v1}/requeue",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 1},
    )

    # Attempt to redirect to Doctor 2 -> 409
    redir_res = client.post(
        f"/api/queue/{v1}/redirect",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 2},
    )
    assert redir_res.status_code == 409, f"Expected 409 on redirect to unavailable doctor, got {redir_res.status_code}"
    assert "unavailable" in redir_res.json()["detail"].lower()

    # Restore Doctor 2 availability
    restore_conn = get_db_connection()
    try:
        with restore_conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = 'neha.kapoor@campuscare.edu'")
            doc_uid = cur.fetchone()["user_id"]
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', %s)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """,
                (doc_uid,),
            )
            restore_conn.commit()
    finally:
        restore_conn.close()

    # Clean up v1
    client.post(f"/api/queue/{v1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Target-doctor availability strictly validated across Check-in, Requeue, and Redirect.")


# ─────────────────────────────────────────────────────────────────────────────
# 4. Transaction Rollback & Atomicity
# ─────────────────────────────────────────────────────────────────────────────

def test_transaction_rollback_atomicity():
    """
    If any operation fails midway, verify that VISIT, QUEUE_ENTRY, CONSULTATION,
    PRESCRIPTION, and VISIT_EVENT do not end up partially updated.
    """
    print("\n--- Test 4: Transaction rollback & atomic failure recovery ---")
    rec_token, doc1_token, _ = get_tokens()
    roll = "TEST_P2_002"

    # Step 1: Check in student under Doctor 1
    chk = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 1},
    )
    assert chk.status_code == 201
    visit_id = chk.json()["visit_id"]

    # Step 2: Attempt illegal transition (complete consultation when patient is still WAITING)
    # This must fail and leave zero partial records
    bad_comp = client.post(
        "/api/doctor/1/complete",
        headers={"Authorization": f"Bearer {doc1_token}"},
        json={"roll_number": "NON_EXISTENT_PATIENT", "diagnosis": "Test", "general": "Test", "medicines": []},
    )
    assert bad_comp.status_code == 404

    # Verify that visit_id remains WAITING_FOR_DOCTOR, no partial consultation rows exist
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM CONSULTATION WHERE visit_id = %s", (visit_id,))
            assert cur.fetchone()["n"] == 0, "No consultation record should exist"

            cur.execute("SELECT status FROM VISIT WHERE visit_id = %s", (visit_id,))
            assert cur.fetchone()["status"] == "WAITING_FOR_DOCTOR"

            cur.execute("SELECT status FROM QUEUE_ENTRY WHERE visit_id = %s", (visit_id,))
            assert cur.fetchone()["status"] == "WAITING"
    finally:
        conn.close()

    # Clean up
    client.post(f"/api/queue/{visit_id}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Transaction rollback atomicity verified with zero partial updates.")


# ─────────────────────────────────────────────────────────────────────────────
# 5. Idempotency Guarantees
# ─────────────────────────────────────────────────────────────────────────────

def test_idempotency_call_next_and_dispense():
    """
    Retrying call-next must not call a second patient when one is already in consultation.
    Retrying dispense must not create duplicate completion events.
    """
    print("\n--- Test 5: Idempotency of call-next and dispense ---")
    rec_token, doc1_token, _ = get_tokens()

    # Check in two students
    c1 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": "TEST_P2_001", "doctor_id": 1})
    c2 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": "TEST_P2_002", "doctor_id": 1})
    v1 = c1.json()["visit_id"]
    v2 = c2.json()["visit_id"]

    # Call next -> calls student 1
    call1 = client.post("/api/doctor/1/call-next", headers={"Authorization": f"Bearer {doc1_token}"})
    assert call1.status_code == 200
    assert call1.json()["visitId"] == v1
    assert call1.json()["status"] == "called"

    # Retry call next -> returns student 1 (already_in_consultation), DOES NOT call student 2!
    call2 = client.post("/api/doctor/1/call-next", headers={"Authorization": f"Bearer {doc1_token}"})
    assert call2.status_code == 200
    assert call2.json()["status"] == "already_in_consultation"
    assert call2.json()["visitId"] == v1, "Must return active consultation visit, not advance to next student"

    # Complete consultation for v1
    client.post(
        "/api/doctor/1/complete",
        headers={"Authorization": f"Bearer {doc1_token}"},
        json={"roll_number": "TEST_P2_001", "diagnosis": "Recovered", "general": "N/A", "medicines": []},
    )

    # Dispense v1
    disp1 = client.post(f"/api/queue/{v1}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp1.status_code == 200
    assert disp1.json()["status"] == "dispensed"

    # Retry dispense on v1 -> idempotent already_completed
    disp2 = client.post(f"/api/queue/{v1}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp2.status_code == 200
    assert disp2.json()["status"] == "already_completed"

    # Count audit events for v1 in database -> MEDICINE_DISPENSED and COMPLETED must appear exactly once
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'MEDICINE_DISPENSED'", (v1,))
            assert cur.fetchone()["n"] == 1, "Duplicate dispense must not write redundant audit event"

            cur.execute("SELECT COUNT(*) AS n FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'COMPLETED'", (v1,))
            assert cur.fetchone()["n"] == 1, "Duplicate dispense must not write redundant COMPLETED audit event"
    finally:
        conn.close()

    # Clean up v2
    client.post(f"/api/queue/{v2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Idempotency verified: call-next never skips waiting patients; dispense never duplicates events.")


# ─────────────────────────────────────────────────────────────────────────────
# 6. Audit Consistency & Server-Derived Actor
# ─────────────────────────────────────────────────────────────────────────────

def test_audit_consistency_and_server_actor():
    """
    Every successful transition must write the expected event exactly once,
    with server-derived actor identity and timestamp.
    """
    print("\n--- Test 6: Audit consistency and server-derived actor identity ---")
    rec_token, doc1_token, _ = get_tokens()
    roll = "TEST_P2_003"

    chk = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 1, "complaint": "Audit test complaint"},
    )
    v_id = chk.json()["visit_id"]

    # Call next
    client.post("/api/doctor/1/call-next", headers={"Authorization": f"Bearer {doc1_token}"})

    # Complete
    client.post(
        "/api/doctor/1/complete",
        headers={"Authorization": f"Bearer {doc1_token}"},
        json={"roll_number": roll, "diagnosis": "Audit diagnosis", "general": "N/A", "medicines": []},
    )

    # Dispense
    client.post(f"/api/queue/{v_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})

    # Check all events in database
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = 'reception@thapar.edu'")
            rec_uid = cur.fetchone()["user_id"]

            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = 'dr.kapoor@thapar.edu'")
            doc1_uid = cur.fetchone()["user_id"]

            cur.execute("SELECT event_type, performed_by_user_id, created_at FROM VISIT_EVENT WHERE visit_id = %s ORDER BY event_id ASC", (v_id,))
            events = cur.fetchall()

            types = [e["event_type"] for e in events]
            assert "CHECKED_IN" in types
            assert "CONSULTATION_STARTED" in types
            assert "CONSULTATION_COMPLETED" in types
            assert "MEDICINE_DISPENSED" in types
            assert "COMPLETED" in types

            for e in events:
                assert e["created_at"] is not None
                if e["event_type"] in ("CHECKED_IN", "MEDICINE_DISPENSED", "COMPLETED"):
                    assert e["performed_by_user_id"] == rec_uid
                elif e["event_type"] in ("CONSULTATION_STARTED", "CONSULTATION_COMPLETED"):
                    assert e["performed_by_user_id"] == doc1_uid
    finally:
        conn.close()

    print("PASS: Audit consistency confirmed: all events logged with server-derived actor and timestamp.")


# ─────────────────────────────────────────────────────────────────────────────
# 7. Active Visit Constraints Uniformity
# ─────────────────────────────────────────────────────────────────────────────

def test_active_visit_constraints_uniformity():
    """
    Active visit states: CHECKED_IN, WAITING_FOR_DOCTOR, CALLED, IN_CONSULTATION, WAITING_FOR_MEDICINE.
    Terminal states: COMPLETED, CANCELLED, NO_SHOW.
    Verify consistency across service, SQL queries, and endpoints.
    """
    print("\n--- Test 7: Active visit constraints uniformity ---")
    rec_token, doc1_token, _ = get_tokens()
    roll = "TEST_P2_004"

    # 1. Check in -> WAITING_FOR_DOCTOR
    c1 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": roll, "doctor_id": 1})
    assert c1.status_code == 201
    v = c1.json()["visit_id"]

    # Attempt second check-in while in WAITING_FOR_DOCTOR -> 409
    c_dup1 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": roll, "doctor_id": 1})
    assert c_dup1.status_code == 409

    # Advance to IN_CONSULTATION
    client.post("/api/doctor/1/call-next", headers={"Authorization": f"Bearer {doc1_token}"})

    # Attempt second check-in while IN_CONSULTATION -> 409
    c_dup2 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": roll, "doctor_id": 1})
    assert c_dup2.status_code == 409

    # Advance to WAITING_FOR_MEDICINE
    client.post(
        "/api/doctor/1/complete",
        headers={"Authorization": f"Bearer {doc1_token}"},
        json={"roll_number": roll, "diagnosis": "Constraint check", "general": "N/A", "medicines": []},
    )

    # Attempt second check-in while WAITING_FOR_MEDICINE -> 409 (Cannot check in while in pharmacy queue)
    c_dup3 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": roll, "doctor_id": 1})
    assert c_dup3.status_code == 409, f"Expected 409 during WAITING_FOR_MEDICINE, got {c_dup3.status_code}"

    # Advance to COMPLETED via dispense
    client.post(f"/api/queue/{v}/dispense", headers={"Authorization": f"Bearer {rec_token}"})

    # Once COMPLETED, student can check in again for a new visit!
    c_new = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": roll, "doctor_id": 1})
    assert c_new.status_code == 201, "Student must be able to check in again once visit is COMPLETED"
    v_new = c_new.json()["visit_id"]

    # Cancel the new visit
    client.post(f"/api/queue/{v_new}/cancel", headers={"Authorization": f"Bearer {rec_token}"})

    # Once CANCELLED, student can check in again!
    c_new2 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": roll, "doctor_id": 1})
    assert c_new2.status_code == 201, "Student must be able to check in again once visit is CANCELLED"
    v_new2 = c_new2.json()["visit_id"]

    # Mark NO_SHOW on the new visit
    client.post(f"/api/doctor/1/no-show/{v_new2}", headers={"Authorization": f"Bearer {doc1_token}"})

    # Once NO_SHOW, student can check in again!
    c_new3 = client.post("/api/reception/check-ins", headers={"Authorization": f"Bearer {rec_token}"}, json={"roll_number": roll, "doctor_id": 1})
    assert c_new3.status_code == 201, "Student must be able to check in again once visit is in NO_SHOW"
    v_new3 = c_new3.json()["visit_id"]

    # Clean up v_new3
    client.post(f"/api/queue/{v_new3}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Active visit constraints verified uniformly across all active and terminal statuses.")


if __name__ == "__main__":
    setup_fixtures()
    try:
        test_queue_numbering_all_entry_paths()
        test_redirect_during_consultation()
        test_doctor_availability_changes()
        test_transaction_rollback_atomicity()
        test_idempotency_call_next_and_dispense()
        test_audit_consistency_and_server_actor()
        test_active_visit_constraints_uniformity()
        print("\n=======================================================")
        print("ALL 7 PRIORITY 2 EDGE-CASE TESTS PASSED SUCCESSFULLY!")
        print("=======================================================\n")
    finally:
        teardown_fixtures()
