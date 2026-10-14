"""
Backwards-compatible bridge. Canonical router is at app.api.routes.health.
"""
from app.api.routes.health import router, health_check, readiness_check

__all__ = ["router", "health_check", "readiness_check"]
