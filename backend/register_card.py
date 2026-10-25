import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import get_db_connection

conn = get_db_connection()
try:
    with conn.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        
        # 1. Update or Insert student record
        cur.execute("SELECT roll_number FROM STUDENT WHERE user_id = 88891 OR roll_number = 'HSINGH_BE24'")
        existing_st = cur.fetchone()
        
        if existing_st:
            cur.execute("""
                UPDATE STUDENT 
                SET roll_number = '1024030109', 
                    full_name = 'Harshveer Singh', 
                    date_of_birth = '2005-12-02', 
                    sex = 'MALE', 
                    blood_group = 'B+', 
                    phone_number = '1234567897', 
                    status = 'ACTIVE' 
                WHERE user_id = 88891 OR roll_number = 'HSINGH_BE24'
            """)
            print("Updated existing STUDENT record for Harshveer Singh to roll 1024030109")
        else:
            cur.execute("""
                INSERT INTO STUDENT (roll_number, user_id, full_name, date_of_birth, sex, blood_group, phone_number, status)
                VALUES ('1024030109', 88891, 'Harshveer Singh', '2005-12-02', 'MALE', 'B+', '1234567897', 'ACTIVE')
            """)
            print("Inserted new STUDENT record for Harshveer Singh")

        # 2. Update child tables
        tables = ['ALLERGY', 'EMERGENCY_CONTACT', 'EMERGENCY_LOG', 'MEDICAL_PROFILE_STATUS', 'RFID_CARD', 'STUDENT_CONDITION', 'STUDENT_MEDICATION', 'STUDENT_PROFILE_HISTORY', 'VISIT']
        for table in tables:
            try:
                cur.execute(f"UPDATE {table} SET roll_number = '1024030109' WHERE roll_number = 'HSINGH_BE24'")
            except Exception as e:
                pass
        
        # 3. Check and enroll RFID Card 3255AF7A
        cur.execute("SELECT rfid_card_id, roll_number, card_uid, status FROM RFID_CARD WHERE card_uid = %s", ('3255AF7A',))
        existing_card = cur.fetchone()
        
        if existing_card:
            cur.execute("UPDATE RFID_CARD SET roll_number = '1024030109', status = 'ACTIVE' WHERE card_uid = '3255AF7A'")
            print(f"Updated RFID_CARD row #{existing_card['rfid_card_id']} to 1024030109")
        else:
            cur.execute("""
                INSERT INTO RFID_CARD (roll_number, card_uid, status, issued_at) 
                VALUES ('1024030109', '3255AF7A', 'ACTIVE', NOW())
            """)
            print("Enrolled new RFID_CARD row with UID 3255AF7A for 1024030109")

        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("""
            SELECT st.roll_number, st.full_name, st.blood_group, st.phone_number, rc.card_uid, rc.status, ua.email
            FROM STUDENT st
            JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id
            JOIN RFID_CARD rc ON st.roll_number = rc.roll_number
            WHERE rc.card_uid = '3255AF7A'
        """)
        res = cur.fetchone()
        print("VERIFIED DB RECORD:", res)
finally:
    conn.close()
