import sys
import unittest
from datetime import datetime
from fastapi.testclient import TestClient

sys.path.insert(0, "backend")
from app.main import app
from app.core.database import get_db_connection
from app.core.security import create_access_token

client = TestClient(app)


def run_tests():
    print("=" * 70)
    print("RUNNING CAMPUSCARE FOUR-PORTAL & FACULTY INTEGRATION TEST SUITE")
    print("=" * 70)

    # 1. DOCTOR LOGIN TESTS
    print("\n[TEST 1] Valid Doctor login at /api/auth/doctor/login...")
    res = client.post("/api/auth/doctor/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    assert res.status_code == 200, f"Doctor login failed: {res.text}"
    doc_data = res.json()
    assert doc_data["role"] == "DOCTOR"
    assert "access_token" in doc_data
    doc_token = doc_data["access_token"]
    print(f"  [OK] Doctor authenticated: {doc_data['name']} (Doctor ID: {doc_data['doctor_id']})")

    print("\n[TEST 2] Invalid password at /api/auth/doctor/login must fail (401)...")
    res = client.post("/api/auth/doctor/login", json={"email": "neha.kapoor@campuscare.edu", "password": "wrongpassword"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("  [OK] Rejected invalid doctor password.")

    print("\n[TEST 3] Receptionist attempting to login at /api/auth/doctor/login must be rejected (403)...")
    res = client.post("/api/auth/doctor/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    assert res.status_code == 403, f"Expected 403 role mismatch, got {res.status_code}: {res.text}"
    print("  [OK] Receptionist correctly blocked from Doctor portal (403 Role Mismatch).")

    # 2. RECEPTIONIST LOGIN TESTS
    print("\n[TEST 4] Valid Receptionist login at /api/auth/receptionist/login...")
    res = client.post("/api/auth/receptionist/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    assert res.status_code == 200, f"Receptionist login failed: {res.text}"
    rec_data = res.json()
    assert rec_data["role"] == "RECEPTIONIST"
    assert "access_token" in rec_data
    rec_token = rec_data["access_token"]
    print(f"  [OK] Receptionist authenticated: {rec_data['name']} (Staff ID: {rec_data['staff_id']})")

    print("\n[TEST 5] Doctor attempting to login at /api/auth/receptionist/login must be rejected (403)...")
    res = client.post("/api/auth/receptionist/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    assert res.status_code == 403, f"Expected 403 role mismatch, got {res.status_code}: {res.text}"
    print("  [OK] Doctor correctly blocked from Receptionist portal (403 Role Mismatch).")

    # 3. ADMIN LOGIN & FACULTY DIRECTORY TESTS
    print("\n[TEST 6] Valid Admin login at /api/auth/admin/login...")
    res = client.post("/api/auth/admin/login", json={"email": "admin@campuscare.thapar.edu", "password": "admin123"})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_data = res.json()
    assert admin_data["role"] == "ADMIN"
    admin_token = admin_data["access_token"]
    print(f"  [OK] Administrator authenticated: {admin_data['name']} (Staff ID: {admin_data['staff_id']})")

    print("\n[TEST 7] Non-admin (Doctor) cannot access Admin Faculty Directory (403)...")
    res = client.get("/api/admin/faculty-directory", headers={"Authorization": f"Bearer {doc_token}"})
    assert res.status_code == 403, f"Expected 403 for doctor accessing admin dir, got {res.status_code}"
    print("  [OK] Doctor blocked from Admin Faculty Directory (403 Forbidden).")

    print("\n[TEST 8] Admin lists Faculty Directory entries...")
    res = client.get("/api/admin/faculty-directory", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200, f"Admin list directory failed: {res.text}"
    dir_entries = res.json()["data"]
    emails = [d["institutional_email"] for d in dir_entries]
    assert "dr.sharma@thapar.edu" in emails
    print(f"  [OK] Admin fetched {len(dir_entries)} approved faculty directory records.")

    print("\n[TEST 9] Admin adds new Faculty Directory record...")
    new_faculty_email = "test.prof@thapar.edu"
    res = client.post(
        "/api/admin/faculty-directory",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "institutional_email": new_faculty_email,
            "full_name": "Prof. Test Faculty",
            "department": "Mechanical Engineering",
            "designation": "Assistant Professor",
            "is_active": True,
        },
    )
    assert res.status_code in (201, 409), f"Failed adding directory entry: {res.text}"
    print("  [OK] Admin added/verified directory entry for test.prof@thapar.edu")

    # 4. FACULTY AUTHENTICATION & DIRECTORY ENFORCEMENT
    print("\n[TEST 10] Faculty provisioning via faculty_service for approved email...")
    from app.services.faculty_service import resolve_or_create_faculty_account, FacultyNotEligibleError, FacultyAccountDisabledError
    fac_acc = resolve_or_create_faculty_account(
        email="dr.sharma@thapar.edu",
        name="Dr. Rajesh Sharma",
        google_sub="mock_google_sub_dr_sharma",
    )
    assert fac_acc["faculty_id"] is not None
    assert fac_acc["patient_id"] is not None
    assert fac_acc["department"] == "Computer Science & Engineering"
    print(f"  [OK] Faculty account resolved/provisioned: Faculty ID={fac_acc['faculty_id']}, Patient ID={fac_acc['patient_id']}")

    print("\n[TEST 11] Unapproved institutional email rejected by Faculty directory check...")
    try:
        resolve_or_create_faculty_account(
            email="unapproved.student@thapar.edu",
            name="Impostor Student",
        )
        assert False, "Expected FacultyNotEligibleError"
    except FacultyNotEligibleError:
        print("  [OK] Unlisted email correctly rejected with FacultyNotEligibleError.")

    print("\n[TEST 12] Deactivated Faculty Directory record rejected...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE FACULTY_DIRECTORY SET is_active = FALSE WHERE institutional_email = 'anita.verma@thapar.edu'")
            conn.commit()
    finally:
        conn.close()

    try:
        resolve_or_create_faculty_account(
            email="anita.verma@thapar.edu",
            name="Dr. Anita Verma",
        )
        assert False, "Expected FacultyAccountDisabledError"
    except FacultyAccountDisabledError:
        print("  [OK] Deactivated directory record correctly rejected with FacultyAccountDisabledError.")

    # Restore active status
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE FACULTY_DIRECTORY SET is_active = TRUE WHERE institutional_email = 'anita.verma@thapar.edu'")
            conn.commit()
    finally:
        conn.close()

    # 5. CENTRAL IDENTITY ENDPOINT (/api/auth/me)
    print("\n[TEST 13] Central identity (/api/auth/me) for Doctor, Receptionist, Admin, Faculty...")
    # Doctor /me
    res_me_doc = client.get("/api/auth/me", headers={"Authorization": f"Bearer {doc_token}"})
    assert res_me_doc.status_code == 200
    assert res_me_doc.json()["role"] == "DOCTOR"
    assert res_me_doc.json()["profile"]["doctorId"] is not None
    print(f"  [OK] /api/auth/me [DOCTOR]: {res_me_doc.json()['name']} ({res_me_doc.json()['profile']['specialization']})")

    # Receptionist /me
    res_me_rec = client.get("/api/auth/me", headers={"Authorization": f"Bearer {rec_token}"})
    assert res_me_rec.status_code == 200
    assert res_me_rec.json()["role"] == "RECEPTIONIST"
    print(f"  [OK] /api/auth/me [RECEPTIONIST]: {res_me_rec.json()['name']}")

    # Admin /me
    res_me_adm = client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_me_adm.status_code == 200
    assert res_me_adm.json()["role"] == "ADMIN"
    print(f"  [OK] /api/auth/me [ADMIN]: {res_me_adm.json()['name']}")

    # Faculty /me
    fac_token = create_access_token({
        "sub": str(fac_acc["user_id"]),
        "email": fac_acc["email"],
        "faculty_id": fac_acc["faculty_id"],
        "patient_id": fac_acc["patient_id"],
        "role": "FACULTY",
    })
    res_me_fac = client.get("/api/auth/me", headers={"Authorization": f"Bearer {fac_token}"})
    assert res_me_fac.status_code == 200
    assert res_me_fac.json()["role"] == "FACULTY"
    assert res_me_fac.json()["profile"]["facultyId"] == fac_acc["faculty_id"]
    print(f"  [OK] /api/auth/me [FACULTY]: {res_me_fac.json()['name']} ({res_me_fac.json()['profile']['department']})")

    # 6. REAL-TIME ACCOUNT STATUS / DEACTIVATION ENFORCEMENT
    print("\n[TEST 14] Real-time revocation: Disabled account fails on protected endpoint (403)...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE USER_ACCOUNT SET status = 'DISABLED' WHERE user_id = %s", (fac_acc["user_id"],))
            conn.commit()
    finally:
        conn.close()

    res_disabled = client.get("/api/auth/me", headers={"Authorization": f"Bearer {fac_token}"})
    assert res_disabled.status_code == 403, f"Expected 403 disabled, got {res_disabled.status_code}"
    print("  [OK] Disabled account immediately blocked from protected endpoint (403 Forbidden).")

    # Re-enable
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE USER_ACCOUNT SET status = 'ACTIVE' WHERE user_id = %s", (fac_acc["user_id"],))
            conn.commit()
    finally:
        conn.close()

    # 7. FACULTY PATIENT PROFILE & FAMILY MEMBERS
    print("\n[TEST 15] Faculty accesses own profile & medical history (/api/faculty/me & /records)...")
    res_fac_prof = client.get("/api/faculty/me", headers={"Authorization": f"Bearer {fac_token}"})
    assert res_fac_prof.status_code == 200
    assert res_fac_prof.json()["data"]["patient_id"] == fac_acc["patient_id"]
    print(f"  [OK] Faculty profile verified: Patient ID = {res_fac_prof.json()['data']['patient_id']}")

    res_fac_rec = client.get("/api/faculty/records", headers={"Authorization": f"Bearer {fac_token}"})
    assert res_fac_rec.status_code == 200
    print(f"  [OK] Faculty records queryable via patient_id: {res_fac_rec.json()['data']}")

    print("\n[TEST 16] Faculty registers linked family member (/api/faculty/family)...")
    res_fam_add = client.post(
        "/api/faculty/family",
        headers={"Authorization": f"Bearer {fac_token}"},
        json={
            "full_name": "Meera Sharma",
            "relationship_type": "SPOUSE",
            "age": 45,
            "gender": "FEMALE",
            "blood_group": "A+",
        },
    )
    assert res_fam_add.status_code == 201, f"Failed adding family member: {res_fam_add.text}"
    fam_data = res_fam_add.json()["data"]
    fam_patient_id = fam_data["patient_id"]
    print(f"  [OK] Family member added: {fam_data['full_name']} (Dependent Patient ID: {fam_patient_id})")

    res_fam_list = client.get("/api/faculty/family", headers={"Authorization": f"Bearer {fac_token}"})
    assert res_fam_list.status_code == 200
    assert any(m["patient_id"] == fam_patient_id for m in res_fam_list.json()["data"])
    print(f"  [OK] Family members list returned {len(res_fam_list.json()['data'])} active dependents.")

    print("\n[TEST 17] Strict Family Authorization Gate: Unauthorized patient access rejected (403)...")
    # Try accessing student patient_id = 1
    res_unauth = client.get(f"/api/faculty/family/1/records", headers={"Authorization": f"Bearer {fac_token}"})
    assert res_unauth.status_code == 403, f"Expected 403 unauthorized access, got {res_unauth.status_code}"
    print("  [OK] Unauthorized patient record access correctly rejected with 403 Forbidden.")

    # Authorized dependent access
    res_auth = client.get(f"/api/faculty/family/{fam_patient_id}/records", headers={"Authorization": f"Bearer {fac_token}"})
    assert res_auth.status_code == 200, f"Expected 200 authorized, got {res_auth.status_code}"
    print(f"  [OK] Authorized family record access granted for dependent Patient ID {fam_patient_id}.")

    # 8. BACKWARD COMPATIBILITY & REGRESSION
    print("\n[TEST 18] Backward Compatibility: Legacy /api/auth/login still operational...")
    res_legacy = client.post("/api/auth/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    assert res_legacy.status_code == 200
    assert "access_token" in res_legacy.json()
    print("  [OK] Legacy /api/auth/login fully backward-compatible.")

    print("\n" + "=" * 70)
    print("ALL 18 FOUR-PORTAL & FACULTY INTEGRATION TESTS PASSED (100% SUCCESS)!")
    print("=" * 70)


if __name__ == "__main__":
    run_tests()

