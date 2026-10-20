"""
CampusCare Phase 8: Task 8.2 Remaining APIs Test Suite.

Verifies:
1. Student directory search and pagination (GET /api/reception/students).
2. Student medical profile and past visit history (GET /api/reception/students/{roll}/history).
3. Completed visits feed with dispensing details (GET /api/reception/visits/completed).
4. Activity audit stream from VISIT_EVENT (GET /api/reception/activity).
5. Terminal settings telemetry (GET /api/reception/settings).
6. Doctor availability management (POST /api/reception/doctors/{id}/availability).
7. RFID card enrollment and UID lookup (POST /api/reception/rfid/enroll & GET /api/reception/rfid/lookup/{uid}).
8. Emergency case updates (PUT /api/emergency/logs/{id}).
9. Role authorization guards: Staff permitted; students rejected (403); unauthenticated (401).
10. Validation & not-found guards (404, 422).
"""

import os
import sys
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_STUDENT_ROLL = "TEST_P8_REM_01"
TEST_STUDENT_NAME = "Remaining APIs Test Student"
TEST_STUDENT_EMAIL = "rem_test@thapar.edu"


def setup_fixtures():
    """Ensure dedicated fixtures exist for Task 8.2 tests."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Clean prior test artifacts
            cur.execute("SELECT emergency_id FROM EMERGENCY_LOG WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            e_ids = [r["emergency_id"] for r in cur.fetchall()]
            if e_ids:
                id_str = ",".join(map(str, e_ids))
                cur.execute(f"DELETE FROM AMBULANCE_DISPATCH WHERE emergency_id IN ({id_str})")
                cur.execute(f"DELETE FROM EMERGENCY_LOG WHERE emergency_id IN ({id_str})")

            cur.execute("DELETE FROM RFID_CARD WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            cur.execute("DELETE FROM EMERGENCY_CONTACT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            cur.execute("DELETE FROM ALLERGY WHERE roll_number = %s", (TEST_STUDENT_ROLL,))

            cur.execute("SELECT visit_id FROM VISIT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            v_ids = [r["visit_id"] for r in cur.fetchall()]
            if v_ids:
                id_str = ",".join(map(str, v_ids))
                cur.execute(f"DELETE FROM DISPENSING WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM CONSULTATION WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM QUEUE_ENTRY WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM VISIT_EVENT WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({id_str})")

            cur.execute("DELETE FROM STUDENT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))

            # 2. Create student
            cur.execute(
                "INSERT INTO USER_ACCOUNT (email, password_hash, account_type, status) VALUES (%s, 'dummyhash', 'STUDENT', 'ACTIVE')",
                (TEST_STUDENT_EMAIL,),
            )
            u_id = cur.lastrowid
            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, %s, '2004-03-21', 'A+', 'ACTIVE')
                """,
                (TEST_STUDENT_ROLL, u_id, TEST_STUDENT_NAME),
            )

            # 3. Add allergy & emergency contact
            cur.execute(
                "INSERT INTO ALLERGY (roll_number, allergen, reaction, severity, recorded_by_user_id) VALUES (%s, 'Sulfonamides', 'Erythema', 'MODERATE', 1)",
                (TEST_STUDENT_ROLL,),
            )
            cur.execute(
                "INSERT INTO EMERGENCY_CONTACT (roll_number, name, relationship, phone_number) VALUES (%s, 'Dr. H.S. Bawa', 'Uncle', '+91-9876511111')",
                (TEST_STUDENT_ROLL,),
            )

            # 4. Insert completed visit fixture
            cur.execute(
                """
                INSERT INTO VISIT (roll_number, doctor_id, status, checked_in_at, consultation_started_at, consultation_completed_at, completed_at)
                VALUES (%s, 1, 'COMPLETED', NOW(), NOW(), NOW(), NOW())
                """,
                (TEST_STUDENT_ROLL,),
            )
            vis_id = cur.lastrowid
            cur.execute(
                """
                INSERT INTO QUEUE_ENTRY (visit_id, doctor_id, queue_sequence, status, entered_at, queue_data, entry_reason)
                VALUES (%s, 1, 999, 'COMPLETED', NOW(), NOW(), 'INITIAL_CHECKIN')
                """,
                (vis_id,),
            )
            cur.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, created_at, notes)
                VALUES (%s, 'CHECKED_IN', 5, NOW(), 'Check-in - Viral throat infection')
                """,
                (vis_id,),
            )
            cur.execute(
                """
                INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, created_at, notes)
                VALUES (%s, 'COMPLETED', 5, NOW(), 'Visit completed and medicines dispensed')
                """,
                (vis_id,),
            )
            cur.execute(
                """
                INSERT INTO DISPENSING (visit_id, dispensed_by_staff_id, status, was_changed)
                VALUES (%s, 3, 'DISPENSED', FALSE)
                """,
                (vis_id,),
            )
        conn.commit()
    finally:
        conn.close()


def get_tokens():
    rec_token = create_access_token({"sub": "5", "staff_id": 3, "email": "reception@thapar.edu", "role": "RECEPTIONIST"})
    doc_token = create_access_token({"sub": "3", "staff_id": 1, "doctor_id": 1, "email": "dr.kapoor@thapar.edu", "role": "DOCTOR"})
    student_token = create_access_token({"sub": "999", "role": "STUDENT", "roll_number": TEST_STUDENT_ROLL})
    return rec_token, doc_token, student_token


def test_student_directory_and_search():
    print("\n--- Test 1: Student Directory Search & Pagination ---")
    setup_fixtures()
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # 1. List students (paginated)
    res = client.get("/api/reception/students?limit=10&offset=0", headers=headers)
    assert res.status_code == 200, f"Failed: {res.text}"
    data = res.json()
    assert "total" in data
    assert "students" in data
    assert isinstance(data["students"], list)
    assert data["limit"] == 10

    # 2. Search by roll number
    search_res = client.get(f"/api/reception/students?q={TEST_STUDENT_ROLL}", headers=headers)
    assert search_res.status_code == 200
    st_list = search_res.json()["students"]
    assert len(st_list) >= 1
    target = next((s for s in st_list if s["rollNumber"] == TEST_STUDENT_ROLL), None)
    assert target is not None
    assert target["name"] == TEST_STUDENT_NAME
    assert target["blood"] == "A+"
    assert target["emergencyContact"]["name"] == "Dr. H.S. Bawa"

    print("PASS: Student search and paginated directory verified.")


def test_student_history_and_profile():
    print("\n--- Test 2: Student History & Medical Profile ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # Fetch history
    res = client.get(f"/api/reception/students/{TEST_STUDENT_ROLL}/history", headers=headers)
    assert res.status_code == 200, f"Failed: {res.text}"
    profile = res.json()
    assert profile["rollNumber"] == TEST_STUDENT_ROLL
    assert profile["name"] == TEST_STUDENT_NAME
    assert len(profile["allergies"]) >= 1
    assert profile["allergies"][0]["allergen"] == "Sulfonamides"
    assert profile["emergencyContact"]["name"] == "Dr. H.S. Bawa"
    assert profile["pastVisitsCount"] >= 1
    assert profile["visits"][0]["status"] == "COMPLETED"

    # Nonexistent student -> 404
    missing = client.get("/api/reception/students/UNKNOWN_ROLL_9999/history", headers=headers)
    assert missing.status_code == 404

    print("PASS: Student medical telemetry, allergy list, and past visits verified.")


def test_completed_visits_feed():
    print("\n--- Test 3: Completed Visits Feed ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # Retrieve completed visits for today
    res = client.get("/api/reception/visits/completed?date=ALL", headers=headers)
    assert res.status_code == 200, f"Failed: {res.text}"
    visits = res.json()
    assert isinstance(visits, list)
    assert len(visits) >= 1

    target = next((v for v in visits if v["rollNumber"] == TEST_STUDENT_ROLL), None)
    assert target is not None
    assert target["name"] == TEST_STUDENT_NAME
    assert target["doctorName"] is not None
    assert target["dispensingStatus"] in ("Dispensed as prescribed", "Dispensed", "FULL")
    assert target["completedAt"] is not None

    print("PASS: Completed OPD visits feed and dispensing status verified.")


def test_activity_log_audit_feed():
    print("\n--- Test 4: Activity Audit Stream ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # Fetch activity log
    res = client.get("/api/reception/activity?date=ALL&limit=20", headers=headers)
    assert res.status_code == 200, f"Failed: {res.text}"
    events = res.json()
    assert isinstance(events, list)
    assert len(events) >= 1

    first = events[0]
    assert "kind" in first
    assert "text" in first
    assert "timestamp" in first
    assert "eventType" in first

    print("PASS: Front desk activity and audit feed verified from VISIT_EVENT.")


def test_terminal_settings_and_admin_operations():
    print("\n--- Test 5 & 6: Terminal Settings, Doctor Availability & RFID Enrollment ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # 1. Terminal Settings
    settings_res = client.get("/api/reception/settings", headers=headers)
    assert settings_res.status_code == 200
    s_data = settings_res.json()
    assert "station" in s_data
    assert "emergencyHotline" in s_data
    assert "activeDoctorsCount" in s_data

    # 2. Doctor Availability update
    avail_res = client.post(
        "/api/reception/doctors/1/availability",
        json={"status": "AVAILABLE"},
        headers=headers,
    )
    assert avail_res.status_code == 200
    assert avail_res.json()["status"] == "AVAILABLE"

    # 3. RFID Card Enrollment
    test_uid = "CARD_UID_TEST_888"
    enroll_res = client.post(
        "/api/reception/rfid/enroll",
        json={"roll_number": TEST_STUDENT_ROLL, "card_uid": test_uid},
        headers=headers,
    )
    assert enroll_res.status_code == 201
    assert enroll_res.json()["status"] == "ACTIVE"

    # 4. RFID Card Lookup
    lookup_res = client.get(f"/api/reception/rfid/lookup/{test_uid}", headers=headers)
    assert lookup_res.status_code == 200
    card_info = lookup_res.json()
    assert card_info["rollNumber"] == TEST_STUDENT_ROLL
    assert card_info["studentName"] == TEST_STUDENT_NAME

    # Lookup unknown card -> 404
    unknown_card = client.get("/api/reception/rfid/lookup/NONEXISTENT_CARD_000", headers=headers)
    assert unknown_card.status_code == 404

    print("PASS: Terminal settings, doctor availability toggles, and RFID enrollment/lookup verified.")


def test_emergency_log_updates():
    print("\n--- Test 7: Emergency Case Updates ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # 1. Create emergency
    create_res = client.post(
        "/api/emergency/logs",
        json={
            "roll_number": TEST_STUDENT_ROLL,
            "emergency_type": "Syncope",
            "description": "Dizziness in laboratory",
            "severity": "LOW",
            "action_taken": "Vitals checked",
            "ambulance_required": False,
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    emg_id = create_res.json()["emergency_id"]

    # 2. Update emergency notes and escalate severity to HIGH
    update_res = client.put(
        f"/api/emergency/logs/{emg_id}",
        json={
            "severity": "HIGH",
            "action_taken": "Condition worsened, IV access established, 500ml Normal Saline infused",
            "description": "Hypotensive episode confirmed, BP 85/50",
            "ambulance_required": True,
        },
        headers=headers,
    )
    assert update_res.status_code == 200, f"Update failed: {update_res.text}"
    updated = update_res.json()
    assert updated["severity"] == "HIGH"
    assert "IV access established" in updated["action_taken"]
    assert updated["ambulance_required"] is True
    assert updated["ambulance"] is not None

    # Invalid severity -> 422
    bad_sev = client.put(f"/api/emergency/logs/{emg_id}", json={"severity": "INVALID_SEV"}, headers=headers)
    assert bad_sev.status_code == 422

    print("PASS: Emergency case update and triage escalation verified.")


def test_role_authorization_guards():
    print("\n--- Test 8: Role Authorization Guards ---")
    _, _, student_token = get_tokens()

    # Student forbidden from viewing completed visits
    st_res = client.get("/api/reception/visits/completed", headers={"Authorization": f"Bearer {student_token}"})
    assert st_res.status_code == 403

    # Student forbidden from viewing activity log
    st_act = client.get("/api/reception/activity", headers={"Authorization": f"Bearer {student_token}"})
    assert st_act.status_code == 403

    # Student forbidden from enrolling RFID
    st_rfid = client.post(
        "/api/reception/rfid/enroll",
        json={"roll_number": TEST_STUDENT_ROLL, "card_uid": "TEST"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert st_rfid.status_code == 403

    # Unauthenticated rejected with 401
    no_auth = client.get("/api/reception/students")
    assert no_auth.status_code == 401

    print("PASS: Role guards strictly enforced across remaining receptionist APIs.")


def cleanup_fixtures():
    setup_fixtures()


if __name__ == "__main__":
    print("=" * 75)
    print("RUNNING CAMPUSCARE PHASE 8: REMAINING APIS TEST SUITE (TASK 8.2)")
    print("=" * 75)

    test_student_directory_and_search()
    test_student_history_and_profile()
    test_completed_visits_feed()
    test_activity_log_audit_feed()
    test_terminal_settings_and_admin_operations()
    test_emergency_log_updates()
    test_role_authorization_guards()

    cleanup_fixtures()

    print("=" * 75)
    print("ALL PHASE 8 REMAINING APIS TESTS PASSED SUCCESSFULLY!")
    print("=" * 75)
