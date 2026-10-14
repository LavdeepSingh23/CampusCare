import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from jose import jwt
from fastapi.testclient import TestClient

# Ensure backend directory is in path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.main import app
from app.core import config
from app.core.security import create_access_token, decode_access_token
from app.core.database import get_db_connection

client = TestClient(app)


def test_staff_login_receptionist_against_real_db():
    """Verify receptionist authenticates against real MySQL DB records."""
    res = client.post(
        "/api/auth/login",
        json={"email": "reception@thapar.edu", "password": "reception123"},
    )
    assert res.status_code == 200, f"Expected 200 but got {res.status_code}: {res.text}"
    data = res.json()
    assert data["role"] == "RECEPTIONIST"
    assert "access_token" in data
    assert data["access_token"]

    # Decode and verify server token claims
    payload = decode_access_token(data["access_token"])
    assert payload["email"] == "reception@thapar.edu"
    assert payload["role"] == "RECEPTIONIST"
    assert "sub" in payload
    assert "staff_id" in payload
    print("PASS: Receptionist authenticated against real DB records with verified claims")


def test_staff_login_doctor_against_real_db():
    """Verify doctor authenticates against real MySQL DB records."""
    res = client.post(
        "/api/auth/login",
        json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"},
    )
    assert res.status_code == 200, f"Expected 200 but got {res.status_code}: {res.text}"
    data = res.json()
    assert data["role"] == "DOCTOR"
    assert data["doctor_id"] == 2
    assert "access_token" in data

    # Decode and verify server token claims
    payload = decode_access_token(data["access_token"])
    assert payload["email"] == "neha.kapoor@campuscare.edu"
    assert payload["role"] == "DOCTOR"
    assert payload["doctor_id"] == 2
    print("PASS: Doctor authenticated against real DB records with doctor_id claim")


def test_login_invalid_credentials_rejected():
    """Verify wrong password or unknown user is rejected with 401."""
    # Wrong password
    res1 = client.post(
        "/api/auth/login",
        json={"email": "reception@thapar.edu", "password": "wrong_password_xyz"},
    )
    assert res1.status_code == 401, f"Expected 401 for bad password, got {res1.status_code}"

    # Nonexistent user
    res2 = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@thapar.edu", "password": "anypassword"},
    )
    assert res2.status_code == 401, f"Expected 401 for nonexistent user, got {res2.status_code}"
    print("PASS: Invalid credentials correctly rejected with 401 Unauthorized")


