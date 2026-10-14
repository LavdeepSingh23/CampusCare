import logging
from fastapi import APIRouter, Response, status
from app.core.config import ENVIRONMENT, DB_MODE
from app.core.database import check_database_readiness, DatabaseError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    """
    Liveness probe: verifies that the FastAPI application process is alive and responsive.
    Fast non-blocking check suitable for load balancers and container orchestrators.
    """
    return {
        "status": "healthy",
        "service": "CampusCare API",
        "environment": ENVIRONMENT,
        "database_mode": DB_MODE,
    }


@router.get("/ready")
def readiness_check(response: Response):
    """
    Readiness probe: actively queries the database (Aiven MySQL or explicit local DB).
    Returns HTTP 200 if database is queryable and ready to accept traffic.
    Returns HTTP 503 if database connection is failing, surfacing visible error diagnostics.
    """
    try:
        diagnostics = check_database_readiness()
        return {
            "status": "ready",
            "service": "CampusCare API",
            "environment": ENVIRONMENT,
            "database": diagnostics,
        }
    except DatabaseError as err:
        logger.error("Readiness probe reported database failure: %s", err)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unhealthy",
            "service": "CampusCare API",
            "environment": ENVIRONMENT,
            "database_mode": DB_MODE,
            "error": "Database is unavailable or failing readiness probe",
            "detail": str(err),
        }
    except Exception as exc:
        logger.error("Unexpected error during readiness check: %s", exc)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unhealthy",
            "service": "CampusCare API",
            "environment": ENVIRONMENT,
            "database_mode": DB_MODE,
            "error": "Unexpected readiness error",
            "detail": str(exc),
        }

