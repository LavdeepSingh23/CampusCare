"""
Pydantic schemas for Student Identity, Profile, Telemetry, and Onboarding (SD-1 & SD-2).
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


class ProfileCompletionStatus(BaseModel):
    isComplete: bool
    percentage: int
    status: str  # "INCOMPLETE" | "COMPLETED"
    missingFields: List[str] = []
    completedFields: List[str] = []


class StudentMeResponse(BaseModel):
    student: StudentIdentity
    allergies: List[StudentAllergyItem] = []
    chronicConditions: List[str] = []
    currentMedications: List[str] = []
    emergencyContacts: List[StudentEmergencyContactItem] = []
    activeVisit: Optional[StudentActiveVisit] = None
    profileCompletion: Optional[ProfileCompletionStatus] = None


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


# ==========================================
# SD-2: Onboarding & Profile Update Schemas
# ==========================================

class EmergencyContactInput(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="Full name of emergency contact")
    relationship: str = Field(..., min_length=2, max_length=50, description="Relationship to student (e.g. Father, Mother, Guardian)")
    phoneNumber: str = Field(..., min_length=7, max_length=20, description="Primary contact phone number")


class AllergyInput(BaseModel):
    allergen: str = Field(..., min_length=1, max_length=150, description="Name of allergen (e.g. Penicillin, Peanuts)")
    reaction: Optional[str] = Field(None, max_length=255, description="Reaction symptoms (e.g. Hives, Anaphylaxis)")
    severity: Optional[str] = Field("MILD", description="MILD, MODERATE, SEVERE, UNKNOWN")


class MedicationInput(BaseModel):
    medicineName: str = Field(..., min_length=1, max_length=150, description="Brand or generic medicine name")
    strength: Optional[str] = Field(None, max_length=50, description="e.g. 500mg, 10mg")
    dose: Optional[str] = Field(None, max_length=50, description="e.g. 1 tablet OD, 2 puffs PRN")
    reason: Optional[str] = Field(None, max_length=255, description="Indication for use")


class StudentProfileUpdateRequest(BaseModel):
    phoneNumber: Optional[str] = Field(None, max_length=20, description="Student personal phone number")
    dateOfBirth: Optional[str] = Field(None, description="Date of birth in YYYY-MM-DD format")
    sex: Optional[str] = Field(None, description="Gender identity: MALE, FEMALE, OTHER")
    bloodGroup: Optional[str] = Field(None, description="Blood group: A+, A-, B+, B-, AB+, AB-, O+, O-")
    emergencyContact: Optional[EmergencyContactInput] = None
    
    # Declarations for medical history
    hasAllergies: Optional[bool] = None
    allergies: Optional[List[AllergyInput]] = None
    
    hasChronicConditions: Optional[bool] = None
    chronicConditions: Optional[List[str]] = None
    
    hasCurrentMedications: Optional[bool] = None
    currentMedications: Optional[List[MedicationInput]] = None


class StudentProfileUpdateResponse(BaseModel):
    success: bool = True
    message: str
    profileCompletion: ProfileCompletionStatus
    data: StudentMeResponse
