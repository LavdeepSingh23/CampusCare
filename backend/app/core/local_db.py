import os
import sqlite3
from datetime import date, datetime, timedelta

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "campuscare_dev.db"))


class SQLiteDictCursor:
    def __init__(self, cursor):
        self._cursor = cursor
        self.lastrowid = None

    def execute(self, sql, params=None):
        sqlite_sql = sql.replace("%s", "?")
        # Replace MySQL specific function calls with SQLite equivalents if present
        sqlite_sql = sqlite_sql.replace("CURDATE()", "DATE('now')")
        sqlite_sql = sqlite_sql.strip()

        try:
            if params is not None:
                if not isinstance(params, (tuple, list, dict)):
                    params = (params,)
                self._cursor.execute(sqlite_sql, params)
            else:
                self._cursor.execute(sqlite_sql)
            self.lastrowid = self._cursor.lastrowid
        except Exception as e:
            raise e
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        return [dict(r) for r in rows]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


class SQLiteConnectionWrapper:
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return SQLiteDictCursor(self._conn.cursor())

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def get_local_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return SQLiteConnectionWrapper(conn)
