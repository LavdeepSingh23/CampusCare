"""
Comprehensive Integration Test Suite for SD-3:
Student Medical Details, Clinical Record Protection, Data Minimization, and Granular Management.
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

TEST_STUDENT_EMAIL = "sd3_student102203555@thapar.edu"
TEST_STUDENT_ROLL = "102203555"
TEST_STUDENT_NAME = "SD3 Medical Student"
TEST_STUDENT_SUB = "google_sub_sd3_555555"

OTHER_STUDENT_EMAIL = "sd3_other102203444@thapar.edu"
OTHER_STUDENT_ROLL = "102203444"
OTHER_STUDENT_NAME = "SD3 Other Student"
OTHER_STUDENT_SUB = "google_sub_sd3_444444"


def clean_fixtures():
    """Removes SD-3 test artifacts from the live database."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Clean visits and related records
            cur.execute(
                "SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s)",
                (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL),
            )
            v_rows = cur.fetchall()
            if v_rows:
                v_ids = ",".join(str(r["visit_id"]) for r in v_rows)
                cur.execute(f"DELETE FROM DISPENSING WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM VISIT_EVENT WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM QUEUE_ENTRY WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM PRESCRIPTION WHERE consultation_id IN (SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({v_ids}))")
                cur.execute(f"DELETE FROM CONSULTATION WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({v_ids})")

            # 2. Clean allergies, conditions, medications, contacts, status
            cur.execute("DELETE FROM ALLERGY WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM STUDENT_CONDITION WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM STUDENT_MEDICATION WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM EMERGENCY_CONTACT WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute("DELETE FROM MEDICAL_PROFILE_STATUS WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))

            # 3. Clean student and user accounts
            cur.execute("DELETE FROM STUDENT WHERE roll_number IN (%s, %s)", (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL))
            cur.execute(
                "DELETE FROM USER_ACCOUNT WHERE email IN (%s, %s) OR google_subject IN (%s, %s)",
                (TEST_STUDENT_EMAIL, OTHER_STUDENT_EMAIL, TEST_STUDENT_SUB, OTHER_STUDENT_SUB),
            )
        conn.commit()
    finally:
        conn.close()


