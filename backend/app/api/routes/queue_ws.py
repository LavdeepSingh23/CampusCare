"""
CampusCare Real-Time WebSocket Routes
Exposes authenticated WebSocket endpoints for real-time doctor and receptionist workstations.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.core.deps import CurrentUser, get_current_user
from app.services.queue_ws_manager import queue_ws_manager

logger = logging.getLogger("campuscare.websocket_routes")

router = APIRouter(tags=["websocket"])


@router.post("/ws/ticket")
def create_websocket_ticket(
    current: CurrentUser = Depends(get_current_user),
):
    """
    Generates a short-lived (60s) single-use handshake ticket.
    Protects against leaking long-lived tokens into query strings, server logs,
    and browser history.
    """
    ticket = queue_ws_manager.create_handshake_ticket(
        user_id=current.user_id,
        role=current.role,
        doctor_id=getattr(current, "doctor_id", None),
    )
    return {
        "ticket": ticket,
        "expires_in": 60,
        "role": current.role,
    }


@router.websocket("/ws/doctor/{doctor_id}")
async def doctor_queue_websocket(
    websocket: WebSocket,
    doctor_id: int,
    token: Optional[str] = Query(None),
    ticket: Optional[str] = Query(None),
):
    """
    Authenticated WebSocket connection for the doctor's queue.
    Accepts single-use `?ticket=<ticket>` or `?token=<jwt>`.
    Strictly verifies identity and Origin headers.
    Handles ping/pong heartbeats to prevent Render 100-second idle disconnects.
    """
    connected = await queue_ws_manager.authenticate_and_connect(
        websocket=websocket,
        doctor_id=doctor_id,
        token=token,
        ticket=ticket,
    )
    if not connected:
        return

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type", "").upper()
                if msg_type == "PING":
                    await websocket.send_json({
                        "type": "PONG",
                        "timestamp": msg.get("timestamp"),
                    })
                elif msg_type == "RECONNECT_SYNC":
                    await websocket.send_json({
                        "type": "RECONNECT_ACK",
                        "doctor_id": doctor_id,
                    })
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        await queue_ws_manager.disconnect(doctor_id, websocket)
    except Exception as exc:
        logger.warning("Unexpected WebSocket error on doctor_id=%s: %s", doctor_id, exc)
        await queue_ws_manager.disconnect(doctor_id, websocket)


@router.websocket("/ws/reception")
@router.websocket("/ws/dispensing")
async def receptionist_dispensing_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    ticket: Optional[str] = Query(None),
):
    """
    Authenticated WebSocket connection for receptionist & pharmacy dispensing desks.
    Accepts single-use `?ticket=<ticket>` or `?token=<jwt>`.
    Restricted to authorized RECEPTIONIST and ADMIN roles.
    Pushes instantaneous PRESCRIPTION_PENDING_DISPENSE and PRESCRIPTION_DISPENSED events.
    """
    connected = await queue_ws_manager.authenticate_and_connect_receptionist(
        websocket=websocket,
        token=token,
        ticket=ticket,
    )
    if not connected:
        return

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type", "").upper()
                if msg_type == "PING":
                    await websocket.send_json({
                        "type": "PONG",
                        "timestamp": msg.get("timestamp"),
                    })
                elif msg_type == "RECONNECT_SYNC":
                    await websocket.send_json({
                        "type": "RECONNECT_ACK",
                        "channel": "dispensing",
                    })
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        await queue_ws_manager.disconnect_receptionist(websocket)
    except Exception as exc:
        logger.warning("Unexpected WebSocket error on receptionist feed: %s", exc)
        await queue_ws_manager.disconnect_receptionist(websocket)


@router.get("/ws/telemetry")
def get_websocket_telemetry():
    """Returns real-time connection telemetry across doctor and receptionist pools."""
    return {
        "status": "active",
        **queue_ws_manager.get_active_connection_count(),
    }
