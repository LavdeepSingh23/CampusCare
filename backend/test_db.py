from app.core.database import get_db_connection


def main():
    connection = get_db_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT DATABASE() AS database_name")
            result = cursor.fetchone()

            print("=================================")
            print("DATABASE CONNECTION SUCCESSFUL")
            print("=================================")
            print(f"Database: {result['database_name']}")

    finally:
        connection.close()


if __name__ == "__main__":
    main()