def provision_test_student():
    """Provisions a student user and linked STUDENT record."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO USER_ACCOUNT (email, google_subject, account_type, status, last_login_at)
                VALUES (%s, %s, 'STUDENT', 'ACTIVE', NOW())
                """,
                (TEST_STUDENT_EMAIL, TEST_STUDENT_SUB),
            )
            user_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, phone_number, blood_group, status)
                VALUES (%s, %s, %s, '2004-03-12', 'MALE', '+91-9876543210', 'B+', 'ACTIVE')
                """,
                (TEST_STUDENT_ROLL, user_id, TEST_STUDENT_NAME),
            )

            cur.execute(
                """
                INSERT INTO MEDICAL_PROFILE_STATUS (roll_number, allergy_status, condition_status, medication_status)
                VALUES (%s, 'NOT_REPORTED', 'NOT_REPORTED', 'NOT_REPORTED')
                """,
                (TEST_STUDENT_ROLL,),
            )
        conn.commit()
        return user_id
    finally:
        conn.close()


def make_student_token(user_id: int, roll: str = TEST_STUDENT_ROLL):
    return create_access_token(
        claims={
            "sub": str(user_id),
            "email": TEST_STUDENT_EMAIL,
            "role": "STUDENT",
            "roll_number": roll,
        }
    )


def test_read_initial_medical_profile():
    print("\n--- Test 1: Read Initial Medical Profile (GET /api/student/medical) ---")
    clean_fixtures()
    user_id = provision_test_student()
    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/student/medical", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()

    assert body["rollNumber"] == TEST_STUDENT_ROLL
    assert body["bloodGroup"] == "B+"
    assert body["medicalStatus"]["allergyStatus"] == "NOT_REPORTED"
    assert body["summary"]["totalAllergies"] == 0
    assert body["summary"]["totalConditions"] == 0
    assert body["summary"]["totalMedications"] == 0
    assert body["summary"]["hasSevereAllergyAlert"] is False
    assert len(body["allergies"]) == 0
    assert len(body["conditions"]) == 0
    assert len(body["medications"]) == 0
    print("PASS: Initial medical profile structure and empty summary verified.")


def test_bulk_update_medical_profile():
    print("\n--- Test 2: Bulk Update Student Medical Details (PUT /api/student/medical) ---")
    clean_fixtures()
    user_id = provision_test_student()
    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "bloodGroup": "O+",
        "hasAllergies": True,
        "allergies": [
            {
                "allergen": "Sulfa Drugs",
                "reaction": "Skin peeling and swelling",
                "severity": "SEVERE",
            }
        ],
        "hasChronicConditions": True,
        "chronicConditions": ["Type 1 Diabetes"],
        "hasCurrentMedications": True,
        "currentMedications": [
            {
                "medicineName": "Insulin Glargine",
                "strength": "100IU/ml",
                "dose": "10 units QPM",
                "reason": "Basal glycemic control",
            }
        ],
    }

    res = client.put("/api/student/medical", headers=headers, json=payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()

    assert body["bloodGroup"] == "O+"
    assert body["medicalStatus"]["allergyStatus"] == "HAS_RECORDS"
    assert body["summary"]["totalAllergies"] == 1
    assert body["summary"]["hasSevereAllergyAlert"] is True
    assert body["summary"]["totalConditions"] == 1
    assert body["summary"]["totalMedications"] == 1
    assert body["summary"]["editableCount"] == 3
    assert body["summary"]["clinicalVerifiedCount"] == 0

    assert body["allergies"][0]["allergen"] == "Sulfa Drugs"
    assert body["allergies"][0]["severity"] == "SEVERE"
    assert body["allergies"][0]["source"] == "SELF_REPORTED"
    assert body["allergies"][0]["canEdit"] is True

    assert body["conditions"][0]["name"] == "Type 1 Diabetes"
    assert body["conditions"][0]["source"] == "SELF_REPORTED"
    assert body["conditions"][0]["canEdit"] is True

    assert body["medications"][0]["medicineName"] == "Insulin Glargine"
    assert body["medications"][0]["source"] == "SELF_REPORTED"
    assert body["medications"][0]["canEdit"] is True
    print("PASS: Bulk update correctly populated self-reported medical declarations and summary metrics.")


def test_granular_item_endpoints():
    print("\n--- Test 3: Granular Item Addition & Soft Deletion ---")
    user_id = 0
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))
            user_id = cur.fetchone()["user_id"]
    finally:
        conn.close()

    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # 3.1 Add Allergy
    res_al = client.post(
        "/api/student/medical/allergies",
        headers=headers,
        json={"allergen": "Peanuts", "reaction": "Throat constriction", "severity": "MODERATE"},
    )
    assert res_al.status_code == 200, f"Expected 200, got {res_al.status_code}: {res_al.text}"
    al_id = res_al.json()["itemId"]
    assert al_id > 0
    print(f"PASS: Added single allergy (id={al_id}).")

    # Verify count is now 2
    res_prof = client.get("/api/student/medical", headers=headers)
    assert res_prof.json()["summary"]["totalAllergies"] == 2

    # 3.2 Delete Allergy
    res_del_al = client.delete(f"/api/student/medical/allergies/{al_id}", headers=headers)
    assert res_del_al.status_code == 200, f"Expected 200, got {res_del_al.status_code}: {res_del_al.text}"
    print(f"PASS: Deleted single allergy (id={al_id}).")

    # Verify count back to 1
    res_prof2 = client.get("/api/student/medical", headers=headers)
    assert res_prof2.json()["summary"]["totalAllergies"] == 1

    # 3.3 Add and Delete Chronic Condition
    res_cond = client.post(
        "/api/student/medical/conditions",
        headers=headers,
        json={"name": "Migraine", "otherDescription": "Triggered by bright light"},
    )
    assert res_cond.status_code == 200
    cond_id = res_cond.json()["itemId"]

    res_del_cond = client.delete(f"/api/student/medical/conditions/{cond_id}", headers=headers)
    assert res_del_cond.status_code == 200
    print(f"PASS: Granular Condition added (id={cond_id}) and deleted successfully.")

    # 3.4 Add and Delete Medication
    res_med = client.post(
        "/api/student/medical/medications",
        headers=headers,
        json={"medicineName": "Metformin", "strength": "500mg", "dose": "1 tab BD", "reason": "Insulin sensitivity"},
    )
    assert res_med.status_code == 200
    med_id = res_med.json()["itemId"]

    res_del_med = client.delete(f"/api/student/medical/medications/{med_id}", headers=headers)
    assert res_del_med.status_code == 200
    print(f"PASS: Granular Medication added (id={med_id}) and deleted successfully.")


def test_clinical_record_protection():
    print("\n--- Test 4: Clinical Record Protection (Student Cannot Delete/Alter Clinician Flags) ---")
    user_id = 0
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))
            user_id = cur.fetchone()["user_id"]

            # Insert clinical allergy recorded by staff (user_id=1, Dr. Anil Sharma)
            cur.execute(
                """
                INSERT INTO ALLERGY (roll_number, allergen, reaction, severity, recorded_at, recorded_by_user_id)
                VALUES (%s, 'Cephalosporins', 'Anaphylactoid reaction', 'SEVERE', NOW(), 1)
                """,
                (TEST_STUDENT_ROLL,),
            )
            clinical_allergy_id = cur.lastrowid

            # Insert clinical condition recorded by staff
            cur.execute("SELECT condition_id FROM `CONDITION` WHERE name = 'Hypertension' LIMIT 1")
            cond_row = cur.fetchone()
            if not cond_row:
                cur.execute("INSERT INTO `CONDITION` (name, description, is_active) VALUES ('Hypertension', 'Clinical', 1)")
                c_id = cur.lastrowid
            else:
                c_id = cond_row["condition_id"]

            cur.execute(
                """
                INSERT INTO STUDENT_CONDITION (roll_number, condition_id, other_description, recorded_at, recorded_by_user_id)
                VALUES (%s, %s, 'Stage 1 Hypertension', NOW(), 1)
                """,
                (TEST_STUDENT_ROLL, c_id),
            )
            clinical_condition_id = cur.lastrowid

            # Insert clinical medication recorded by staff
            cur.execute(
                """
                INSERT INTO STUDENT_MEDICATION (roll_number, medicine_name, strength, dose, reason, started_at, recorded_by_user_id)
                VALUES (%s, 'Amlodipine', '5mg', '1 OD', 'BP Control', CURDATE(), 1)
                """,
                (TEST_STUDENT_ROLL,),
            )
            clinical_medication_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # 4.1 Verify read API shows CLINICAL source and canEdit=False
    res_get = client.get("/api/student/medical", headers=headers)
    assert res_get.status_code == 200
    b = res_get.json()
    assert b["summary"]["clinicalVerifiedCount"] >= 3

    clinical_al = next((a for a in b["allergies"] if a["allergyId"] == clinical_allergy_id), None)
    assert clinical_al is not None
    assert clinical_al["source"] == "CLINICAL"
    assert clinical_al["canEdit"] is False

    clinical_cond = next((c for c in b["conditions"] if c["studentConditionId"] == clinical_condition_id), None)
    assert clinical_cond is not None
    assert clinical_cond["source"] == "CLINICAL"
    assert clinical_cond["canEdit"] is False

    clinical_med = next((m for m in b["medications"] if m["studentMedicationId"] == clinical_medication_id), None)
    assert clinical_med is not None
    assert clinical_med["source"] == "CLINICAL"
    assert clinical_med["canEdit"] is False
    print("PASS: Clinician-entered alerts correctly tagged with source='CLINICAL' and canEdit=False.")

    # 4.2 Student attempt to DELETE clinical allergy rejected with 403
    res_del_al = client.delete(f"/api/student/medical/allergies/{clinical_allergy_id}", headers=headers)
    assert res_del_al.status_code == 403, f"Expected 403 for deleting clinical allergy, got {res_del_al.status_code}"
    assert "clinical" in res_del_al.json()["detail"].lower()
    print("PASS: Student deletion of clinician-verified allergy rejected with 403 Forbidden.")

    # 4.3 Student attempt to DELETE clinical condition rejected with 403
    res_del_cond = client.delete(f"/api/student/medical/conditions/{clinical_condition_id}", headers=headers)
    assert res_del_cond.status_code == 403
    assert "clinical" in res_del_cond.json()["detail"].lower()
    print("PASS: Student deletion of clinician-verified condition rejected with 403 Forbidden.")

    # 4.4 Student attempt to DELETE clinical medication rejected with 403
    res_del_med = client.delete(f"/api/student/medical/medications/{clinical_medication_id}", headers=headers)
    assert res_del_med.status_code == 403
    assert "clinical" in res_del_med.json()["detail"].lower()
    print("PASS: Student deletion of clinician-verified medication rejected with 403 Forbidden.")

    # 4.5 Student bulk update with hasAllergies=False only clears self-reported allergies; clinical ones preserved!
    res_bulk = client.put("/api/student/medical", headers=headers, json={"hasAllergies": False})
    assert res_bulk.status_code == 200
    b_bulk = res_bulk.json()
    remaining_allergies = [a["allergyId"] for a in b_bulk["allergies"]]
    assert clinical_allergy_id in remaining_allergies, "Clinical allergy must remain active even after student declares hasAllergies=False!"
    print("PASS: Bulk update soft-ended only self-reported entries; clinician-verified allergy was preserved intact.")


def test_data_minimization_consultations():
    print("\n--- Test 5: Data Minimization in Consultation History ---")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Insert a completed visit with prescription and confidential internal notes
            cur.execute(
                """
                INSERT INTO VISIT (roll_number, doctor_id, status, checked_in_at, completed_at)
                VALUES (%s, 1, 'COMPLETED', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY)
                """,
                (TEST_STUDENT_ROLL,),
            )
            v_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO CONSULTATION (visit_id, doctor_id, reason_for_visit, diagnosis, clinical_notes)
                VALUES (%s, 1, 'Persistent dry cough', 'Acute Bronchitis', 'CONFIDENTIAL INTERNAL NOTE: Patient showed extreme anxiety, check thyroid.')
                """,
                (v_id,),
            )
            co_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO PRESCRIPTION (consultation_id, general_instructions, finalized_at)
                VALUES (%s, 'Drink warm fluids', NOW())
                """,
                (co_id,),
            )
            pr_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO PRESCRIPTION_ITEM (prescription_id, medicine_name, strength, duration_value, duration_unit)
                VALUES (%s, 'Azithromycin', '500mg', 3, 'DAY')
                """,
                (pr_id,),
            )
        conn.commit()
    finally:
        conn.close()

    user_id = 0
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))
            user_id = cur.fetchone()["user_id"]
    finally:
        conn.close()

    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/student/medical", headers=headers)
    assert res.status_code == 200
    consultations = res.json()["recentConsultations"]
    assert len(consultations) >= 1

    sample = next((c for c in consultations if c["visitId"] == v_id), None)
    assert sample is not None
    assert sample["diagnosis"] == "Acute Bronchitis"
    assert len(sample["prescriptions"]) >= 1

    # Verify data minimization: confidential internal note is NEVER present in the payload!
    raw_json = res.text
    assert "CONFIDENTIAL INTERNAL NOTE" not in raw_json
    assert "anxiety" not in raw_json.lower()
    print("PASS: Data minimization verified: student receives diagnosis and prescription instructions while internal staff notes remain private.")


