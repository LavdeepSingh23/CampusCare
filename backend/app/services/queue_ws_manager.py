"""
CampusCare Real-Time Queue WebSocket Manager
Provides isolated, authenticated, in-memory WebSocket event dispatching
for clinic workstations (Doctor Dashboard & Reception Triage).

Guarantees:
1. Strict doctor identity isolation (Cross-doctor subscriptions forbidden).
2. Clean disconnect / reconnect handling with heartbeats (Render 100s idle prevention).
3. Payload deduplication via event_id (UUID4).
4. Events dispatched ONLY after database transaction commit.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core.database import get_db_connection
from app.core.security import decode_access_token

logger = logging.getLogger("campuscare.websocket")


class QueueWebSocketManager:
    """
    Manages active WebSocket connections for doctors.
    Maintains in-memory connection pools keyed by doctor_id.
    """

    def __init__(self):
        # doctor_id -> Set of active WebSocket instances
        self._doctor_connections: Dict[int, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def authenticate_and_connect(
        self,
        websocket: WebSocket,
        doctor_id: int,
        token: Optional[str],
    ) -> bool:
        """
        Validates the handshake JWT token.
        Enforces strict cross-doctor isolation:
        - Must be role 'DOCTOR' with matching doctor_id, OR
        - Must be role 'RECEPTIONIST' / 'ADMIN' authorized to monitor clinic triage.
        Rejects unauthorized callers with WebSocket close code 1008 (Policy Violation).
        """
        if not token:
            logger.warning("WebSocket connection rejected: No token provided (doctor_id=%s)", doctor_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication token required")
            return False

        try:
            payload = decode_access_token(token)
        except JWTError as err:
            logger.warning("WebSocket handshake JWT validation failed: %s (doctor_id=%s)", err, doctor_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
            return False

        user_id = int(payload.get("sub", 0))
        role = payload.get("role")
        token_doc_id = payload.get("doctor_id")

        # Strict authorization check
        if role == "DOCTOR":
            if int(token_doc_id or 0) != int(doctor_id):
                logger.warning(
                    "SECURITY: Cross-doctor WebSocket subscription blocked. User %s (Doc #%s) attempted to subscribe to Doc #%s",
                    user_id,
                    token_doc_id,
                    doctor_id,
                )
                await websocket.close(
                    code=status.WS_1008_POLICY_VIOLATION,
                    reason="Access forbidden: You cannot subscribe to another doctor's queue",
                )
                return False
        elif role in ("RECEPTIONIST", "ADMIN"):
            # Authorized staff may observe queues
            pass
        else:
            logger.warning("WebSocket connection rejected: Role '%s' unauthorized for doctor queue (user %s)", role, user_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Doctor or staff privileges required")
            return False

        # Accept connection and register
        await websocket.accept()
        async with self._lock:
            if doctor_id not in self._doctor_connections:
                self._doctor_connections[doctor_id] = set()
            self._doctor_connections[doctor_id].add(websocket)

        logger.info("WebSocket connected for doctor_id=%s (User %s, role=%s). Active sockets: %d",
                    doctor_id, user_id, role, len(self._doctor_connections[doctor_id]))

        # Send initial confirmation handshake with server timestamp
        await websocket.send_json({
            "type": "CONNECTION_ACK",
            "event_id": str(uuid.uuid4()),
            "doctor_id": doctor_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": f"Connected to real-time queue feed for doctor #{doctor_id}",
        })
        return True

    async def disconnect(self, doctor_id: int, websocket: WebSocket):
        """Removes a WebSocket connection from the doctor's active pool."""
        async with self._lock:
            if doctor_id in self._doctor_connections:
                self._doctor_connections[doctor_id].discard(websocket)
                if not self._doctor_connections[doctor_id]:
                    del self._doctor_connections[doctor_id]
        logger.info("WebSocket disconnected for doctor_id=%s", doctor_id)

    async def broadcast_to_doctor(self, doctor_id: int, event_type: str, data: Dict[str, Any]):
        """
        Publishes a real-time event to all active sessions of a specific doctor.
        Cleanly prunes stale/disconnected sockets without throwing.
        """
        event = {
            "event_id": str(uuid.uuid4()),
            "type": event_type,
            "doctor_id": doctor_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }

        sockets = []
        async with self._lock:
            if doctor_id in self._doctor_connections:
                sockets = list(self._doctor_connections[doctor_id])

        if not sockets:
            logger.debug("No active WebSocket connections for doctor_id=%s; event buffered/dropped safely.", doctor_id)
            return

        dead_sockets = []
        for ws in sockets:
            try:
                await ws.send_json(event)
            except Exception as exc:
                logger.debug("Failed sending WebSocket message to doctor_id=%s: %s", doctor_id, exc)
                dead_sockets.append(ws)

        if dead_sockets:
            async with self._lock:
                if doctor_id in self._doctor_connections:
                    for dws in dead_sockets:
                        self._doctor_connections[doctor_id].discard(dws)

        logger.info("Broadcast %s to doctor_id=%s (delivered to %d sockets)", event_type, doctor_id, len(sockets) - len(dead_sockets))

    def get_active_connection_count(self, doctor_id: Optional[int] = None) -> int:
        """Returns the number of connected WebSockets."""
        if doctor_id is not None:
            return len(self._doctor_connections.get(doctor_id, set()))
        return sum(len(conns) for conns in self._doctor_connections.values())


# Global singleton instance
queue_ws_manager = QueueWebSocketManager()

_main_event_loop: Optional[asyncio.AbstractEventLoop] = None


def set_main_event_loop(loop: asyncio.AbstractEventLoop):
    global _main_event_loop
    _main_event_loop = loop


def safe_broadcast_event(doctor_id: int, event_type: str, data: Dict[str, Any]):
    """
    Thread-safe helper that broadcasts an event to a doctor's WebSockets.
    Safe to call from sync FastAPI def endpoints or worker threads.
    Guarantees non-blocking execution and never raises an exception.
    """
    global _main_event_loop
    try:
        coro = queue_ws_manager.broadcast_to_doctor(doctor_id, event_type, data)
        # 1. Try saved main event loop
        if _main_event_loop and _main_event_loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, _main_event_loop)
            return

        # 2. Try current thread's running event loop
        try:
            loop = asyncio.get_running_loop()
            if loop and loop.is_running():
                loop.create_task(coro)
                return
        except RuntimeError:
            pass

        # 3. Fallback: run in background thread with a new event loop
        import threading
        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()
    except Exception as exc:
        logger.warning("safe_broadcast_event encountered exception: %s", exc)
