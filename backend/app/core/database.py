import logging
import os
import queue
import ssl
import threading
import time
from contextlib import contextmanager
from typing import Any, Dict, Optional

import pymysql
import pymysql.cursors

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
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    elif config.DB_SSL_MODE in ("VERIFY_CA", "VERIFY_IDENTITY"):
        ctx.check_hostname = (config.DB_SSL_MODE == "VERIFY_IDENTITY")
        ctx.verify_mode = ssl.CERT_REQUIRED

    return ctx


# ── Pooled MySQL Connection Wrapper ────────────────────────────────────

class PooledMySQLConnection:
    """
    Transparent proxy wrapper for a pooled PyMySQL connection.
    Intercepts .close() to return the underlying connection to the pool
    rather than destroying the TCP/TLS socket.
    """
    def __init__(self, raw_conn: pymysql.Connection, pool: "MySQLConnectionPool", created_at: float):
        self._raw_conn = raw_conn
        self._pool = pool
        self._created_at = created_at
        self._is_closed = False

    def close(self):
        """Returns the connection to the pool instead of closing the physical socket."""
        if not self._is_closed:
            self._is_closed = True
            self._pool.release(self._raw_conn, self._created_at)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def __getattr__(self, name: str) -> Any:
        if self._is_closed:
            raise DatabaseConnectionError("Cannot operate on a closed database connection.")
        return getattr(self._raw_conn, name)


# ── Thread-Safe Connection Pool ────────────────────────────────────────

