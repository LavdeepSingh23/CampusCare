"""
Pydantic schemas for Student Identity, Profile, and Telemetry (SD-1).
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class StudentIdentity(BaseModel):
    userId: int
    rollNumber: str
    fullName: str
    email: str
    dateOfBirth: Optional[str] = None
    sex: Optional[str] = None
    phoneNumber: Optional[str] = None
    bloodGroup: Optional[str] = None
    status: str = "ACTIVE"
    program: Optional[str] = "B.Tech"
    branch: Optional[str] = None
    department: Optional[str] = None
    semester: Optional[int] = None


class StudentAllergyItem(BaseModel):
    allergyId: Optional[int] = None
    allergen: str
    reaction: Optional[str] = None
    severity: Optional[str] = "MILD"


class StudentEmergencyContactItem(BaseModel):
    contactId: Optional[int] = None
    name: str
    relationship: str
    phoneNumber: str


class StudentActiveVisit(BaseModel):
    visitId: int
    queueEntryId: Optional[int] = None
    doctorId: int
    doctorName: str
    specialty: Optional[str] = None
    queueSequence: Optional[int] = None
    status: str
    checkedInAt: Optional[str] = None
    calledAt: Optional[str] = None
    complaint: Optional[str] = None


class StudentMeResponse(BaseModel):
    student: StudentIdentity
    allergies: List[StudentAllergyItem] = []
    chronicConditions: List[str] = []
    currentMedications: List[str] = []
    emergencyContacts: List[StudentEmergencyContactItem] = []
    activeVisit: Optional[StudentActiveVisit] = None


class StudentProfileHistoryItem(BaseModel):
    visitId: int
    doctorId: int
    doctorName: str
    status: str
    diagnosis: Optional[str] = None
    clinicalNotes: Optional[str] = None
    prescriptionId: Optional[int] = None
    checkedInAt: Optional[str] = None
    completedAt: Optional[str] = None
    medicines: List[str] = []

