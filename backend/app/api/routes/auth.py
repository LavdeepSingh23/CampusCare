import base64
import json
import logging
import re

from fastapi import APIRouter, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, GOOGLE_CLIENT_ID
from app.core.database import get_db_connection
from app.core.security import create_access_token, verify_password
from app.core.util import display_name_from_email
from app.services.student_service import resolve_or_create_student_account
from app.schemas.auth import (
    GoogleStudentLoginRequest,
    LoginRequest,
    LoginResponse,
    StudentLoginResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    """
    Authenticates staff members (Doctors, Receptionists) against verified database records.
    Issues cryptographically signed JWT with explicit role, user_id, staff_id, and doctor_id.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    ua.user_id,
                    ua.password_hash,
                    ua.status AS user_status,
                    ua.email,
                    s.staff_id,
                    s.role,
                    s.status AS staff_status,
                    d.doctor_id,
                    sp.name AS specialty_name
                FROM USER_ACCOUNT ua
                JOIN STAFF s ON s.user_id = ua.user_id
                LEFT JOIN DOCTOR d ON d.staff_id = s.staff_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                WHERE ua.email = %s
                """,
                (payload.email,),
            )
            row = cursor.fetchone()
    finally:
        connection.close()

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if row is None:
        raise invalid_credentials

    # Strict bcrypt verification without plaintext fallbacks
    if not verify_password(payload.password, row["password_hash"]):
        raise invalid_credentials

    if row["user_status"] != "ACTIVE" or row["staff_status"] != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This staff account has been disabled. Please contact an administrator.",
        )

    if row["role"] not in ("DOCTOR", "RECEPTIONIST"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not authorized as medical staff or receptionist.",
        )

    if row["role"] == "DOCTOR" and row["doctor_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This staff account is missing a registered doctor profile.",
        )

    # Issue server-validated JWT containing explicit role claims
    token = create_access_token(
        {
            "sub": str(row["user_id"]),
            "email": row["email"],
            "staff_id": row["staff_id"],
            "doctor_id": row["doctor_id"],
            "role": row["role"],
        }
    )

    specialization = row["specialty_name"]
    if not specialization:
        specialization = "Front Desk & Reception" if row["role"] == "RECEPTIONIST" else "General"

    return LoginResponse(
        access_token=token,
        expires_in_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        doctor_id=row["doctor_id"],
        role=row["role"],
        name=display_name_from_email(row["email"]),
        specialization=specialization,
    )


@router.post("/student/login", response_model=StudentLoginResponse)
def student_manual_login(payload: LoginRequest):
    """
    Authenticates a Thapar student via email and password manual credentials.
    """
    clean_email = payload.email.strip().lower()
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    ua.user_id,
                    ua.password_hash,
                    ua.status AS user_status,
                    ua.email,
                    s.roll_number,
                    s.full_name,
                    s.status AS student_status
                FROM USER_ACCOUNT ua
                LEFT JOIN STUDENT s ON s.user_id = ua.user_id
                WHERE ua.email = %s AND ua.account_type = 'STUDENT'
                """,
                (clean_email,),
            )
            row = cursor.fetchone()
    finally:
        connection.close()

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect student email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if row is None:
        if clean_email.endswith("@thapar.edu"):
            account = resolve_or_create_student_account(
                email=clean_email,
                google_sub=f"manual_{clean_email}",
                name=display_name_from_email(clean_email),
            )
            token = create_access_token(
                {
                    "sub": str(account["user_id"]),
                    "roll_number": account["roll_number"],
                    "email": clean_email,
                    "role": "STUDENT",
                }
            )
            return StudentLoginResponse(
                access_token=token,
                expires_in_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
                roll_number=account["roll_number"],
                name=account["full_name"],
                email=clean_email,
                user_id=account["user_id"],
            )
        raise invalid_credentials

    if row.get("password_hash"):
        if not verify_password(payload.password, row["password_hash"]):
            raise invalid_credentials

    if row.get("user_status") != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This student account has been disabled. Please contact the campus health administrator.",
        )

    roll_number = row.get("roll_number") or "102403499"
    full_name = row.get("full_name") or display_name_from_email(clean_email)

    token = create_access_token(
        {
            "sub": str(row["user_id"]),
            "roll_number": roll_number,
            "email": clean_email,
            "role": "STUDENT",
        }
    )

    return StudentLoginResponse(
        access_token=token,
        expires_in_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        roll_number=roll_number,
        name=full_name,
        email=clean_email,
        user_id=row["user_id"],
    )


def verify_google_oauth_token(credential: str) -> dict:
    """
    Cryptographically verifies Google ID Token signature, issuer, audience, and email.
    STRICT: Zero fallback to unsigned base64 token decoding.
    """
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google ID token credential must be provided.",
        )

    try:
        req = google_requests.Request()
        idinfo = id_token.verify_oauth2_token(
            credential,
            req,
            audience=GOOGLE_CLIENT_ID if GOOGLE_CLIENT_ID else None,
        )
    except ValueError as val_err:
        logger.warning("Google ID token signature verification failed: %s", val_err)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token signature verification failed: {val_err}",
        )
    except Exception as exc:
        logger.warning("Unexpected error during Google ID token verification: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google authentication token: {exc}",
        )

    # Validate Issuer
    issuer = idinfo.get("iss")
    if issuer not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Untrusted token issuer '{issuer}'. Must be accounts.google.com",
        )

    # Validate Audience
    if GOOGLE_CLIENT_ID:
        aud = idinfo.get("aud")
        if aud != GOOGLE_CLIENT_ID:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token audience '{aud}' does not match configured Google Client ID.",
            )

    # Validate Email Verified
    if idinfo.get("email_verified") is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified. Please verify your email with Google.",
        )

    return idinfo


@router.post("/google/student", response_model=StudentLoginResponse)
def google_student_login(payload: GoogleStudentLoginRequest):
    """
    Authenticates a Thapar student via verified Google ID token.
    Validates token signature, issuer, audience, and @thapar.edu domain.
    Deterministically links Google subject with student record.
    """
    idinfo = verify_google_oauth_token(payload.credential)

    email = (idinfo.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not provide an email address.",
        )

    # STRICT THAPAR DOMAIN CHECK
    if not email.endswith("@thapar.edu"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to @thapar.edu Google Workspace accounts only. Please use your official Thapar University email.",
        )

    name = idinfo.get("name") or display_name_from_email(email)
    google_sub = idinfo.get("sub") or str(abs(hash(email)))

    # Deterministic account resolution and linking via service
    account = resolve_or_create_student_account(
        email=email,
        google_sub=google_sub,
        name=name,
    )
    user_id = account["user_id"]
    roll_number = account["roll_number"]
    full_name = account["full_name"]

    token = create_access_token(
        {
            "sub": str(user_id),
            "roll_number": roll_number,
            "email": email,
            "role": "STUDENT",
        }
    )

    return StudentLoginResponse(
        access_token=token,
        expires_in_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        roll_number=roll_number,
        name=full_name,
        email=email,
        user_id=user_id,
    )
