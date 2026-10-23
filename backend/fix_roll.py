import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import get_db_connection

conn = get_db_connection()
try:
    with conn.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        cur.execute("UPDATE STUDENT SET roll_number = '1024030107', full_name = 'Lavdeep Singh', blood_group = 'B+', status = 'ACTIVE' WHERE user_id = 561")
        for table in ['ALLERGY', 'EMERGENCY_CONTACT', 'EMERGENCY_LOG', 'MEDICAL_PROFILE_STATUS', 'RFID_CARD', 'STUDENT_CONDITION', 'STUDENT_MEDICATION', 'STUDENT_PROFILE_HISTORY', 'VISIT']:
            cur.execute(f"UPDATE {table} SET roll_number = '1024030107' WHERE roll_number = 'LSINGH2_BE24'")
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT roll_number, full_name, blood_group, user_id FROM STUDENT WHERE roll_number = '1024030107'")
        print("Updated student:", cur.fetchone())
finally:
    conn.close()

