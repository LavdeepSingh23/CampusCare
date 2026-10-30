from typing import Any, Dict, Optional
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    doctor_id: int | None = None
    role: str = "DOCTOR"
    name: str
    specialization: str | None = None
    staff_id: int | None = None


class GoogleStudentLoginRequest(BaseModel):
    credential: str


class StudentLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    roll_number: str
    name: str
    email: EmailStr
    user_id: int


# --- Dedicated Four-Portal Request & Response Schemas ---

class DoctorLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    doctor_id: int
    staff_id: int
    role: str = "DOCTOR"
    name: str
    specialization: Optional[str] = "General"


class ReceptionistLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    staff_id: int
    role: str = "RECEPTIONIST"
    name: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    staff_id: int
    role: str = "ADMIN"
    name: str


class FacultyInstitutionalLoginRequest(BaseModel):
    credential: str


class FacultyLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    faculty_id: int
    patient_id: int
    user_id: int
    role: str = "FACULTY"
    name: str
    email: EmailStr
    department: str
    designation: Optional[str] = None


class MeResponse(BaseModel):
    user_id: int
    email: str
    account_type: str
    role: str
    status: str
    name: str
    profile: Dict[str, Any]
