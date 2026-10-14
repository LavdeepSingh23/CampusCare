from datetime import datetime, timedelta, timezone
import logging
from jose import JWTError, jwt

from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
)

import bcrypt

logger = logging.getLogger(__name__)


def hash_password(plain_password: str) -> str:
    """Hashes a plain text password using bcrypt with salt."""
    if not plain_password:
        raise ValueError("Password cannot be empty")
    pwd_bytes = plain_password.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """
    Verifies a plain text password against a bcrypt hash.
    STRICT: Never falls back to plain-text matching under any circumstances.
    """
    if not plain_password or not password_hash:
        return False
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = password_hash.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception as exc:
        logger.warning("Bcrypt password verification failed with error: %s", exc)
        return False


from typing import Optional


def create_access_token(claims: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates a cryptographically signed JWT with explicit exp and iat claims.
    """
    to_encode = claims.copy()
    now = datetime.now(timezone.utc)
    to_encode["iat"] = int(now.timestamp())
    expire = (now + expires_delta) if expires_delta is not None else (now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = int(expire.timestamp())

    
    if "sub" not in to_encode:
        raise ValueError("JWT claims must contain 'sub' (subject)")
    if "role" not in to_encode:
        raise ValueError("JWT claims must contain 'role'")

    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Cryptographically verifies the JWT signature and expiration.
    Enforces algorithm pinning and verifies required claims (sub, role).
    Raises jose.JWTError on any validation failure.
    """
    payload = jwt.decode(
        token,
        JWT_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
        options={
            "verify_signature": True,
            "verify_exp": True,
            "verify_iat": True,
        },
    )
    
    if "sub" not in payload or not payload.get("sub"):
        raise JWTError("Invalid token: missing subject ('sub') claim")
    if "role" not in payload or not payload.get("role"):
        raise JWTError("Invalid token: missing role claim")

    return payload
