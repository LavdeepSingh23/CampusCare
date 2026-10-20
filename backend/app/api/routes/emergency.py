"""
Emergency and Ambulance Dispatch API Router for CampusCare.

Endpoints:
- POST /api/emergency/logs          (and /api/emergency/log)
- GET  /api/emergency/logs          (and /api/emergency)
- GET  /api/emergency/logs/{id}     (and /api/emergency/{id})
- PUT  /api/emergency/ambulance/{id}
- GET  /api/emergency/contacts/{roll_number}
- PUT  /api/emergency/contacts/{roll_number}

Role authorization:
- Medical & clinic staff (RECEPTIONIST, DOCTOR) can create and update emergency cases.
- Actor is derived strictly from server-verified JWT token (current_user.user_id).
- Routine OPD queue (VISIT, QUEUE_ENTRY) is untouched.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.database import get_db_connection
from app.core.deps import CurrentUser, get_current_staff
from app.schemas.emergency import (
    AmbulanceDispatchUpdate,
    EmergencyContactCreate,
    EmergencyLogCreate,
    EmergencyLogUpdate,
)
from app.services import emergency_service as es

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/emergency", tags=["emergency"])


@router.post("/logs", status_code=status.HTTP_201_CREATED)
@router.post("/log", status_code=status.HTTP_201_CREATED)
def create_emergency(
    payload: EmergencyLogCreate,
    current_staff: CurrentUser = Depends(get_current_staff),
):
    """
    Records an emergency or trauma case into EMERGENCY_LOG and optionally registers
    an AMBULANCE_DISPATCH record.
    Actor (recorded_by_user_id) is derived strictly from the verified JWT token.
    Separation principle: Does NOT create an OPD visit or queue entry.
    """
    conn = get_db_connection()
    try:
        amb_dict = payload.ambulance_details.model_dump() if payload.ambulance_details else None
        result = es.create_emergency_log(
            conn=conn,
            roll_number=payload.roll_number,
            recorded_by_user_id=current_staff.user_id,
            emergency_type=payload.emergency_type,
            description=payload.description,
            severity=payload.severity,
            action_taken=payload.action_taken,
            ambulance_required=payload.ambulance_required,
            occurred_at=payload.occurred_at,
            called_at=payload.called_at,
            ambulance_details=amb_dict,
        )
        conn.commit()
        return result
    except es.ResourceNotFoundError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        conn.rollback()
        logger.error("Failed to log emergency: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record emergency: {exc}",
        )
    finally:
        conn.close()


@router.get("/logs")
@router.get("")
def list_emergencies(
    severity: Optional[str] = Query(None, description="Filter by severity: LOW, MEDIUM, HIGH, CRITICAL"),
    limit: int = Query(50, ge=1, le=200, description="Max cases to return"),
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Returns list of recent emergency cases ordered by occurrence time descending.
    Accessible to authorized clinic staff (RECEPTIONIST, DOCTOR).
    """
    conn = get_db_connection()
    try:
        return es.list_emergency_logs(conn=conn, severity=severity, limit=limit)
    finally:
        conn.close()


@router.get("/logs/{emergency_id}")
@router.get("/{emergency_id}")
def get_emergency_detail(
    emergency_id: int,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Returns full details for an emergency case, including ambulance dispatch progress
    and student emergency contacts.
    """
    conn = get_db_connection()
    try:
        return es.get_emergency_log(conn=conn, emergency_id=emergency_id)
    except es.ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    finally:
        conn.close()


@router.put("/logs/{emergency_id}")
@router.put("/{emergency_id}")
def update_emergency(
    emergency_id: int,
    payload: EmergencyLogUpdate,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Updates emergency case notes, triage severity, action taken, or ambulance requirement.
    """
    conn = get_db_connection()
    try:
        result = es.update_emergency_log(
            conn=conn,
            emergency_id=emergency_id,
            update_data=payload.model_dump(exclude_unset=True),
        )
        conn.commit()
        return result
    except es.ResourceNotFoundError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        conn.rollback()
        logger.error("Failed to update emergency #%s: %s", emergency_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update emergency: {exc}")
    finally:
        conn.close()


@router.put("/ambulance/{emergency_id}")
def update_ambulance_status(
    emergency_id: int,
    payload: AmbulanceDispatchUpdate,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Updates ambulance dispatch status and timestamps for an emergency incident.
    Transitions: REQUESTED -> DISPATCHED -> ARRIVED -> COMPLETED (or CANCELLED).
    """
    conn = get_db_connection()
    try:
        result = es.update_ambulance_dispatch(
            conn=conn,
            emergency_id=emergency_id,
            update_data=payload.model_dump(exclude_unset=True),
        )
        conn.commit()
        return result
    except es.ResourceNotFoundError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except es.InvalidTransitionError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:
        conn.rollback()
        logger.error("Failed to update ambulance dispatch: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update ambulance dispatch: {exc}",
        )
    finally:
        conn.close()


@router.get("/contacts/{roll_number}")
def get_student_contact(
    roll_number: str,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Retrieves student's registered emergency contact during triage / intake.
    """
    conn = get_db_connection()
    try:
        contact = es.get_student_emergency_contact(conn=conn, roll_number=roll_number)
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No emergency contact registered for student '{roll_number}'.",
            )
        return contact
    except es.ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    finally:
        conn.close()


@router.put("/contacts/{roll_number}")
def update_student_contact(
    roll_number: str,
    payload: EmergencyContactCreate,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Updates or inserts student's registered emergency contact.
    """
    conn = get_db_connection()
    try:
        result = es.upsert_student_emergency_contact(
            conn=conn,
            roll_number=roll_number,
            name=payload.name,
            relationship=payload.relationship,
            phone_number=payload.phone_number,
        )
        conn.commit()
        return result
    except es.ResourceNotFoundError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        conn.rollback()
        logger.error("Failed to update emergency contact: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update emergency contact: {exc}",
        )
    finally:
        conn.close()

