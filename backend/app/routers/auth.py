from fastapi import APIRouter, HTTPException, status

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.core.database import get_db_connection
from app.core.security import create_access_token, verify_password
from app.core.util import display_name_from_email
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
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
    )

    if row is None:
        raise invalid_credentials

    if not verify_password(payload.password, row["password_hash"]):
        raise invalid_credentials

    if row["user_status"] != "ACTIVE" or row["staff_status"] != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been disabled. Contact an administrator.",
        )

    if row["role"] != "DOCTOR" or row["doctor_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not registered as a doctor",
        )

    token = create_access_token(
        {
            "sub": str(row["user_id"]),
            "staff_id": row["staff_id"],
            "doctor_id": row["doctor_id"],
            "role": row["role"],
        }
    )

    return LoginResponse(
        access_token=token,
        expires_in_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        doctor_id=row["doctor_id"],
        name=display_name_from_email(row["email"]),
        specialization=row["specialty_name"] or "General",
    )
