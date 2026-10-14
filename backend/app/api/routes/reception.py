"""
Canonical Reception Route Bridge for CampusCare.
"""
from app.routers.reception import (
    router,
    lookup_student,
    list_doctors,
    check_in,
    front_desk_queue,
)

__all__ = [
    "router",
    "lookup_student",
    "list_doctors",
    "check_in",
    "front_desk_queue",
]

