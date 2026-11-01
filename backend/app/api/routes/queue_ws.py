"""
CampusCare Real-Time WebSocket Routes
Exposes authenticated WebSocket endpoints for real-time doctor queue updates.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.services.queue_ws_manager import queue_ws_manager

logger = logging.getLogger("campuscare.websocket_routes")

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/doctor/{doctor_id}")
async def doctor_queue_websocket(
    websocket: WebSocket,
    doctor_id: int,
    token: Optional[str] = Query(None),
):
    """
    Authenticated WebSocket connection for the doctor's queue.
    Requires a valid JWT passed in query string `?token=<jwt>`.
    Strictly verifies identity: doctor can only connect to their own queue line.
    Handles ping/pong heartbeats to prevent Render 100-second idle disconnects.
    """
    connected = await queue_ws_manager.authenticate_and_connect(
        websocket=websocket,
        doctor_id=doctor_id,
        token=token,
    )
    if not connected:
        return

    try:
        while True:
            # Listen for client heartbeats and control messages
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
                # Ignore malformed client text
                pass
    except WebSocketDisconnect:
        await queue_ws_manager.disconnect(doctor_id, websocket)
    except Exception as exc:
        logger.warning("Unexpected WebSocket error on doctor_id=%s: %s", doctor_id, exc)
        await queue_ws_manager.disconnect(doctor_id, websocket)


@router.get("/ws/telemetry")
def get_websocket_telemetry():
    """Returns real-time connection telemetry for system monitoring."""
    return {
        "status": "active",
        "total_active_connections": queue_ws_manager.get_active_connection_count(),
    }

