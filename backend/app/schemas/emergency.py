"""
Emergency Management Schemas for CampusCare.
Pydantic schemas for EMERGENCY_LOG, AMBULANCE_DISPATCH, and EMERGENCY_CONTACT.
"""
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


SeverityLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
AmbulanceStatus = Literal["REQUESTED", "DISPATCHED", "ARRIVED", "COMPLETED", "CANCELLED"]


class AmbulanceDispatchCreate(BaseModel):
    ambulance_provider: Optional[str] = Field(default="Campus Health Center Ambulance Unit", max_length=150)
    contact_number: Optional[str] = Field(default=None, max_length=20)
    vehicle_number: Optional[str] = Field(default=None, max_length=30)
    destination: str = Field(default="Rajindra Hospital, Patiala", min_length=2, max_length=255)
    called_at: Optional[datetime] = None


class AmbulanceDispatchUpdate(BaseModel):
    status: Optional[AmbulanceStatus] = None
    ambulance_provider: Optional[str] = Field(default=None, max_length=150)
    contact_number: Optional[str] = Field(default=None, max_length=20)
    vehicle_number: Optional[str] = Field(default=None, max_length=30)
    called_at: Optional[datetime] = None
    arrived_at: Optional[datetime] = None
    departure_at: Optional[datetime] = None
    destination: Optional[str] = Field(default=None, max_length=255)


class AmbulanceDispatchResponse(BaseModel):
    ambulance_dispatch_id: int
    emergency_id: int
    ambulance_provider: Optional[str] = None
    contact_number: Optional[str] = None
    vehicle_number: Optional[str] = None
    called_at: Optional[datetime] = None
    arrived_at: Optional[datetime] = None
    departure_at: Optional[datetime] = None
    destination: str
    status: AmbulanceStatus


class EmergencyContactCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    relationship: str = Field(..., min_length=2, max_length=50)
    phone_number: str = Field(..., min_length=5, max_length=20)


class EmergencyContactResponse(BaseModel):
    emergency_contact_id: Optional[int] = None
    roll_number: str
    name: str
    relationship: str
    phone_number: str
    updated_at: Optional[datetime] = None


class EmergencyLogCreate(BaseModel):
    roll_number: str = Field(..., min_length=1, max_length=30)
    occurred_at: Optional[datetime] = None
    emergency_type: str = Field(..., min_length=2, max_length=100)
    description: str = Field(..., min_length=3)
    severity: SeverityLevel = Field(..., description="LOW, MEDIUM, HIGH, or CRITICAL")
    action_taken: str = Field(..., min_length=2)
    ambulance_required: bool = False
    called_at: Optional[datetime] = None
    ambulance_details: Optional[AmbulanceDispatchCreate] = None


class EmergencyLogResponse(BaseModel):
    emergency_id: int
    roll_number: str
    student_name: Optional[str] = None
    blood_group: Optional[str] = None
    recorded_by_user_id: int
    recorded_by_email: Optional[str] = None
    occurred_at: datetime
    emergency_type: str
    description: str
    severity: SeverityLevel
    action_taken: str
    ambulance_required: bool
    called_at: Optional[datetime] = None
    created_at: datetime
    ambulance: Optional[AmbulanceDispatchResponse] = None
    emergency_contact: Optional[EmergencyContactResponse] = None



class EmergencyLogUpdate(BaseModel):
    severity: Optional[SeverityLevel] = None
    emergency_type: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description: Optional[str] = Field(default=None, min_length=3)
    action_taken: Optional[str] = Field(default=None, min_length=2)
    ambulance_required: Optional[bool] = None
