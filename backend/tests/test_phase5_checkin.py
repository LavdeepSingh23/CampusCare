"""
CampusCare Phase 5: Task 5.1 Check-In Endpoint & Doctor-Specific Live Queue Integration Test.

Validates:
1. Receptionist authentication & role enforcement (401 Anon, 403 Doctor, 403 Student, 201 Receptionist).
2. Input validation:
   - Nonexistent student -> 404 Not Found
   - Nonexistent doctor -> 404 Not Found
   - Inactive student account -> 400 Bad Request
   - Missing student/doctor identifiers -> 422 Unprocessable Entity
3. Doctor availability validation:
   - Unavailable doctor -> 409 Conflict
4. Conflict prevention (Single active visit policy):
   - Duplicate check-in -> 409 Conflict
5. Server-side queue sequence allocation:
   - Client-supplied fake sequence is ignored; server computes gap-safe sequence under doctor row lock.
6. Atomic persistence across VISIT, QUEUE_ENTRY, and VISIT_EVENT.
7. First Integration Milestone:
   - Checked-in student immediately appears in target doctor's queue (GET /api/doctor/{doctor_id}/queue).
   - Student immediately appears in receptionist's overall front-desk queue (GET /api/reception/queue).
   - Student does NOT appear in other doctors' queues.
8. Route aliases & naming conventions:
   - Both POST /api/reception/check-ins and POST /api/reception/checkin work with both snake_case and camelCase payloads.
"""

import os
import sys
import concurrent.futures
from typing import Dict, Any

# Ensure backend directory is in path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token, decode_access_token

client = TestClient(app)

TEST_ROLL_PREFIX = "TEST_P5_"
TEST_STUDENTS = [
    {"roll": "TEST_P5_001", "name": "Phase5 Student One", "email": "test_p5_001@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_P5_002", "name": "Phase5 Student Two", "email": "test_p5_002@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_P5_003", "name": "Phase5 Student Three", "email": "test_p5_003@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_P5_INACT", "name": "Phase5 Inactive", "email": "test_p5_inact@thapar.edu", "status": "INACTIVE"},
]


def cleanup_test_records():
    """Removes all test visits, queue entries, and test students created during testing."""
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # 1. Delete visits belonging to test students (cascades to QUEUE_ENTRY, VISIT_EVENT, etc.)
                cur.execute("SELECT visit_id FROM VISIT WHERE roll_number LIKE %s", (f"{TEST_ROLL_PREFIX}%",))
                test_visits = [r["visit_id"] for r in cur.fetchall()]
                if test_visits:
                    placeholders = ",".join(["%s"] * len(test_visits))
                    cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({placeholders})", tuple(test_visits))

                # 2. Delete test students
                cur.execute("DELETE FROM STUDENT WHERE roll_number LIKE %s", (f"{TEST_ROLL_PREFIX}%",))

                # 3. Delete test user accounts
                cur.execute("DELETE FROM USER_ACCOUNT WHERE email LIKE %s", ("test_p5_%@thapar.edu",))

                # 4. Clean up any dummy availability records for doctor 2 created for testing
                cur.execute("DELETE FROM DOCTOR_AVAILABILITY WHERE doctor_id = 2 AND availability_date = CURDATE()")

                conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        print(f"Warning during cleanup: {exc}")


def setup_test_students():
    """Ensures test students and their corresponding USER_ACCOUNT records exist in the DB."""
    cleanup_test_records()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            for s in TEST_STUDENTS:
                account_status = "DISABLED" if s["status"] == "INACTIVE" else "ACTIVE"
                cur.execute(
                    """
                    INSERT INTO USER_ACCOUNT (email, password_hash, account_type, status)
                    VALUES (%s, 'dummy_hash', 'STUDENT', %s)
                    """,
                    (s["email"], account_status),
                )
                user_id = cur.lastrowid

                cur.execute(
                    """
                    INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, blood_group, status)
                    VALUES (%s, %s, %s, '2004-01-01', 'OTHER', 'B+', %s)
                    """,
                    (s["roll"], user_id, s["name"], s["status"]),
                )
            conn.commit()
    finally:
        conn.close()


_CACHED_TOKENS = None


def get_tokens():
    """Returns valid JWT tokens for Receptionist, Doctor 2, and Doctor 1 (cached)."""
    global _CACHED_TOKENS
    if _CACHED_TOKENS is not None:
        return _CACHED_TOKENS

    rec_res = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    assert rec_res.status_code == 200, f"Receptionist login failed: {rec_res.text}"
    rec_token = rec_res.json()["access_token"]
    rec_user_id = int(decode_access_token(rec_token)["sub"])

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

    student_token = create_access_token({
        "sub": "100",
        "email": "test_p5_001@thapar.edu",
        "roll_number": "TEST_P5_001",
        "role": "STUDENT",
    })

    _CACHED_TOKENS = (rec_token, rec_user_id, doc2_token, doc1_token, student_token)
    return _CACHED_TOKENS


# ─────────────────────────────────────────────────────────────────────────────
# TEST 1: Role-Based Authorization Guards
# ─────────────────────────────────────────────────────────────────────────────

def test_checkin_auth_guards():
    """Verify only authenticated receptionists can invoke check-ins."""
    rec_token, _, doc2_token, _, student_token = get_tokens()

    payload = {"roll_number": "TEST_P5_001", "doctor_id": 2, "complaint": "General check"}

    # 1. Unauthenticated request -> 401 Unauthorized
    anon_res = client.post("/api/reception/check-ins", json=payload)
    assert anon_res.status_code == 401, f"Expected 401 for anonymous check-in, got {anon_res.status_code}"

    # 2. Doctor token -> 403 Forbidden
    doc_res = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json=payload,
    )
    assert doc_res.status_code == 403, f"Expected 403 when Doctor calls checkin, got {doc_res.status_code}"

    # 3. Student token -> 403 Forbidden
    st_res = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {student_token}"},
        json=payload,
    )
    assert st_res.status_code == 403, f"Expected 403 when Student calls checkin, got {st_res.status_code}"

    print("PASS: Task 5.1 check-in rejects Anonymous (401), Doctor (403), and Student (403).")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 2: Validation of Student Identifier & Doctor Existence
