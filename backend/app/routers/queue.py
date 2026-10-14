"""
Backwards-compatible bridge. Canonical router is at app.api.routes.queue.
"""
from app.api.routes.queue import (
    router,
    check_in_student,
    dispense_medicine,
    get_live_queue,
)

__all__ = [
    "router",
    "check_in_student",
    "dispense_medicine",
    "get_live_queue",
]

