from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.database import get_db_connection
from app.core.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    """Lightweight representation of any validated identity in a JWT."""

    def __init__(
        self,
        user_id: int,
        role: str,
        email: str = None,
        roll_number: str = None,
        doctor_id: int = None,
        staff_id: int = None,
        faculty_id: int = None,
        patient_id: int = None,
    ):
        self.user_id = user_id
        self.role = role
        self.email = email
        self.roll_number = roll_number
        self.doctor_id = doctor_id
        self.staff_id = staff_id
        self.faculty_id = faculty_id
        self.patient_id = patient_id


class CurrentDoctor:
    """Identity container for a validated Doctor JWT."""

    def __init__(self, user_id: int, staff_id: int, doctor_id: int, email: str = None, role: str = "DOCTOR"):
        self.user_id = user_id
        self.staff_id = staff_id
        self.doctor_id = doctor_id
        self.email = email
        self.role = role


class CurrentReceptionist:
    """Identity container for a validated Receptionist JWT."""

    def __init__(self, user_id: int, staff_id: int, email: str = None, role: str = "RECEPTIONIST"):
        self.user_id = user_id
        self.staff_id = staff_id
        self.email = email
        self.role = role


class CurrentFaculty:
    """Identity container for a validated Faculty JWT."""

    def __init__(self, user_id: int, faculty_id: int, patient_id: int, email: str = None, role: str = "FACULTY"):
        self.user_id = user_id
        self.faculty_id = faculty_id
        self.patient_id = patient_id
        self.email = email
        self.role = role


class CurrentAdmin:
    """Identity container for a validated Admin JWT."""

    def __init__(self, user_id: int, staff_id: int, email: str = None, role: str = "ADMIN"):
        self.user_id = user_id
        self.staff_id = staff_id
        self.email = email
        self.role = role


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """
    Validates the Authorization: Bearer <token> header, verifying signature,
    expiration, required claims, and real-time database active account status.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid, expired, or malformed authentication token: {err}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload["sub"])
    role = payload.get("role")

    # Real-time database verification of account existence and status
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT status, account_type FROM USER_ACCOUNT WHERE user_id = %s", (user_id,))
            acc = cursor.fetchone()
            if not acc:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User account associated with this session no longer exists.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            if acc["status"] != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This account has been disabled. Please contact the campus health administrator.",
                )
    finally:
        connection.close()

    return CurrentUser(
        user_id=user_id,
        role=role,
        email=payload.get("email"),
        roll_number=payload.get("roll_number"),
        doctor_id=payload.get("doctor_id"),
        staff_id=payload.get("staff_id"),
        faculty_id=payload.get("faculty_id"),
        patient_id=payload.get("patient_id"),
    )


def get_current_doctor(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentDoctor:
    """
    Role dependency: strictly restricts endpoint to authenticated DOCTOR accounts.
    Rejects receptionists, faculty, students, or unauthenticated users with 403 Forbidden.
    """
    if user.role != "DOCTOR" or user.doctor_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Doctor privileges required.",
        )

    return CurrentDoctor(
        user_id=user.user_id,
        staff_id=user.staff_id,
        doctor_id=user.doctor_id,
        email=user.email,
        role=user.role,
    )


def get_current_receptionist(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentReceptionist:
    """
    Role dependency: strictly restricts endpoint to authenticated RECEPTIONIST accounts.
    Rejects doctors, faculty, students, or unauthenticated users with 403 Forbidden.
    """
    if user.role != "RECEPTIONIST" or user.staff_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Receptionist privileges required.",
        )

    return CurrentReceptionist(
        user_id=user.user_id,
        staff_id=user.staff_id,
        email=user.email,
        role=user.role,
    )


def get_current_faculty(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentFaculty:
    """
    Role dependency: strictly restricts endpoint to verified FACULTY accounts.
    """
    if user.role != "FACULTY" or user.faculty_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Verified faculty account required.",
        )

    return CurrentFaculty(
        user_id=user.user_id,
        faculty_id=user.faculty_id,
        patient_id=user.patient_id,
        email=user.email,
        role=user.role,
    )


def get_current_admin(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentAdmin:
    """
    Role dependency: strictly restricts endpoint to authorized ADMIN accounts.
    """
    if user.role != "ADMIN" or user.staff_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: System administrator privileges required.",
        )

    return CurrentAdmin(
        user_id=user.user_id,
        staff_id=user.staff_id,
        email=user.email,
        role=user.role,
    )


def get_current_staff(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Role dependency: allows DOCTOR, RECEPTIONIST, or ADMIN staff members.
    Rejects students and faculty with 403 Forbidden.
    """
    if user.role not in ("DOCTOR", "RECEPTIONIST", "ADMIN") or user.staff_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Medical staff or receptionist privileges required.",
        )

    return user


def get_current_student(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Role dependency: strictly restricts endpoint to verified STUDENT accounts.
    """
    if user.role != "STUDENT" or not user.roll_number:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Verified student account required.",
        )

    return user


def require_own_doctor_id(doctor_id: int, current: CurrentDoctor) -> None:
    """
    Authorization check: ensures a doctor can only access or modify data
    associated with their own doctor_id.
    """
    if doctor_id != current.doctor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You are not authorized to view or modify another doctor's workstation.",
        )
