from pathlib import Path

from app.core.database import get_db_connection


# backend/sql
SQL_DIR = Path(__file__).resolve().parents[2] / "sql"


def create_migration_table(connection):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                migration_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                migration_name VARCHAR(255) NOT NULL UNIQUE,
                applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )

    connection.commit()


def get_applied_migrations(connection):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT migration_name
            FROM schema_migrations
            ORDER BY migration_id;
            """
        )

        rows = cursor.fetchall()

    return {row["migration_name"] for row in rows}


def run_migration(connection, migration_file):
    print(f"Running: {migration_file.name}")

    sql = migration_file.read_text(encoding="utf-8-sig").strip()

    if not sql:
        print("  SKIPPED - file is empty")
        return

    with connection.cursor() as cursor:
        cursor.execute(sql)

        cursor.execute(
            """
            INSERT INTO schema_migrations (migration_name)
            VALUES (%s);
            """,
            (migration_file.name,),
        )

    connection.commit()

    print("  OK")


def main():
    print("=" * 50)
    print("CampusCare Database Migration")
    print("=" * 50)

    connection = get_db_connection()

    try:
        print(f"SQL directory: {SQL_DIR}")
        print()

        create_migration_table(connection)

        applied_migrations = get_applied_migrations(connection)

        migration_files = sorted(SQL_DIR.glob("*.sql"))

        if not migration_files:
            print("ERROR: No SQL migration files found.")
            return

        for migration_file in migration_files:

            if migration_file.name in applied_migrations:
                print(f"Already applied: {migration_file.name}")
                continue

            try:
                run_migration(connection, migration_file)

            except Exception:
                connection.rollback()

                print()
                print(f"FAILED: {migration_file.name}")
                print("Migration process stopped.")
                raise

        print()
        print("=" * 50)
        print("ALL MIGRATIONS COMPLETED SUCCESSFULLY")
        print("=" * 50)

    finally:
        connection.close()


if __name__ == "__main__":
    main()