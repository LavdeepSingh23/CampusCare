"""
Backwards-compatible bridge. Canonical router is at app.api.routes.auth.
"""
from app.api.routes.auth import (
    router,
    login,
    google_student_login,
    verify_google_oauth_token,
)

__all__ = [
    "router",
    "login",
    "google_student_login",
    "verify_google_oauth_token",
]
