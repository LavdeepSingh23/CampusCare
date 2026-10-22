"""
Backwards-compatible bridge. Canonical router is at app.api.routes.student.
"""
from app.api.routes.student import (
    router,
    get_current_student_profile,
    update_current_student_profile,
    get_current_student_medical_profile_endpoint,
    update_current_student_medical_profile_endpoint,
    add_student_allergy_endpoint,
    delete_student_allergy_endpoint,
    add_student_condition_endpoint,
    delete_student_condition_endpoint,
    add_student_medication_endpoint,
    delete_student_medication_endpoint,
    get_student_profile,
    get_student_visit_history,
    get_current_student_visit_history,
    get_student_emergency_contacts_endpoint,
)

__all__ = [
    "router",
    "get_current_student_profile",
    "update_current_student_profile",
    "get_current_student_medical_profile_endpoint",
    "update_current_student_medical_profile_endpoint",
    "add_student_allergy_endpoint",
    "delete_student_allergy_endpoint",
    "add_student_condition_endpoint",
    "delete_student_condition_endpoint",
    "add_student_medication_endpoint",
    "delete_student_medication_endpoint",
    "get_student_profile",
    "get_student_visit_history",
    "get_current_student_visit_history",
    "get_student_emergency_contacts_endpoint",
]
