import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import CORS_ORIGINS, DB_MODE, ENVIRONMENT
from app.core.database import DatabaseConnectionError, DatabaseError, check_database_readiness, close_db_pool, init_db_pool
from app.routers import health
from app.services.queue_ws_manager import set_main_event_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("campuscare")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle startup & shutdown events for FastAPI."""
    try:
        set_main_event_loop(asyncio.get_running_loop())
    except Exception:
        pass

    logger.info(
        "Starting CampusCare API [env=%s, db_mode=%s]...",
        ENVIRONMENT,
        DB_MODE,
    )
    try:
        init_db_pool()
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

    # Launch CampusCare Automated Daily Analytics Scheduler (09:00 AM IST)
    try:
        from app.services.daily_scheduler import start_scheduler, stop_scheduler
        start_scheduler()
    except Exception as sched_err:
        logger.error("Failed to initialize daily analytics scheduler: %s", sched_err)

    # Initialize Enterprise Redis Pub/Sub & Local WebSocket Bridge
    try:
        from app.core.redis_client import redis_manager
        from app.services.queue_ws_manager import queue_ws_manager
        from app.core import config

        async def _dispatch_redis_to_local_websockets(channel: str, message: dict):
            event_type = message.get("event_type") or message.get("type")
            if "campuscare:queue:doctor:" in channel:
                try:
                    doc_id = int(channel.split(":")[-1])
                    await queue_ws_manager.broadcast_to_doctor(doc_id, event_type, message)
                except Exception as e:
                    logger.debug("Redis doctor dispatch error: %s", e)
            elif channel == "campuscare:queue:dispensing":
                try:
                    await queue_ws_manager.broadcast_to_receptionists(event_type, message)
                except Exception as e:
                    logger.debug("Redis dispensing dispatch error: %s", e)

        if config.USE_REDIS_PUBSUB:
            await redis_manager.initialize()
            redis_manager.start_subscriber(_dispatch_redis_to_local_websockets)
    except Exception as redis_init_err:
        logger.warning("Redis Pub/Sub setup error: %s", redis_init_err)

    # Launch Transactional Outbox Publisher Daemon
    try:
        from app.services.outbox import outbox_publisher
        outbox_publisher.start()
    except Exception as outbox_init_err:
        logger.error("Failed to start outbox publisher worker: %s", outbox_init_err)

    yield
    try:
        from app.services.outbox import outbox_publisher
        await outbox_publisher.stop()
    except Exception:
        pass
    try:
        from app.core.redis_client import redis_manager
        await redis_manager.close()
    except Exception:
        pass
    try:
        from app.services.daily_scheduler import stop_scheduler
        stop_scheduler()
    except Exception:
        pass
    try:
        close_db_pool()
    except Exception:
        pass
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
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|172\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|.*\.ngrok.*)(:\d+)?",
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
