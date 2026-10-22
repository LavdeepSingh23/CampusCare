"""
Integration Test Suite for SD-4:
Connecting Dashboard Data to the Real Backend:
- Home: verified profile, real blood group, visit statistics
- Prescription & Medical History: authorized prescription items, medicine instructions, dosage schedules
- Account: verified student profile, authoritative immutable registrar fields vs editable demographics
- Emergency: verified campus emergency services directory and personal emergency contacts
- Security: strict role boundaries, cross-student isolation, 401 unauthenticated rejection
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

TEST_STUDENT_EMAIL = "sd4_student102303777@thapar.edu"
TEST_STUDENT_ROLL = "102303777"
TEST_STUDENT_NAME = "SD4 Dashboard Student"
TEST_STUDENT_SUB = "google_sub_sd4_777777"

OTHER_STUDENT_EMAIL = "sd4_other102303888@thapar.edu"
OTHER_STUDENT_ROLL = "102303888"
OTHER_STUDENT_NAME = "SD4 Other Student"
OTHER_STUDENT_SUB = "google_sub_sd4_888888"


def clean_fixtures():
    """Removes SD-4 test artifacts from the live database."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Clean visits, consultations, prescriptions
            cur.execute(
                "SELECT visit_id FROM VISIT WHERE roll_number IN (%s, %s)",
                (TEST_STUDENT_ROLL, OTHER_STUDENT_ROLL),
            )
            v_rows = cur.fetchall()
            if v_rows:
                v_ids = ",".join(str(r["visit_id"]) for r in v_rows)
                cur.execute(
                    f"SELECT prescription_id FROM PRESCRIPTION WHERE consultation_id IN "
                    f"(SELECT consultation_id FROM CONSULTATION WHERE visit_id IN ({v_ids}))"
                )
                p_rows = cur.fetchall()
                if p_rows:
                    p_ids = ",".join(str(p["prescription_id"]) for p in p_rows)
                    cur.execute(
                        f"DELETE FROM PRESCRIPTION_DOSE WHERE prescription_item_id IN "
                        f"(SELECT prescription_item_id FROM PRESCRIPTION_ITEM WHERE prescription_id IN ({p_ids}))"
                    )
                    cur.execute(f"DELETE FROM PRESCRIPTION_ITEM WHERE prescription_id IN ({p_ids})")
                    cur.execute(f"DELETE FROM PRESCRIPTION WHERE prescription_id IN ({p_ids})")

                cur.execute(f"DELETE FROM CONSULTATION WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM VISIT_EVENT WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM QUEUE_ENTRY WHERE visit_id IN ({v_ids})")
                cur.execute(f"DELETE FROM VISIT WHERE visit_id IN ({v_ids})")

            # 2. Clean allergies, conditions, medications, emergency contacts, profile status
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