def test_jwt_signature_and_expiration_enforcement():
    """Verify JWT signature tampering and expiration are strictly enforced."""
    # 1. Expired token
    expired_token = create_access_token(
        {"sub": "1", "role": "DOCTOR", "doctor_id": 1, "email": "test@thapar.edu"},
        expires_delta=timedelta(seconds=-60),
    )
    res_exp = client.get(
        "/api/queue/live",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res_exp.status_code == 401, f"Expected 401 for expired token, got {res_exp.status_code}"
    assert "expired" in res_exp.json().get("detail", "").lower()

    # 2. Tampered token signature
    valid_token = create_access_token(
        {"sub": "1", "role": "DOCTOR", "doctor_id": 1, "email": "test@thapar.edu"}
    )
    tampered_token = valid_token[:-4] + "ABCD"
    res_tamp = client.get(
        "/api/queue/live",
        headers={"Authorization": f"Bearer {tampered_token}"},
    )
    assert res_tamp.status_code == 401, f"Expected 401 for tampered signature, got {res_tamp.status_code}"

    # 3. Forged token with different secret key
    forged_token = jwt.encode(
        {"sub": "1", "role": "DOCTOR", "doctor_id": 1, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "completely-different-forged-secret-key",
        algorithm="HS256",
    )
    res_forged = client.get(
        "/api/queue/live",
        headers={"Authorization": f"Bearer {forged_token}"},
    )
    assert res_forged.status_code == 401, f"Expected 401 for forged token, got {res_forged.status_code}"

    # 4. Token missing required claims (missing 'role')
    missing_role_token = jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        config.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    res_missing = client.get(
        "/api/queue/live",
        headers={"Authorization": f"Bearer {missing_role_token}"},
    )
    assert res_missing.status_code == 401, f"Expected 401 for token missing role, got {res_missing.status_code}"
    print("PASS: JWT expiration, signature verification, and required claims strictly enforced")


def test_google_student_oauth_validation():
    """Verify Google OAuth token verification and strict @thapar.edu domain checking."""
    # 1. Unsigned / malformed token rejected with 401
    res_unverified = client.post(
        "/api/auth/google/student",
        json={"credential": "raw.fake.token"},
    )
    assert res_unverified.status_code == 401, f"Expected 401 for unverified google token, got {res_unverified.status_code}"

    # 2. Mocking Google OAuth library to simulate non-thapar email
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": "external_student@gmail.com",
            "name": "External Student",
            "sub": "999888777",
        }
        res_non_thapar = client.post(
            "/api/auth/google/student",
            json={"credential": "mocked.valid.signature"},
        )
        assert res_non_thapar.status_code == 403, f"Expected 403 for non-thapar domain, got {res_non_thapar.status_code}"
        assert "thapar.edu" in res_non_thapar.json().get("detail", "")

    # 3. Mocking Google OAuth library to simulate valid @thapar.edu student
    with patch("app.api.routes.auth.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "accounts.google.com",
            "aud": config.GOOGLE_CLIENT_ID or "",
            "email": "ssingh102403499@thapar.edu",
            "name": "Simar Singh",
            "sub": "1122334455",
        }
        res_thapar = client.post(
            "/api/auth/google/student",
            json={"credential": "mocked.valid.signature"},
        )
        assert res_thapar.status_code == 200, f"Expected 200 for valid thapar student, got {res_thapar.status_code}"
        student_data = res_thapar.json()
        assert student_data["roll_number"] == "102403499"
        assert student_data["email"] == "ssingh102403499@thapar.edu"
        assert "access_token" in student_data

        # Verify decoded token has STUDENT role
        st_token_payload = decode_access_token(student_data["access_token"])
        assert st_token_payload["role"] == "STUDENT"
        assert st_token_payload["roll_number"] == "102403499"
    print("PASS: Google student OAuth validation enforces cryptographic verification and @thapar.edu domain")


def test_receptionist_only_route_authorization():
    """Verify /api/queue/checkin allows Receptionist and rejects Doctor and Student with 403."""
    # Obtain receptionist token
    rec_login = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    assert rec_login.status_code == 200
    rec_token = rec_login.json()["access_token"]

    # Obtain doctor token
    doc_login = client.post("/api/auth/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    assert doc_login.status_code == 200
    doc_token = doc_login.json()["access_token"]

    # Create student token
    student_token = create_access_token({
        "sub": "100",
        "email": "student@thapar.edu",
        "roll_number": "102403499",
        "role": "STUDENT",
    })

    # Test 1: Doctor attempts Receptionist operation -> 403 Forbidden
    doc_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {doc_token}"},
        json={"roll_number": "102403499", "doctor_id": 2, "complaint": "Fever"},
    )
    assert doc_res.status_code == 403, f"Expected 403 Forbidden when Doctor calls receptionist checkin, got {doc_res.status_code}"
    assert "Receptionist privileges required" in doc_res.json().get("detail", "")

    # Test 2: Student attempts Receptionist operation -> 403 Forbidden
    st_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"roll_number": "102403499", "doctor_id": 2, "complaint": "Fever"},
    )
    assert st_res.status_code == 403, f"Expected 403 Forbidden when Student calls receptionist checkin, got {st_res.status_code}"

    # Test 3: Unauthenticated request -> 401 Unauthorized
    anon_res = client.post(
        "/api/queue/checkin",
        json={"roll_number": "102403499", "doctor_id": 2, "complaint": "Fever"},
    )
    assert anon_res.status_code == 401, f"Expected 401 for unauthenticated checkin, got {anon_res.status_code}"

    # Test 4: Receptionist performs checkin -> Allowed (200 OK or 409 if already checked in)
    rec_res = client.post(
        "/api/queue/checkin",
        headers={"Authorization": f"Bearer {rec_token}"},
        json={"roll_number": "102403499", "doctor_id": 2, "complaint": "Routine checkup test"},
    )
    assert rec_res.status_code in (200, 409), f"Expected 200 or 409, got {rec_res.status_code}: {rec_res.text}"
    print("PASS: Receptionist-only route correctly rejects Doctor (403), Student (403), Anon (401), and permits Receptionist")


