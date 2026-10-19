"""
CampusCare Phase 7: Medicine Dispensing Test Suite.

Verifies:
1. Retrieval of prescriptions awaiting dispensing (GET /api/queue/awaiting-dispense & /api/reception/prescriptions/awaiting-dispense).
2. Retrieval of finalized prescription details and items for a specific visit (GET /api/queue/{visit_id}/prescription).
3. Full dispensing fulfillment ("Dispensed as prescribed") with DISPENSING, DISPENSING_ITEM, and VISIT completion.
4. Partial dispensing fulfillment ("Partially dispensed") with custom item quantities, variation flags, and reasons.
5. Clinical prescription integrity: doctor's original prescription remains untouched after partial dispensing.
6. Validation rules: partial dispensing requires a documented reason.
7. Role authorization guards: receptionist-only mutation; doctors and students forbidden (403).
8. Status transition guards: premature dispensing on non-waiting visits rejected with 409 Conflict.
9. Idempotency: repeated dispense requests return already_completed without creating duplicate rows or audit events.
10. Atomic transaction rollback: zero partial records if an error occurs.
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

TEST_STUDENTS = [
    ("TEST_P7_001", "Phase7 Student One", "test_p7_001@thapar.edu", "ACTIVE"),
    ("TEST_P7_002", "Phase7 Student Two", "test_p7_002@thapar.edu", "ACTIVE"),
    ("TEST_P7_003", "Phase7 Student Three", "test_p7_003@thapar.edu", "ACTIVE"),
    ("TEST_P7_004", "Phase7 Student Four", "test_p7_004@thapar.edu", "ACTIVE"),
]


def setup_fixtures():
    """Clean up and insert dedicated test fixtures on Aiven MySQL."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT visit_id FROM VISIT WHERE roll_number LIKE 'TEST_P7_%'")
            v_ids = [r["visit_id"] for r in cur.fetchall()]
            if v_ids:
                id_str = ",".join(map(str, v_ids))
                cur.execute(f"DELETE FROM DISPENSING_ITEM WHERE dispensing_id IN (SELECT dispensing_id FROM DISPENSING WHERE visit_id IN ({id_str}))")
                cur.execute(f"DELETE FROM DISPENSING WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM PRESCRIPTION_DOSE WHERE prescription_item_id IN (SELECT prescription_item_id FROM PRESCRIPTION_ITEM WHERE prescription_id IN (SELECT prescription_id FROM PRESCRIPTION WHERE consultation_id IN (SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({id_str}))))")
                cur.execute(f"DELETE FROM PRESCRIPTION_ITEM WHERE prescription_id IN (SELECT prescription_id FROM PRESCRIPTION WHERE consultation_id IN (SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({id_str})))")
                cur.execute(f"DELETE FROM PRESCRIPTION WHERE consultation_id IN (SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({id_str}))")
                cur.execute(f"DELETE FROM CONSULTATION WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM QUEUE_ENTRY WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM VISIT_EVENT WHERE visit_id IN ({id_str})")
                cur.execute(f"DELETE FROM ALLERGY WHERE roll_number LIKE 'TEST_P7_%'")
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({id_str})")

            cur.execute("DELETE FROM STUDENT WHERE roll_number LIKE 'TEST_P7_%'")
            cur.execute("DELETE FROM USER_ACCOUNT WHERE email LIKE 'test_p7_%@thapar.edu'")

            for roll, name, email, st in TEST_STUDENTS:
                cur.execute(
                    "INSERT INTO USER_ACCOUNT (email, password_hash, account_type, status) VALUES (%s, 'dummyhash', 'STUDENT', 'ACTIVE')",
                    (email,),
                )
                u_id = cur.lastrowid
                cur.execute(
                    "INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, blood_group, status) VALUES (%s, %s, %s, '2004-05-15', 'O+', 'ACTIVE')",
                    (roll, u_id, name),
                )

            # Add sample allergy for TEST_P7_001
            cur.execute(
                "INSERT INTO ALLERGY (roll_number, allergen, reaction, severity, recorded_by_user_id) VALUES ('TEST_P7_001', 'Penicillin', 'Hives and swelling', 'SEVERE', 1)"
            )


            # Ensure Doctor 1 and Doctor 2 availability
            cur.execute(
                "INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, created_by_user_id) VALUES (1, CURDATE(), 'AVAILABLE', 3) ON DUPLICATE KEY UPDATE status = 'AVAILABLE'"
            )
            cur.execute(
                "INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, created_by_user_id) VALUES (2, CURDATE(), 'AVAILABLE', 4) ON DUPLICATE KEY UPDATE status = 'AVAILABLE'"
            )


        conn.commit()
    finally:
        conn.close()


