"""
Creates a receptionist login to test the reception desk in CampusCare.

Usage:
    python seed_receptionist.py --email reception@thapar.edu --password reception123
"""
import argparse
from app.core.database import get_db_connection
from app.core.security import hash_password


def seed_receptionist(email: str, password: str):
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT user_id FROM USER_ACCOUNT WHERE email = %s", (email,))
            existing_user = cursor.fetchone()
            if existing_user:
                user_id = existing_user["user_id"]
                # Update password and ensure active status
                cursor.execute(
                    """
                    UPDATE USER_ACCOUNT
                    SET password_hash = %s, status = 'ACTIVE', account_type = 'STAFF'
                    WHERE user_id = %s
                    """,
                    (hash_password(password), user_id),
                )
                cursor.execute("SELECT staff_id FROM STAFF WHERE user_id = %s", (user_id,))
                staff_row = cursor.fetchone()
                if staff_row:
                    cursor.execute(
                        "UPDATE STAFF SET role = 'RECEPTIONIST', status = 'ACTIVE' WHERE user_id = %s",
                        (user_id,),
                    )
                    staff_id = staff_row["staff_id"]
                else:
                    cursor.execute(
                        "INSERT INTO STAFF (user_id, role, status) VALUES (%s, 'RECEPTIONIST', 'ACTIVE')",
                        (user_id,),
                    )
                    staff_id = cursor.lastrowid
                print(f"Updated existing account for '{email}' to RECEPTIONIST.")
            else:
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
                    VALUES (%s, 'RECEPTIONIST', 'ACTIVE')
                    """,
                    (user_id,),
                )
                staff_id = cursor.lastrowid
                print(f"Created new RECEPTIONIST account for '{email}'.")

        connection.commit()
        print("=" * 50)
        print("RECEPTIONIST LOGIN READY")
        print("=" * 50)
        print(f"Email:     {email}")
        print(f"Password:  {password}")
        print(f"Staff ID:  {staff_id}")
        print("=" * 50)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", default="reception@thapar.edu")
    parser.add_argument("--password", default="reception123")
    args = parser.parse_args()

    seed_receptionist(args.email, args.password)

