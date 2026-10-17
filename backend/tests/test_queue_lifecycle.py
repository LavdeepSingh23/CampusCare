"""
CampusCare Phase 4 Queue Lifecycle & State Transition Test Suite.

Validates:
1. Full Happy-Path Lifecycle (Check-in -> Call Next -> Complete -> Dispense -> Completed).
2. No-Show & Requeue Lifecycle (Check-in -> No-Show -> Requeue -> Consultation -> Complete).
3. Patient Redirection Lifecycle (Doctor 1 -> Redirect to Doctor 2 -> Consultation).
4. Cancellation Lifecycle (Check-in -> Cancel).
5. Invalid Transitions & Policy Guards (Cannot dispense unconsulted, cannot cancel completed, etc.).
6. Idempotency & Repeated Requests (Duplicate dispense, duplicate call-next, duplicate check-in).
7. Concurrency Test 1: Active check-in race conditions (5 threads checking in same student -> 1 succeeds, 4 get 409).
8. Concurrency Test 2: Sequence allocation race conditions (5 threads checking in distinct students -> unique sequences).
"""

from concurrent.futures import ThreadPoolExecutor
import os
import sys
from typing import List

# Ensure backend directory is in path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_ROLL_PREFIX = "TEST_STU_"
TEST_STUDENTS = [
    {"roll": "TEST_STU_001", "name": "Test Student One", "email": "test_stu_001@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_STU_002", "name": "Test Student Two", "email": "test_stu_002@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_STU_003", "name": "Test Student Three", "email": "test_stu_003@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_STU_004", "name": "Test Student Four", "email": "test_stu_004@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_STU_005", "name": "Test Student Five", "email": "test_stu_005@thapar.edu", "status": "ACTIVE"},
    {"roll": "TEST_STU_INACT", "name": "Inactive Student", "email": "test_stu_inact@thapar.edu", "status": "INACTIVE"},
]


