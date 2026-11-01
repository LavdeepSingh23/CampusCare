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
DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "5"))
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "20"))
DB_POOL_TIMEOUT = float(os.getenv("DB_POOL_TIMEOUT", "5.0"))
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "300"))

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

# Automated Daily Analytics & Resend Configuration
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "CampusCare Analytics <onboarding@resend.dev>")
ANALYTICS_REPORT_RECIPIENT = os.getenv("ANALYTICS_REPORT_RECIPIENT", "lavdeepsingh38160@gmail.com")
ANALYTICS_SCHEDULE_HOUR = int(os.getenv("ANALYTICS_SCHEDULE_HOUR", "9"))
ANALYTICS_SCHEDULE_MINUTE = int(os.getenv("ANALYTICS_SCHEDULE_MINUTE", "0"))
ANALYTICS_TIMEZONE = os.getenv("ANALYTICS_TIMEZONE", "Asia/Kolkata")


CAMPUSCARE_WEB_URL = os.getenv("CAMPUSCARE_WEB_URL", "https://alarm-diagnoses-lash.ngrok-free.dev")

# ── Redis Pub/Sub & Transactional Outbox Configuration ───────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
USE_REDIS_PUBSUB = os.getenv("USE_REDIS_PUBSUB", "false").lower() in ("true", "1", "yes")
REDIS_CONNECT_TIMEOUT = float(os.getenv("REDIS_CONNECT_TIMEOUT", "5.0"))
REDIS_SOCKET_TIMEOUT = float(os.getenv("REDIS_SOCKET_TIMEOUT", "5.0"))
REDIS_HEALTH_CHECK_INTERVAL = int(os.getenv("REDIS_HEALTH_CHECK_INTERVAL", "30"))
REDIS_MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "20"))

# Transactional Outbox Worker Tuning
OUTBOX_POLL_INTERVAL_SECONDS = float(os.getenv("OUTBOX_POLL_INTERVAL_SECONDS", "0.2"))
OUTBOX_BATCH_SIZE = int(os.getenv("OUTBOX_BATCH_SIZE", "50"))
OUTBOX_MAX_RETRIES = int(os.getenv("OUTBOX_MAX_RETRIES", "5"))
OUTBOX_RETENTION_HOURS = int(os.getenv("OUTBOX_RETENTION_HOURS", "48"))

