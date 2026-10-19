"""
Canonical Reception Route Bridge for CampusCare.
"""
from app.routers.reception import (
    router,
    lookup_student,
    list_doctors,
    check_in,
    front_desk_queue,
    list_prescriptions_awaiting_dispense,
    get_prescription_by_visit,
    dispense_visit_prescription,
)

__all__ = [
    "router",
    "lookup_student",
    "list_doctors",
    "check_in",
    "front_desk_queue",
    "list_prescriptions_awaiting_dispense",
    "get_prescription_by_visit",
    "dispense_visit_prescription",
]


