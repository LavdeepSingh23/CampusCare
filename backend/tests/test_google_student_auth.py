import base64
import json
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def make_jwt(payload):
    header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').decode().rstrip("=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"{header}.{body}.sig"

def test_google_auth():
    # Test 1: Reject non-thapar email with 403
    bad_token = make_jwt({"email": "student@gmail.com", "name": "John Doe", "sub": "1001"})
    res_bad = client.post("/api/auth/google/student", json={"credential": bad_token})
    print("Test 1 (gmail.com rejection):", res_bad.status_code, res_bad.json())
    assert res_bad.status_code == 403, f"Expected 403 but got {res_bad.status_code}"

    # Test 2: Accept valid @thapar.edu email with 200
    good_token = make_jwt({"email": "ssingh102403499@thapar.edu", "name": "Simar Singh", "sub": "1002"})
    res_good = client.post("/api/auth/google/student", json={"credential": good_token})
    print("Test 2 (thapar.edu acceptance):", res_good.status_code, res_good.json())
    assert res_good.status_code == 200, f"Expected 200 but got {res_good.status_code}"
    data = res_good.json()
    assert data["roll_number"] == "102403499"
    assert data["email"] == "ssingh102403499@thapar.edu"
    assert "access_token" in data

    print("\nSUCCESS: All backend Google student authorization tests passed!")

if __name__ == "__main__":
    test_google_auth()