def provision_test_data():
    """Provisions test students and completed clinical visits with prescriptions and dose schedules."""
    clean_fixtures()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Student 1
            cur.execute(
                """
                INSERT INTO USER_ACCOUNT (email, google_subject, account_type, status, last_login_at)
                VALUES (%s, %s, 'STUDENT', 'ACTIVE', NOW())
                """,
                (TEST_STUDENT_EMAIL, TEST_STUDENT_SUB),
            )
            user1_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, phone_number, blood_group, date_of_birth, sex, status)
                VALUES (%s, %s, %s, '+91 98765 43210', 'B+', '2004-05-14', 'MALE', 'ACTIVE')
                """,
                (TEST_STUDENT_ROLL, user1_id, TEST_STUDENT_NAME),
            )

            # Emergency Contact for Student 1
            cur.execute(
                """
                INSERT INTO EMERGENCY_CONTACT (roll_number, name, relationship, phone_number)
                VALUES (%s, 'Suresh Sharma', 'Father', '+91 98765 09876')
                """,
                (TEST_STUDENT_ROLL,),
            )

            # Student 2 (Other Student)
            cur.execute(
                """
                INSERT INTO USER_ACCOUNT (email, google_subject, account_type, status, last_login_at)
                VALUES (%s, %s, 'STUDENT', 'ACTIVE', NOW())
                """,
                (OTHER_STUDENT_EMAIL, OTHER_STUDENT_SUB),
            )
            user2_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, status)
                VALUES (%s, %s, %s, '2004-01-01', 'OTHER', 'ACTIVE')
                """,
                (OTHER_STUDENT_ROLL, user2_id, OTHER_STUDENT_NAME),
            )

            # Completed Consultation for Student 1 with Doctor 1 (Dr. Anil Sharma)
            cur.execute(
                """
                INSERT INTO VISIT (roll_number, doctor_id, status, checked_in_at, completed_at)
                VALUES (%s, 1, 'COMPLETED', NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 3 DAY)
                """,
                (TEST_STUDENT_ROLL,),
            )
            v_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO CONSULTATION (visit_id, doctor_id, reason_for_visit, diagnosis, clinical_notes)
                VALUES (%s, 1, 'High fever and sore throat', 'Acute Tonsillitis', 'Advised warm saline gargles twice daily.')
                """,
                (v_id,),
            )
            c_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO PRESCRIPTION (consultation_id, general_instructions, created_at, finalized_at)
                VALUES (%s, 'Complete the 5-day antibiotic course even if fever resolves.', NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 3 DAY)
                """,
                (c_id,),
            )
            p_id = cur.lastrowid

            # Prescription item 1: Amoxicillin (Morning, Night)
            cur.execute(
                """
                INSERT INTO PRESCRIPTION_ITEM (prescription_id, medicine_name, strength, dosage_form, route, duration_value, duration_unit, meal_relation, special_instructions)
                VALUES (%s, 'Amoxicillin', '500mg', 'Capsule', 'Oral', 5, 'DAY', 'AFTER_MEAL', 'Take with plenty of water')
                """,
                (p_id,),
            )
            pi1_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO PRESCRIPTION_DOSE (prescription_item_id, time_of_day, dose_quantity, dose_unit)
                VALUES (%s, 'MORNING', 1.0, 'capsule'), (%s, 'NIGHT', 1.0, 'capsule')
                """,
                (pi1_id, pi1_id),
            )

            # Prescription item 2: Paracetamol (As needed)
            cur.execute(
                """
                INSERT INTO PRESCRIPTION_ITEM (prescription_id, medicine_name, strength, dosage_form, route, duration_value, duration_unit, meal_relation, special_instructions)
                VALUES (%s, 'Paracetamol', '650mg', 'Tablet', 'Oral', 3, 'DAY', 'AFTER_MEAL', 'For fever above 100 F')
                """,
                (p_id,),
            )
            pi2_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO PRESCRIPTION_DOSE (prescription_item_id, time_of_day, dose_quantity, dose_unit)
                VALUES (%s, 'AFTERNOON', 1.0, 'tablet')
                """,
                (pi2_id,),
            )

        conn.commit()
        return user1_id, user2_id
    finally:
        conn.close()


def make_token(user_id: int, roll: str = TEST_STUDENT_ROLL, email: str = TEST_STUDENT_EMAIL) -> str:
    return create_access_token(
        claims={
            "sub": str(user_id),
            "email": email,
            "role": "STUDENT",
            "roll_number": roll,
        }
    )


def test_home_and_account_telemetry():
    print("\n--- Test 1: Home & Account Telemetry (GET /api/student/me) ---")
    u1, _ = provision_test_data()
    token = make_token(u1)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/student/me", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()

    # Home / Account real bindings
    st = data["student"]
    assert st["rollNumber"] == TEST_STUDENT_ROLL
    assert st["fullName"] == TEST_STUDENT_NAME
    assert st["bloodGroup"] == "B+"
    assert st["phoneNumber"] == "+91 98765 43210"
    assert st["dateOfBirth"] == "2004-05-14"
    assert st["sex"] == "MALE"
    assert st["program"] is not None
    assert st["status"] == "ACTIVE"

    # Emergency contact binding
    assert len(data["emergencyContacts"]) == 1
    ec = data["emergencyContacts"][0]
    assert ec["name"] == "Suresh Sharma"
    assert ec["relationship"] == "Father"
    assert ec["phoneNumber"] == "+91 98765 09876"

    print("PASS: Home and Account verified profile and emergency contact bound to real values.")


