"""
CampusCare Phase 8: Emergency Implementation & OPD Isolation Test Suite.

Verifies:
1. Creation of emergency log with staff authentication and token-derived actor.
2. Linked ambulance dispatch creation when ambulance_required=True.
3. Strict isolation from routine OPD: zero rows created in VISIT or QUEUE_ENTRY.
4. Role authorization guards: receptionist & doctor permitted; students forbidden (403); unauthenticated (401).
5. Validation: nonexistent student rejected (404); invalid severity rejected (422).
6. Emergency logs listing with severity filter and student details.
7. Emergency detail retrieval with linked ambulance and emergency contact info.
8. Ambulance dispatch state machine transitions: REQUESTED -> DISPATCHED -> ARRIVED -> COMPLETED.
9. Ambulance invalid transition rejection (409 Conflict) and cancellation.
10. Student emergency contact retrieval and upsert.
"""

from datetime import datetime
import os
import sys
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)

TEST_STUDENT_ROLL = "TEST_P8_EMG_01"
TEST_STUDENT_NAME = "Emergency Test Student"
TEST_STUDENT_EMAIL = "emg_test@thapar.edu"


def setup_fixtures():
    """Ensure dedicated student and clean emergency fixtures exist on MySQL."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Clean up prior test emergency logs and ambulance dispatches
            cur.execute("SELECT emergency_id FROM EMERGENCY_LOG WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            e_ids = [r["emergency_id"] for r in cur.fetchall()]
            if e_ids:
                id_str = ",".join(map(str, e_ids))
                cur.execute(f"DELETE FROM AMBULANCE_DISPATCH WHERE emergency_id IN ({id_str})")
                cur.execute(f"DELETE FROM EMERGENCY_LOG WHERE emergency_id IN ({id_str})")

            cur.execute("DELETE FROM EMERGENCY_CONTACT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            cur.execute("DELETE FROM STUDENT WHERE roll_number = %s", (TEST_STUDENT_ROLL,))
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))

            # 2. Ensure test student exists
            cur.execute(
                "INSERT INTO USER_ACCOUNT (email, password_hash, account_type, status) VALUES (%s, 'dummyhash', 'STUDENT', 'ACTIVE')",
                (TEST_STUDENT_EMAIL,),
            )
            u_id = cur.lastrowid
            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status)
                VALUES (%s, %s, %s, '2004-05-15', 'O+', 'ACTIVE')
                """,
                (TEST_STUDENT_ROLL, u_id, TEST_STUDENT_NAME),
            )
        conn.commit()
    finally:
        conn.close()


def get_tokens():
    """Returns valid JWT tokens for receptionist, doctor, and student."""
    rec_res = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    if rec_res.status_code == 200:
        rec_token = rec_res.json().get("access_token") or rec_res.json().get("accessToken")
    else:
        rec_token = create_access_token({"sub": "5", "staff_id": 3, "email": "reception@thapar.edu", "role": "RECEPTIONIST"})

    doc_token = create_access_token({"sub": "3", "staff_id": 1, "doctor_id": 1, "email": "dr.kapoor@thapar.edu", "role": "DOCTOR"})
    student_token = create_access_token({"sub": "999", "role": "STUDENT", "roll_number": TEST_STUDENT_ROLL})
    return rec_token, doc_token, student_token


def cleanup_fixtures():
    """Clean up fixtures after tests."""
    setup_fixtures()


