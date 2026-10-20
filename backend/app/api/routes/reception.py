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
    search_students,
    get_student_history,
    list_completed_visits,
    list_activity_log,
    get_terminal_settings,
    update_doctor_availability,
    lookup_rfid_card,
    enroll_rfid_card,
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
    "search_students",
    "get_student_history",
    "list_completed_visits",
    "list_activity_log",
    "get_terminal_settings",
    "update_doctor_availability",
    "lookup_rfid_card",
    "enroll_rfid_card",
]
