import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import CORS_ORIGINS, DB_MODE, ENVIRONMENT
from app.core.database import DatabaseConnectionError, DatabaseError, check_database_readiness
from app.routers import health

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("campuscare")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle startup & shutdown events for FastAPI."""
    logger.info(
        "Starting CampusCare API [env=%s, db_mode=%s]...",
        ENVIRONMENT,
        DB_MODE,
    )
    try:
        diag = check_database_readiness()
        logger.info(
            "Database connectivity verified on startup: %s (%s) with %d tables via %s (latency: %sms)",
            diag.get("database_name"),
            diag.get("server_version"),
            diag.get("tables_count", 0),
            diag.get("tls_cipher"),
            diag.get("latency_ms"),
        )
    except Exception as exc:
        logger.error(
            "DATABASE STARTUP CHECK FAILED: %s",
            exc,
            exc_info=True,
        )
        if ENVIRONMENT == "production":
            raise RuntimeError(f"Refusing to start production backend without valid database connection: {exc}")

    yield
    logger.info("CampusCare API shutdown complete.")


app = FastAPI(
    title="CampusCare API",
    version="1.0.0",
    description="CampusCare Healthcare Management REST API",
    lifespan=lifespan,
)

# ── CORS Middleware ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.ngrok.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Standardized Database Exception Handlers ──────────────────────────────
@app.exception_handler(DatabaseConnectionError)
async def database_connection_exception_handler(request: Request, exc: DatabaseConnectionError):
    logger.error("Database connection error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "error": "DatabaseConnectionError",
            "message": "Database is unreachable or rejecting connections.",
            "detail": str(exc),
            "database_mode": DB_MODE,
            "path": request.url.path,
        },
    )


@app.exception_handler(DatabaseError)
async def database_generic_exception_handler(request: Request, exc: DatabaseError):
    logger.error("Database error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "DatabaseError",
            "message": "A database operation failed.",
            "detail": str(exc),
            "database_mode": DB_MODE,
            "path": request.url.path,
        },
    )


# ── Routers ───────────────────────────────────────────────────────────────
# API routes under /api
app.include_router(api_router, prefix="/api")

# Top-level health and readiness probes
app.include_router(health.router)


@app.get("/")
def root():
    return {
        "status": "CampusCare API is running",
        "service": "CampusCare",
        "environment": ENVIRONMENT,
        "database_mode": DB_MODE,
    }