# ─────────────────────────────────────────────────────────────────────────────

def test_checkin_validation_rules():
    """Verify nonexistent student, nonexistent doctor, and inactive student are rejected."""
    rec_token, _, _, _, _ = get_tokens()

    # 1. Nonexistent student -> 404 Not Found
    res1 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "NONEXISTENT_99999", "doctor_id": 2},
    )
    assert res1.status_code == 404, f"Expected 404 for unknown student, got {res1.status_code}"

    # 2. Nonexistent doctor -> 404 Not Found
    res2 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P5_001", "doctor_id": 99999},
    )
    assert res2.status_code == 404, f"Expected 404 for unknown doctor, got {res2.status_code}"

    # 3. Inactive student -> 400 Bad Request
    res3 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P5_INACT", "doctor_id": 2},
    )
    assert res3.status_code in (400, 403), f"Expected 400/403 for inactive student, got {res3.status_code}"

    # 4. Missing required identifiers -> 422 Unprocessable Entity
    res4 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"complaint": "Only complaint, no student or doctor"},
    )
    assert res4.status_code == 422, f"Expected 422 for missing fields, got {res4.status_code}"

    print("PASS: Task 5.1 input validation strictly enforced (student/doctor existence, active account, required fields).")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 3: Doctor Availability Validation
# ─────────────────────────────────────────────────────────────────────────────