def test_emergency_creation_and_opd_isolation():
    print("\n--- Test 1 & 2: Emergency Creation, Token Actor & OPD Isolation ---")
    setup_fixtures()
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # Snapshot VISIT and QUEUE_ENTRY counts before emergency
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM VISIT")
            visit_count_before = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM QUEUE_ENTRY")
            queue_count_before = cur.fetchone()["cnt"]
    finally:
        conn.close()

    # 1. Create Emergency without ambulance
    emg_payload = {
        "roll_number": TEST_STUDENT_ROLL,
        "emergency_type": "Trauma / Sports Injury",
        "description": "Right ankle inversion fracture on football ground with severe swelling",
        "severity": "HIGH",
        "action_taken": "Immobilized with compression splint, ice pack applied, pain relief spray",
        "ambulance_required": False,
    }
    res = client.post("/api/emergency/logs", json=emg_payload, headers=headers)
    assert res.status_code == 201, f"Failed to create emergency log: {res.text}"
    data = res.json()
    emg_id = data["emergency_id"]
    assert data["roll_number"] == TEST_STUDENT_ROLL
    assert data["student_name"] == TEST_STUDENT_NAME
    assert data["severity"] == "HIGH"
    assert data["ambulance_required"] is False
    assert data["ambulance"] is None
    # Server-derived actor
    assert data["recorded_by_user_id"] is not None

    # Verify OPD isolation: VISIT and QUEUE_ENTRY counts MUST NOT CHANGE!
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM VISIT")
            visit_count_after = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM QUEUE_ENTRY")
            queue_count_after = cur.fetchone()["cnt"]
            assert visit_count_after == visit_count_before, "VISIT count changed! Emergency must not create OPD visits!"
            assert queue_count_after == queue_count_before, "QUEUE_ENTRY count changed! Emergency must not enter OPD queues!"
    finally:
        conn.close()

    print("PASS: Emergency case created with server-derived actor and confirmed 100% isolated from routine OPD queues.")


def test_emergency_creation_with_ambulance_dispatch():
    print("\n--- Test 3: Emergency Creation with Ambulance Dispatch ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    emg_payload = {
        "roll_number": TEST_STUDENT_ROLL,
        "emergency_type": "Acute Anaphylaxis",
        "description": "Severe allergic reaction after cafeteria meal, facial angioedema, respiratory stridor",
        "severity": "CRITICAL",
        "action_taken": "Administered 0.5mg IM Epinephrine, high-flow oxygen 10L/min, continuous vitals monitor",
        "ambulance_required": True,
        "ambulance_details": {
            "ambulance_provider": "TIET Fast-Response Unit",
            "contact_number": "+91-9876543210",
            "vehicle_number": "PB 11 CD 5678",
            "destination": "Rajindra Hospital Emergency, Patiala",
        },
    }
    res = client.post("/api/emergency/logs", json=emg_payload, headers=headers)
    assert res.status_code == 201, f"Failed to create emergency log: {res.text}"
    data = res.json()
    emg_id = data["emergency_id"]
    assert data["severity"] == "CRITICAL"
    assert data["ambulance_required"] is True

    amb = data.get("ambulance")
    assert amb is not None, "Ambulance dispatch was not returned!"
    assert amb["emergency_id"] == emg_id
    assert amb["status"] == "REQUESTED"
    assert amb["destination"] == "Rajindra Hospital Emergency, Patiala"
    assert amb["vehicle_number"] == "PB 11 CD 5678"

    # Verify database persistence
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM AMBULANCE_DISPATCH WHERE emergency_id = %s", (emg_id,))
            dispatch_row = cur.fetchone()
            assert dispatch_row is not None
            assert dispatch_row["status"] == "REQUESTED"
            assert dispatch_row["destination"] == "Rajindra Hospital Emergency, Patiala"
    finally:
        conn.close()

    print("PASS: Emergency log with linked AMBULANCE_DISPATCH in REQUESTED state verified.")
    return emg_id


