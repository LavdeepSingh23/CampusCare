import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import get_db_connection

def run_migration():
    print("Connecting to database...")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Create Base PATIENT Table
            print("1. Creating PATIENT table...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS PATIENT (
                    patient_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    patient_type ENUM('STUDENT', 'COMMUNITY') NOT NULL,
                    full_name VARCHAR(150) NOT NULL,
                    date_of_birth DATE NULL,
                    age INT NULL,
                    gender ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL DEFAULT 'OTHER',
                    blood_group VARCHAR(10) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_patient_type (patient_type),
                    INDEX idx_patient_name (full_name)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # 2. Add patient_id column to STUDENT table if missing
            print("2. Ensuring patient_id column on STUDENT table...")
            cur.execute("""
                SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'STUDENT' AND COLUMN_NAME = 'patient_id'
            """)
            if not cur.fetchone():
                cur.execute("ALTER TABLE STUDENT ADD COLUMN patient_id BIGINT NULL UNIQUE")
                print("   Added patient_id to STUDENT.")

            # 3. Create COMMUNITY_SEQUENCE table
            print("3. Creating COMMUNITY_SEQUENCE table...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS COMMUNITY_SEQUENCE (
                    seq_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY
                ) ENGINE=InnoDB AUTO_INCREMENT=1001 DEFAULT CHARSET=utf8mb4
            """)

            # 4. Create COMMUNITY_PROFILE table
            print("4. Creating COMMUNITY_PROFILE table...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS COMMUNITY_PROFILE (
                    community_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    patient_id BIGINT NOT NULL UNIQUE,
                    community_code VARCHAR(30) NOT NULL UNIQUE,
                    category ENUM('CARETAKER', 'CAMPUS_WORKER', 'GUARD', 'OTHER') NOT NULL,
                    category_other VARCHAR(150) NULL,
                    affiliation_details VARCHAR(255) NOT NULL,
                    registered_by_staff_id BIGINT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    CONSTRAINT fk_comm_patient
                        FOREIGN KEY (patient_id) REFERENCES PATIENT(patient_id)
                        ON DELETE CASCADE,
                    CONSTRAINT fk_comm_staff
                        FOREIGN KEY (registered_by_staff_id) REFERENCES STAFF(staff_id)
                        ON DELETE SET NULL,
                    INDEX idx_comm_category (category),
                    INDEX idx_comm_code (community_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # 5. Create MANUAL_VERIFICATION table
            print("5. Creating MANUAL_VERIFICATION table...")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS MANUAL_VERIFICATION (
                    verification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    patient_id BIGINT NOT NULL,
                    receptionist_user_id BIGINT NOT NULL,
                    verification_outcome ENUM('VERIFIED', 'REJECTED', 'FLAGGED') NOT NULL,
                    notes TEXT NULL,
                    verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_verif_patient
                        FOREIGN KEY (patient_id) REFERENCES PATIENT(patient_id)
                        ON DELETE CASCADE,
                    CONSTRAINT fk_verif_receptionist
                        FOREIGN KEY (receptionist_user_id) REFERENCES USER_ACCOUNT(user_id)
                        ON DELETE RESTRICT,
                    INDEX idx_verif_patient (patient_id),
                    INDEX idx_verif_outcome (verification_outcome)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)

            # 6. Ensure patient_id on VISIT table & make roll_number nullable
            print("6. Updating VISIT table schema...")
            cur.execute("""
                SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VISIT' AND COLUMN_NAME = 'patient_id'
            """)
            if not cur.fetchone():
                cur.execute("ALTER TABLE VISIT ADD COLUMN patient_id BIGINT NULL AFTER visit_id")
                print("   Added patient_id to VISIT.")

            cur.execute("ALTER TABLE VISIT MODIFY COLUMN roll_number VARCHAR(30) NULL")
            print("   Made VISIT.roll_number nullable.")

            # 7. Backfill PATIENT from STUDENT
            print("7. Backfilling PATIENT records from STUDENT...")
            cur.execute("SELECT roll_number, full_name, date_of_birth, sex, blood_group, patient_id FROM STUDENT")
            students = cur.fetchall()
            backfilled_students = 0
            for s in students:
                p_id = s.get("patient_id")
                if not p_id:
                    # Insert new PATIENT
                    dob = s["date_of_birth"]
                    cur.execute("""
                        INSERT INTO PATIENT (patient_type, full_name, date_of_birth, age, gender, blood_group)
                        VALUES ('STUDENT', %s, %s, TIMESTAMPDIFF(YEAR, %s, CURDATE()), %s, %s)
                    """, (s["full_name"], dob, dob, s["sex"], s["blood_group"]))
                    new_pid = cur.lastrowid
                    cur.execute("UPDATE STUDENT SET patient_id = %s WHERE roll_number = %s", (new_pid, s["roll_number"]))
                    backfilled_students += 1
            print(f"   Backfilled {backfilled_students} student patient records.")

            # 8. Backfill VISIT.patient_id from STUDENT.patient_id
            print("8. Backfilling historical VISIT.patient_id...")
            cur.execute("""
                UPDATE VISIT v
                JOIN STUDENT s ON s.roll_number = v.roll_number
                SET v.patient_id = s.patient_id
                WHERE v.patient_id IS NULL AND v.roll_number IS NOT NULL
            """)
            print(f"   Updated {cur.rowcount} historical visits with unified patient_id.")

            # 9. Add FK from VISIT to PATIENT if not already present
            cur.execute("""
                SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VISIT' AND CONSTRAINT_NAME = 'fk_visit_patient'
            """)
            if not cur.fetchone():
                cur.execute("""
                    ALTER TABLE VISIT
                    ADD CONSTRAINT fk_visit_patient
                        FOREIGN KEY (patient_id) REFERENCES PATIENT(patient_id)
                        ON DELETE RESTRICT
                """)
                print("   Added fk_visit_patient foreign key constraint.")

            # 10. Record migration in schema_migrations
            cur.execute("SELECT * FROM schema_migrations WHERE migration_name = '28_community_identity.sql'")
            if not cur.fetchone():
                cur.execute("INSERT INTO schema_migrations (migration_name) VALUES ('28_community_identity.sql')")
                print("   Recorded 28_community_identity.sql in schema_migrations.")

        conn.commit()
        print("MIGRATION 28 APPLIED SUCCESSFULLY!")
    except Exception as exc:
        conn.rollback()
        print("MIGRATION FAILED:", exc)
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    run_migration()

