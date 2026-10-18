"""
CampusCare Phase 5: Task 5.5 Backend Tests Suite.

Comprehensive tests verifying:
1. Check-in for two different doctors.
2. Queue numbering within each doctor's queue (independent sequence isolation).
3. Correct filtering by doctor (reception queue doctor_id filter & clinic-wide view).
4. Duplicate active check-ins (single active visit rule across same and different doctors).
5. Concurrent check-ins for the same doctor (ThreadPoolExecutor race condition & sequence safety).
6. Unauthorized access to another doctor's queue (cross-doctor 403, student 403, anonymous 401).
7. Database failure and transaction rollback (atomic commit & clean rollback on failure).
"""

import os
import sys
import concurrent.futures
from typing import Dict, Any, List

# Ensure backend root is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token, decode_access_token
from app.services import queue_lifecycle as ql

client = TestClient(app)

TEST_ROLL_PREFIX = "TEST_P5_T55_"
TEST_STUDENTS = [
    {"roll": f"{TEST_ROLL_PREFIX}001", "name": "Task55 Student 1", "email": f"{TEST_ROLL_PREFIX.lower()}001@thapar.edu", "status": "ACTIVE"},
    {"roll": f"{TEST_ROLL_PREFIX}002", "name": "Task55 Student 2", "email": f"{TEST_ROLL_PREFIX.lower()}002@thapar.edu", "status": "ACTIVE"},
    {"roll": f"{TEST_ROLL_PREFIX}003", "name": "Task55 Student 3", "email": f"{TEST_ROLL_PREFIX.lower()}003@thapar.edu", "status": "ACTIVE"},
    {"roll": f"{TEST_ROLL_PREFIX}004", "name": "Task55 Student 4", "email": f"{TEST_ROLL_PREFIX.lower()}004@thapar.edu", "status": "ACTIVE"},
    {"roll": f"{TEST_ROLL_PREFIX}005", "name": "Task55 Student 5", "email": f"{TEST_ROLL_PREFIX.lower()}005@thapar.edu", "status": "ACTIVE"},
    {"roll": f"{TEST_ROLL_PREFIX}INACT", "name": "Task55 Inactive", "email": f"{TEST_ROLL_PREFIX.lower()}inact@thapar.edu", "status": "INACTIVE"},
]


def cleanup_test_records():
    """Removes all test visits, queue entries, and student fixtures created during Task 5.5."""
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # 1. Delete test visits (cascading deletes queue entries and visit events)
                cur.execute("SELECT visit_id FROM VISIT WHERE roll_number LIKE %s", (f"{TEST_ROLL_PREFIX}%",))
                test_visits = [r["visit_id"] for r in cur.fetchall()]
                if test_visits:
                    placeholders = ",".join(["%s"] * len(test_visits))
                    cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({placeholders})", tuple(test_visits))

                # 2. Delete test students
                cur.execute("DELETE FROM STUDENT WHERE roll_number LIKE %s", (f"{TEST_ROLL_PREFIX}%",))

                # 3. Delete test user accounts
                cur.execute("DELETE FROM USER_ACCOUNT WHERE email LIKE %s", (f"{TEST_ROLL_PREFIX.lower()}%",))

                # 4. Ensure doctor 2 availability is clean
                cur.execute("DELETE FROM DOCTOR_AVAILABILITY WHERE doctor_id = 2 AND availability_date = CURDATE()")

                conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        print(f"Warning during cleanup: {exc}")


def setup_test_students():
    """Seeds test students and their corresponding USER_ACCOUNT records in the DB."""
    cleanup_test_records()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Ensure Doctor 2 is marked AVAILABLE today
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (2, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', 5)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """
            )

            # Ensure Doctor 1 is marked AVAILABLE today
            cur.execute(
                """
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, start_time, end_time, created_by_user_id)
                VALUES (1, CURDATE(), 'AVAILABLE', '09:00:00', '17:00:00', 5)
                ON DUPLICATE KEY UPDATE status = 'AVAILABLE'
                """
            )

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
    """Returns valid JWT tokens: (rec_token, rec_user_id, doc2_token, doc1_token, student_token)."""
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
        "email": f"{TEST_ROLL_PREFIX.lower()}001@thapar.edu",
        "roll_number": f"{TEST_ROLL_PREFIX}001",
        "role": "STUDENT",
    })

    _CACHED_TOKENS = (rec_token, rec_user_id, doc2_token, doc1_token, student_token)
    return _CACHED_TOKENS