def test_prescription_and_history_details():
    print("\n--- Test 2: Prescription & Medical History (GET /api/student/me/history) ---")
    u1, _ = provision_test_data()
    token = make_token(u1)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/student/me/history", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    history = res.json()

    assert len(history) == 1, f"Expected 1 history item, got {len(history)}"
    visit = history[0]

    # Verify visit fields
    assert visit["diagnosis"] == "Acute Tonsillitis"
    assert "Kapoor" in visit["doctorName"]
    assert visit["specialty"] is not None
    assert visit["date"] is not None
    assert "warm saline gargles" in visit["notes"]

    # Verify prescription medicines & dose schedule timings
    assert len(visit["medicines"]) == 2
    med1 = next((m for m in visit["medicines"] if "Amoxicillin" in m["name"]), None)
    assert med1 is not None
    assert "500mg" in med1["name"]
    assert "morning" in med1["timing"]
    assert "night" in med1["timing"]
    assert "after food" in med1["note"]
    assert med1["duration"] == "5 days"

    med2 = next((m for m in visit["medicines"] if "Paracetamol" in m["name"]), None)
    assert med2 is not None
    assert "afternoon" in med2["timing"]

    print("PASS: Prescription details, timing schedules, and clinical notes verified.")


def test_emergency_directory():
    print("\n--- Test 3: Emergency Contacts Directory (GET /api/student/emergency-contacts) ---")
    u1, _ = provision_test_data()
    token = make_token(u1)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/student/emergency-contacts", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()

    # Personal contacts
    assert len(body["personalContacts"]) == 1
    assert body["personalContacts"][0]["name"] == "Suresh Sharma"
    assert body["personalContacts"][0]["relationship"] == "Father"

    # Campus services - verified numbers (NO DUMMY PLACEHOLDERS)
    campus = body["campusServices"]
    assert len(campus) >= 3
    numbers = [c["number"] for c in campus]
    assert "+91-175-2393108" in numbers  # Health Centre Dispensary
    assert "+91-175-2393110" in numbers  # Campus Security Desk
    assert "+91-175-2393112" in numbers  # Hostel Warden
    assert "+91-000-000-0000" not in numbers  # Placeholders removed!

    # National helplines
    national = body["nationalHelplines"]
    nat_numbers = [n["number"] for n in national]
    assert "108" in nat_numbers
    assert "14416" in nat_numbers

    print("PASS: Verified campus emergency numbers and personal contacts confirmed.")


