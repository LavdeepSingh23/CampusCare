from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class UpdateValueRequest(BaseModel):
    """
    Adapter schema: the frontend edits allergies/conditions/medication as
    one free-text blob. We no longer trust a client-supplied
    recorded_by_user_id - the server derives that from the authenticated
    doctor's token instead.
    """
    value: str


class DoseScheduleInput(BaseModel):
    """
    Explicit dose schedule item for a specific time of day.
    """
    time_of_day: str = Field(..., description="Time of day: MORNING, AFTERNOON, EVENING, NIGHT")
    dose_quantity: float = Field(default=1.0, ge=0.01, description="Quantity for this dose (positive decimal)")
    dose_unit: str = Field(default="dose", max_length=30, description="Dose unit e.g. 'tablets', 'ml', 'dose'")

    @field_validator("time_of_day")
    @classmethod
    def validate_time_of_day(cls, v: str) -> str:
        clean = (v or "").strip().upper()
        if clean not in ("MORNING", "AFTERNOON", "EVENING", "NIGHT"):
            raise ValueError(f"Invalid time_of_day '{v}'. Must be one of: MORNING, AFTERNOON, EVENING, NIGHT")
        return clean


class MedicineInput(BaseModel):
    """
    Structured prescription medicine item supporting both rich clinical fields
    and lenient frontend draft format.
    """
    name: str = Field(..., min_length=1, max_length=150, description="Medicine name (required)")
    medicine_name: Optional[str] = Field(default=None, max_length=150)
    medicineName: Optional[str] = Field(default=None, max_length=150)

    strength: Optional[str] = Field(default=None, max_length=50)
    dosage_form: Optional[str] = Field(default=None, max_length=50)
    dosageForm: Optional[str] = Field(default=None, max_length=50)
    category: Optional[str] = Field(default=None, max_length=50)
    route: Optional[str] = Field(default=None, max_length=50)

    duration_value: Optional[int] = Field(default=None, ge=1)
    durationValue: Optional[int] = Field(default=None, ge=1)
    duration_unit: Optional[str] = Field(default=None, description="DAY, WEEK, or MONTH")
    durationUnit: Optional[str] = Field(default=None, description="DAY, WEEK, or MONTH")
    duration: Optional[str] = Field(default=None, description="Free text duration e.g. '3 days'")

    meal_relation: Optional[str] = Field(default=None, description="BEFORE_MEAL, AFTER_MEAL, WITH_MEAL, ANY_TIME, NOT_APPLICABLE")
    mealRelation: Optional[str] = Field(default=None)

    special_instructions: Optional[str] = Field(default=None)
    specialInstructions: Optional[str] = Field(default=None)
    note: Optional[str] = Field(default="")
    instructions: Optional[str] = Field(default=None)

    # Simple time boolean flags
    morning: bool = False
    afternoon: bool = False
    evening: bool = False
    night: bool = False

    # Medical shorthand dosage e.g. "1-0-1", "OD", "BD", "TID"
    dosage: Optional[str] = None
    dose_quantity: Optional[float] = Field(default=1.0, ge=0.01)
    doseQuantity: Optional[float] = None
    dose_unit: Optional[str] = Field(default="dose", max_length=30)
    doseUnit: Optional[str] = None

    # Detailed dose schedule list if passed explicitly
    doses: Optional[List[DoseScheduleInput]] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = (v or "").strip()
        if not clean:
            raise ValueError("Medicine name cannot be empty.")
        return clean

    @field_validator("duration_unit")
    @classmethod
    def validate_duration_unit(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        clean = v.strip().upper()
        if clean in ("DAY", "DAYS"):
            return "DAY"
        if clean in ("WEEK", "WEEKS"):
            return "WEEK"
        if clean in ("MONTH", "MONTHS"):
            return "MONTH"
        raise ValueError(f"Invalid duration_unit '{v}'. Must be DAY, WEEK, or MONTH.")

    @field_validator("meal_relation")
    @classmethod
    def validate_meal_relation(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        clean = v.strip().upper().replace(" ", "_")
        valid = {"BEFORE_MEAL", "AFTER_MEAL", "WITH_MEAL", "ANY_TIME", "NOT_APPLICABLE"}
        if clean not in valid:
            raise ValueError(f"Invalid meal_relation '{v}'. Must be one of: {', '.join(valid)}")
        return clean

    @model_validator(mode="after")
    def unify_medicine_fields(self) -> "MedicineInput":
        if self.name is None and (self.medicine_name or self.medicineName):
            self.name = self.medicine_name or self.medicineName
        if not self.dosage_form and (self.dosageForm or self.category):
            self.dosage_form = self.dosageForm or self.category
        if self.duration_value is None and self.durationValue is not None:
            self.duration_value = self.durationValue
        if not self.duration_unit and self.durationUnit:
            self.duration_unit = self.durationUnit
        if not self.meal_relation and self.mealRelation:
            self.meal_relation = self.mealRelation
        if not self.special_instructions:
            self.special_instructions = self.specialInstructions or self.instructions or self.note
        if self.doseQuantity is not None and self.dose_quantity == 1.0:
            self.dose_quantity = self.doseQuantity
        if self.doseUnit and self.dose_unit == "dose":
            self.dose_unit = self.doseUnit
        return self


class CompleteConsultationRequest(BaseModel):
    """
    Request body for doctor consultation completion and prescription finalization.
    Supports identifying visits by visit_id (canonical) or roll_number (backward-compatible fallback).
    """
    visit_id: Optional[int] = Field(default=None, description="Canonical visit identifier")
    visitId: Optional[int] = Field(default=None, description="CamelCase alias for visit_id")
    roll_number: Optional[str] = Field(default=None, max_length=30)
    rollNumber: Optional[str] = Field(default=None, max_length=30)

    diagnosis: str = Field(..., min_length=1, description="Clinical diagnosis (required)")
    reason_for_visit: Optional[str] = Field(default=None, description="Primary reason for visit / chief complaint")
    reasonForVisit: Optional[str] = Field(default=None)

    clinical_notes: Optional[str] = Field(default=None)
    clinicalNotes: Optional[str] = Field(default=None)
    general_instructions: Optional[str] = Field(default=None)
    generalInstructions: Optional[str] = Field(default=None)
    general: Optional[str] = Field(default=None, description="General advice / notes alias")

    medicines: List[MedicineInput] = Field(default_factory=list)

    @field_validator("diagnosis")
    @classmethod
    def validate_diagnosis(cls, v: str) -> str:
        clean = (v or "").strip()
        if not clean:
            raise ValueError("Diagnosis cannot be empty.")
        return clean

    @model_validator(mode="after")
    def unify_aliases(self) -> "CompleteConsultationRequest":
        if self.visit_id is None and self.visitId is not None:
            self.visit_id = self.visitId
        if self.roll_number is None and self.rollNumber is not None:
            self.roll_number = self.rollNumber
        if not self.reason_for_visit and self.reasonForVisit:
            self.reason_for_visit = self.reasonForVisit
        if not self.clinical_notes:
            self.clinical_notes = self.clinicalNotes or self.general
        if not self.general_instructions:
            self.general_instructions = self.generalInstructions or self.general
        return self


class SavedPrescriptionDose(BaseModel):
    time_of_day: str
    timeOfDay: str
    dose_quantity: float
    doseQuantity: float
    dose_unit: str
    doseUnit: str


class SavedPrescriptionItem(BaseModel):
    prescription_item_id: int
    prescriptionItemId: int
    medicine_name: str
    medicineName: str
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    dosageForm: Optional[str] = None
    route: Optional[str] = None
    duration_value: Optional[int] = None
    durationValue: Optional[int] = None
    duration_unit: Optional[str] = None
    durationUnit: Optional[str] = None
    meal_relation: Optional[str] = None
    mealRelation: Optional[str] = None
    special_instructions: Optional[str] = None
    specialInstructions: Optional[str] = None
    doses: List[SavedPrescriptionDose] = Field(default_factory=list)


class CompleteConsultationResponse(BaseModel):
    status: str = "ok"
    prescription_id: int
    prescriptionId: int
    consultation_id: int
    consultationId: int
    visit_id: int
    visitId: int
    roll_number: str
    rollNumber: str
    doctor_id: int
    doctorId: int
    diagnosis: str
    reason_for_visit: str
    reasonForVisit: str
    clinical_notes: Optional[str] = None
    clinicalNotes: Optional[str] = None
    general_instructions: Optional[str] = None
    generalInstructions: Optional[str] = None
    finalized_at: str
    finalizedAt: str
    visit_status: str = "WAITING_FOR_MEDICINE"
    visitStatus: str = "WAITING_FOR_MEDICINE"
    queue_status: str = "COMPLETED"
    queueStatus: str = "COMPLETED"
    medicines: List[SavedPrescriptionItem] = Field(default_factory=list)
    items: List[SavedPrescriptionItem] = Field(default_factory=list)