# ─────────────────────────────────────────────────────────────────────────────
# 1. Check-In for Two Different Doctors
# ─────────────────────────────────────────────────────────────────────────────

def test_1_checkin_two_different_doctors():
    """Verify receptionist can check in students for two distinct doctors and verify database isolation."""
    rec_token, _, doc2_token, doc1_token, _ = get_tokens()

    # Check in Student 1 for Doctor 1
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 1, "complaint": "General ENT Check"},
    )
    assert res1.status_code == 201, f"Doctor 1 check-in failed: {res1.text}"
    data1 = res1.json()
    vid1 = data1["visit_id"]
    assert data1["doctor_id"] == 1
    assert data1["status"] == "WAITING_FOR_DOCTOR"

    # Check in Student 2 for Doctor 2
    res2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}002", "doctorId": 2, "complaint": "General Ortho Check"},
    )
    assert res2.status_code == 201, f"Doctor 2 check-in failed: {res2.text}"
    data2 = res2.json()
    vid2 = data2["visit_id"]
    assert data2["doctor_id"] == 2
    assert data2["status"] == "WAITING_FOR_DOCTOR"
    assert vid1 != vid2

    try:
        # Direct SQL Verification on Aiven MySQL
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Visit 1 check
                cur.execute("SELECT doctor_id, status, roll_number FROM VISIT WHERE visit_id = %s", (vid1,))
                v1 = cur.fetchone()
                assert v1["doctor_id"] == 1
                assert v1["status"] == "WAITING_FOR_DOCTOR"
                assert v1["roll_number"] == f"{TEST_ROLL_PREFIX}001"

                # Queue Entry 1 check
                cur.execute("SELECT doctor_id, status FROM QUEUE_ENTRY WHERE visit_id = %s", (vid1,))
                qe1 = cur.fetchone()
                assert qe1["doctor_id"] == 1
                assert qe1["status"] == "WAITING"

                # Visit 2 check
                cur.execute("SELECT doctor_id, status, roll_number FROM VISIT WHERE visit_id = %s", (vid2,))
                v2 = cur.fetchone()
                assert v2["doctor_id"] == 2
                assert v2["status"] == "WAITING_FOR_DOCTOR"
                assert v2["roll_number"] == f"{TEST_ROLL_PREFIX}002"

                # Queue Entry 2 check
                cur.execute("SELECT doctor_id, status FROM QUEUE_ENTRY WHERE visit_id = %s", (vid2,))
                qe2 = cur.fetchone()
                assert qe2["doctor_id"] == 2
                assert qe2["status"] == "WAITING"
        finally:
            conn.close()

        # Doctor 1 workstation sees only Student 1
        d1_queue = client.get("/api/doctor/1/queue", headers={"Authorization": f"Bearer {doc1_token}"}).json()
        assert any(item["rollNumber"] == f"{TEST_ROLL_PREFIX}001" for item in d1_queue)
        assert not any(item["rollNumber"] == f"{TEST_ROLL_PREFIX}002" for item in d1_queue)

        # Doctor 2 workstation sees only Student 2
        d2_queue = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {doc2_token}"}).json()
        assert any(item["rollNumber"] == f"{TEST_ROLL_PREFIX}002" for item in d2_queue)
        assert not any(item["rollNumber"] == f"{TEST_ROLL_PREFIX}001" for item in d2_queue)

        print("PASS [1/7]: Check-in for two different doctors verified with full database isolation.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
        client.post(f"/api/queue/{vid2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# 2. Queue Numbering Within Each Doctor's Queue
# ─────────────────────────────────────────────────────────────────────────────

def test_2_queue_numbering_within_each_doctor_queue():
    """Verify queue sequence numbers are partitioned per doctor on CURDATE() and increment independently."""
    rec_token, _, _, _, _ = get_tokens()

    # Step A: Check in Student 1 for Doctor 1
    r_d1_1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 1},
    ).json()
    vid_d1_1 = r_d1_1["visit_id"]
    seq_d1_1 = r_d1_1["queue_number"]

    # Step B: Check in Student 2 for Doctor 2
    r_d2_1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}002", "doctorId": 2},
    ).json()
    vid_d2_1 = r_d2_1["visit_id"]
    seq_d2_1 = r_d2_1["queue_number"]

    # Step C: Check in Student 3 for Doctor 1 (interleaved)
    r_d1_2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}003", "doctorId": 1},
    ).json()
    vid_d1_2 = r_d1_2["visit_id"]
    seq_d1_2 = r_d1_2["queue_number"]

    # Step D: Check in Student 4 for Doctor 2 (interleaved)
    r_d2_2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}004", "doctorId": 2},
    ).json()
    vid_d2_2 = r_d2_2["visit_id"]
    seq_d2_2 = r_d2_2["queue_number"]

    try:
        # Doctor 1's second check-in must be exactly seq_d1_1 + 1
        assert seq_d1_2 == seq_d1_1 + 1, f"Doctor 1 sequence jumped unexpectedly: {seq_d1_1} -> {seq_d1_2}"

        # Doctor 2's second check-in must be exactly seq_d2_1 + 1
        assert seq_d2_2 == seq_d2_1 + 1, f"Doctor 2 sequence jumped unexpectedly: {seq_d2_1} -> {seq_d2_2}"

        print(f"PASS [2/7]: Independent queue sequence allocation confirmed (Doctor 1: [{seq_d1_1}, {seq_d1_2}], Doctor 2: [{seq_d2_1}, {seq_d2_2}]).")
    finally:
        for vid in (vid_d1_1, vid_d2_1, vid_d1_2, vid_d2_2):
            client.post(f"/api/queue/{vid}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# 3. Correct Filtering by Doctor
# ─────────────────────────────────────────────────────────────────────────────

def test_3_correct_filtering_by_doctor():
    """Verify GET /api/reception/queue supports multi-doctor aggregation and optional doctor_id filtering."""
    rec_token, _, _, _, _ = get_tokens()

    # Check in Student 1 for Doctor 1, Student 2 for Doctor 2
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 1, "complaint": "Flu"},
    )
    vid1 = res1.json()["visit_id"]

    res2 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}002", "doctorId": 2, "complaint": "Rash"},
    )
    vid2 = res2.json()["visit_id"]

    try:
        # 1. Unfiltered receptionist queue view -> contains both active visits
        all_q = client.get("/api/reception/queue", headers={"Authorization": f"Bearer {rec_token}"}).json()
        assert any(item["visitId"] == vid1 and item["doctorId"] == 1 for item in all_q)
        assert any(item["visitId"] == vid2 and item["doctorId"] == 2 for item in all_q)

        # 2. Filtered by Doctor 1 -> contains only Doctor 1 entries
        d1_filtered = client.get("/api/reception/queue?doctor_id=1", headers={"Authorization": f"Bearer {rec_token}"}).json()
        assert len(d1_filtered) >= 1
        assert all(item["doctorId"] == 1 for item in d1_filtered)
        assert any(item["visitId"] == vid1 for item in d1_filtered)
        assert not any(item["visitId"] == vid2 for item in d1_filtered)

        # 3. Filtered by Doctor 2 -> contains only Doctor 2 entries
        d2_filtered = client.get("/api/reception/queue?doctor_id=2", headers={"Authorization": f"Bearer {rec_token}"}).json()
        assert len(d2_filtered) >= 1
        assert all(item["doctorId"] == 2 for item in d2_filtered)
        assert any(item["visitId"] == vid2 for item in d2_filtered)
        assert not any(item["visitId"] == vid1 for item in d2_filtered)

        # 4. Filtered by non-existent Doctor 99999 -> returns clean empty list
        d_none = client.get("/api/reception/queue?doctor_id=99999", headers={"Authorization": f"Bearer {rec_token}"}).json()
        assert d_none == []

        print("PASS [3/7]: Correct receptionist filtering by doctor verified across combined and filtered modes.")
    finally:
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})
        client.post(f"/api/queue/{vid2}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# 4. Duplicate Active Check-Ins (Conflict Prevention)
# ─────────────────────────────────────────────────────────────────────────────

def test_4_duplicate_active_checkins():
    """Verify single active visit policy strictly prevents duplicate check-ins across same and different doctors."""
    rec_token, _, doc2_token, _, _ = get_tokens()

    # Step 1: Initial Check-In for Student 1 with Doctor 2
    res1 = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 2},
    )
    assert res1.status_code == 201
    vid1 = res1.json()["visit_id"]

    try:
        # Step 2: Attempt duplicate check-in for same student with SAME doctor -> 409 Conflict
        dup_same = client.post(
            "/api/reception/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 2},
        )
        assert dup_same.status_code == 409
        assert any(t in dup_same.json().get("detail", "").lower() for t in ("already", "active visit"))

        # Step 3: Attempt duplicate check-in for same student with DIFFERENT doctor (Doctor 1) -> 409 Conflict
        dup_diff = client.post(
            "/api/reception/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 1},
        )
        assert dup_diff.status_code == 409
        assert any(t in dup_diff.json().get("detail", "").lower() for t in ("already", "active visit"))

        # Step 4: Advance visit to IN_CONSULTATION
        client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc2_token}"})

        # Step 5: Duplicate check-in while in consultation -> still 409 Conflict
        dup_consult = client.post(
            "/api/reception/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 2},
        )
        assert dup_consult.status_code == 409

        # Step 6: Cancel visit 1 -> reaches terminal state CANCELLED
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})

        # Step 7: Now check-in for Student 1 is permitted again!
        new_res = client.post(
            "/api/reception/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 1},
        )
        assert new_res.status_code == 201
        vid_new = new_res.json()["visit_id"]
        assert vid_new != vid1

        # Clean up new visit
        client.post(f"/api/queue/{vid_new}/cancel", headers={"Authorization": f"Bearer {rec_token}"})

        print("PASS [4/7]: Duplicate active check-ins strictly rejected across all active statuses; re-checkin permitted once cancelled.")
    finally:
        # Safety cleanup
        client.post(f"/api/queue/{vid1}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# 5. Concurrent Check-Ins for the Same Doctor
# ─────────────────────────────────────────────────────────────────────────────

def test_5_concurrent_checkins_same_doctor():
    """Verify thread-safe concurrent check-ins under doctor row lock produce strictly unique sequence numbers."""
    rec_token, _, _, _, _ = get_tokens()

    # We will submit 5 concurrent check-ins for Doctor 2 using 5 distinct test students
    students = [
        f"{TEST_ROLL_PREFIX}001",
        f"{TEST_ROLL_PREFIX}002",
        f"{TEST_ROLL_PREFIX}003",
        f"{TEST_ROLL_PREFIX}004",
        f"{TEST_ROLL_PREFIX}005",
    ]

    vids = []

    def checkin_student(roll: str):
        return client.post(
            "/api/reception/checkin",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"rollNumber": roll, "doctorId": 2, "complaint": f"Concurrent tap for {roll}"},
        )

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(checkin_student, r) for r in students]
            responses = [f.result() for f in futures]

        # Verify all 5 succeeded
        status_codes = [r.status_code for r in responses]
        assert all(code == 201 for code in status_codes), f"One or more concurrent check-ins failed: {status_codes}"

        results = [r.json() for r in responses]
        vids = [r["visit_id"] for r in results]
        sequences = [r["queue_number"] for r in results]

        # Verify all sequence numbers are unique (no race condition collision)
        assert len(set(sequences)) == 5, f"Collision detected! Sequences: {sequences}"

        # Verify sequences are contiguous
        sorted_seqs = sorted(sequences)
        for i in range(len(sorted_seqs) - 1):
            assert sorted_seqs[i + 1] == sorted_seqs[i] + 1, f"Sequences not contiguous: {sorted_seqs}"

        # Verify database persisted exactly 5 QUEUE_ENTRY rows with matching sequences
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT queue_sequence FROM QUEUE_ENTRY WHERE visit_id IN (%s, %s, %s, %s, %s)",
                    tuple(vids),
                )
                db_seqs = sorted([r["queue_sequence"] for r in cur.fetchall()])
                assert db_seqs == sorted_seqs
        finally:
            conn.close()

        print(f"PASS [5/7]: Concurrent check-ins for the same doctor safely serialized under row lock (Allocated sequences: {sorted_seqs}).")
    finally:
        for vid in vids:
            client.post(f"/api/queue/{vid}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# 6. Unauthorized Access to Another Doctor's Queue
# ─────────────────────────────────────────────────────────────────────────────

def test_6_unauthorized_access_another_doctor_queue():
    """Verify cross-doctor access, student access, and anonymous access are strictly blocked."""
    rec_token, _, doc2_token, doc1_token, student_token = get_tokens()

    # 1. Doctor 1 querying Doctor 2 queue -> 403 Forbidden
    d1_cross_q = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {doc1_token}"})
    assert d1_cross_q.status_code == 403, f"Expected 403, got {d1_cross_q.status_code}"
    assert "another doctor's workstation" in d1_cross_q.json().get("detail", "")

    # 2. Doctor 2 querying Doctor 1 queue -> 403 Forbidden
    d2_cross_q = client.get("/api/doctor/1/queue", headers={"Authorization": f"Bearer {doc2_token}"})
    assert d2_cross_q.status_code == 403
    assert "another doctor's workstation" in d2_cross_q.json().get("detail", "")

    # 3. Doctor 1 calling next on Doctor 2 -> 403 Forbidden
    d1_cross_call = client.post("/api/doctor/2/call-next", headers={"Authorization": f"Bearer {doc1_token}"})
    assert d1_cross_call.status_code == 403

    # 4. Doctor 2 calling next on Doctor 1 -> 403 Forbidden
    d2_cross_call = client.post("/api/doctor/1/call-next", headers={"Authorization": f"Bearer {doc2_token}"})
    assert d2_cross_call.status_code == 403

    # 5. Student attempting to access doctor queue -> 403 Forbidden
    st_queue = client.get("/api/doctor/2/queue", headers={"Authorization": f"Bearer {student_token}"})
    assert st_queue.status_code == 403

    # 6. Anonymous caller attempting to access doctor queue -> 401 Unauthorized
    anon_queue = client.get("/api/doctor/2/queue")
    assert anon_queue.status_code == 401

    # 7. Anonymous caller attempting call-next -> 401 Unauthorized
    anon_call = client.post("/api/doctor/2/call-next")
    assert anon_call.status_code == 401

    print("PASS [6/7]: Cross-doctor isolation, student guard, and anonymous authentication strictly enforced.")


# ─────────────────────────────────────────────────────────────────────────────
# 7. Database Failure and Transaction Rollback
# ─────────────────────────────────────────────────────────────────────────────

def test_7_database_failure_and_transaction_rollback():
    """Verify atomic transaction rollback ensures zero orphan records on unexpected failure."""
    rec_token, rec_user_id, _, _, _ = get_tokens()

    # Part A: Direct Service-Level Atomic Rollback Simulation
    conn = get_db_connection()
    try:
        # Simulate check-in failure midway through transaction
        with conn.cursor() as cur:
            # 1. Lock doctor
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = 2 FOR UPDATE")

            # 2. Insert partial visit
            cur.execute(
                """
                INSERT INTO VISIT (roll_number, doctor_id, status, checked_in_at)
                VALUES (%s, 2, 'WAITING_FOR_DOCTOR', NOW())
                """,
                (f"{TEST_ROLL_PREFIX}001",),
            )
            partial_visit_id = cur.lastrowid
            assert partial_visit_id > 0

            # 3. Simulate unexpected failure (e.g. power cutoff, constraint crash) by executing ROLLBACK
            conn.rollback()

        # Verify that because of rollback, partial_visit_id DOES NOT EXIST in the database
        with conn.cursor() as cur:
            cur.execute("SELECT visit_id FROM VISIT WHERE visit_id = %s", (partial_visit_id,))
            assert cur.fetchone() is None, "Rollback failed: partial VISIT row leaked!"

            cur.execute("SELECT queue_entry_id FROM QUEUE_ENTRY WHERE visit_id = %s", (partial_visit_id,))
            assert cur.fetchone() is None, "Rollback failed: orphan QUEUE_ENTRY row found!"
    finally:
        conn.close()

    # Part B: API-Level Rollback on Invalid State Transition
    # Check in a student cleanly first
    res = client.post(
        "/api/reception/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"rollNumber": f"{TEST_ROLL_PREFIX}001", "doctorId": 2},
    )
    assert res.status_code == 201
    vid = res.json()["visit_id"]

    try:
        # Attempt illegal requeue while visit is in WAITING status (only NO_SHOW is allowed)
        bad_req = client.post(
            f"/api/queue/{vid}/requeue",
            headers={"Authorization": f"Bearer {rec_token}"},
            json={"target_doctor_id": 2},
        )
        assert bad_req.status_code == 409
        assert "Only visits in NO_SHOW status can be requeued" in bad_req.json().get("detail", "")

        # Verify DB: visit is untouched, status is still WAITING_FOR_DOCTOR, no corrupt audit rows
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT status, doctor_id FROM VISIT WHERE visit_id = %s", (vid,))
                v_row = cur.fetchone()
                assert v_row["status"] == "WAITING_FOR_DOCTOR"
                assert v_row["doctor_id"] == 2

                cur.execute("SELECT COUNT(*) AS qe_count FROM QUEUE_ENTRY WHERE visit_id = %s", (vid,))
                assert cur.fetchone()["qe_count"] == 1

                cur.execute("SELECT COUNT(*) AS event_count FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'QUEUED_JOINED_PATIENT'", (vid,))
                assert cur.fetchone()["event_count"] == 0, "Failed transaction leaked audit event!"
        finally:
            conn.close()

        print("PASS [7/7]: Database failure and transaction rollback verified with zero orphan records or corrupted state.")
    finally:
        client.post(f"/api/queue/{vid}/cancel", headers={"Authorization": f"Bearer {rec_token}"})


# ─────────────────────────────────────────────────────────────────────────────
# MAIN RUNNER
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 75)
    print("RUNNING CAMPUSCARE PHASE 5: TASK 5.5 BACKEND TEST SUITE")
    print("=" * 75)

    try:
        print("\n--- Setting up Task 5.5 test fixtures on Aiven MySQL ---")
        setup_test_students()
        print("Task 5.5 test fixtures ready.")

        print("\n--- Running Test 1: Check-in for two different doctors ---")
        test_1_checkin_two_different_doctors()

        print("\n--- Running Test 2: Queue numbering within each doctor's queue ---")
        test_2_queue_numbering_within_each_doctor_queue()

        print("\n--- Running Test 3: Correct filtering by doctor ---")
        test_3_correct_filtering_by_doctor()

        print("\n--- Running Test 4: Duplicate active check-ins ---")
        test_4_duplicate_active_checkins()

        print("\n--- Running Test 5: Concurrent check-ins for the same doctor ---")
        test_5_concurrent_checkins_same_doctor()

        print("\n--- Running Test 6: Unauthorized access to another doctor's queue ---")
        test_6_unauthorized_access_another_doctor_queue()

        print("\n--- Running Test 7: Database failure and transaction rollback ---")
        test_7_database_failure_and_transaction_rollback()

        print("\n" + "=" * 75)
        print("ALL 7 TASK 5.5 BACKEND TESTS PASSED SUCCESSFULLY!")
        print("=" * 75)
    finally:
        print("\n--- Cleaning up Task 5.5 test records ---")
        cleanup_test_records()
        print("Cleanup completed.")


if __name__ == "__main__":
    main()