def test_doctor_only_route_authorization():
    """Verify /api/doctor/{doctor_id}/call-next allows Doctor for their own ID and rejects Receptionist and Doctor cross-access."""
    # Obtain receptionist token
    rec_login = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    rec_token = rec_login.json()["access_token"]

    # Obtain Doctor #2 token
    doc2_login = client.post("/api/auth/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    doc2_token = doc2_login.json()["access_token"]

    # Create student token
    student_token = create_access_token({
        "sub": "100",
        "email": "student@thapar.edu",
        "roll_number": "102403499",
        "role": "STUDENT",
    })

    # Test 1: Receptionist attempts Doctor call-next -> 403 Forbidden
    rec_res = client.post(
        "/api/doctor/2/call-next",
        headers={"Authorization": f"Bearer {rec_token}"},
    )
    assert rec_res.status_code == 403, f"Expected 403 when Receptionist calls doctor endpoint, got {rec_res.status_code}"
    assert "Doctor privileges required" in rec_res.json().get("detail", "")

    # Test 2: Student attempts Doctor call-next -> 403 Forbidden
    st_res = client.post(
        "/api/doctor/2/call-next",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert st_res.status_code == 403, f"Expected 403 when Student calls doctor endpoint, got {st_res.status_code}"

    # Test 3: Doctor #2 attempts to call next for Doctor #1 -> 403 Forbidden (cross-doctor prevention)
    cross_res = client.post(
        "/api/doctor/1/call-next",
        headers={"Authorization": f"Bearer {doc2_token}"},
    )
    assert cross_res.status_code == 403, f"Expected 403 when Doctor #2 tries to manage Doctor #1 queue, got {cross_res.status_code}"
    assert "another doctor's workstation" in cross_res.json().get("detail", "")

    # Test 4: Doctor #2 calls next for Doctor #2 -> Authorized (200 if patient waiting, or 404 if queue empty)
    own_res = client.post(
        "/api/doctor/2/call-next",
        headers={"Authorization": f"Bearer {doc2_token}"},
    )
    assert own_res.status_code in (200, 404), f"Expected 200 or 404 for own doctor queue call-next, got {own_res.status_code}: {own_res.text}"
    
    # Also verify GET /api/doctor/2/queue returns 200 OK for matching doctor
    queue_res = client.get(
        "/api/doctor/2/queue",
        headers={"Authorization": f"Bearer {doc2_token}"},
    )
    assert queue_res.status_code == 200, f"Expected 200 for doctor queue, got {queue_res.status_code}: {queue_res.text}"
    print("PASS: Doctor-only route prevents Receptionist (403), Student (403), Cross-Doctor access (403), and permits matching Doctor")



def test_staff_shared_live_queue_authorization():
    """Verify /api/queue/live permits all Staff (Doctor, Receptionist) and rejects Student."""
    rec_login = client.post("/api/auth/login", json={"email": "reception@thapar.edu", "password": "reception123"})
    rec_token = rec_login.json()["access_token"]

    doc_login = client.post("/api/auth/login", json={"email": "neha.kapoor@campuscare.edu", "password": "test1234"})
    doc_token = doc_login.json()["access_token"]

    student_token = create_access_token({
        "sub": "100",
        "email": "student@thapar.edu",
        "roll_number": "102403499",
        "role": "STUDENT",
    })

    # Doctor access -> 200 OK
    res_doc = client.get("/api/queue/live", headers={"Authorization": f"Bearer {doc_token}"})
    assert res_doc.status_code == 200, f"Doctor should access live queue: {res_doc.status_code}"

    # Receptionist access -> 200 OK
    res_rec = client.get("/api/queue/live", headers={"Authorization": f"Bearer {rec_token}"})
    assert res_rec.status_code == 200, f"Receptionist should access live queue: {res_rec.status_code}"

    # Student access -> 403 Forbidden
    res_st = client.get("/api/queue/live", headers={"Authorization": f"Bearer {student_token}"})
    assert res_st.status_code == 403, f"Student should be forbidden from live queue: {res_st.status_code}"

    # Anonymous -> 401 Unauthorized
    res_anon = client.get("/api/queue/live")
    assert res_anon.status_code == 401, f"Anonymous should be unauthorized: {res_anon.status_code}"
    print("PASS: Shared staff route allows Doctor & Receptionist and rejects Student & Anonymous")


def main():
    print("=" * 70)
    print("RUNNING CAMPUSCARE PHASE 3 AUTHENTICATION & ROLE SEPARATION TESTS")
    print("=" * 70)
    test_staff_login_receptionist_against_real_db()
    test_staff_login_doctor_against_real_db()
    test_login_invalid_credentials_rejected()
    test_jwt_signature_and_expiration_enforcement()
    test_google_student_oauth_validation()
    test_receptionist_only_route_authorization()
    test_doctor_only_route_authorization()
    test_staff_shared_live_queue_authorization()
    print("=" * 70)
    print("ALL PHASE 3 AUTHENTICATION & ROLE SEPARATION TESTS PASSED!")
    print("=" * 70)


if __name__ == "__main__":
    main()