def test_security_and_isolation():
    print("\n--- Test 4: Security & Cross-Student Isolation ---")
    u1, u2 = provision_test_data()
    token1 = make_token(u1)
    token2 = make_token(u2, roll=OTHER_STUDENT_ROLL, email=OTHER_STUDENT_EMAIL)

    # 4.1 Student 2 cannot access Student 1's history by roll number
    res_forbidden = client.get(
        f"/api/student/{TEST_STUDENT_ROLL}/history",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res_forbidden.status_code == 403, f"Expected 403, got {res_forbidden.status_code}"
    print("PASS: Cross-student history access blocked with 403 Forbidden.")

    # 4.2 Student 2 cannot access Student 1's profile by roll number
    res_prof_forbidden = client.get(
        f"/api/student/{TEST_STUDENT_ROLL}",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert res_prof_forbidden.status_code == 403, f"Expected 403, got {res_prof_forbidden.status_code}"
    print("PASS: Cross-student profile access blocked with 403 Forbidden.")

    # 4.3 Unauthenticated request rejected
    res_unauth = client.get("/api/student/me/history")
    assert res_unauth.status_code == 401
    print("PASS: Unauthenticated requests rejected with 401 Unauthorized.")


def test_canonical_contract_routes():
    print("\n--- Test 5: Proposed API Contract Verification (All 8 Canonical Endpoints) ---")
    u1, _ = provision_test_data()
    token = make_token(u1)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. GET /api/student/me
    res1 = client.get("/api/student/me", headers=headers)
    assert res1.status_code == 200, f"GET /api/student/me failed: {res1.text}"
    assert res1.json()["student"]["rollNumber"] == TEST_STUDENT_ROLL
    print("  [OK] GET /api/student/me -> 200 OK")

    # 2. GET /api/student/profile
    res2 = client.get("/api/student/profile", headers=headers)
    assert res2.status_code == 200, f"GET /api/student/profile failed: {res2.text}"
    assert res2.json()["student"]["rollNumber"] == TEST_STUDENT_ROLL
    print("  [OK] GET /api/student/profile -> 200 OK")

    # 3. PUT /api/student/profile
    res3 = client.put(
        "/api/student/profile",
        headers=headers,
        json={"phoneNumber": "+91 99999 11111", "bloodGroup": "B+", "sex": "MALE"},
    )
    assert res3.status_code == 200, f"PUT /api/student/profile failed: {res3.text}"
    assert res3.json()["success"] is True
    print("  [OK] PUT /api/student/profile -> 200 OK")

    # 4. GET /api/student/medical-profile
    res4 = client.get("/api/student/medical-profile", headers=headers)
    assert res4.status_code == 200, f"GET /api/student/medical-profile failed: {res4.text}"
    assert res4.json()["rollNumber"] == TEST_STUDENT_ROLL
    print("  [OK] GET /api/student/medical-profile -> 200 OK")

    # 5. PUT /api/student/medical-profile
    res5 = client.put(
        "/api/student/medical-profile",
        headers=headers,
        json={
            "allergies": [{"allergen": "Sulfa drugs", "severity": "MODERATE", "reaction": "Hives"}],
            "chronicConditions": [],
            "currentMedications": [],
        },
    )
    assert res5.status_code == 200, f"PUT /api/student/medical-profile failed: {res5.text}"
    assert any(a["allergen"] == "Sulfa drugs" for a in res5.json()["allergies"])
    print("  [OK] PUT /api/student/medical-profile -> 200 OK")

    # 6. GET /api/student/visits
    res6 = client.get("/api/student/visits", headers=headers)
    assert res6.status_code == 200, f"GET /api/student/visits failed: {res6.text}"
    assert len(res6.json()) >= 1
    assert res6.json()[0]["diagnosis"] == "Acute Tonsillitis"
    print("  [OK] GET /api/student/visits -> 200 OK")

    # 7. GET /api/student/prescriptions
    res7 = client.get("/api/student/prescriptions", headers=headers)
    assert res7.status_code == 200, f"GET /api/student/prescriptions failed: {res7.text}"
    presc_list = res7.json()
    assert len(presc_list) >= 1
    assert len(presc_list[0]["medicines"]) == 2
    assert any("Amoxicillin" in m["name"] for m in presc_list[0]["medicines"])
    print("  [OK] GET /api/student/prescriptions -> 200 OK")

    # 8. GET /api/student/summary
    res8 = client.get("/api/student/summary", headers=headers)
    assert res8.status_code == 200, f"GET /api/student/summary failed: {res8.text}"
    sum_data = res8.json()
    assert sum_data["student"]["rollNumber"] == TEST_STUDENT_ROLL
    assert sum_data["statistics"]["totalVisits"] >= 1
    assert sum_data["recentPrescription"] is not None
    assert sum_data["recentPrescription"]["diagnosis"] == "Acute Tonsillitis"
    print("  [OK] GET /api/student/summary -> 200 OK")

    print("PASS: All 8 proposed API contract endpoints verified with real database records.")


if __name__ == "__main__":
    try:
        test_home_and_account_telemetry()
        test_prescription_and_history_details()
        test_emergency_directory()
        test_security_and_isolation()
        test_canonical_contract_routes()
        clean_fixtures()
        print("\n===========================================================================")
        print("ALL SD-4 DASHBOARD BACKEND INTEGRATION TESTS PASSED SUCCESSFULLY!")
        print("===========================================================================\n")
    except Exception:
        clean_fixtures()
        raise