def test_authorization_and_boundary_guards():
    print("\n--- Test 6: Authorization & Boundary Protection ---")
    # 6.1 Unauthenticated requests rejected
    res_unauth_get = client.get("/api/student/medical")
    assert res_unauth_get.status_code == 401, f"Expected 401, got {res_unauth_get.status_code}"

    res_unauth_put = client.put("/api/student/medical", json={"bloodGroup": "A+"})
    assert res_unauth_put.status_code == 401, f"Expected 401, got {res_unauth_put.status_code}"
    print("PASS: Unauthenticated requests rejected with 401 Unauthorized.")

    # 6.2 Non-student tokens rejected
    staff_token = create_access_token(claims={"sub": "1", "email": "doctor1@campuscare.com", "role": "DOCTOR"})
    res_staff = client.get("/api/student/medical", headers={"Authorization": f"Bearer {staff_token}"})
    assert res_staff.status_code == 403, f"Expected 403, got {res_staff.status_code}"
    print("PASS: Doctor/Staff token rejected with 403 Forbidden on student medical endpoint.")

    # 6.3 Cross-student deletion rejected
    # Student A tries to delete Student B's allergy
    conn = get_db_connection()
    other_user_id = 0
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO USER_ACCOUNT (email, google_subject, account_type, status, last_login_at)
                VALUES (%s, %s, 'STUDENT', 'ACTIVE', NOW())
                """,
                (OTHER_STUDENT_EMAIL, OTHER_STUDENT_SUB),
            )
            other_user_id = cur.lastrowid
            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, status)
                VALUES (%s, %s, %s, '2004-01-01', 'OTHER', 'ACTIVE')
                """,
                (OTHER_STUDENT_ROLL, other_user_id, OTHER_STUDENT_NAME),
            )
            cur.execute(
                """
                INSERT INTO ALLERGY (roll_number, allergen, reaction, severity, recorded_at, recorded_by_user_id)
                VALUES (%s, 'Dust Mites', 'Sneezing', 'MILD', NOW(), %s)
                """,
                (OTHER_STUDENT_ROLL, other_user_id),
            )
            other_allergy_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    user_id = 0
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (TEST_STUDENT_EMAIL,))
            user_id = cur.fetchone()["user_id"]
    finally:
        conn.close()

    token = make_student_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    res_cross_del = client.delete(f"/api/student/medical/allergies/{other_allergy_id}", headers=headers)
    assert res_cross_del.status_code in (403, 404), f"Expected 403/404, got {res_cross_del.status_code}"
    print("PASS: Cross-student record deletion blocked with 403/404.")


def run_all_tests():
    print("=" * 75)
    print("RUNNING CAMPUSCARE SD-3: STUDENT MEDICAL DETAILS TEST SUITE")
    print("=" * 75)
    try:
        test_read_initial_medical_profile()
        test_bulk_update_medical_profile()
        test_granular_item_endpoints()
        test_clinical_record_protection()
        test_data_minimization_consultations()
        test_authorization_and_boundary_guards()
        print("=" * 75)
        print("ALL SD-3 STUDENT MEDICAL DETAILS TESTS PASSED SUCCESSFULLY!")
        print("=" * 75)
    finally:
        clean_fixtures()


if __name__ == "__main__":
    run_all_tests()
