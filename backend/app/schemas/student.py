"""
Pydantic schemas for Student Identity, Profile, Telemetry, Onboarding, and Medical Details (SD-1, SD-2, SD-3).
"""

from typing import List, Optional, Union, Dict, Any
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


class StudentPrescriptionMedicineDetail(BaseModel):
    prescriptionItemId: Optional[int] = None
    name: str
    timing: Optional[str] = None
    note: Optional[str] = None
    mealRelation: Optional[str] = None
    dosageForm: Optional[str] = None
    duration: Optional[str] = None
    specialInstructions: Optional[str] = None


class StudentProfileHistoryItem(BaseModel):
    visitId: int
    doctorId: int
    doctorName: str
    specialty: Optional[str] = "General Physician"
    status: str
    date: Optional[str] = None
    diagnosis: Optional[str] = None
    clinicalNotes: Optional[str] = None
    notes: Optional[str] = None
    generalInstructions: Optional[str] = None
    prescriptionId: Optional[int] = None
    checkedInAt: Optional[str] = None
    completedAt: Optional[str] = None
    medicines: List[Union[StudentPrescriptionMedicineDetail, Dict[str, Any], str]] = []


# ==========================================
# SD-4: Campus Emergency Directory Schemas
# ==========================================

class CampusEmergencyContactItem(BaseModel):
    label: str
    sub: str
    number: str
    icon: Optional[str] = None
    priority: bool = False


class StudentEmergencyDirectoryResponse(BaseModel):
    personalContacts: List[StudentEmergencyContactItem] = []
    campusServices: List[CampusEmergencyContactItem] = []
    nationalHelplines: List[CampusEmergencyContactItem] = []


class StudentPrescriptionItemDetail(BaseModel):
    visitId: int
    prescriptionId: int
    date: str
    doctorName: str
    specialty: Optional[str] = "General Physician"
    diagnosis: str
    generalInstructions: Optional[str] = None
    medicines: List[StudentPrescriptionMedicineDetail] = []
    completedAt: Optional[str] = None


class StudentStatisticsDetail(BaseModel):
    totalVisits: int = 0
    lastVisitDate: Optional[str] = None
    lastVisitDiagnosis: Optional[str] = None


class StudentHealthSummaryDetail(BaseModel):
    bloodGroup: Optional[str] = None
    conditions: str = "None recorded"
    allergies: str = "None recorded"
    medication: str = "None recorded"
    hasSevereAllergyAlert: bool = False


class StudentHomeSummaryResponse(BaseModel):
    student: StudentIdentity
    healthSummary: StudentHealthSummaryDetail
    statistics: StudentStatisticsDetail
    activeVisit: Optional[StudentActiveVisit] = None
    profileCompletion: Optional[ProfileCompletionStatus] = None
    recentPrescription: Optional[StudentPrescriptionItemDetail] = None


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


class ConditionInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Name of chronic condition")
    otherDescription: Optional[str] = Field(None, max_length=255, description="Additional notes or specifics")


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


# ==========================================
# SD-3: Student Medical Details Schemas
# ==========================================

class StudentAllergyDetail(BaseModel):
    allergyId: int
    allergen: str
    reaction: Optional[str] = None
    severity: str = "MILD"
    source: str = "SELF_REPORTED"  # SELF_REPORTED | CLINICAL
    canEdit: bool = True
    recordedAt: Optional[str] = None


class StudentConditionDetail(BaseModel):
    studentConditionId: int
    conditionId: int
    name: str
    otherDescription: Optional[str] = None
    source: str = "SELF_REPORTED"  # SELF_REPORTED | CLINICAL
    canEdit: bool = True
    recordedAt: Optional[str] = None


class StudentMedicationDetail(BaseModel):
    studentMedicationId: int
    medicineName: str
    strength: Optional[str] = None
    dose: Optional[str] = None
    reason: Optional[str] = None
    startedAt: Optional[str] = None
    source: str = "SELF_REPORTED"  # SELF_REPORTED | CLINICAL
    canEdit: bool = True


class MedicalProfileStatusDetail(BaseModel):
    allergyStatus: str = "NOT_REPORTED"  # NOT_REPORTED | NONE_REPORTED | HAS_RECORDS
    conditionStatus: str = "NOT_REPORTED"
    medicationStatus: str = "NOT_REPORTED"
    updatedAt: Optional[str] = None


class StudentMedicalSummary(BaseModel):
    totalAllergies: int = 0
    totalConditions: int = 0
    totalMedications: int = 0
    hasSevereAllergyAlert: bool = False
    editableCount: int = 0
    clinicalVerifiedCount: int = 0


class StudentConsultationSummary(BaseModel):
    visitId: int
    doctorName: str
    specialty: Optional[str] = None
    diagnosis: str
    prescriptions: List[str] = []
    completedAt: Optional[str] = None


class StudentMedicalProfileResponse(BaseModel):
    rollNumber: str
    bloodGroup: Optional[str] = None
    medicalStatus: MedicalProfileStatusDetail
    summary: StudentMedicalSummary
    allergies: List[StudentAllergyDetail] = []
    conditions: List[StudentConditionDetail] = []
    medications: List[StudentMedicationDetail] = []
    recentConsultations: List[StudentConsultationSummary] = []


class StudentMedicalProfileUpdateRequest(BaseModel):
    bloodGroup: Optional[str] = Field(None, description="Blood group: A+, A-, B+, B-, AB+, AB-, O+, O-")
    hasAllergies: Optional[bool] = None
    allergies: Optional[List[AllergyInput]] = None
    hasChronicConditions: Optional[bool] = None
    chronicConditions: Optional[List[str]] = None
    hasCurrentMedications: Optional[bool] = None
    currentMedications: Optional[List[MedicationInput]] = None


class SingleMedicalItemActionResponse(BaseModel):
    success: bool = True
    message: str
    itemId: int
