from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

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
    ):
        self.user_id = user_id
        self.role = role
        self.email = email
        self.roll_number = roll_number
        self.doctor_id = doctor_id
        self.staff_id = staff_id


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


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """
    Validates the Authorization: Bearer <token> header, verifying signature,
    expiration, and required claims.
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

    return CurrentUser(
        user_id=int(payload["sub"]),
        role=payload["role"],
        email=payload.get("email"),
        roll_number=payload.get("roll_number"),
        doctor_id=payload.get("doctor_id"),
        staff_id=payload.get("staff_id"),
    )


def get_current_doctor(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentDoctor:
    """
    Role dependency: strictly restricts endpoint to authenticated DOCTOR accounts.
    Rejects receptionists, students, or unauthenticated users with 403 Forbidden.
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
    Rejects doctors, students, or unauthenticated users with 403 Forbidden.
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


def get_current_staff(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Role dependency: allows either DOCTOR or RECEPTIONIST staff members.
    Rejects students with 403 Forbidden.
    """
    if user.role not in ("DOCTOR", "RECEPTIONIST") or user.staff_id is None:
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