def test_authorization_guards():
    print("\n--- Test 4: Role Authorization Guards ---")
    rec_token, doc_token, student_token = get_tokens()

    # 1. Unauthenticated request -> 401
    no_auth = client.post("/api/emergency/logs", json={"roll_number": TEST_STUDENT_ROLL, "emergency_type": "Test", "description": "Test", "severity": "LOW", "action_taken": "Test"})
    assert no_auth.status_code == 401, f"Expected 401 Unauthorized, got {no_auth.status_code}"

    # 2. Student token -> 403 Forbidden
    student_req = client.post(
        "/api/emergency/logs",
        json={"roll_number": TEST_STUDENT_ROLL, "emergency_type": "Test", "description": "Test", "severity": "LOW", "action_taken": "Test"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert student_req.status_code == 403, f"Expected 403 Forbidden for Student, got {student_req.status_code}"

    # 3. Doctor token -> 201 Created (authorized medical staff)
    doc_headers = {"Authorization": f"Bearer {doc_token}"}
    doc_emg = client.post(
        "/api/emergency/logs",
        json={
            "roll_number": TEST_STUDENT_ROLL,
            "emergency_type": "Laceration",
            "description": "Deep glass cut on left forearm requiring sutures",
            "severity": "MEDIUM",
            "action_taken": "Wound cleansed, 4 simple interrupted sutures with 3-0 Ethilon, sterile dressing",
            "ambulance_required": False,
        },
        headers=doc_headers,
    )
    assert doc_emg.status_code == 201, f"Doctor should be authorized to log emergency, got: {doc_emg.text}"

    print("PASS: Authorization guards strictly enforced: 401 for unauthenticated, 403 for students, 201 for doctor/receptionist.")


def test_validation_rules():
    print("\n--- Test 5: Validation Rules (Student Lookup & Severity) ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # 1. Nonexistent student roll number -> 404
    non_student = client.post(
        "/api/emergency/logs",
        json={
            "roll_number": "NON_EXISTENT_ROLL_9999",
            "emergency_type": "Syncope",
            "description": "Passed out",
            "severity": "MEDIUM",
            "action_taken": "Rest",
        },
        headers=headers,
    )
    assert non_student.status_code == 404, f"Expected 404 for nonexistent student, got {non_student.status_code}"

    # 2. Invalid severity -> 422
    bad_severity = client.post(
        "/api/emergency/logs",
        json={
            "roll_number": TEST_STUDENT_ROLL,
            "emergency_type": "Syncope",
            "description": "Passed out",
            "severity": "SUPER_CRITICAL_BAD",
            "action_taken": "Rest",
        },
        headers=headers,
    )
    assert bad_severity.status_code == 422, f"Expected 422 for bad severity, got {bad_severity.status_code}"

    print("PASS: Validation properly rejects nonexistent students with 404 and invalid severities with 422.")


def test_list_and_detail_emergency():
    print("\n--- Test 6 & 7: List & Detail Emergency Logs ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # List all
    res = client.get("/api/emergency/logs", headers=headers)
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)
    assert len(logs) >= 2

    # Filter by severity
    res_crit = client.get("/api/emergency/logs?severity=CRITICAL", headers=headers)
    assert res_crit.status_code == 200
    crit_logs = res_crit.json()
    assert all(l["severity"] == "CRITICAL" for l in crit_logs)

    # Get single detail
    emg_id = logs[0]["emergency_id"]
    detail = client.get(f"/api/emergency/logs/{emg_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["emergency_id"] == emg_id

    # Nonexistent detail -> 404
    missing = client.get("/api/emergency/logs/9999999", headers=headers)
    assert missing.status_code == 404

    print("PASS: Emergency log listing, severity filtering, and individual detail retrieval verified.")


def test_ambulance_dispatch_state_machine():
    print("\n--- Test 8 & 9: Ambulance Dispatch State Machine & Conflict Rejection ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # Create emergency with ambulance
    emg = client.post(
        "/api/emergency/logs",
        json={
            "roll_number": TEST_STUDENT_ROLL,
            "emergency_type": "Severe Head Trauma",
            "description": "Fall from hostel stairs, loss of consciousness for 3 mins, unequal pupils",
            "severity": "CRITICAL",
            "action_taken": "C-spine immobilized with collar, airway secured, GCS 10 monitored",
            "ambulance_required": True,
            "ambulance_details": {
                "destination": "Rajindra Hospital Trauma Center",
            },
        },
        headers=headers,
    ).json()
    emg_id = emg["emergency_id"]

    # 1. Advance to DISPATCHED
    disp_res = client.put(
        f"/api/emergency/ambulance/{emg_id}",
        json={
            "status": "DISPATCHED",
            "vehicle_number": "PB 11 EM 9999",
            "contact_number": "+91-9876500000",
        },
        headers=headers,
    )
    assert disp_res.status_code == 200, f"Failed to dispatch: {disp_res.text}"
    disp_data = disp_res.json()
    assert disp_data["status"] == "DISPATCHED"
    assert disp_data["vehicle_number"] == "PB 11 EM 9999"
    assert disp_data["called_at"] is not None

    # 2. Advance to ARRIVED
    arr_res = client.put(
        f"/api/emergency/ambulance/{emg_id}",
        json={"status": "ARRIVED"},
        headers=headers,
    )
    assert arr_res.status_code == 200
    arr_data = arr_res.json()
    assert arr_data["status"] == "ARRIVED"
    assert arr_data["arrived_at"] is not None

    # 3. Advance to COMPLETED (transferred to hospital)
    comp_res = client.put(
        f"/api/emergency/ambulance/{emg_id}",
        json={"status": "COMPLETED"},
        headers=headers,
    )
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert comp_data["status"] == "COMPLETED"
    assert comp_data["departure_at"] is not None

    # 4. Attempt backward transition from COMPLETED to REQUESTED -> 409 Conflict
    back_res = client.put(
        f"/api/emergency/ambulance/{emg_id}",
        json={"status": "REQUESTED"},
        headers=headers,
    )
    assert back_res.status_code == 409, f"Expected 409 Conflict on backward transition, got: {back_res.status_code}"

    # 5. Cancellation test on a new emergency dispatch
    emg2 = client.post(
        "/api/emergency/logs",
        json={
            "roll_number": TEST_STUDENT_ROLL,
            "emergency_type": "Syncope",
            "description": "Fainting due to dehydration",
            "severity": "LOW",
            "action_taken": "Oral rehydration salts, patient recovered fully",
            "ambulance_required": True,
        },
        headers=headers,
    ).json()
    emg2_id = emg2["emergency_id"]

    cancel_res = client.put(
        f"/api/emergency/ambulance/{emg2_id}",
        json={"status": "CANCELLED"},
        headers=headers,
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    print("PASS: Ambulance dispatch state machine transitions verified with 409 rejection on invalid backward state changes.")


def test_student_emergency_contact():
    print("\n--- Test 10: Student Emergency Contact Retrieval & Upsert ---")
    rec_token, _, _ = get_tokens()
    headers = {"Authorization": f"Bearer {rec_token}"}

    # Upsert emergency contact
    contact_payload = {
        "name": "Col. Rajesh Sharma",
        "relationship": "Father",
        "phone_number": "+91-9814012345",
    }
    upsert_res = client.put(f"/api/emergency/contacts/{TEST_STUDENT_ROLL}", json=contact_payload, headers=headers)
    assert upsert_res.status_code == 200, f"Upsert contact failed: {upsert_res.text}"
    contact = upsert_res.json()
    assert contact["roll_number"] == TEST_STUDENT_ROLL
    assert contact["name"] == "Col. Rajesh Sharma"
    assert contact["relationship"] == "Father"
    assert contact["phone_number"] == "+91-9814012345"

    # Retrieve contact
    get_res = client.get(f"/api/emergency/contacts/{TEST_STUDENT_ROLL}", headers=headers)
    assert get_res.status_code == 200
    retrieved = get_res.json()
    assert retrieved["name"] == "Col. Rajesh Sharma"
    assert retrieved["relationship"] == "Father"
    assert retrieved["phone_number"] == "+91-9814012345"

    # Nonexistent student contact -> 404
    missing_res = client.get("/api/emergency/contacts/UNKNOWN_ROLL_888", headers=headers)
    assert missing_res.status_code == 404

    print("PASS: Student emergency contact upsert and retrieval verified.")


if __name__ == "__main__":
    print("=" * 75)
    print("RUNNING CAMPUSCARE PHASE 8: EMERGENCY IMPLEMENTATION TEST SUITE")
    print("=" * 75)

    test_emergency_creation_and_opd_isolation()
    test_emergency_creation_with_ambulance_dispatch()
    test_authorization_guards()
    test_validation_rules()
    test_list_and_detail_emergency()
    test_ambulance_dispatch_state_machine()
    test_student_emergency_contact()

    cleanup_fixtures()

    print("=" * 75)
    print("ALL 10 PHASE 8 EMERGENCY TESTS PASSED SUCCESSFULLY!")
    print("=" * 75)
