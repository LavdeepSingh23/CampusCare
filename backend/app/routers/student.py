"""
Backwards-compatible bridge. Canonical router is at app.api.routes.student.
"""
from app.api.routes.student import (
    router,
    get_current_student_profile,
    update_current_student_profile,
    get_student_profile,
    get_student_visit_history,
)

__all__ = [
    "router",
    "get_current_student_profile",
    "update_current_student_profile",
    "get_student_profile",
    "get_student_visit_history",
]
