from typing import List, Optional

from pydantic import BaseModel


class UpdateValueRequest(BaseModel):
    """
    Adapter schema: the frontend edits allergies/conditions/medication as
    one free-text blob. We no longer trust a client-supplied
    recorded_by_user_id (the old frontend hardcoded it to 1) - the server
    derives that from the authenticated doctor's token instead.
    """
    value: str


class MedicineInput(BaseModel):
    name: str
    morning: bool = False
    evening: bool = False
    night: bool = False
    note: Optional[str] = ""


class CompleteConsultationRequest(BaseModel):
    roll_number: str
    diagnosis: str
    general: Optional[str] = ""
    medicines: List[MedicineInput] = []
