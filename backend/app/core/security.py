from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    if not password_hash:
        # e.g. a Google-only account with no password set
        return False
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(claims: dict) -> str:
    """
    claims should contain whatever you want embedded in the token,
    e.g. {"sub": str(user_id), "doctor_id": 5, "staff_id": 3, "role": "DOCTOR"}
    """
    to_encode = claims.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Raises jose.JWTError (including ExpiredSignatureError) if the token
    is invalid or expired. Caller is responsible for catching it.
    """
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
