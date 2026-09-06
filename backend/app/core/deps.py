from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentDoctor:
    """Lightweight container for the identity embedded in a validated JWT."""

    def __init__(self, user_id: int, staff_id: int, doctor_id: int, role: str):
        self.user_id = user_id
        self.staff_id = staff_id
        self.doctor_id = doctor_id
        self.role = role


def get_current_doctor(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentDoctor:
    """
    Validates the Authorization: Bearer <token> header and returns the
    doctor identity embedded in it. Use this on any route that should only
    be reachable by a logged-in doctor.

    NOTE: this trusts the claims embedded at login time for the lifetime of
    the token (kept short - see ACCESS_TOKEN_EXPIRE_MINUTES) rather than
    re-querying the DB on every request. If you disable/suspend a doctor
    mid-shift, it takes effect on their next login, not instantly.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("role") != "DOCTOR" or payload.get("doctor_id") is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not authorized as a doctor",
        )

    return CurrentDoctor(
        user_id=int(payload["sub"]),
        staff_id=payload["staff_id"],
        doctor_id=payload["doctor_id"],
        role=payload["role"],
    )


def require_own_doctor_id(doctor_id: int, current: CurrentDoctor) -> None:
    """
    Authorization check (not just authentication): a doctor can only act
    on routes addressed to THEIR OWN doctor_id. Without this, doctor #3
    could read doctor #7's queue just by editing the URL.
    """
    if doctor_id != current.doctor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this doctor's data",
        )
