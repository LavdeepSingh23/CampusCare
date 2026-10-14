import os
import sys

# Ensure backend directory is in path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from main import app as root_app
from app.main import app as canonical_app
from app.core import config
from app.core.database import (
    get_db_connection,
    check_database_readiness,
    DatabaseConnectionError,
    _connect_sqlite,
)


def test_entrypoints_identical():
    """Verify backend/main.py re-exports the exact canonical app from app.main."""
    assert root_app is canonical_app, "root main.app must match canonical app.main.app"
    print("PASS: Entrypoint verification (main.app is app.main.app)")


def test_router_registration():
    """Verify all critical routes are registered in the FastAPI application."""
    routes = set(canonical_app.openapi()["paths"].keys())
    expected_routes = [
        "/",
        "/health",
        "/ready",
        "/api/health",
        "/api/ready",
        "/api/auth/login",
        "/api/auth/google/student",
        "/api/patient/{roll_number}/profile",
        "/api/patient/{roll_number}/summary",
        "/api/patient/{roll_number}/history",
        "/api/doctor/{doctor_id}/profile",
        "/api/doctor/{doctor_id}/queue",
        "/api/doctor/{doctor_id}/stats",
        "/api/reception/doctors",
        "/api/reception/checkin",
        "/api/reception/students/{roll_number}",
        "/api/reception/queue",
    ]
    for exp in expected_routes:
        assert exp in routes, f"Missing route: {exp}"
    print(f"PASS: All {len(expected_routes)} expected routes verified in FastAPI routing table")


def test_health_endpoint():
    """Verify /health returns 200 OK with service and database mode metadata."""
    client = TestClient(canonical_app)
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["database_mode"] == "mysql"
    print("PASS: /health endpoint verified:", data)


def test_ready_endpoint_queries_aiven_mysql():
    """Verify /ready actively queries Aiven MySQL and returns 200 with server version and tables."""
    client = TestClient(canonical_app)
    res = client.get("/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    db_info = data["database"]
    assert db_info["status"] == "connected"
    assert db_info["mode"] == "mysql"
    assert db_info["database_name"] == "campuscare_dev"
    assert "8.4" in db_info["server_version"]
    assert db_info["tables_count"] >= 20
    assert db_info["latency_ms"] > 0
    print("PASS: /ready successfully queried Aiven MySQL live:", db_info)


def test_no_silent_fallback_to_sqlite():
    """Verify that a MySQL connection failure raises DatabaseConnectionError and does NOT fall back to SQLite."""
    original_password = config.DB_PASSWORD
    try:
        config.DB_PASSWORD = "invalid_password_test_123"
        try:
            get_db_connection()
            assert False, "Should have raised DatabaseConnectionError"
        except DatabaseConnectionError as exc:
            assert "Failed to connect to MySQL" in str(exc) or "Access denied" in str(exc)
            print("PASS: Bad MySQL connection correctly raised DatabaseConnectionError without falling back to SQLite")
    finally:
        config.DB_PASSWORD = original_password


def test_ready_endpoint_surfaces_errors_when_db_down():
    """Verify /ready surfaces visible 503 Service Unavailable when the database is unreachable."""
    original_password = config.DB_PASSWORD
    try:
        config.DB_PASSWORD = "invalid_password_test_123"
        client = TestClient(canonical_app)
        res = client.get("/ready")
        assert res.status_code == 503
        data = res.json()
        assert data["status"] == "unhealthy"
        assert "Database is unavailable" in data["error"]
        assert "Access denied" in data["detail"] or "Failed to connect" in data["detail"]
        print("PASS: /ready returned HTTP 503 with visible diagnostics when DB fails:", data["error"])
    finally:
        config.DB_PASSWORD = original_password


def test_production_forbids_sqlite():
    """Verify that SQLite mode is strictly forbidden in production."""
    original_env = config.ENVIRONMENT
    try:
        config.ENVIRONMENT = "production"
        try:
            _connect_sqlite()
            assert False, "Should have forbidden SQLite in production"
        except DatabaseConnectionError as exc:
            assert "strictly prohibited in production" in str(exc)
            print("PASS: SQLite correctly rejected when ENVIRONMENT=production")
    finally:
        config.ENVIRONMENT = original_env


def main():
    print("=" * 60)
    print("RUNNING CAMPUSCARE FASTAPI & MYSQL VERIFICATION SUITE")
    print("=" * 60)
    test_entrypoints_identical()
    test_router_registration()
    test_health_endpoint()
    test_ready_endpoint_queries_aiven_mysql()
    test_no_silent_fallback_to_sqlite()
    test_ready_endpoint_surfaces_errors_when_db_down()
    test_production_forbids_sqlite()
    print("=" * 60)
    print("ALL TESTS PASSED SUCCESSFULLY! BACKEND RELIABLY QUERIES AIVEN MYSQL.")
    print("=" * 60)


if __name__ == "__main__":
    main()
