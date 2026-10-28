import os
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env is resolved from backend directory regardless of current working directory
_backend_dir = Path(__file__).resolve().parents[2]
_env_path = _backend_dir / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv()

# Application Environment
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

# Database Configuration
DB_HOST = os.getenv("DB_HOST", "campuscare-db-campuscare23.h.aivencloud.com")
DB_PORT = int(os.getenv("DB_PORT", "11141"))
DB_NAME = os.getenv("DB_NAME", "campuscare_dev")
DB_USER = os.getenv("DB_USER", "campuscare_dev")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_SSL_MODE = os.getenv("DB_SSL_MODE", "REQUIRED").upper()
DB_SSL_CA = os.getenv("DB_SSL_CA", None)
DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))

# Explicit Database Mode: "mysql" (default/production) or "sqlite" (isolated local/dev only)
# Production MUST NOT use SQLite
DB_MODE = os.getenv("DB_MODE", "mysql" if DB_HOST else "sqlite").lower()

if ENVIRONMENT == "production" and DB_MODE == "sqlite":
    raise ValueError(
        "CRITICAL SECURITY CONFIGURATION: Production environment cannot use SQLite. "
        "Set DB_MODE=mysql and provide valid MySQL credentials."
    )

# Auth & Secrets
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "campuscare-secret-key-super-secure-change-in-prod")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# CORS
raw_cors = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,https://localhost:5173,http://localhost:5174,https://localhost:5174,http://127.0.0.1:5173,https://127.0.0.1:5173,http://localhost:3000,https://localhost:3000",
)
CORS_ORIGINS = [orig.strip() for orig in raw_cors.split(",") if orig.strip()]