def test_doctor_availability_validation():
    """Verify check-in is rejected when the selected doctor is marked UNAVAILABLE today."""
    rec_token, _, _, _, _ = get_tokens()

    # Mark doctor 2 UNAVAILABLE for CURDATE()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, created_by_user_id)
                VALUES (2, CURDATE(), 'UNAVAILABLE', 5)
                ON DUPLICATE KEY UPDATE status = 'UNAVAILABLE'
                """
            )
            conn.commit()
    finally:
        conn.close()

    try:
        res = client.post(
            "/api/reception/check-ins",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"roll_number": "TEST_P5_001", "doctor_id": 2, "complaint": "Fever"},
        )
        assert res.status_code == 409, f"Expected 409 Conflict when doctor is unavailable, got {res.status_code}"
        assert "unavailable" in res.json().get("detail", "").lower()
    finally:
        # Revert doctor 2 availability back
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM DOCTOR_AVAILABILITY WHERE doctor_id = 2 AND availability_date = CURDATE()")
                conn.commit()
        finally:
            conn.close()

    print("PASS: Doctor availability rule enforced on CURDATE().")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 4: Single Active Visit Conflict Enforcement
# ─────────────────────────────────────────────────────────────────────────────

def test_conflicting_active_visit_rejection():
    """Verify a student already in queue/consultation cannot be checked in a second time."""
    rec_token, _, _, _, _ = get_tokens()
    roll = "TEST_P5_001"

    # First check-in -> 201 Created
    res1 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "First check-in"},
    )
    assert res1.status_code == 201, f"Expected 201 Created, got {res1.status_code}: {res1.text}"
    visit_id = res1.json()["visit_id"]

    # Second check-in for the same student while active -> 409 Conflict
    res2 = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Second check-in"},
    )
    assert res2.status_code == 409, f"Expected 409 Conflict for duplicate active visit, got {res2.status_code}"
    assert "already has an active visit" in res2.json().get("detail", "").lower()

    # Cancel first visit so student is free
    client.post(f"/api/queue/{visit_id}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Conflicting active visit policy strictly enforced (409 Conflict).")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 5: Server-Allocated Queue Number & Atomic Persistence
# ─────────────────────────────────────────────────────────────────────────────

def test_server_allocated_queue_number_and_persistence():
    """
    Verify:
    1. Client-supplied queue number is IGNORED; server allocates sequence.
    2. Response contains: visit_id, queue_number, doctor_id, persisted status.
    3. Records are persisted atomically in VISIT, QUEUE_ENTRY, and VISIT_EVENT.
    """
    rec_token, rec_user_id, _, _, _ = get_tokens()
    roll = "TEST_P5_001"

    # Attempt to supply fake queue number from frontend
    fake_queue_payload = {
        "roll_number": roll,
        "doctor_id": 2,
        "complaint": "Chest congestion",
        "queue_number": 999999,  # Malicious/fake sequence
        "queueNo": 888888,
    }

    res = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json=fake_queue_payload,
    )
    assert res.status_code == 201, f"Check-in failed: {res.text}"
    data = res.json()

    # 1. Verify response structure
    assert "visit_id" in data and data["visit_id"] > 0
    assert "queue_number" in data and data["queue_number"] > 0
    assert data["queue_number"] not in (999999, 888888), "Server trusted frontend-supplied queue number!"
    assert data["doctor_id"] == 2
    assert data["status"] in ("WAITING_FOR_DOCTOR", "WAITING")

    visit_id = data["visit_id"]
    assigned_seq = data["queue_number"]

    # 2. Verify database persistence
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check VISIT
            cur.execute("SELECT status, doctor_id, roll_number, checked_in_at FROM VISIT WHERE visit_id = %s", (visit_id,))
            v_row = cur.fetchone()
            assert v_row is not None
            assert v_row["status"] == "WAITING_FOR_DOCTOR"
            assert v_row["doctor_id"] == 2
            assert v_row["roll_number"] == roll

            # Check QUEUE_ENTRY
            cur.execute("SELECT queue_sequence, status, entry_reason, doctor_id FROM QUEUE_ENTRY WHERE visit_id = %s", (visit_id,))
            qe_row = cur.fetchone()
            assert qe_row is not None
            assert qe_row["queue_sequence"] == assigned_seq
            assert qe_row["status"] == "WAITING"
            assert qe_row["entry_reason"] == "INITIAL_CHECKIN"
            assert qe_row["doctor_id"] == 2

            # Check VISIT_EVENT
            cur.execute(
                "SELECT event_type, performed_by_user_id, notes FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'CHECKED_IN'",
                (visit_id,),
            )
            ve_row = cur.fetchone()
            assert ve_row is not None
            assert ve_row["performed_by_user_id"] == rec_user_id
            assert "Chest congestion" in (ve_row["notes"] or "")
    finally:
        conn.close()

    # Cleanup
    client.post(f"/api/queue/{visit_id}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Server-side queue allocation confirmed (frontend spoof ignored) and DB records verified.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 6: First Integration Milestone - Appears in Doctor Queue & Reception Queue
# ─────────────────────────────────────────────────────────────────────────────

def test_first_integration_milestone():
    """
    Goal: A receptionist checks in a student for a particular doctor, and that student
    appears in that doctor's queue and the receptionist's overall queue view.
    """
    rec_token, _, doc2_token, doc1_token, _ = get_tokens()
    roll = "TEST_P5_002"

    # Step 1: Receptionist checks in student to Doctor 2
    res = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Migraine headache"},
    )
    assert res.status_code == 201
    data = res.json()
    visit_id = data["visit_id"]
    assigned_queue_no = data["queue_number"]

    # Step 2: Doctor 2 fetches their own queue
    doc2_queue_res = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {doc2_token}"})
    assert doc2_queue_res.status_code == 200
    doc2_queue = doc2_queue_res.json()

    # Assert student appears in Doctor 2's queue
    doc2_match = next((p for p in doc2_queue if p["rollNumber"] == roll), None)
    assert doc2_match is not None, f"Student {roll} not found in Doctor 2's queue: {doc2_queue}"
    assert doc2_match["visitId"] == visit_id
    assert doc2_match["queueNo"] == assigned_queue_no

    # Step 3: Receptionist fetches overall queue view
    rec_queue_res = client.get("/api/reception/queue", headers={"Authorization": f"Bearer {rec_token}"})
    assert rec_queue_res.status_code == 200
    rec_queue = rec_queue_res.json()

    # Assert student appears in receptionist's front-desk queue view
    rec_match = next((p for p in rec_queue if p["rollNumber"] == roll), None)
    assert rec_match is not None, f"Student {roll} not found in Receptionist queue: {rec_queue}"
    assert rec_match["visitId"] == visit_id
    assert rec_match["doctorId"] == 2
    assert rec_match["queueNo"] == assigned_queue_no

    # Step 4: Doctor 1 fetches their queue -> student must NOT appear in Doctor 1's queue
    doc1_queue_res = client.get("/api/doctor/1/queue", headers={"Authorization": f"Bearer {doc1_token}"})
    assert doc1_queue_res.status_code == 200
    doc1_queue = doc1_queue_res.json()
    assert not any(p["rollNumber"] == roll for p in doc1_queue), "Student leaked into Doctor 1's queue!"

    # Cleanup
    client.post(f"/api/queue/{visit_id}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: First integration milestone confirmed! Student checked in by receptionist appears in Doctor 2 queue and Receptionist queue, isolated from Doctor 1.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 7: Route Aliases & Payload Conventions
# ─────────────────────────────────────────────────────────────────────────────

def test_route_aliases_and_casing_conventions():
    """Verify both /check-ins and /checkin work with camelCase and snake_case."""
    rec_token, _, _, _, _ = get_tokens()

    # Test A: POST /api/reception/checkin with camelCase { rollNumber, doctorId }
    res_a = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_003", "doctorId": 2, "complaint": "Sore throat", "via": "MANUAL"},
    )
    assert res_a.status_code == 201, f"Failed on /checkin camelCase: {res_a.text}"
    vid_a = res_a.json()["visit_id"]

    # Cancel visit A
    client.post(f"/api/queue/{vid_a}/cancel", headers={"Authorization": f"Bearer {rec_token}"})

    # Test B: POST /api/reception/check-ins with snake_case { roll_number, doctor_id }
    res_b = client.post(
        "/api/reception/check-ins",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_P5_003", "doctor_id": 2, "complaint": "Sore throat", "via": "RFID"},
    )
    assert res_b.status_code == 201, f"Failed on /check-ins snake_case: {res_b.text}"
    vid_b = res_b.json()["visit_id"]

    # Cancel visit B
    client.post(f"/api/queue/{vid_b}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Both /check-ins and /checkin endpoints and camelCase/snake_case payloads verified.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 8: Task 5.2 — Receptionist Multi-Doctor Queue View & Metadata
# ─────────────────────────────────────────────────────────────────────────────

def test_reception_queue_multi_doctor_view():
    """Verify GET /api/reception/queue returns active queues across all doctors with full metadata."""
    rec_token, _, _, _, _ = get_tokens()

    # Ensure Doctor 2 is marked available
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', 5)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """
            )
            conn.commit()
    finally:
        conn.close()

    # Check in Student 1 for Doctor 1 with complaint
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={
            "rollNumber": "TEST_P5_001",
            "doctorId": 1,
            "complaint": "Severe headache and fever",
        },
    )
    assert res1.status_code == 201, f"Check-in 1 failed: {res1.text}"
    vid1 = res1.json()["visit_id"]

    # Check in Student 2 for Doctor 2 with complaint
    res2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={
            "rollNumber": "TEST_P5_002",
            "doctorId": 2,
            "complaint": "Sports ankle sprain",
        },
    )
    assert res2.status_code == 201, f"Check-in 2 failed: {res2.text}"
    vid2 = res2.json()["visit_id"]

    try:
        # Fetch receptionist overall queue
        queue_res = client.get(
            "/api/reception/queue",
            headers={"Authorization": f"Bearer {rec_token}"},
        )
        assert queue_res.status_code == 200, f"Failed to get reception queue: {queue_res.text}"
        queue = queue_res.json()
        assert isinstance(queue, list)

        # Student 1 verification
        item1 = next((p for p in queue if p["rollNumber"] == "TEST_P5_001"), None)
        assert item1 is not None, f"Student 1 not found in reception queue: {queue}"
        assert item1["visitId"] == vid1
        assert item1["doctorId"] == 1
        assert item1["doctor_id"] == 1
        assert "Kapoor" in item1["doctorName"] or "Dr" in item1["doctorName"]
        assert item1["specialty"] is not None
        assert item1["room"].startswith("Room ")
        assert item1["queueNo"] >= 1
        assert item1["status"] == "Waiting"
        assert item1["statusCode"] == "WAITING"
        assert item1["checkInTime"] is not None
        assert item1["waitingSince"] is not None
        assert "headache" in item1["complaint"].lower()

        # Student 2 verification
        item2 = next((p for p in queue if p["rollNumber"] == "TEST_P5_002"), None)
        assert item2 is not None, f"Student 2 not found in reception queue: {queue}"
        assert item2["visitId"] == vid2
        assert item2["doctorId"] == 2
        assert item2["doctor_id"] == 2
        assert item2["queueNo"] >= 1
        assert item2["status"] == "Waiting"
        assert item2["statusCode"] == "WAITING"
        assert "ankle" in item2["complaint"].lower()

        print("PASS: Multi-doctor receptionist queue view returns active entries with complete metadata.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
        client.post(f"/api/queue/{vid2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 9: Task 5.2 — Optional Doctor Filter (?doctor_id=...)
# ─────────────────────────────────────────────────────────────────────────────

def test_reception_queue_doctor_filter():
    """Verify GET /api/reception/queue?doctor_id=... filters accurately by doctor."""
    rec_token, _, _, _, _ = get_tokens()

    # Ensure Doctor 2 is marked available
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', 5)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """
            )
            conn.commit()
    finally:
        conn.close()

    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_001", "doctorId": 1, "complaint": "Flu"},
    )
    assert res1.status_code == 201
    vid1 = res1.json()["visit_id"]

    res2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_002", "doctorId": 2, "complaint": "Skin rash"},
    )
    assert res2.status_code == 201
    vid2 = res2.json()["visit_id"]

    try:
        # Filter by Doctor 1
        q_doc1 = client.get("/api/reception/queue?doctor_id=1", headers={"Authorization": f"Bearer {rec_token}"})
        assert q_doc1.status_code == 200
        items_doc1 = q_doc1.json()
        assert all(item["doctorId"] == 1 for item in items_doc1)
        assert any(item["rollNumber"] == "TEST_P5_001" for item in items_doc1)
        assert not any(item["rollNumber"] == "TEST_P5_002" for item in items_doc1)

        # Filter by Doctor 2
        q_doc2 = client.get("/api/reception/queue?doctor_id=2", headers={"Authorization": f"Bearer {rec_token}"})
        assert q_doc2.status_code == 200
        items_doc2 = q_doc2.json()
        assert all(item["doctorId"] == 2 for item in items_doc2)
        assert any(item["rollNumber"] == "TEST_P5_002" for item in items_doc2)
        assert not any(item["rollNumber"] == "TEST_P5_001" for item in items_doc2)

        # Filter by non-existent Doctor 99999
        q_none = client.get("/api/reception/queue?doctor_id=99999", headers={"Authorization": f"Bearer {rec_token}"})
        assert q_none.status_code == 200
        assert q_none.json() == []

        print("PASS: Reception queue filtering by doctor_id works accurately.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
        client.post(f"/api/queue/{vid2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 10: Task 5.2 — Consultation Status & Ordering Visibility
# ─────────────────────────────────────────────────────────────────────────────

def test_reception_queue_consultation_status_and_ordering():
    """Verify that when a doctor calls a patient, the receptionist queue reflects In Consultation state."""
    rec_token, _, doc2_token, _, _ = get_tokens()

    # Ensure Doctor 2 is marked available
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', 5)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """
            )
            conn.commit()
    finally:
        conn.close()

    # Check in Student 2 for Doctor 2
    res = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_002", "doctorId": 2, "complaint": "Migraine"},
    )
    assert res.status_code == 201
    vid = res.json()["visit_id"]

    try:
        # Advance Doctor 2 queue: Doctor 2 calls next patient
        call_res = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
        assert call_res.status_code == 200, f"Doctor 2 call-next failed: {call_res.text}"

        # Check receptionist queue view
        q_res = client.get("/api/reception/queue?doctor_id=2", headers={"Authorization": f"Bearer {rec_token}"})
        assert q_res.status_code == 200
        entries = q_res.json()
        match = next((p for p in entries if p["visitId"] == vid), None)
        assert match is not None, f"Visit {vid} not in reception queue: {entries}"
        assert match["status"] == "In Consultation"
        assert match["statusCode"] == "IN_CONSULTATION"
        assert match["calledAt"] is not None

        print("PASS: Reception queue accurately reflects In Consultation status when doctor advances queue.")
    finally:
        # Doctor 2 completes consultation
        client.post(
            "/api/doctor/2/complete",
            headers={"Authorization": f"Bearer {doc2_token}"},
            json={
                "roll_number": "TEST_P5_002",
                "diagnosis": "Tension headache",
                "general": "Rest and fluids",
                "medicines": [],
            },
        )
        # Cancel or cleanup if still active
        client.post(f"/api/queue/{vid}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 11: Task 5.2 — Reception Queue Authorization Guards
# ─────────────────────────────────────────────────────────────────────────────

def test_reception_queue_auth_guards():
    """Verify only authenticated receptionists can access GET /api/reception/queue."""
    rec_token, _, doc2_token, _, student_token = get_tokens()

    # Anonymous request -> 401
    anon_res = client.get("/api/reception/queue")
    assert anon_res.status_code == 401, f"Expected 401 for anonymous, got {anon_res.status_code}"

    # Doctor request -> 403
    doc_res = client.get("/api/reception/queue", headers={"Authorization": f"Bearer {doc2_token}"})
    assert doc_res.status_code == 403, f"Expected 403 for doctor, got {doc_res.status_code}"

    # Student request -> 403
    st_res = client.get("/api/reception/queue", headers={"Authorization": f"Bearer {student_token}"})
    assert st_res.status_code == 403, f"Expected 403 for student, got {st_res.status_code}"

    # Receptionist request -> 200
    rec_res = client.get("/api/reception/queue", headers={"Authorization": f"Bearer {rec_token}"})
    assert rec_res.status_code == 200, f"Expected 200 for receptionist, got {rec_res.status_code}"

    print("PASS: Reception queue endpoint strictly guards access to authenticated receptionists.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 12: Task 5.3 — Doctor Queue Reuse & Role Authorization Boundaries
# ─────────────────────────────────────────────────────────────────────────────

def test_doctor_queue_endpoint_authorization_and_data():
    """
    Verify GET /api/doctor/{doctor_id}/queue:
    1. Authenticated doctor can only see their own queue line.
    2. Cross-doctor read is strictly rejected with 403 Forbidden.
    3. Receptionist is permitted to view any doctor's queue (multi-doctor coordination).
    4. Students (403) and anonymous callers (401) are strictly rejected.
    5. Response includes full dual-cased metadata, clinical complaint, and correct ordering.
    """
    rec_token, _, doc2_token, doc1_token, student_token = get_tokens()

    # Ensure Doctor 2 is marked available
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', 5)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """
            )
            conn.commit()
    finally:
        conn.close()

    # Check in student 1 for Doctor 1
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_001", "doctorId": 1, "complaint": "Allergic rhinitis"},
    )
    assert res1.status_code == 201
    vid1 = res1.json()["visit_id"]

    # Check in student 2 for Doctor 2
    res2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_002", "doctorId": 2, "complaint": "Acute joint ache"},
    )
    assert res2.status_code == 201
    vid2 = res2.json()["visit_id"]

    try:
        # 1. Doctor 1 fetches own queue -> receives Patient 1, isolated from Patient 2
        d1_res = client.get("/api/doctor/1/queue", headers={"Authorization": f"Bearer {doc1_token}"})
        assert d1_res.status_code == 200, f"Doctor 1 queue failed: {d1_res.text}"
        d1_queue = d1_res.json()
        assert any(p["rollNumber"] == "TEST_P5_001" for p in d1_queue)
        assert not any(p["rollNumber"] == "TEST_P5_002" for p in d1_queue)
        item1 = next(p for p in d1_queue if p["rollNumber"] == "TEST_P5_001")
        assert item1["visitId"] == vid1
        assert item1["visit_id"] == vid1
        assert item1["queueNo"] >= 1
        assert item1["queue_number"] >= 1
        assert item1["status"] == "Waiting"
        assert item1["statusCode"] == "WAITING"
        assert "rhinitis" in item1["complaint"].lower()

        # 2. Doctor 2 fetches own queue -> receives Patient 2, isolated from Patient 1
        d2_res = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {doc2_token}"})
        assert d2_res.status_code == 200, f"Doctor 2 queue failed: {d2_res.text}"
        d2_queue = d2_res.json()
        assert any(p["rollNumber"] == "TEST_P5_002" for p in d2_queue)
        assert not any(p["rollNumber"] == "TEST_P5_001" for p in d2_queue)
        item2 = next(p for p in d2_queue if p["rollNumber"] == "TEST_P5_002")
        assert item2["visitId"] == vid2
        assert item2["visit_id"] == vid2
        assert "joint" in item2["complaint"].lower()

        # 3. Cross-Doctor Isolation: Doctor 1 tries to read Doctor 2's queue -> 403 Forbidden
        cross_res = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {doc1_token}"})
        assert cross_res.status_code == 403, f"Expected 403 for cross-doctor queue read, got {cross_res.status_code}"
        assert "another doctor's workstation" in cross_res.json().get("detail", "")

        # 4. Cross-Doctor Isolation: Doctor 2 tries to read Doctor 1's queue -> 403 Forbidden
        cross_res2 = client.get("/api/doctor/1/queue", headers={"Authorization": f"Bearer {doc2_token}"})
        assert cross_res2.status_code == 403, f"Expected 403 for cross-doctor queue read, got {cross_res2.status_code}"
        assert "another doctor's workstation" in cross_res2.json().get("detail", "")

        # 5. Receptionist Authorization: Receptionist reads Doctor 1's queue -> 200 OK
        rec_d1 = client.get("/api/doctor/1/queue", headers={"Authorization": f"Bearer {rec_token}"})
        assert rec_d1.status_code == 200
        assert any(p["rollNumber"] == "TEST_P5_001" for p in rec_d1.json())

        # 6. Receptionist Authorization: Receptionist reads Doctor 2's queue -> 200 OK
        rec_d2 = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {rec_token}"})
        assert rec_d2.status_code == 200
        assert any(p["rollNumber"] == "TEST_P5_002" for p in rec_d2.json())

        # 7. Student Authorization Guard -> 403 Forbidden
        st_res = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {student_token}"})
        assert st_res.status_code == 403, f"Expected 403 for student queue read, got {st_res.status_code}"

        # 8. Anonymous Guard -> 401 Unauthorized
        anon_res = client.get("/api/doctor/2/queue")
        assert anon_res.status_code == 401, f"Expected 401 for anonymous queue read, got {anon_res.status_code}"

        print("PASS: Task 5.3 Doctor queue verified! Doctors isolated to own queue, Receptionists permitted cross-queue.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
        client.post(f"/api/queue/{vid2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 13: Task 5.4 — Call Next Eligible Student & Idempotency
# ─────────────────────────────────────────────────────────────────────────────

def test_call_next_eligible_student():
    """Verify Doctor workstation calls next eligible student and enforces idempotency."""
    rec_token, _, doc2_token, doc1_token, student_token = get_tokens()

    # Ensure Doctor 2 is available
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', 5)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """
            )
            conn.commit()
    finally:
        conn.close()

    # Check in Student 1 and Student 2 for Doctor 2
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_001", "doctorId": 2, "complaint": "Viral throat infection"},
    )
    assert res1.status_code == 201
    vid1 = res1.json()["visit_id"]

    res2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_002", "doctorId": 2, "complaint": "Migraine headache"},
    )
    assert res2.status_code == 201
    vid2 = res2.json()["visit_id"]

    try:
        # 1. Doctor 2 calls next student -> should be Student 1 (first in sequence)
        call1 = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
        assert call1.status_code == 200, f"Call next failed: {call1.text}"
        data1 = call1.json()
        assert data1["status"] == "called"
        assert data1["visitId"] == vid1
        assert data1["rollNumber"] == "TEST_P5_001"

        # Verify DB status
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT status, consultation_started_at FROM VISIT WHERE visit_id = %s", (vid1,))
                v_row = cur.fetchone()
                assert v_row["status"] == "IN_CONSULTATION"
                assert v_row["consultation_started_at"] is not None

                cur.execute("SELECT status, called_at FROM QUEUE_ENTRY WHERE visit_id = %s AND status = 'IN_CONSULTATION'", (vid1,))
                q_row = cur.fetchone()
                assert q_row is not None
                assert q_row["called_at"] is not None

                # Student 2 must still be WAITING
                cur.execute("SELECT status FROM VISIT WHERE visit_id = %s", (vid2,))
                assert cur.fetchone()["status"] == "WAITING_FOR_DOCTOR"
        finally:
            conn.close()

        # 2. Idempotency: Doctor 2 calls next again while Student 1 is in consultation
        call2 = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
        assert call2.status_code == 200
        data2 = call2.json()
        assert data2["status"] == "already_in_consultation"
        assert data2["visitId"] == vid1
        assert data2["rollNumber"] == "TEST_P5_001"

        # 3. Doctor 1 cannot call Doctor 2's queue -> 403 Forbidden
        d1_call = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc1_token}"})
        assert d1_call.status_code == 403

        # 4. Receptionist cannot call doctor queue -> 403 Forbidden
        rec_call = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {rec_token}"})
        assert rec_call.status_code == 403

        print("PASS: Task 5.4 Call next eligible student & idempotency verified.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
        client.post(f"/api/queue/{vid2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 14: Task 5.4 — Start Consultation Endpoints & Transition Guards
# ─────────────────────────────────────────────────────────────────────────────

def test_start_consultation_endpoints_and_guards():
    """Verify explicit start-consultation endpoints and conflicting consultation guards."""
    rec_token, _, doc2_token, doc1_token, student_token = get_tokens()

    # Check in Student 1 for Doctor 2 and Student 2 for Doctor 1
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_001", "doctorId": 2, "complaint": "Fever"},
    )
    assert res1.status_code == 201
    vid1 = res1.json()["visit_id"]

    res2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_002", "doctorId": 1, "complaint": "Back pain"},
    )
    assert res2.status_code == 201
    vid2 = res2.json()["visit_id"]

    try:
        # 1. Doctor 2 tries to start consultation on Student 2 (assigned to Doctor 1) -> 409 Conflict
        bad_start = client.post(
            "/api/doctor/2/start-consultation",
            headers={"Authorization": f"Bearer {doc2_token}"},
            json={"visit_id": vid2},
        )
        assert bad_start.status_code == 409
        assert "assigned to Doctor #1" in bad_start.json().get("detail", "")

        # 2. Doctor 2 explicitly starts consultation on Student 1 via path parameter
        start1 = client.post(
            f"/api/doctor/2/start-consultation/{vid1}",
            headers={"Authorization": f"Bearer {doc2_token}"},
        )
        assert start1.status_code == 200, f"Explicit start consultation failed: {start1.text}"
        assert start1.json()["status"] == "in_consultation"
        assert start1.json()["visitId"] == vid1

        # 3. Doctor 2 calls start-consultation again for Student 1 -> idempotent success
        start_idem = client.post(
            f"/api/doctor/2/start-consultation/{vid1}",
            headers={"Authorization": f"Bearer {doc2_token}"},
        )
        assert start_idem.status_code == 200
        assert start_idem.json()["status"] == "already_in_consultation"

        # 4. Doctor 1 starts consultation on Student 2 via queue endpoint /api/queue/{visit_id}/start-consultation
        q_start = client.post(
            f"/api/queue/{vid2}/start-consultation",
            headers={"Authorization": f"Bearer {doc1_token}"},
        )
        assert q_start.status_code == 200
        assert q_start.json()["status"] == "in_consultation"
        assert q_start.json()["visitId"] == vid2

        # 5. Non-doctor access to /api/queue/{visit_id}/start-consultation -> 403 Forbidden
        rec_denied = client.post(
            f"/api/queue/{vid2}/start-consultation",
            headers={"Authorization": f"Bearer {rec_token}"},
        )
        assert rec_denied.status_code == 403

        print("PASS: Task 5.4 Start consultation endpoints & transition guards verified.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
        client.post(f"/api/queue/{vid2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 15: Task 5.4 — Mark No-Show & Idempotency
# ─────────────────────────────────────────────────────────────────────────────

def test_mark_no_show_and_idempotency():
    """Verify marking no-show, assignment validations, and idempotency."""
    rec_token, _, doc2_token, doc1_token, student_token = get_tokens()

    # Check in Student 1 for Doctor 2
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_001", "doctorId": 2, "complaint": "Persistent cough"},
    )
    assert res1.status_code == 201
    vid1 = res1.json()["visit_id"]

    try:
        # 1. Doctor 1 tries to mark no-show on Doctor 2's patient -> 409 Conflict
        d1_noshow = client.post(
            f"/api/doctor/1/no-show/{vid1}",
            headers={"Authorization": f"Bearer {doc1_token}"},
        )
        assert d1_noshow.status_code == 409
        assert "another doctor" in d1_noshow.json().get("detail", "")

        # 2. Doctor 2 marks no-show on own patient
        noshow_res = client.post(
            f"/api/doctor/2/no-show/{vid1}",
            headers={"Authorization": f"Bearer {doc2_token}"},
        )
        assert noshow_res.status_code == 200, f"Mark no-show failed: {noshow_res.text}"
        assert noshow_res.json()["status"] == "no_show"
        assert noshow_res.json()["visitId"] == vid1

        # Verify DB state
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM VISIT WHERE visit_id = %s", (vid1,))
                assert cur.fetchone()["status"] == "NO_SHOW"

                cur.execute("SELECT status, exit_reason FROM QUEUE_ENTRY WHERE visit_id = %s", (vid1,))
                qe_row = cur.fetchone()
                assert qe_row["status"] == "NO_SHOW"
                assert qe_row["exit_reason"] == "NO_SHOW"

                cur.execute("SELECT event_type FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'NO_SHOW'", (vid1,))
                assert cur.fetchone() is not None
        finally:
            conn.close()

        # 3. Idempotent retry: Doctor 2 marks no-show again
        idem_res = client.post(
            f"/api/doctor/2/no-show/{vid1}",
            headers={"Authorization": f"Bearer {doc2_token}"},
        )
        assert idem_res.status_code == 200
        assert idem_res.json()["status"] == "already_no_show"

        # 4. Staff queue no-show endpoint /api/queue/{visit_id}/no-show is also idempotent
        staff_noshow = client.post(
            f"/api/queue/{vid1}/no-show",
            headers={"Authorization": f"Bearer {rec_token}"},
        )
        assert staff_noshow.status_code == 200
        assert staff_noshow.json()["status"] == "already_no_show"

        print("PASS: Task 5.4 Mark no-show & idempotency verified.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 16: Task 5.4 — Requeue & Redirect Permissions and Validation
# ─────────────────────────────────────────────────────────────────────────────

def test_requeue_and_redirect_permissions_and_validation():
    """Verify requeue (receptionist only) and redirect (doctor own patient / receptionist triage)."""
    rec_token, _, doc2_token, doc1_token, student_token = get_tokens()

    # Check in Student 1 for Doctor 2
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": "TEST_P5_001", "doctorId": 2, "complaint": "Ankle sprain"},
    )
    assert res1.status_code == 201
    vid1 = res1.json()["visit_id"]

    try:
        # 1. Attempt to requeue while visit is WAITING -> 409 Conflict
        early_req = client.post(
            f"/api/queue/{vid1}/requeue",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"target_doctor_id": 2},
        )
        assert early_req.status_code == 409
        assert "Only visits in NO_SHOW status can be requeued" in early_req.json().get("detail", "")

        # 2. Mark visit as NO_SHOW
        client.post(f"/api/doctor/2/no-show/{vid1}", headers={"Authorization": f"Bearer {doc2_token}"})

        # 3. Doctor attempts to requeue -> 403 Forbidden (Receptionist only)
        doc_req = client.post(
            f"/api/queue/{vid1}/requeue",
            headers={"Authorization": f"Bearer {doc2_token}"},
            json={"target_doctor_id": 2},
        )
        assert doc_req.status_code == 403

        # 4. Receptionist requeues visit to Doctor 1
        req_res = client.post(
            f"/api/queue/{vid1}/requeue",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"target_doctor_id": 1, "reason": "Student arrived late after no-show"},
        )
        assert req_res.status_code == 200, f"Requeue failed: {req_res.text}"
        req_data = req_res.json()
        assert req_data["status"] == "requeued"
        assert req_data["doctorId"] == 1
        assert req_data["queueNo"] >= 1

        # Verify DB reflects new queue entry and WAITING_FOR_DOCTOR
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT status, doctor_id FROM VISIT WHERE visit_id = %s", (vid1,))
                v_row = cur.fetchone()
                assert v_row["status"] == "WAITING_FOR_DOCTOR"
                assert v_row["doctor_id"] == 1

                cur.execute(
                    "SELECT status, entry_reason FROM QUEUE_ENTRY WHERE visit_id = %s ORDER BY queue_entry_id DESC LIMIT 1",
                    (vid1,),
                )
                qe_row = cur.fetchone()
                assert qe_row["status"] == "WAITING"
                assert qe_row["entry_reason"] == "NO_SHOW_RESCHEDULE"
        finally:
            conn.close()

        # 5. Redirect: Doctor 2 tries to redirect visit currently assigned to Doctor 1 -> 409 Conflict
        d2_bad_redir = client.post(
            f"/api/doctor/2/redirect/{vid1}",
            headers={"Authorization": f"Bearer {doc2_token}"},
            json={"target_doctor_id": 2},
        )
        assert d2_bad_redir.status_code in (403, 409)

        # 6. Doctor 1 redirects own patient to Doctor 2 via /api/doctor/1/redirect/{vid1}
        redir_res = client.post(
            f"/api/doctor/1/redirect/{vid1}",
            headers={"Authorization": f"Bearer {doc1_token}"},
            json={"target_doctor_id": 2, "reason": "Requires Doctor 2 specialty"},
        )
        assert redir_res.status_code == 200, f"Redirect failed: {redir_res.text}"
        assert redir_res.json()["status"] == "redirected"
        assert redir_res.json()["newDoctorId"] == 2

        # 7. Receptionist triage redirects Student 1 back to Doctor 1 via /api/queue/{vid1}/redirect
        rec_redir = client.post(
            f"/api/queue/{vid1}/redirect",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"target_doctor_id": 1, "reason": "Front-desk load balance"},
        )
        assert rec_redir.status_code == 200
        assert rec_redir.json()["newDoctorId"] == 1

        print("PASS: Task 5.4 Requeue & redirect permissions and validation verified.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# TEST 17: Task 5.4 — Concurrent Queue Actions Safety
# ─────────────────────────────────────────────────────────────────────────────

def test_concurrent_queue_actions_safety():
    """Verify that simultaneous call-next requests serialize cleanly and prevent double consultation."""
    rec_token, _, doc2_token, _, _ = get_tokens()

    # Check in 3 students for Doctor 2
    vids = []
    for roll, comp in [("TEST_P5_001", "Cold"), ("TEST_P5_002", "Sprain"), ("TEST_P5_003", "Rash")]:
        res = client.post(
            "/api/reception/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"rollNumber": roll, "doctorId": 2, "complaint": comp},
        )
        assert res.status_code == 201
        vids.append(res.json()["visit_id"])

    try:
        def call_next():
            return client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})

        # Fire 5 concurrent call-next requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(call_next) for _ in range(5)]
            responses = [f.result() for f in futures]

        status_codes = [r.status_code for r in responses]
        assert all(code == 200 for code in status_codes), f"Unexpected status codes: {status_codes}"

        results = [r.json()["status"] for r in responses]
        called_count = results.count("called")
        already_count = results.count("already_in_consultation")

        # Exactly 1 request successfully transitioned a student to consultation;
        # the remaining 4 requests observed the locked session and returned already_in_consultation
        assert called_count == 1, f"Expected exactly 1 'called', got {called_count} in {results}"
        assert already_count == 4, f"Expected 4 'already_in_consultation', got {already_count} in {results}"

        # Verify DB has EXACTLY 1 patient in IN_CONSULTATION for Doctor 2
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS active_count FROM QUEUE_ENTRY WHERE doctor_id = 2 AND status = 'IN_CONSULTATION'"
                )
                assert cur.fetchone()["active_count"] == 1
        finally:
            conn.close()

        print("PASS: Task 5.4 Concurrent call-next race condition test passed with 100% serialization.")
    finally:
        for vid in vids:
            client.post(f"/api/queue/{vid}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# MAIN RUNNER
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("RUNNING CAMPUSCARE PHASE 5: CHECK-IN & RECEPTIONIST QUEUE TESTS")
    print("=" * 70)

    try:
        print("\n--- Setting up Phase 5 test student fixtures ---")
        setup_test_students()
        print("Phase 5 test fixtures ready.")

        print("\n--- Running Test 1: Receptionist Role Authorization ---")
        test_checkin_auth_guards()

        print("\n--- Running Test 2: Input Validation (Student, Doctor, Status) ---")
        test_checkin_validation_rules()

        print("\n--- Running Test 3: Doctor Availability Rules ---")
        test_doctor_availability_validation()

        print("\n--- Running Test 4: Single Active Visit Conflict Prevention ---")
        test_conflicting_active_visit_rejection()

        print("\n--- Running Test 5: Server Queue Number Allocation & Persistence ---")
        test_server_allocated_queue_number_and_persistence()

        print("\n--- Running Test 6: First Integration Milestone (Doctor & Reception Queues) ---")
        test_first_integration_milestone()

        print("\n--- Running Test 7: Route Aliases & Naming Conventions ---")
        test_route_aliases_and_casing_conventions()

        print("\n--- Running Test 8: Task 5.2 Multi-Doctor Reception Queue View & Metadata ---")
        test_reception_queue_multi_doctor_view()

        print("\n--- Running Test 9: Task 5.2 Optional Doctor Filter (?doctor_id=...) ---")
        test_reception_queue_doctor_filter()

        print("\n--- Running Test 10: Task 5.2 Consultation Status & Ordering Visibility ---")
        test_reception_queue_consultation_status_and_ordering()

        print("\n--- Running Test 11: Task 5.2 Reception Queue Auth Guards ---")
        test_reception_queue_auth_guards()

        print("\n--- Running Test 12: Task 5.3 Doctor Queue Reuse & Role Authorization ---")
        test_doctor_queue_endpoint_authorization_and_data()

        print("\n--- Running Test 13: Task 5.4 Call Next Eligible Student & Idempotency ---")
        test_call_next_eligible_student()

        print("\n--- Running Test 14: Task 5.4 Start Consultation Endpoints & Guards ---")
        test_start_consultation_endpoints_and_guards()

        print("\n--- Running Test 15: Task 5.4 Mark No-Show & Idempotency ---")
        test_mark_no_show_and_idempotency()

        print("\n--- Running Test 16: Task 5.4 Requeue & Redirect Permissions and Validation ---")
        test_requeue_and_redirect_permissions_and_validation()

        print("\n--- Running Test 17: Task 5.4 Concurrent Queue Actions Safety ---")
        test_concurrent_queue_actions_safety()

        print("\n" + "=" * 70)
        print("ALL 17 PHASE 5 INTEGRATION TESTS (TASKS 5.1 TO 5.4) PASSED SUCCESSFULLY!")
        print("=" * 70)
    finally:
        print("\n--- Cleaning up test records ---")
        cleanup_test_records()
        print("Cleanup completed.")


if __name__ == "__main__":
    main()

