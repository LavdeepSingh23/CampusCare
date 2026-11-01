import json
import time
import urllib.request
import statistics
import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.abspath("backend"))

from app.core import database as db

# 1. Fetch staff accounts from database
conn = db.get_db_connection()
with conn.cursor() as cur:
    cur.execute("SELECT ua.email, s.role, s.staff_id, d.doctor_id FROM USER_ACCOUNT ua JOIN STAFF s ON s.user_id = ua.user_id LEFT JOIN DOCTOR d ON d.staff_id = s.staff_id")
    staff_accounts = cur.fetchall()
conn.close()

print("Staff accounts:")
for sa in staff_accounts:
    print(" ", sa)

receptionist_email = next((sa["email"] for sa in staff_accounts if sa["role"] == "RECEPTIONIST"), "reception@thapar.edu")
doctor_info = next((sa for sa in staff_accounts if sa["role"] == "DOCTOR"), None)
doctor_email = doctor_info["email"] if doctor_info else "doctor@thapar.edu"
doctor_id = doctor_info["doctor_id"] if doctor_info else 1

print(f"\nUsing receptionist: {receptionist_email}, doctor: {doctor_email} (ID #{doctor_id})")

# 2. Login Receptionist
rec_login_url = "http://localhost:8000/api/auth/receptionist/login"
payload = json.dumps({"email": receptionist_email, "password": "password123"}).encode("utf-8")
req = urllib.request.Request(rec_login_url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=10) as resp:
    rec_token = json.loads(resp.read().decode("utf-8"))["access_token"]

# 3. Login Doctor
doc_login_url = "http://localhost:8000/api/auth/doctor/login"
payload = json.dumps({"email": doctor_email, "password": "password123"}).encode("utf-8")
req = urllib.request.Request(doc_login_url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=10) as resp:
    doc_res = json.loads(resp.read().decode("utf-8"))
    doc_token = doc_res["access_token"]

print("Authenticated receptionist and doctor successfully.")

# 4. Measure Direct Database Handshake & Query Time
db_connect_times = []
query_times = []
for i in range(5):
    t0 = time.perf_counter()
    c = db.get_db_connection()
    t1 = time.perf_counter()
    db_connect_times.append((t1 - t0) * 1000)
    
    with c.cursor() as cur:
        t2 = time.perf_counter()
        cur.execute("SELECT 1")
        cur.fetchone()
        t3 = time.perf_counter()
        query_times.append((t3 - t2) * 1000)
    c.close()

print(f"\nDirect DB TCP+TLS Connect Time (ms):")
print(f"  p50 = {statistics.median(db_connect_times):.1f} ms")
print(f"  min = {min(db_connect_times):.1f} ms, max = {max(db_connect_times):.1f} ms")

print(f"Direct DB Query Roundtrip Time (ms):")
print(f"  p50 = {statistics.median(query_times):.1f} ms")
print(f"  min = {min(query_times):.1f} ms, max = {max(query_times):.1f} ms")

# 5. Measure Doctor Queue API Call Latency
queue_times = []
for i in range(5):
    t0 = time.perf_counter()
    q_url = f"http://localhost:8000/api/doctor/{doctor_id}/queue"
    req = urllib.request.Request(q_url, headers={"Authorization": f"Bearer {doc_token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        queue_data = json.loads(resp.read().decode("utf-8"))
    t1 = time.perf_counter()
    queue_times.append((t1 - t0) * 1000)

print(f"\nDoctor Queue API Latency (ms):")
print(f"  p50 = {statistics.median(queue_times):.1f} ms")
print(f"  min = {min(queue_times):.1f} ms, max = {max(queue_times):.1f} ms")
print(f"  Active Queue Size: {len(queue_data)} patient(s)")

# 6. Measure Student Summary API Call Latency (if queue not empty)
if queue_data:
    sample_roll = queue_data[0].get("rollNumber") or queue_data[0].get("roll_number")
    if sample_roll:
        summary_times = []
        for i in range(5):
            t0 = time.perf_counter()
            s_url = f"http://localhost:8000/api/student/{sample_roll}/summary"
            req = urllib.request.Request(s_url, headers={"Authorization": f"Bearer {doc_token}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                summary_data = json.loads(resp.read().decode("utf-8"))
            t1 = time.perf_counter()
            summary_times.append((t1 - t0) * 1000)
        print(f"\nPatient Summary API Latency (ms):")
        print(f"  p50 = {statistics.median(summary_times):.1f} ms")
        print(f"  min = {min(summary_times):.1f} ms, max = {max(summary_times):.1f} ms")

print("\nMeasurement baseline completed successfully.")
