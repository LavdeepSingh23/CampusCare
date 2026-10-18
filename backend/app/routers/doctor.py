"""
Backwards-compatible bridge. Canonical router is at app.api.routes.doctor.
"""
from app.api.routes.doctor import (
    router,
    get_doctor_profile,
    get_doctor_queue,
    get_doctor_stats,
    get_patient_profile,
    get_patient_summary,
    get_patient_history,
    update_allergy,
    update_condition,
    update_medication,
    complete_consultation,
    call_next_student,
    mark_doctor_patient_no_show,
    start_doctor_consultation,
    start_doctor_consultation_by_id,
    redirect_doctor_patient,
)

__all__ = [
    "router",
    "get_doctor_profile",
    "get_doctor_queue",
    "get_doctor_stats",
    "get_patient_profile",
    "get_patient_summary",
    "get_patient_history",
    "update_allergy",
    "update_condition",
    "update_medication",
    "complete_consultation",
    "call_next_student",
    "mark_doctor_patient_no_show",
    "start_doctor_consultation",
    "start_doctor_consultation_by_id",
    "redirect_doctor_patient",
]
