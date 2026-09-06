"""
Creates a doctor login you can use to test the app end-to-end.

Usage:
    python seed_doctor.py --email neha.kapoor@campuscare.edu --password test1234 --specialty "General Physician"

Run this once per doctor you want to be able to log in as. It is safe to
re-run with the same email - it will tell you the account already exists
rather than creating a duplicate.
"""
import argparse

from app.core.database import get_db_connection
from app.core.security import hash_password


def seed_doctor(email: str, password: str, specialty_name: str, license_number: str | None):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (email,))
            if cursor.fetchone():
                print(f"An account with email '{email}' already exists. Nothing to do.")
                return

            cursor.execute(
                "SELECT specialty_id FROM SPECIALTY WHERE name = %s",
                (specialty_name,),
            )
            specialty_row = cursor.fetchone()
            if specialty_row:
                specialty_id = specialty_row["specialty_id"]
            else:
                cursor.execute(
                    "INSERT INTO SPECIALTY (name, description, is_active) VALUES (%s, %s, TRUE)",
                    (specialty_name, None),
                )
                specialty_id = cursor.lastrowid
                print(f"Created new specialty: {specialty_name}")

            cursor.execute(
                """
                INSERT INTO USER_ACCOUNT (email, password_hash, account_type, status)
                VALUES (%s, %s, 'STAFF', 'ACTIVE')
                """,
                (email, hash_password(password)),
            )
            user_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO STAFF (user_id, role, status)
                VALUES (%s, 'DOCTOR', 'ACTIVE')
                """,
                (user_id,),
            )
            staff_id = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO DOCTOR (staff_id, specialty_id, license_number)
                VALUES (%s, %s, %s)
                """,
                (staff_id, specialty_id, license_number),
            )
            doctor_id = cursor.lastrowid

        connection.commit()
        print("=" * 50)
        print("DOCTOR LOGIN CREATED")
        print("=" * 50)
        print(f"Email:      {email}")
        print(f"Password:   {password}")
        print(f"doctor_id:  {doctor_id}")
        print("You can log in with these credentials in the app now.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--specialty", default="General Physician")
    parser.add_argument("--license-number", default=None)
    args = parser.parse_args()

    seed_doctor(args.email, args.password, args.specialty, args.license_number)
