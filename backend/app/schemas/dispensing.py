from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class DispensingItemInput(BaseModel):
    """
    Item-level input for medicine dispensing.
    Allows recording actual dispensed quantity, medicine name substitutions, or partial fulfillment.
    """
    prescription_item_id: Optional[int] = Field(default=None, description="Linked PRESCRIPTION_ITEM ID")
    prescriptionItemId: Optional[int] = Field(default=None, description="CamelCase alias for prescription_item_id")

    medicine_name: Optional[str] = Field(default=None, max_length=150, description="Medicine name dispensed")
    medicineName: Optional[str] = Field(default=None, max_length=150)
    dispensed_medicine_name: Optional[str] = Field(default=None, max_length=150)

    strength: Optional[str] = Field(default=None, max_length=50)
    dispensed_strength: Optional[str] = Field(default=None, max_length=50)
    dispensedStrength: Optional[str] = Field(default=None, max_length=50)

    quantity: Optional[float] = Field(default=None, ge=0, description="Quantity dispensed")
    dispensed_quantity: Optional[float] = Field(default=None, ge=0)
    dispensedQuantity: Optional[float] = Field(default=None, ge=0)

    was_changed: Optional[bool] = Field(default=False)
    wasChanged: Optional[bool] = Field(default=False)

    change_reason: Optional[str] = Field(default=None, max_length=255)
    changeReason: Optional[str] = Field(default=None, max_length=255)

    def get_prescription_item_id(self) -> Optional[int]:
        return self.prescription_item_id if self.prescription_item_id is not None else self.prescriptionItemId

    def get_medicine_name(self) -> Optional[str]:
        return self.dispensed_medicine_name or self.medicine_name or self.medicineName

    def get_strength(self) -> Optional[str]:
        return self.dispensed_strength or self.dispensedStrength or self.strength

    def get_quantity(self) -> Optional[float]:
        if self.dispensed_quantity is not None:
            return float(self.dispensed_quantity)
        if self.dispensedQuantity is not None:
            return float(self.dispensedQuantity)
        if self.quantity is not None:
            return float(self.quantity)
        return None

    def get_was_changed(self) -> bool:
        return bool(self.was_changed or self.wasChanged)

    def get_change_reason(self) -> Optional[str]:
        return (self.change_reason or self.changeReason or "").strip() or None


class DispenseRequest(BaseModel):
    """
    Request body for POST /api/queue/{visit_id}/dispense.
    Supports simple notes (backward-compatible) and full item-level dispensing.
    """
    remarks: Optional[str] = Field(default=None, max_length=500, description="Dispensing notes or pharmacy remarks")
    status: Optional[str] = Field(
        default=None,
        description="Fulfillment status e.g. 'DISPENSED', 'PARTIALLY_DISPENSED', 'Dispensed as prescribed', 'Partially dispensed', 'Substituted'",
    )
    dispensing_status: Optional[str] = Field(default=None)
    dispensingStatus: Optional[str] = Field(default=None)
    dispensing_type: Optional[str] = Field(default=None)
    dispensingType: Optional[str] = Field(default=None)

    change_reason: Optional[str] = Field(default=None, max_length=255, description="Reason for partial dispensing or substitution")
    changeReason: Optional[str] = Field(default=None, max_length=255)

    items: Optional[List[DispensingItemInput]] = Field(default=None, description="Optional per-medicine dispensing overrides")

    def get_status(self) -> Optional[str]:
        return self.dispensing_status or self.dispensingStatus or self.dispensing_type or self.dispensingType or self.status

    def get_change_reason(self) -> Optional[str]:
        return (self.change_reason or self.changeReason or "").strip() or None