class MySQLConnectionPool:
    """
    Thread-safe connection pool for PyMySQL over WAN TLS.
    Maintains pre-warmed connections to eliminate the ~3.2s TLS handshake penalty
    per HTTP request.
    """
    def __init__(
        self,
        host: str,
        port: int,
        user: str,
        password: str,
        database: str,
        ssl_ctx: Optional[ssl.SSLContext] = None,
        min_connections: int = 5,
        max_connections: int = 20,
        acquire_timeout: float = 5.0,
        recycle_seconds: int = 300,
        connect_timeout: int = 10,
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.ssl_ctx = ssl_ctx
        self.min_connections = min_connections
        self.max_connections = max_connections
        self.acquire_timeout = acquire_timeout
        self.recycle_seconds = recycle_seconds
        self.connect_timeout = connect_timeout

        self._pool: queue.Queue = queue.Queue(maxsize=max_connections)
        self._lock = threading.Lock()
        self._created_count = 0
        self._is_closed = False

    def _create_raw_connection(self) -> pymysql.Connection:
        connect_kwargs = {
            "host": self.host,
            "port": self.port,
            "user": self.user,
            "password": self.password,
            "database": self.database,
            "cursorclass": pymysql.cursors.DictCursor,
            "autocommit": False,
            "connect_timeout": self.connect_timeout,
        }
        if self.ssl_ctx is not None:
            connect_kwargs["ssl"] = self.ssl_ctx

        max_retries = 3
        for attempt in range(max_retries):
            try:
                conn = pymysql.connect(**connect_kwargs)
                return conn
            except pymysql.MySQLError as err:
                err_code = err.args[0] if getattr(err, "args", None) else None
                is_transient = (
                    err_code in (2003, 2013)
                    or "getaddrinfo" in str(err)
                    or "timed out" in str(err)
                    or "lost connection" in str(err).lower()
                )
                if attempt < max_retries - 1 and is_transient:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise DatabaseConnectionError(
                    f"Failed to connect to MySQL database at {self.host}:{self.port}/{self.database}: {err}"
                ) from err

    def prewarm(self, count: Optional[int] = None) -> int:
        target = count or self.min_connections
        target = min(target, self.max_connections)
        established = 0
        logger.info("Pre-warming MySQL connection pool with %d connections...", target)
        for i in range(target):
            try:
                raw_conn = self._create_raw_connection()
                now = time.time()
                with self._lock:
                    self._created_count += 1
                self._pool.put((raw_conn, now, now))
                established += 1
            except Exception as exc:
                logger.warning("Failed creating pre-warmed connection #%d: %s", i + 1, exc)
                break
        logger.info("MySQL connection pool pre-warmed with %d/%d connections.", established, target)
        return established

    def acquire(self) -> PooledMySQLConnection:
        if self._is_closed:
            raise DatabaseConnectionError("Database connection pool is closed.")

        deadline = time.time() + self.acquire_timeout
        while time.time() < deadline:
            # 1. Fetch available connection from pool
            try:
                raw_conn, created_at, last_used_at = self._pool.get_nowait()
                now = time.time()

                # Recycle old connections
                if now - created_at > self.recycle_seconds:
                    try:
                        raw_conn.close()
                    except Exception:
                        pass
                    with self._lock:
                        self._created_count -= 1
                    continue

                # Liveness check if idle > 15s
                if now - last_used_at > 15.0:
                    try:
                        raw_conn.ping(reconnect=True)
                    except Exception:
                        try:
                            raw_conn.close()
                        except Exception:
                            pass
                        with self._lock:
                            self._created_count -= 1
                        continue

                return PooledMySQLConnection(raw_conn, self, created_at)
            except queue.Empty:
                pass

            # 2. Dynamically expand pool if below max_connections
            can_create = False
            with self._lock:
                if self._created_count < self.max_connections:
                    self._created_count += 1
                    can_create = True

            if can_create:
                try:
                    raw_conn = self._create_raw_connection()
                    now = time.time()
                    return PooledMySQLConnection(raw_conn, self, now)
                except Exception as exc:
                    with self._lock:
                        self._created_count -= 1
                    raise DatabaseConnectionError(f"Failed to create new pooled connection: {exc}") from exc

            # 3. Wait briefly for a released connection
            time_left = deadline - time.time()
            if time_left <= 0:
                break
            try:
                raw_conn, created_at, last_used_at = self._pool.get(timeout=min(0.2, time_left))
                return PooledMySQLConnection(raw_conn, self, created_at)
            except queue.Empty:
                continue

        raise DatabaseConnectionError(
            f"Database connection pool exhausted after {self.acquire_timeout}s timeout. "
            f"Stats: {self.get_stats()}"
        )

    def release(self, raw_conn: pymysql.Connection, created_at: float):
        if self._is_closed:
            try:
                raw_conn.close()
            except Exception:
                pass
            return

        try:
            raw_conn.rollback()
        except Exception:
            try:
                raw_conn.close()
            except Exception:
                pass
            with self._lock:
                self._created_count -= 1
            return

        now = time.time()
        if now - created_at > self.recycle_seconds:
            try:
                raw_conn.close()
            except Exception:
                pass
            with self._lock:
                self._created_count -= 1
            return

        try:
            self._pool.put_nowait((raw_conn, created_at, now))
        except queue.Full:
            try:
                raw_conn.close()
            except Exception:
                pass
            with self._lock:
                self._created_count -= 1

    def close_all(self):
        self._is_closed = True
        while not self._pool.empty():
            try:
                raw_conn, _, _ = self._pool.get_nowait()
                raw_conn.close()
            except Exception:
                pass
        with self._lock:
            self._created_count = 0
        logger.info("MySQL connection pool closed all connections.")

    def get_stats(self) -> Dict[str, Any]:
        idle = self._pool.qsize()
        with self._lock:
            total = self._created_count
        checked_out = max(0, total - idle)
        return {
            "total_connections": total,
            "idle_connections": idle,
            "checked_out_connections": checked_out,
            "min_connections": self.min_connections,
            "max_connections": self.max_connections,
        }


# Global singleton pool
_mysql_pool: Optional[MySQLConnectionPool] = None
_pool_lock = threading.Lock()


def init_db_pool() -> Optional[MySQLConnectionPool]:
    """Initializes and pre-warms the database connection pool."""
    global _mysql_pool
    mode = (config.DB_MODE or "mysql").lower()
    if mode != "mysql":
        return None

    with _pool_lock:
        if _mysql_pool is None or _mysql_pool._is_closed:
            _mysql_pool = MySQLConnectionPool(
                host=config.DB_HOST,
                port=config.DB_PORT,
                user=config.DB_USER,
                password=config.DB_PASSWORD,
                database=config.DB_NAME,
                ssl_ctx=get_ssl_context(),
                min_connections=config.DB_POOL_MIN,
                max_connections=config.DB_POOL_MAX,
                acquire_timeout=config.DB_POOL_TIMEOUT,
                recycle_seconds=config.DB_POOL_RECYCLE,
                connect_timeout=config.DB_CONNECT_TIMEOUT,
            )
            _mysql_pool.prewarm()
    return _mysql_pool


def close_db_pool():
    """Gracefully closes all pooled connections on application shutdown."""
    global _mysql_pool
    with _pool_lock:
        if _mysql_pool is not None:
            _mysql_pool.close_all()
            _mysql_pool = None


def get_pool_stats() -> Dict[str, Any]:
    """Returns telemetry on connection pool utilization."""
    if _mysql_pool is not None:
        return _mysql_pool.get_stats()
    return {"status": "uninitialized"}


# ── Connection Factory ─────────────────────────────────────────────────

def _connect_mysql():
    """Acquires a pooled MySQL connection."""
    global _mysql_pool
    if _mysql_pool is None or _mysql_pool._is_closed:
        init_db_pool()
    return _mysql_pool.acquire()


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
    - DB_MODE='mysql': Connects to pooled MySQL/Aiven with TLS.
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
    Guarantees connection is returned to pool on exit.
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
            logger.warning("Connection return to pool failed: %s", cl_err)


def get_db():
    """FastAPI dependency yielding a connection with automatic cleanup."""
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
    Queries the database to verify active connectivity, latency, catalog,
    and connection pool status.
    Used by the readiness endpoint (/ready) and startup probes.
    """
    start_time = time.perf_counter()
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 AS probe, DATABASE() AS database_name, VERSION() AS version;")
            row = cursor.fetchone()

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
            raw_c = getattr(connection, "_raw_conn", connection)
            if hasattr(raw_c, "_sock") and hasattr(raw_c._sock, "cipher"):
                try:
                    c = raw_c._sock.cipher()
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
                "pool": get_pool_stats(),
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
