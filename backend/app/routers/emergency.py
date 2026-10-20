"""
Backwards-compatible bridge. Canonical router is at app.api.routes.emergency.
"""
from app.api.routes.emergency import (
    router,
    create_emergency,
    list_emergencies,
    get_emergency_detail,
    update_ambulance_status,
    get_student_contact,
    update_student_contact,
)

__all__ = [
    "router",
    "create_emergency",
    "list_emergencies",
    "get_emergency_detail",
    "update_ambulance_status",
    "get_student_contact",
    "update_student_contact",
]

