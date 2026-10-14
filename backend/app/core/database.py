import logging
import os
import ssl
import time
from contextlib import contextmanager

import pymysql

from app.core import config

logger = logging.getLogger(__name__)


# ── Custom Exceptions ──────────────────────────────────────────────────

class DatabaseError(Exception):
    """Base exception for all database-related operations."""
    pass


class DatabaseConnectionError(DatabaseError):
    """Raised when connecting to the database fails."""
    pass


class DatabaseQueryError(DatabaseError):
    """Raised when an executed query fails."""
    pass


# ── SSL Context Helper ─────────────────────────────────────────────────

def get_ssl_context():
    """
    Constructs an SSL context suitable for cloud MySQL (such as Aiven).
    Supports REQUIRED (TLS encryption without local cert file requirement),
    VERIFY_CA / VERIFY_IDENTITY (with optional CA certificate bundle),
    or DISABLED.
    """
    if config.DB_SSL_MODE == "DISABLED":
        return None

    cafile = config.DB_SSL_CA if (config.DB_SSL_CA and os.path.exists(config.DB_SSL_CA)) else None
    try:
        ctx = ssl.create_default_context(cafile=cafile)
    except Exception as exc:
        logger.warning("Could not initialize default SSL context with cafile=%s: %s. Using default context.", cafile, exc)
        ctx = ssl.create_default_context()

    if config.DB_SSL_MODE == "REQUIRED":
        # Cloud providers like Aiven require TLS encryption, but the client
        # might not have the provider CA bundle installed locally.
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    elif config.DB_SSL_MODE in ("VERIFY_CA", "VERIFY_IDENTITY"):
        ctx.check_hostname = (config.DB_SSL_MODE == "VERIFY_IDENTITY")
        ctx.verify_mode = ssl.CERT_REQUIRED

    return ctx


# ── Connection Factory ─────────────────────────────────────────────────

def _connect_mysql():
    """
    Connects to remote MySQL (e.g. Aiven) using PyMySQL and TLS.
    RAISES DatabaseConnectionError on failure — NEVER silently falls back to SQLite.
    """
    if not config.DB_HOST:
        raise DatabaseConnectionError("DB_HOST is not configured for MySQL mode.")

    ssl_ctx = get_ssl_context()
    connect_kwargs = {
        "host": config.DB_HOST,
        "port": config.DB_PORT,
        "user": config.DB_USER,
        "password": config.DB_PASSWORD,
        "database": config.DB_NAME,
        "cursorclass": pymysql.cursors.DictCursor,
        "autocommit": False,
        "connect_timeout": config.DB_CONNECT_TIMEOUT,
    }
    if ssl_ctx is not None:
        connect_kwargs["ssl"] = ssl_ctx

    try:
        connection = pymysql.connect(**connect_kwargs)
        return connection
    except pymysql.MySQLError as err:
        logger.error(
            "MySQL connection to %s:%s (database: %s) failed: %s",
            config.DB_HOST,
            config.DB_PORT,
            config.DB_NAME,
            err,
        )
        raise DatabaseConnectionError(
            f"Failed to connect to MySQL database at {config.DB_HOST}:{config.DB_PORT}/{config.DB_NAME}: {err}"
        ) from err
    except Exception as err:
        logger.error("Unexpected error connecting to MySQL database: %s", err)
        raise DatabaseConnectionError(
            f"Unexpected error connecting to MySQL database at {config.DB_HOST}: {err}"
        ) from err


def _connect_sqlite():
    """
    Connects to local development SQLite.
    FORBIDDEN in production environment.
    """
    if config.ENVIRONMENT == "production":
        raise DatabaseConnectionError(
            "CRITICAL: Local SQLite database mode is strictly prohibited in production. "
            "Please configure DB_MODE=mysql and valid database credentials."
        )

    from app.core.local_db import get_local_db_connection
    logger.info("Connecting to explicit local SQLite database mode (ENVIRONMENT=%s).", config.ENVIRONMENT)
    return get_local_db_connection()


def get_db_connection():
    """
    Returns an active database connection according to explicit DB_MODE.
    - DB_MODE='mysql': Connects to MySQL/Aiven with TLS. FAILS LOUDLY on error.
    - DB_MODE='sqlite': Connects to local SQLite. Disallowed in production.
    """
    mode = (config.DB_MODE or "mysql").lower()
    if mode == "mysql":
        return _connect_mysql()
    elif mode == "sqlite":
        return _connect_sqlite()
    else:
        raise DatabaseConnectionError(
            f"Invalid DB_MODE: '{mode}'. Supported modes are 'mysql' and 'sqlite'."
        )


# ── Context Managers and Dependencies ──────────────────────────────────

@contextmanager
def get_db_cursor(commit: bool = False):
    """
    Context manager yielding (cursor, connection).
    Automatically commits on normal exit if commit=True.
    Rolls back transaction on any exception.
    Guarantees connection is closed on exit.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            yield cursor, connection
        if commit:
            connection.commit()
    except Exception:
        try:
            connection.rollback()
        except Exception as rb_err:
            logger.warning("Rollback failed: %s", rb_err)
        raise
    finally:
        try:
            connection.close()
        except Exception as cl_err:
            logger.warning("Connection close failed: %s", cl_err)


def get_db():
    """FastAPI dependency yielding a raw connection with automatic cleanup."""
    conn = get_db_connection()
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ── Readiness & Diagnostics Probe ──────────────────────────────────────

def check_database_readiness() -> dict:
    """
    Queries the database to verify active connectivity, latency, and catalog.
    Used by the readiness endpoint (/ready) and startup probes.
    """
    start_time = time.perf_counter()
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 AS probe, DATABASE() AS database_name, VERSION() AS version;")
            row = cursor.fetchone()
            
            # Query active table count
            table_count = 0
            mode = (config.DB_MODE or "mysql").lower()
            if mode == "mysql":
                cursor.execute(
                    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE();"
                )
                t_row = cursor.fetchone()
                if t_row:
                    table_count = t_row.get("n", 0)
            else:
                cursor.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table';")
                t_row = cursor.fetchone()
                if t_row:
                    table_count = t_row.get("n", 0)

            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            
            cipher_info = None
            if hasattr(connection, "_sock") and hasattr(connection._sock, "cipher"):
                try:
                    c = connection._sock.cipher()
                    cipher_info = f"{c[1]} / {c[0]}" if c else None
                except Exception:
                    cipher_info = None

            return {
                "status": "connected",
                "mode": mode,
                "database_name": row.get("database_name") if row else config.DB_NAME,
                "server_version": row.get("version") if row else "unknown",
                "tables_count": table_count,
                "tls_cipher": cipher_info or ("Active" if config.DB_SSL_MODE != "DISABLED" else "None"),
                "latency_ms": latency_ms,
            }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error("Database readiness check failed after %sms: %s", latency_ms, exc)
        raise DatabaseConnectionError(f"Database readiness probe failed: {exc}") from exc
    finally:
        try:
            connection.close()
        except Exception:
            pass