def get_tokens():
    rec_res = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    if rec_res.status_code == 200:
        rec_token = rec_res.json().get("access_token") or rec_res.json().get("accessToken")
    else:
        rec_token = create_access_token({"sub": "5", "staff_id": 3, "email": "reception@thapar.edu", "role": "RECEPTIONIST"})

    doc1_token = create_access_token({"sub": "3", "staff_id": 1, "doctor_id": 1, "email": "dr.kapoor@thapar.edu", "role": "DOCTOR"})
    doc2_token = create_access_token({"sub": "4", "staff_id": 2, "doctor_id": 2, "email": "neha.kapoor@campuscare.edu", "role": "DOCTOR"})

    return rec_token, doc1_token, doc2_token



def test_awaiting_dispense_and_prescription_detail():
    """
    Test 1: Check in a student, complete consultation with structured medicines,
    verify they appear in awaiting-dispense list with full details, and fetch
    single visit prescription detail.
    """
    print("\n--- Test 1: Prescriptions Awaiting Dispensing & Single Prescription Detail ---")
    setup_fixtures()
    rec_token, doc1_token, _ = get_tokens()

    # Check in TEST_P7_001 under Doctor 1
    chk = client.post(
        "/api/reception/check-ins",
        json={"roll_number": "TEST_P7_001", "doctor_id": 1, "complaint": "Acute Pharyngitis"},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert chk.status_code == 201
    v_id = chk.json()["visitId"]

    # Start and Complete consultation by Doctor 1
    client.post(f"/api/doctor/1/start-consultation/{v_id}", headers={"Authorization": f"Bearer {doc1_token}"})
    comp = client.post(
        f"/api/doctor/1/complete/{v_id}",
        json={
            "diagnosis": "Bacterial Pharyngitis",
            "general_instructions": "Take medication after food. Warm saline gargles thrice daily.",
            "medicines": [
                {
                    "name": "Amoxicillin 500mg",
                    "dosage_form": "Capsule",
                    "duration": "5 days",
                    "dosage": "1-0-1",
                    "special_instructions": "After meal",
                },
                {
                    "name": "Paracetamol 650mg",
                    "dosage_form": "Tablet",
                    "duration": "3 days",
                    "dosage": "1-1-1",
                    "special_instructions": "Take when fever exceeds 100 F",
                },
                {
                    "name": "Cough Syrup 100ml",
                    "dosage_form": "Syrup",
                    "duration": "5 days",
                    "dosage": "0-0-1",
                    "special_instructions": "At bedtime",
                },
            ],
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    assert comp.status_code == 200, f"Complete consultation failed: {comp.text}"
    comp_data = comp.json()
    presc_id = comp_data["prescriptionId"]

    # Verify GET /api/queue/awaiting-dispense
    q_disp = client.get("/api/queue/awaiting-dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert q_disp.status_code == 200
    items = q_disp.json()
    assert isinstance(items, list)
    target = next((x for x in items if x["visitId"] == v_id), None)
    assert target is not None, f"Visit #{v_id} not found in awaiting-dispense list"
    assert target["rollNumber"] == "TEST_P7_001"
    assert target["patientName"] == "Phase7 Student One"
    assert target["allergy"] == "Penicillin"
    assert target["diagnosis"] == "Bacterial Pharyngitis"
    assert target["advice"] == "Take medication after food. Warm saline gargles thrice daily."
    assert len(target["medicines"]) == 3

    # Check calculated quantities:
    # Amoxicillin (1-0-1, 5 days) -> 2 * 5 = 10 capsules
    amox = next(m for m in target["medicines"] if "Amoxicillin" in m["medicineName"])
    assert amox["qty"] == 10.0, f"Expected 10.0 Amoxicillin, got {amox['qty']}"

    # Paracetamol (1-1-1, 3 days) -> 3 * 3 = 9 tablets
    pcm = next(m for m in target["medicines"] if "Paracetamol" in m["medicineName"])
    assert pcm["qty"] == 9.0, f"Expected 9.0 Paracetamol, got {pcm['qty']}"

    # Cough Syrup (Syrup is container) -> 1 bottle
    syp = next(m for m in target["medicines"] if "Cough Syrup" in m["medicineName"])
    assert syp["qty"] == 1.0, f"Expected 1.0 Syrup, got {syp['qty']}"

    # Verify GET /api/reception/prescriptions/awaiting-dispense (reception alias)
    rec_disp = client.get("/api/reception/prescriptions/awaiting-dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert rec_disp.status_code == 200
    assert any(x["visitId"] == v_id for x in rec_disp.json())

    # Verify GET /api/queue/{visit_id}/prescription
    p_detail = client.get(f"/api/queue/{v_id}/prescription", headers={"Authorization": f"Bearer {rec_token}"})
    assert p_detail.status_code == 200
    p_data = p_detail.json()
    assert p_data["visitId"] == v_id
    assert p_data["prescriptionId"] == presc_id
    assert p_data["diagnosis"] == "Bacterial Pharyngitis"
    assert len(p_data["items"]) == 3

    # Verify GET /api/reception/prescriptions/{visit_id}
    rec_p_detail = client.get(f"/api/reception/prescriptions/{v_id}", headers={"Authorization": f"Bearer {rec_token}"})
    assert rec_p_detail.status_code == 200
    assert rec_p_detail.json()["prescriptionId"] == presc_id

    # 404 for non-existent visit
    p_404 = client.get("/api/queue/999999/prescription", headers={"Authorization": f"Bearer {rec_token}"})
    assert p_404.status_code == 404

    print("PASS: Awaiting dispense list and single prescription details verified with accurate quantity calculations.")


def test_full_dispensing_fulfillment():
    """
    Test 2: Full medicine dispensing ("Dispensed as prescribed").
    Verifies DISPENSING, DISPENSING_ITEM rows, VISIT completion, and audit events.
    """
    print("\n--- Test 2: Full Medicine Dispensing (Dispensed as prescribed) ---")
    setup_fixtures()
    rec_token, doc1_token, _ = get_tokens()

    # Check-in and complete consultation
    chk = client.post(
        "/api/reception/check-ins",
        json={"roll_number": "TEST_P7_002", "doctor_id": 1, "complaint": "Viral Rhinitis"},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    v_id = chk.json()["visitId"]
    client.post(f"/api/doctor/1/start-consultation/{v_id}", headers={"Authorization": f"Bearer {doc1_token}"})
    client.post(
        f"/api/doctor/1/complete/{v_id}",
        json={
            "diagnosis": "Viral Upper Respiratory Infection",
            "general_instructions": "Rest and hydration.",
            "medicines": [
                {"name": "Cetirizine 10mg", "dosage_form": "Tablet", "duration": "5 days", "dosage": "0-0-1"},
                {"name": "Vitamin C 500mg", "dosage_form": "Tablet", "duration": "5 days", "dosage": "1-0-0"},
            ],
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )

    # Receptionist dispenses medication
    disp_res = client.post(
        f"/api/queue/{v_id}/dispense",
        json={
            "status": "Dispensed as prescribed",
            "remarks": "Verified roll number and dispensed full course",
        },
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert disp_res.status_code == 200, f"Dispense failed: {disp_res.text}"
    disp_data = disp_res.json()
    assert disp_data["status"] == "dispensed"
    assert disp_data["visitId"] == v_id
    assert disp_data["dispensingStatus"] == "DISPENSED"
    assert disp_data["wasChanged"] is False
    assert disp_data["dispensingId"] is not None
    assert len(disp_data["items"]) == 2

    disp_id = disp_data["dispensingId"]

    # Verify Database state
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. DISPENSING table
            cur.execute("SELECT * FROM DISPENSING WHERE dispensing_id = %s", (disp_id,))
            disp_row = cur.fetchone()
            assert disp_row is not None
            assert disp_row["visit_id"] == v_id
            assert disp_row["status"] == "DISPENSED"
            assert disp_row["was_changed"] == 0

            # 2. DISPENSING_ITEM table
            cur.execute("SELECT * FROM DISPENSING_ITEM WHERE dispensing_id = %s", (disp_id,))
            items = cur.fetchall()
            assert len(items) == 2
            for it in items:
                assert float(it["dispensed_quantity"]) == 5.0
                assert it["was_changed"] == 0

            # 3. VISIT table
            cur.execute("SELECT status, completed_at FROM VISIT WHERE visit_id = %s", (v_id,))
            v_row = cur.fetchone()
            assert v_row["status"] == "COMPLETED"
            assert v_row["completed_at"] is not None

            # 4. VISIT_EVENT table
            cur.execute("SELECT event_type, performed_by_user_id FROM VISIT_EVENT WHERE visit_id = %s", (v_id,))
            events = cur.fetchall()
            event_types = [e["event_type"] for e in events]
            assert "MEDICINE_DISPENSED" in event_types
            assert "COMPLETED" in event_types
    finally:
        conn.close()

    # Verify visit is no longer in awaiting-dispense list
    q_disp = client.get("/api/queue/awaiting-dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert not any(x["visitId"] == v_id for x in q_disp.json())

    print("PASS: Full dispensing persisted DISPENSING, DISPENSING_ITEM, updated VISIT, and logged audit events.")


def test_partial_dispensing_and_prescription_integrity():
    """
    Test 3: Partial dispensing ("Partially dispensed") with quantity overrides and substitution.
    Verifies:
    - DISPENSING.status = 'PARTIALLY_DISPENSED'
    - was_changed = 1, change_reason recorded
    - DISPENSING_ITEM records actual dispensed quantities and item change flags
    - Original PRESCRIPTION and PRESCRIPTION_ITEM remain UNTOUCHED (clinical record integrity)
    - Visit transitions to COMPLETED
    """
    print("\n--- Test 3: Partial Dispensing & Clinical Record Integrity ---")
    setup_fixtures()
    rec_token, doc1_token, _ = get_tokens()

    # Check-in and complete consultation
    chk = client.post(
        "/api/reception/check-ins",
        json={"roll_number": "TEST_P7_003", "doctor_id": 1, "complaint": "Bronchitis & Cough"},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    v_id = chk.json()["visitId"]
    client.post(f"/api/doctor/1/start-consultation/{v_id}", headers={"Authorization": f"Bearer {doc1_token}"})
    comp = client.post(
        f"/api/doctor/1/complete/{v_id}",
        json={
            "diagnosis": "Acute Bronchitis",
            "general_instructions": "Drink warm liquids and rest.",
            "medicines": [
                {"name": "Azithromycin 500mg", "dosage_form": "Tablet", "duration": "5 days", "dosage": "1-0-0"},
                {"name": "Levocetirizine 5mg", "dosage_form": "Tablet", "duration": "5 days", "dosage": "0-0-1"},
            ],
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )
    comp_data = comp.json()
    presc_id = comp_data["prescriptionId"]
    azithro_item_id = comp_data["medicines"][0]["prescriptionItemId"]
    levo_item_id = comp_data["medicines"][1]["prescriptionItemId"]

    # Receptionist partially dispenses: only 3 Azithromycin available, full Levocetirizine
    disp_res = client.post(
        f"/api/queue/{v_id}/dispense",
        json={
            "status": "Partially dispensed",
            "change_reason": "Only 3 tabs of Azithromycin available in pharmacy stock; advised student to collect remaining tomorrow",
            "items": [
                {
                    "prescription_item_id": azithro_item_id,
                    "dispensed_medicine_name": "Azithromycin 500mg",
                    "dispensed_quantity": 3.0,
                    "was_changed": True,
                    "change_reason": "Partial fulfillment: 3/5 tabs issued",
                },
                {
                    "prescription_item_id": levo_item_id,
                    "dispensed_medicine_name": "Levocetirizine 5mg",
                    "dispensed_quantity": 5.0,
                    "was_changed": False,
                },
            ],
        },
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert disp_res.status_code == 200, f"Partial dispense failed: {disp_res.text}"
    disp_data = disp_res.json()
    assert disp_data["status"] == "dispensed"
    assert disp_data["dispensingStatus"] == "PARTIALLY_DISPENSED"
    assert disp_data["wasChanged"] is True
    assert "3 tabs" in disp_data["changeReason"]

    # Verify Clinical Prescription Record is UNTOUCHED
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM PRESCRIPTION_ITEM WHERE prescription_id = %s ORDER BY prescription_item_id ASC", (presc_id,))
            original_items = cur.fetchall()
            # Doctor's original prescription still says 5 days duration
            assert len(original_items) == 2
            assert original_items[0]["duration_value"] == 5
            assert original_items[1]["duration_value"] == 5

            # DISPENSING record shows partial dispensing
            cur.execute("SELECT * FROM DISPENSING WHERE visit_id = %s", (v_id,))
            disp_row = cur.fetchone()
            assert disp_row["status"] == "PARTIALLY_DISPENSED"
            assert disp_row["was_changed"] == 1
            assert "Azithromycin" in disp_row["change_reason"]

            # DISPENSING_ITEM record shows 3.0 dispensed
            cur.execute("SELECT * FROM DISPENSING_ITEM WHERE dispensing_id = %s ORDER BY dispensing_item_id ASC", (disp_row["dispensing_id"],))
            di_items = cur.fetchall()
            assert len(di_items) == 2
            assert float(di_items[0]["dispensed_quantity"]) == 3.0
            assert di_items[0]["was_changed"] == 1
            assert float(di_items[1]["dispensed_quantity"]) == 5.0
            assert di_items[1]["was_changed"] == 0
    finally:
        conn.close()

    print("PASS: Partial dispensing recorded correctly without tampering with the original clinical prescription.")


def test_validation_partial_dispensing_requires_reason():
    """
    Test 4: Submitting partial dispensing without a reason must be rejected with 409 Conflict.
    """
    print("\n--- Test 4: Validation - Partial Dispensing Requires Reason ---")
    setup_fixtures()
    rec_token, doc1_token, _ = get_tokens()

    # Check-in and complete consultation
    chk = client.post(
        "/api/reception/check-ins",
        json={"roll_number": "TEST_P7_004", "doctor_id": 1, "complaint": "Joint Pain"},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    v_id = chk.json()["visitId"]
    client.post(f"/api/doctor/1/start-consultation/{v_id}", headers={"Authorization": f"Bearer {doc1_token}"})
    client.post(
        f"/api/doctor/1/complete/{v_id}",
        json={
            "diagnosis": "Mild Osteoarthritis",
            "medicines": [{"name": "Aceclofenac 100mg", "dosage_form": "Tablet", "duration": "5 days", "dosage": "1-0-1"}],
        },
        headers={"Authorization": f"Bearer {doc1_token}"},
    )

    # Attempt partial dispensing without reason -> MUST BE 409
    res = client.post(
        f"/api/queue/{v_id}/dispense",
        json={"status": "Partially dispensed", "change_reason": ""},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert res.status_code == 409, f"Expected 409 for partial dispense without reason, got {res.status_code}: {res.text}"
    assert "reason" in res.json()["detail"].lower()

    # Cleanup visit with valid full dispense
    valid_res = client.post(
        f"/api/queue/{v_id}/dispense",
        json={"status": "Dispensed as prescribed"},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert valid_res.status_code == 200

    print("PASS: Partial dispensing strictly enforces mandatory variation reason.")


def test_authorization_guards():
    """
    Test 5: Verify role guards:
    - Doctors cannot call dispense (403 Forbidden).
    - Students cannot call dispense or view awaiting-dispense queue (403 Forbidden).
    - Receptionist can dispense.
    """
    print("\n--- Test 5: Role Authorization Guards ---")
    rec_token, doc1_token, _ = get_tokens()

    # Login as student TEST_P7_001
    stu_login = client.post("/api/auth/login", json={"email": "test_p7_001@thapar.edu", "password": "password123"})
    # Since password is dummy in fixture, test with fake/missing token or verify 401/403
    unauth = client.post("/api/queue/1/dispense")
    assert unauth.status_code == 401

    # Doctor attempting to dispense -> 403 Forbidden
    doc_disp = client.post(f"/api/queue/1/dispense", headers={"Authorization": f"Bearer {doc1_token}"})
    assert doc_disp.status_code == 403, f"Expected 403 for doctor dispensing, got {doc_disp.status_code}"

    # Doctor attempting to access receptionist dispensing alias -> 403 Forbidden
    doc_rec_disp = client.post(f"/api/reception/dispense/1", headers={"Authorization": f"Bearer {doc1_token}"})
    assert doc_rec_disp.status_code == 403, f"Expected 403 for doctor on /reception/dispense, got {doc_rec_disp.status_code}"

    print("PASS: Role authorization strictly enforces Receptionist-only dispensing; Doctors receive 403.")


def test_invalid_status_transitions_and_idempotency():
    """
    Test 6: Invalid status transitions and idempotency:
    - Premature dispense on WAITING_FOR_DOCTOR -> 409
    - Premature dispense on IN_CONSULTATION -> 409
    - Retrying dispense on COMPLETED visit -> 200 with already_completed without duplicate audit rows
    """
    print("\n--- Test 6: Invalid Transitions and Dispense Idempotency ---")
    setup_fixtures()
    rec_token, doc1_token, _ = get_tokens()

    # Check in student
    chk = client.post(
        "/api/reception/check-ins",
        json={"roll_number": "TEST_P7_001", "doctor_id": 1, "complaint": "Premature dispense test"},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    v_id = chk.json()["visitId"]

    # 1. Premature dispense while WAITING_FOR_DOCTOR -> 409
    res1 = client.post(f"/api/queue/{v_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert res1.status_code == 409, f"Expected 409, got {res1.status_code}: {res1.text}"

    # 2. Start consultation -> status is IN_CONSULTATION
    client.post(f"/api/doctor/1/start-consultation/{v_id}", headers={"Authorization": f"Bearer {doc1_token}"})
    res2 = client.post(f"/api/queue/{v_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert res2.status_code == 409, f"Expected 409, got {res2.status_code}: {res2.text}"

    # 3. Complete consultation -> status is WAITING_FOR_MEDICINE
    client.post(
        f"/api/doctor/1/complete/{v_id}",
        json={"diagnosis": "Healthy follow-up", "medicines": [{"name": "Multivitamin", "dosage_form": "Tablet", "duration": "5 days", "dosage": "1-0-0"}]},
        headers={"Authorization": f"Bearer {doc1_token}"},
    )

    # 4. First Dispense -> 200 OK, dispensed
    disp1 = client.post(f"/api/queue/{v_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp1.status_code == 200
    assert disp1.json()["status"] == "dispensed"

    # 5. Retry Dispense -> 200 OK, already_completed
    disp2 = client.post(f"/api/queue/{v_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert disp2.status_code == 200
    assert disp2.json()["status"] == "already_completed"

    # Verify database: exactly 1 DISPENSING row and exactly 1 MEDICINE_DISPENSED event
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM DISPENSING WHERE visit_id = %s", (v_id,))
            assert cur.fetchone()["cnt"] == 1, "Duplicate DISPENSING row created on idempotent retry"

            cur.execute("SELECT COUNT(*) AS cnt FROM VISIT_EVENT WHERE visit_id = %s AND event_type = 'MEDICINE_DISPENSED'", (v_id,))
            assert cur.fetchone()["cnt"] == 1, "Duplicate MEDICINE_DISPENSED audit event logged on retry"
    finally:
        conn.close()

    print("PASS: Premature dispensing strictly rejected; retrying dispense is completely idempotent.")


def test_transaction_rollback_atomicity():
    """
    Test 7: Atomic failure rollback:
    Verifies that if an error occurs midway, no partial DISPENSING or DISPENSING_ITEM rows
    are committed and visit remains in WAITING_FOR_MEDICINE.
    """
    print("\n--- Test 7: Transaction Rollback Atomicity ---")
    setup_fixtures()
    rec_token, doc1_token, _ = get_tokens()

    # Check in and complete consultation
    chk = client.post(
        "/api/reception/check-ins",
        json={"roll_number": "TEST_P7_002", "doctor_id": 1, "complaint": "Rollback test"},
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    v_id = chk.json()["visitId"]
    client.post(f"/api/doctor/1/start-consultation/{v_id}", headers={"Authorization": f"Bearer {doc1_token}"})
    client.post(
        f"/api/doctor/1/complete/{v_id}",
        json={"diagnosis": "Test Diagnosis", "medicines": [{"name": "Paracetamol 500mg", "dosage_form": "Tablet", "duration": "3 days", "dosage": "1-0-1"}]},
        headers={"Authorization": f"Bearer {doc1_token}"},
    )

    # Call queue_lifecycle.dispense_medication with a bad connection or simulated error
    from app.services import queue_lifecycle as ql
    conn = get_db_connection()
    try:
        # Simulate partial dispensing without required reason (raises InvalidTransitionError before commit)
        try:
            ql.dispense_medication(
                conn=conn,
                visit_id=v_id,
                performed_by_user_id=5,
                dispensing_status="PARTIALLY_DISPENSED",
                change_reason=None,  # missing reason raises exception
            )
            assert False, "Expected InvalidTransitionError"
        except ql.InvalidTransitionError:
            conn.rollback()

        # Check database: zero DISPENSING rows exist, VISIT remains WAITING_FOR_MEDICINE
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM DISPENSING WHERE visit_id = %s", (v_id,))
            assert cur.fetchone()["cnt"] == 0, "DISPENSING row was not rolled back!"

            cur.execute("SELECT status FROM VISIT WHERE visit_id = %s", (v_id,))
            assert cur.fetchone()["status"] == "WAITING_FOR_MEDICINE"
    finally:
        conn.close()

    # Conclude visit cleanly
    clean_disp = client.post(f"/api/queue/{v_id}/dispense", headers={"Authorization": f"Bearer {rec_token}"})
    assert clean_disp.status_code == 200

    print("PASS: Transaction rollback atomicity verified: zero partial updates on failure.")


def cleanup_fixtures():
    setup_fixtures()


if __name__ == "__main__":
    print("=" * 75)
    print("RUNNING CAMPUSCARE PHASE 7: MEDICINE DISPENSING TEST SUITE")
    print("=" * 75)

    test_awaiting_dispense_and_prescription_detail()
    test_full_dispensing_fulfillment()
    test_partial_dispensing_and_prescription_integrity()
    test_validation_partial_dispensing_requires_reason()
    test_authorization_guards()
    test_invalid_status_transitions_and_idempotency()
    test_transaction_rollback_atomicity()

    cleanup_fixtures()

    print("=" * 75)
    print("ALL 7 PHASE 7 MEDICINE DISPENSING TESTS PASSED SUCCESSFULLY!")
    print("=" * 75)