class DispensingItemDetail(BaseModel):
    dispensing_item_id: int
    dispensingItemId: int
    dispensing_id: int
    dispensingId: int
    prescription_item_id: Optional[int] = None
    prescriptionItemId: Optional[int] = None

    dispensed_medicine_name: str
    dispensedMedicineName: str
    medicine_name: str
    medicineName: str
    med: str

    dispensed_strength: Optional[str] = None
    dispensedStrength: Optional[str] = None
    strength: Optional[str] = None

    dispensed_quantity: Optional[float] = None
    dispensedQuantity: Optional[float] = None
    quantity: Optional[float] = None
    qty: Optional[float] = None

    was_changed: bool = False
    wasChanged: bool = False
    change_reason: Optional[str] = None
    changeReason: Optional[str] = None


class DispenseResponse(BaseModel):
    status: str
    visit_id: int
    visitId: int
    roll_number: str
    rollNumber: str
    dispensing_id: Optional[int] = None
    dispensingId: Optional[int] = None
    dispensing_status: Optional[str] = None
    dispensingStatus: Optional[str] = None
    dispensed_by_staff_id: Optional[int] = None
    dispensedByStaffId: Optional[int] = None
    was_changed: bool = False
    wasChanged: bool = False
    change_reason: Optional[str] = None
    changeReason: Optional[str] = None
    completed_at: Optional[str] = None
    completedAt: Optional[str] = None
    items: List[DispensingItemDetail] = []


class PrescribedItemResponse(BaseModel):
    prescription_item_id: int
    prescriptionItemId: int
    id: int
    medicine_name: str
    medicineName: str
    name: str
    med: str
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    dosageForm: Optional[str] = None
    route: Optional[str] = None
    duration_value: Optional[int] = None
    durationValue: Optional[int] = None
    duration_unit: Optional[str] = None
    durationUnit: Optional[str] = None
    duration_text: str = ""
    days: int = 3
    meal_relation: Optional[str] = None
    mealRelation: Optional[str] = None
    special_instructions: Optional[str] = None
    specialInstructions: Optional[str] = None
    note: Optional[str] = None
    calculated_total_quantity: float = 1.0
    calculatedTotalQuantity: float = 1.0
    quantity: float = 1.0
    qty: float = 1.0
    frequency: str = ""
    freq: str = ""
    doses: List[Dict[str, Any]] = []


class AwaitingDispenseVisitResponse(BaseModel):
    visit_id: int
    visitId: int
    id: int
    roll_number: str
    rollNumber: str
    rollNo: str
    patient_name: str
    patientName: str
    name: str
    blood_group: Optional[str] = None
    bloodGroup: Optional[str] = None
    blood: Optional[str] = None
    allergies: str = "None recorded"
    allergy: str = "None recorded"
    doctor_id: int
    doctorId: int
    doctor_name: str
    doctorName: str
    doctor_email: str
    specialty: Optional[str] = None
    consultation_id: Optional[int] = None
    consultationId: Optional[int] = None
    prescription_id: Optional[int] = None
    prescriptionId: Optional[int] = None
    rx_no: Optional[int] = None
    rxNo: Optional[int] = None
    diagnosis: Optional[str] = None
    reason_for_visit: Optional[str] = None
    reasonForVisit: Optional[str] = None
    clinical_notes: Optional[str] = None
    clinicalNotes: Optional[str] = None
    general_instructions: Optional[str] = None
    generalInstructions: Optional[str] = None
    advice: Optional[str] = None
    finalized_at: Optional[str] = None
    finalizedAt: Optional[str] = None
    consultation_completed_at: Optional[str] = None
    consultationCompletedAt: Optional[str] = None
    checked_in_at: Optional[str] = None
    checkedInAt: Optional[str] = None
    status: str = "WAITING_FOR_MEDICINE"
    visit_status: str = "WAITING_FOR_MEDICINE"
    visitStatus: str = "WAITING_FOR_MEDICINE"
    items: List[PrescribedItemResponse] = []
    medicines: List[PrescribedItemResponse] = []
    rx: List[PrescribedItemResponse] = []