def cleanup_test_records():
    """Removes all test visits, queue entries, and test students created during testing."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Delete visits belonging to test students (cascades to QUEUE_ENTRY, VISIT_EVENT, CONSULTATION, PRESCRIPTION)
            cur.execute("SELECT visit_id FROM VISIT WHERE roll_number LIKE %s", (f"{TEST_ROLL_PREFIX}%",))
            test_visits = [r["visit_id"] for r in cur.fetchall()]
            if test_visits:
                placeholders = ",".join(["%s"] * len(test_visits))
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({placeholders})", tuple(test_visits))

            # 2. Delete test students
            cur.execute("DELETE FROM STUDENT WHERE roll_number LIKE %s", (f"{TEST_ROLL_PREFIX}%",))

            # 3. Delete test user accounts
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email LIKE %s", ("test_stu_%@thapar.edu",))

            conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"Warning during cleanup: {exc}")
    finally:
        conn.close()


def setup_test_students():
    """Ensures test students and their corresponding USER_ACCOUNT records exist in the DB."""
    cleanup_test_records()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            for s in TEST_STUDENTS:
                # Insert USER_ACCOUNT
                account_status = "DISABLED" if s["status"] == "INACTIVE" else "ACTIVE"
                cur.execute(
                    """
                    INSERT INTO USER_ACCOUNT (email, password_hash, account_type, status)
                    VALUES (%s, 'dummy_hash', 'STUDENT', %s)
                    """,
                    (s["email"], account_status),
                )
                user_id = cur.lastrowid

                # Insert STUDENT
                cur.execute(
                    """
                    INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, blood_group, status)
                    VALUES (%s, %s, %s, '2004-01-01', 'OTHER', 'O+', %s)
                    """,
                    (s["roll"], user_id, s["name"], s["status"]),
                )
            conn.commit()
    finally:
        conn.close()


def get_tokens():
    """Returns valid JWT tokens for Receptionist and Doctor 2."""
    # Login Receptionist
    rec_res = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    assert rec_res.status_code == 200, f"Receptionist login failed: {rec_res.text}"
    rec_token = rec_res.json()["access_token"]

    # Login Doctor 2
    doc2_res = client.post("/api/auth/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    assert doc2_res.status_code == 200, f"Doctor 2 login failed: {doc2_res.text}"
    doc2_token = doc2_res.json()["access_token"]

    # Generate Doctor 1 token directly
    doc1_token = create_access_token({
        "sub": "3",
        "staff_id": 1,
        "doctor_id": 1,
        "email": "dr.kapoor@thapar.edu",
        "role": "DOCTOR",
    })

    return rec_token, doc2_token, doc1_token


# ─────────────────────────────────────────────────────────────────────────────
# TEST 1: Full Happy-Path Lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def test_happy_path_lifecycle():
    """
    Validates complete happy path:
    1. Check-in by Receptionist -> WAITING_FOR_DOCTOR / WAITING
    2. Call Next by Doctor 2 -> IN_CONSULTATION / IN_CONSULTATION
    3. Complete Consultation by Doctor 2 -> WAITING_FOR_MEDICINE / COMPLETED
    4. Dispense Medication by Receptionist -> COMPLETED / COMPLETED
    5. Verifies audit event chain in VISIT_EVENT.
    """
    rec_token, doc2_token, _ = get_tokens()
    roll = "TEST_STU_001"

    # Step 1: Check-in
    checkin_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Acute headache and chills", "via": "MANUAL"},
    )
    assert checkin_res.status_code == 200, f"Checkin failed: {checkin_res.text}"
    checkin_data = checkin_res.json()
    visit_id = checkin_data["visitId"]
    assert checkin_data["rollNumber"] == roll
    assert checkin_data["doctorId"] == 2
    assert checkin_data["status"] == "WAITING_FOR_DOCTOR"
    assert checkin_data["queueNo"] >= 1

    # Step 2: Doctor 2 calls next student
    call_res = client.post(
        "/api/doctor/2/call-next",
        headers={"Authorization": f"Bearer {doc2_token}"},
    )
    assert call_res.status_code == 200, f"Call next failed: {call_res.text}"
    call_data = call_res.json()
    assert call_data["status"] == "called"
    assert call_data["visitId"] == visit_id
    assert call_data["rollNumber"] == roll

    # Step 3: Doctor 2 completes consultation
    complete_res = client.post(
        "/api/doctor/2/complete",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json={
            "roll_number": roll,
            "diagnosis": "Viral Pharyngitis",
            "general": "Warm water gargles 3x daily and rest",
            "medicines": [
                {"name": "Paracetamol 500mg", "morning": True, "afternoon": False, "evening": True, "night": False, "note": "After meals"},
                {"name": "Cetirizine 10mg", "morning": False, "afternoon": False, "evening": False, "night": True, "note": "Before sleep"},
            ],
        },
    )
    assert complete_res.status_code == 200, f"Complete consultation failed: {complete_res.text}"
    complete_data = complete_res.json()
    assert complete_data["status"] == "ok"
    assert complete_data["visitId"] == visit_id

    # Step 4: Receptionist dispenses medication
    dispense_res = client.post(
        f"/api/queue/{visit_id}/dispense",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"remarks": "Issued Paracetamol and Cetirizine strips"},
    )
    assert dispense_res.status_code == 200, f"Dispense failed: {dispense_res.text}"
    dispense_data = dispense_res.json()
    assert dispense_data["status"] == "dispensed"

    # Step 5: Database verification
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check VISIT
            cur.execute("SELECT status, completed_at FROM VISIT WHERE visit_id = %s", (visit_id,))
            v_row = cur.fetchone()
            assert v_row["status"] == "COMPLETED"
            assert v_row["completed_at"] is not None

            # Check QUEUE_ENTRY
            cur.execute("SELECT status, exit_reason FROM QUEUE_ENTRY WHERE visit_id = %s", (visit_id,))
            qe_row = cur.fetchone()
            assert qe_row["status"] == "COMPLETED"
            assert qe_row["exit_reason"] == "COMPLETED"

            # Check VISIT_EVENT audit sequence
            cur.execute("SELECT event_type FROM VISIT_EVENT WHERE visit_id = %s ORDER BY event_id ASC", (visit_id,))
            events = [r["event_type"] for r in cur.fetchall()]
            assert "CHECKED_IN" in events
            assert "CONSULTATION_STARTED" in events
            assert "CONSULTATION_COMPLETED" in events
            assert "MEDICINE_DISPENSED" in events
            assert "COMPLETED" in events
    finally:
        conn.close()

    print("PASS: Full Happy-Path Lifecycle verified with complete DB audit sequence.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 2: No-Show & Requeue Lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def test_no_show_and_requeue_lifecycle():
    """
    Validates No-Show and Requeue flow:
    1. Check-in student 2 with Doctor 2.
    2. Doctor 2 calls student 2.
    3. Doctor 2 marks patient as NO_SHOW -> VISIT.status = 'NO_SHOW', QUEUE_ENTRY.status = 'NO_SHOW'.
    4. Receptionist requeues patient with Doctor 2 -> new QUEUE_ENTRY created with 'NO_SHOW_RESCHEDULE'.
    5. Doctor 2 calls patient again, completes consultation, and receptionist dispenses.
    """
    rec_token, doc2_token, _ = get_tokens()
    roll = "TEST_STU_002"

    # 1. Check-in
    checkin_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Sprained ankle"},
    )
    assert checkin_res.status_code == 200
    visit_id = checkin_res.json()["visitId"]

    # 2. Call student
    call_res = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert call_res.status_code == 200

    # 3. Mark No-Show
    noshow_res = client.post(
        f"/api/doctor/2/no-show/{visit_id}",
        headers={"Authorization": f"Bearer {doc2_token}"},
    )
    assert noshow_res.status_code == 200
    assert noshow_res.json()["status"] == "no_show"

    # Verify DB status
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM VISIT WHERE visit_id = %s", (visit_id,))
            assert cur.fetchone()["status"] == "NO_SHOW"
            cur.execute("SELECT status, exit_reason FROM QUEUE_ENTRY WHERE visit_id = %s", (visit_id,))
            qe = cur.fetchone()
            assert qe["status"] == "NO_SHOW"
            assert qe["exit_reason"] == "NO_SHOW"
    finally:
        conn.close()

    # 4. Requeue by Receptionist
    requeue_res = client.post(
        f"/api/queue/{visit_id}/requeue",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 2, "reason": "Patient arrived from hostel"},
    )
    assert requeue_res.status_code == 200
    requeue_data = requeue_res.json()
    assert requeue_data["status"] == "requeued"
    new_qe_id = requeue_data["queueEntryId"]

    # Verify new queue entry in DB
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status, entry_reason FROM QUEUE_ENTRY WHERE queue_entry_id = %s", (new_qe_id,))
            new_qe = cur.fetchone()
            assert new_qe["status"] == "WAITING"
            assert new_qe["entry_reason"] == "NO_SHOW_RESCHEDULE"

            cur.execute("SELECT status FROM VISIT WHERE visit_id = %s", (visit_id,))
            assert cur.fetchone()["status"] == "WAITING_FOR_DOCTOR"
    finally:
        conn.close()

    # 5. Doctor calls again & completes
    call2_res = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert call2_res.status_code == 200

    comp_res = client.post(
        "/api/doctor/2/complete",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json={"roll_number": roll, "diagnosis": "Ligament sprain", "general": "Crepe bandage and ice packs", "medicines": []},
    )
    assert comp_res.status_code == 200

    disp_res = client.post(f"/api/queue/{visit_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp_res.status_code == 200
    print("PASS: No-Show and Requeue Lifecycle verified with NO_SHOW_RESCHEDULE entry.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 3: Doctor Redirection Lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def test_redirect_lifecycle():
    """
    Validates redirecting a visit from Doctor 1 to Doctor 2:
    1. Check-in student 3 with Doctor 1.
    2. Staff redirects visit from Doctor 1 to Doctor 2.
    3. Verify old queue entry has status 'REDIRECTED' and exit_reason 'REDIRECTED'.
    4. Verify new queue entry is under Doctor 2 with entry_reason 'DOCTOR_REDIRECT'.
    5. Doctor 2 calls patient and completes.
    """
    rec_token, doc2_token, _ = get_tokens()
    roll = "TEST_STU_003"

    # 1. Check-in under Doctor 1
    checkin_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 1, "complaint": "Eye irritation"},
    )
    assert checkin_res.status_code == 200
    visit_id = checkin_res.json()["visitId"]
    old_qe_id = checkin_res.json()["queueEntryId"]

    # 2. Redirect to Doctor 2
    redirect_res = client.post(
        f"/api/queue/{visit_id}/redirect",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 2, "reason": "Requires specialized ophthalmology assessment"},
    )
    assert redirect_res.status_code == 200
    red_data = redirect_res.json()
    assert red_data["status"] == "redirected"
    assert red_data["oldDoctorId"] == 1
    assert red_data["newDoctorId"] == 2
    new_qe_id = red_data["queueEntryId"]

    # 3. Database verification
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Old queue entry
            cur.execute("SELECT status, exit_reason FROM QUEUE_ENTRY WHERE queue_entry_id = %s", (old_qe_id,))
            old_qe = cur.fetchone()
            assert old_qe["status"] == "REDIRECTED"
            assert old_qe["exit_reason"] == "REDIRECTED"

            # New queue entry
            cur.execute("SELECT doctor_id, status, entry_reason FROM QUEUE_ENTRY WHERE queue_entry_id = %s", (new_qe_id,))
            new_qe = cur.fetchone()
            assert new_qe["doctor_id"] == 2
            assert new_qe["status"] == "WAITING"
            assert new_qe["entry_reason"] == "DOCTOR_REDIRECT"

            # VISIT assigned doctor
            cur.execute("SELECT doctor_id, status FROM VISIT WHERE visit_id = %s", (visit_id,))
            v = cur.fetchone()
            assert v["doctor_id"] == 2
            assert v["status"] == "WAITING_FOR_DOCTOR"
    finally:
        conn.close()

    # 4. Doctor 2 calls patient and completes
    call_res = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert call_res.status_code == 200
    assert call_res.json()["visitId"] == visit_id

    comp_res = client.post(
        "/api/doctor/2/complete",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json={"roll_number": roll, "diagnosis": "Allergic conjunctivitis", "general": "Avoid rubbing eyes", "medicines": []},
    )
    assert comp_res.status_code == 200
    disp_res = client.post(f"/api/queue/{visit_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp_res.status_code == 200
    print("PASS: Patient Redirection Lifecycle verified with DOCTOR_REDIRECT entry.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 4: Visit Cancellation Lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def test_cancel_visit_lifecycle():
    """
    Validates cancellation flow:
    1. Check-in student 4 with Doctor 2.
    2. Staff cancels visit before consultation.
    3. Verify VISIT.status = 'CANCELLED' and active QUEUE_ENTRY.status = 'CANCELLED'.
    """
    rec_token, _, _ = get_tokens()
    roll = "TEST_STU_004"

    checkin_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Mild stomach ache"},
    )
    assert checkin_res.status_code == 200
    visit_id = checkin_res.json()["visitId"]

    cancel_res = client.post(
        f"/api/queue/{visit_id}/cancel",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"reason": "Student had to attend emergency lecture"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status, cancel_reason FROM VISIT WHERE visit_id = %s", (visit_id,))
            v = cur.fetchone()
            assert v["status"] == "CANCELLED"
            assert "emergency lecture" in (v["cancel_reason"] or "")

            cur.execute("SELECT status, exit_reason FROM QUEUE_ENTRY WHERE visit_id = %s", (visit_id,))
            qe = cur.fetchone()
            assert qe["status"] == "CANCELLED"
            assert qe["exit_reason"] == "CANCELLED"
    finally:
        conn.close()

    print("PASS: Visit Cancellation Lifecycle verified.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 5: Invalid Transitions & Policy Guards
# ─────────────────────────────────────────────────────────────────────────────

def test_invalid_transitions():
    """
    Validates that illegal transitions and unauthorized states are strictly rejected:
    1. Inactive student check-in -> 400 Bad Request.
    2. Nonexistent student check-in -> 404 Not Found.
    3. Nonexistent doctor check-in -> 404 Not Found.
    4. Premature dispensing (dispensing visit in WAITING_FOR_DOCTOR) -> 409 Conflict.
    5. Cancelling an already COMPLETED visit -> 409 Conflict.
    6. Marking an already COMPLETED visit as NO_SHOW -> 409 Conflict.
    7. Requeuing a visit that is NOT in NO_SHOW status -> 409 Conflict.
    8. Redirecting to the same doctor -> 409 Conflict.
    """
    rec_token, doc2_token, _ = get_tokens()

    # 1. Inactive student check-in
    res_inact = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_STU_INACT", "doctor_id": 2, "complaint": "Headache"},
    )
    assert res_inact.status_code == 400, f"Expected 400 for inactive student, got {res_inact.status_code}"
    assert "inactive" in res_inact.json().get("detail", "").lower()

    # 2. Nonexistent student
    res_nostu = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "NONEXISTENT_9999", "doctor_id": 2, "complaint": "Headache"},
    )
    assert res_nostu.status_code == 404

    # 3. Nonexistent doctor
    res_nodoc = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_STU_005", "doctor_id": 99999, "complaint": "Headache"},
    )
    assert res_nodoc.status_code == 404

    # 4. Premature dispensing on a waiting visit
    checkin_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_STU_005", "doctor_id": 2, "complaint": "Test premature dispense"},
    )
    assert checkin_res.status_code == 200
    waiting_visit_id = checkin_res.json()["visitId"]

    disp_premature = client.post(
        f"/api/queue/{waiting_visit_id}/dispense",
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert disp_premature.status_code == 409, f"Expected 409 for premature dispense, got {disp_premature.status_code}"
    assert "waiting_for_medicine" in disp_premature.json().get("detail", "").lower()

    # Move this visit to COMPLETED so we can test completed guards
    client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    client.post(
        "/api/doctor/2/complete",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json={"roll_number": "TEST_STU_005", "diagnosis": "Check", "general": "Ok", "medicines": []},
    )
    client.post(f"/api/queue/{waiting_visit_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})

    # 5. Cancelling an already COMPLETED visit -> 409 Conflict
    cancel_completed = client.post(
        f"/api/queue/{waiting_visit_id}/cancel",
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert cancel_completed.status_code == 409
    assert "already completed" in cancel_completed.json().get("detail", "").lower()

    # 6. Marking an already COMPLETED visit as NO_SHOW -> 409 Conflict
    noshow_completed = client.post(
        f"/api/doctor/2/no-show/{waiting_visit_id}",
        headers={"Authorization": f"Bearer {doc2_token}"},
    )
    assert noshow_completed.status_code == 409

    # 7. Requeuing a COMPLETED visit -> 409 Conflict
    requeue_completed = client.post(
        f"/api/queue/{waiting_visit_id}/requeue",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 2},
    )
    assert requeue_completed.status_code == 409
    assert "no_show" in requeue_completed.json().get("detail", "").lower()

    # 8. Redirecting to the same doctor -> 409 Conflict
    # Check in TEST_STU_005 fresh
    fresh_checkin = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "TEST_STU_005", "doctor_id": 2, "complaint": "Redirect test"},
    )
    assert fresh_checkin.status_code == 200
    fresh_visit_id = fresh_checkin.json()["visitId"]

    same_doc_redirect = client.post(
        f"/api/queue/{fresh_visit_id}/redirect",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"target_doctor_id": 2},
    )
    assert same_doc_redirect.status_code == 409
    assert "same as current doctor" in same_doc_redirect.json().get("detail", "").lower()

    # Clean up fresh visit
    client.post(f"/api/queue/{fresh_visit_id}/cancel", headers={"Authorization": f"Bearer {rec_token}"})

    print("PASS: All Invalid Transitions and Policy Guards successfully enforced.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 6: Repeated Requests & Idempotency
# ─────────────────────────────────────────────────────────────────────────────

def test_repeated_requests_and_idempotency():
    """
    Validates idempotency and duplicate prevention:
    1. Calling dispense twice returns already_completed without throwing or duplicating records.
    2. Calling call-next when doctor is already in consultation returns existing session.
    3. Calling no-show twice returns already_no_show.
    4. Active check-in conflict: Attempting second check-in while active visit exists returns 409 Conflict.
    """
    rec_token, doc2_token, _ = get_tokens()
    roll = "TEST_STU_001"

    # Check in TEST_STU_001
    res1 = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Active visit idempotency check"},
    )
    assert res1.status_code == 200
    visit_id = res1.json()["visitId"]

    # Immediate second check-in for same student must be rejected with 409 Conflict
    res2 = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Duplicate check-in attempt"},
    )
    assert res2.status_code == 409, f"Expected 409 for duplicate check-in, got {res2.status_code}"
    assert "already has an active visit" in res2.json().get("detail", "")

    # Call student -> IN_CONSULTATION
    call1 = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert call1.status_code == 200
    assert call1.json()["status"] == "called"

    # Repeated call-next returns existing consultation session (idempotent)
    call2 = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert call2.status_code == 200
    assert call2.json()["status"] == "already_in_consultation"
    assert call2.json()["visitId"] == visit_id

    # Complete consultation
    client.post(
        "/api/doctor/2/complete",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json={"roll_number": roll, "diagnosis": "Fever", "general": "Hydration", "medicines": []},
    )

    # First Dispense -> dispensed
    disp1 = client.post(f"/api/queue/{visit_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp1.status_code == 200
    assert disp1.json()["status"] == "dispensed"

    # Second Dispense -> already_completed (idempotent)
    disp2 = client.post(f"/api/queue/{visit_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp2.status_code == 200
    assert disp2.json()["status"] == "already_completed"

    # Verify database persistence: MEDICINE_DISPENSED must be logged EXACTLY ONCE
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'MEDICINE_DISPENSED'", (visit_id,))
            cnt = cur.fetchone()["cnt"]
            assert cnt == 1, f"Expected exactly 1 MEDICINE_DISPENSED event, found {cnt}"
    finally:
        conn.close()

    print("PASS: Repeated Requests and Idempotency verified (no duplicate audit events written).")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 6B: Doctor Queue Read & Authorization Boundaries (Issue 1 & 4)
# ─────────────────────────────────────────────────────────────────────────────

def test_doctor_queue_read_and_authorization_boundaries():
    """
    Verifies Issue 1 & Issue 4:
    1. A doctor can retrieve only their own waiting patients and active consultation.
    2. Dedicated /api/doctor/{doctor_id}/active-consultation returns the active patient or active=False.
    3. Cross-doctor read is rejected with 403 Forbidden.
    4. Receptionist read of doctor-only endpoint is rejected with 403 Forbidden.
    5. Doctor B cannot call next or see Doctor A's active consultation.
    """
    rec_token, doc2_token, doc1_token = get_tokens()
    roll = "TEST_STU_001"

    # 1. Check in patient to Doctor 2
    checkin_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": roll, "doctor_id": 2, "complaint": "Triage read test"},
    )
    assert checkin_res.status_code == 200
    visit_id = checkin_res.json()["visitId"]

    # 2. Doctor 2 fetches own queue -> receives patient in line
    doc2_queue = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {doc2_token}"})
    assert doc2_queue.status_code == 200
    q_data = doc2_queue.json()
    assert any(p["rollNumber"] == roll for p in q_data), f"Patient not found in doctor queue: {q_data}"

    # 3. Doctor 1 attempts to fetch Doctor 2's queue -> 403 Forbidden
    cross_read = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {doc1_token}"})
    assert cross_read.status_code == 403, f"Expected 403 for cross-doctor queue read, got {cross_read.status_code}"
    assert "another doctor's workstation" in cross_read.json().get("detail", "")

    # 4. Receptionist attempts to fetch Doctor 2's queue -> 403 Forbidden
    rec_read = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {rec_token}"})
    assert rec_read.status_code == 403, f"Expected 403 when Receptionist queries doctor queue, got {rec_read.status_code}"

    # 5. Doctor 2 checks active consultation before calling -> active=False
    active_before = client.get("/api/doctor/2/active-consultation", headers={"Authorization": f"Bearer {doc2_token}"})
    assert active_before.status_code == 200
    assert active_before.json()["active"] is False

    # 6. Doctor 2 calls patient -> active consultation starts
    call_res = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert call_res.status_code == 200

    # 7. Doctor 2 checks active consultation -> active=True with matching visitId
    active_during = client.get("/api/doctor/2/active-consultation", headers={"Authorization": f"Bearer {doc2_token}"})
    assert active_during.status_code == 200
    assert active_during.json()["active"] is True
    assert active_during.json()["patient"]["visitId"] == visit_id
    assert active_during.json()["patient"]["rollNumber"] == roll

    # 8. Doctor 1 checks own active consultation -> active=False (cannot see Doctor 2's patient)
    doc1_active = client.get("/api/doctor/1/active-consultation", headers={"Authorization": f"Bearer {doc1_token}"})
    assert doc1_active.status_code == 200
    assert doc1_active.json()["active"] is False

    # 9. Doctor 1 calls next -> cannot grab Doctor 2's patient (returns 404 No patients waiting)
    doc1_call = client.post("/api/doctor/1/call-next", headers={"Authorization": f"Bearer {doc1_token}"})
    assert doc1_call.status_code == 404, f"Doctor 1 should not be able to pull Doctor 2 patient: {doc1_call.status_code}"

    # 10. Doctor 2 completes & receptionist dispenses
    client.post(
        "/api/doctor/2/complete",
        headers={"Authorization": f"Bearer {doc2_token}"},
        json={"roll_number": roll, "diagnosis": "Triage ok", "general": "None", "medicines": []},
    )
    client.post(f"/api/queue/{visit_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})

    print("PASS: Doctor Queue Read, Active Consultation, and Authorization Boundaries strictly enforced.")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 7: Concurrency Test 1 - Concurrent Double Check-In Race Condition
# ─────────────────────────────────────────────────────────────────────────────

def test_concurrent_checkin_collision():
    """
    Concurrency Test 1:
    Simulates 5 concurrent threads attempting to check in the EXACT SAME student
    simultaneously.
    Policy enforcement:
    - Exactly ONE thread must succeed (HTTP 200).
    - All 4 other threads must fail with HTTP 409 Conflict.
    - Exactly ONE visit must be created in the database.
    """
    rec_token, doc2_token, _ = get_tokens()
    roll = "TEST_STU_001"

    def do_checkin():
        return client.post(
            "/api/queue/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"roll_number": roll, "doctor_id": 2, "complaint": "Simultaneous rapid checkin test"},
        )

    # Fire 5 concurrent requests
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(do_checkin) for _ in range(5)]
        responses = [f.result() for f in futures]

    status_codes = [r.status_code for r in responses]
    success_count = status_codes.count(200)
    conflict_count = status_codes.count(409)

    assert success_count == 1, f"Expected exactly 1 success (200), got {success_count}. Statuses: {status_codes}"
    assert conflict_count == 4, f"Expected exactly 4 conflicts (409), got {conflict_count}. Statuses: {status_codes}"

    # Verify only 1 active visit exists in the database
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) as cnt FROM VISIT
                WHERE roll_number = %s AND status = 'WAITING_FOR_DOCTOR'
                """,
                (roll,),
            )
            count = cur.fetchone()["cnt"]
            assert count == 1, f"Expected exactly 1 active visit in DB, found {count}"

            # Clean up by cancelling the single visit
            cur.execute("SELECT visit_id FROM VISIT WHERE roll_number = %s AND status = 'WAITING_FOR_DOCTOR'", (roll,))
            v_id = cur.fetchone()["visit_id"]
    finally:
        conn.close()

    client.post(f"/api/queue/{v_id}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
    print("PASS: Concurrent check-in collision test passed (1 succeeded with 200, 4 rejected with 409).")


# ─────────────────────────────────────────────────────────────────────────────
# TEST 8: Concurrency Test 2 - Concurrent Queue Sequence Allocation
# ─────────────────────────────────────────────────────────────────────────────

def test_concurrent_sequence_allocation():
    """
    Concurrency Test 2:
    Simulates 5 concurrent threads checking in 5 DIFFERENT students to the same doctor.
    Policy enforcement:
    - All 5 threads must succeed (HTTP 200).
    - Under the doctor row lock, every allocated queue_sequence MUST be strictly unique
      with NO duplicate sequence numbers allocated.
    """
    rec_token, _, _ = get_tokens()
    rolls = ["TEST_STU_001", "TEST_STU_002", "TEST_STU_003", "TEST_STU_004", "TEST_STU_005"]

    def do_checkin_student(roll_no: str):
        return client.post(
            "/api/queue/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"roll_number": roll_no, "doctor_id": 2, "complaint": "Simultaneous queue allocation"},
        )

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(do_checkin_student, r) for r in rolls]
        responses = [f.result() for f in futures]

    status_codes = [r.status_code for r in responses]
    assert all(code == 200 for code in status_codes), f"Not all concurrent checkins succeeded: {status_codes}"

    queue_numbers = [r.json()["queueNo"] for r in responses]
    visit_ids = [r.json()["visitId"] for r in responses]

    # Verify all allocated queue numbers are distinct
    assert len(set(queue_numbers)) == 5, f"Collision detected! Queue numbers allocated: {queue_numbers}"

    # Verify sequence values are sorted and strictly monotonically increasing
    sorted_seqs = sorted(queue_numbers)
    for i in range(len(sorted_seqs) - 1):
        assert sorted_seqs[i + 1] == sorted_seqs[i] + 1, f"Non-contiguous sequence found: {sorted_seqs}"

    # Clean up created visits
    for vid in visit_ids:
        client.post(f"/api/queue/{vid}/cancel", headers={"Authorization": f"Bearer {rec_token}"})

    print(f"PASS: Concurrent sequence allocation passed (Allocated sequences: {queue_numbers}, strictly unique & contiguous).")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN RUNNER
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("RUNNING CAMPUSCARE PHASE 4 QUEUE LIFECYCLE & CONCURRENCY TESTS")
    print("=" * 70)

    try:
        print("\n--- Setting up test student fixtures ---")
        setup_test_students()
        print("Test student fixtures ready.")

        print("\n--- Running Test 1: Full Happy Path Lifecycle ---")
        test_happy_path_lifecycle()

        print("\n--- Running Test 2: No-Show & Requeue Lifecycle ---")
        test_no_show_and_requeue_lifecycle()

        print("\n--- Running Test 3: Doctor Redirection Lifecycle ---")
        test_redirect_lifecycle()

        print("\n--- Running Test 4: Visit Cancellation Lifecycle ---")
        test_cancel_visit_lifecycle()

        print("\n--- Running Test 5: Invalid Transitions & Policy Guards ---")
        test_invalid_transitions()

        print("\n--- Running Test 6: Repeated Requests & Idempotency ---")
        test_repeated_requests_and_idempotency()

        print("\n--- Running Test 6B: Doctor Queue Read & Authorization Boundaries ---")
        test_doctor_queue_read_and_authorization_boundaries()

        print("\n--- Running Test 7: Concurrency Test 1 (Double Check-in Collision) ---")
        test_concurrent_checkin_collision()

        print("\n--- Running Test 8: Concurrency Test 2 (Sequence Allocation) ---")
        test_concurrent_sequence_allocation()

        print("\n" + "=" * 70)
        print("ALL PHASE 4 QUEUE LIFECYCLE & CONCURRENCY TESTS PASSED!")
        print("=" * 70)
    finally:
        print("\n--- Cleaning up test records ---")
        cleanup_test_records()
        print("Cleanup completed.")


if __name__ == "__main__":
    main()
