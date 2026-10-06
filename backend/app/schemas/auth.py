from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    doctor_id: int | None = None
    role: str = "DOCTOR"
    name: str
    specialization: str | None = None


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
