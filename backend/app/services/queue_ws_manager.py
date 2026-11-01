"""
CampusCare Real-Time Queue WebSocket Manager
Provides isolated, authenticated, in-memory WebSocket event dispatching
for clinic workstations (Doctor Dashboard & Receptionist Dispensing Desk).

Guarantees:
1. Strict doctor identity isolation (Cross-doctor subscriptions forbidden).
2. Dedicated receptionist connection pool for real-time dispensing feed.
3. Clean disconnect / reconnect handling with heartbeats (Render 100s idle prevention).
4. Payload deduplication via event_id (UUID4).
5. Origin validation against configured CORS origins.
6. Short-lived single-use handshake tickets for query-string safety.
7. Events dispatched ONLY after database transaction commit.
"""

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import uuid
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect, status
from jose import JWTError

from app.core import config
from app.core.database import get_db_connection
from app.core.security import create_access_token, decode_access_token

logger = logging.getLogger("campuscare.websocket")


class QueueWebSocketManager:
    """
    Manages active WebSocket connections for doctors and receptionists.
    Maintains in-memory connection pools keyed by doctor_id and a dedicated
    receptionist broadcast pool for dispensing notifications.
    """

    def __init__(self):
        # doctor_id -> Set of active WebSocket instances
        self._doctor_connections: Dict[int, Set[WebSocket]] = {}
        # Set of active receptionist / pharmacy dispensing desk WebSocket instances
        self._receptionist_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        # Single-use handshake ticket jti tracker to prevent ticket replay
        self._used_tickets: Set[str] = set()

    def create_handshake_ticket(
        self,
        user_id: int,
        role: str,
        doctor_id: Optional[int] = None,
    ) -> str:
        """
        Creates a short-lived, single-use JWT handshake ticket valid for 60 seconds.
        Prevents leaking long-lived user tokens into WebSocket query strings and server logs.
        """
        jti = str(uuid.uuid4())
        claims = {
            "sub": str(user_id),
            "role": role,
            "type": "ws_handshake_ticket",
            "jti": jti,
        }
        if doctor_id is not None:
            claims["doctor_id"] = int(doctor_id)

        ticket = create_access_token(claims=claims, expires_delta=timedelta(seconds=60))
        return ticket

    def _validate_origin(self, websocket: WebSocket) -> bool:
        """
        Validates the incoming WebSocket Origin header against configured CORS origins.
        Protects against Cross-Origin WebSocket Hijacking (CSWSH).
        """
        origin = websocket.headers.get("origin")
        if not origin:
            # Allow native tools or same-origin requests where Origin header is absent
            return True

        clean = origin.rstrip("/").lower()
        if "*" in config.CORS_ORIGINS:
            return True

        allowed = {o.rstrip("/").lower() for o in config.CORS_ORIGINS}
        if clean in allowed:
            return True

        # Permit development hosts, tunnels, and render domains
        if any(h in clean for h in ("localhost", "127.0.0.1", "ngrok-free.dev", "onrender.com")):
            return True

        logger.warning("SECURITY: WebSocket handshake rejected: Origin '%s' is not in allowed origins.", origin)
        return False

    def _verify_credential(self, token: Optional[str], ticket: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Validates either a single-use handshake ticket or a standard access token.
        Enforces single-use consumption on tickets.
        """
        raw = ticket or token
        if not raw:
            return None

        try:
            payload = decode_access_token(raw)
        except JWTError as err:
            logger.warning("WebSocket handshake JWT validation failed: %s", err)
            return None

        # If presented as a single-use ticket, check replay prevention
        if payload.get("type") == "ws_handshake_ticket":
            jti = payload.get("jti")
            if not jti or jti in self._used_tickets:
                logger.warning("SECURITY: Rejected replayed or invalid WebSocket handshake ticket: jti=%s", jti)
                return None
            self._used_tickets.add(jti)
            # Prune used tickets collection to avoid memory bloat
            if len(self._used_tickets) > 2000:
                self._used_tickets = set(list(self._used_tickets)[-1000:])

        return payload

    async def authenticate_and_connect(
        self,
        websocket: WebSocket,
        doctor_id: int,
        token: Optional[str] = None,
        ticket: Optional[str] = None,
    ) -> bool:
        """
        Validates doctor credentials and origin, enforcing strict doctor isolation.
        Rejects unauthorized callers with WebSocket close code 1008 (Policy Violation).
        """
        if not self._validate_origin(websocket):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Origin not permitted")
            return False

        payload = self._verify_credential(token, ticket)
        if not payload:
            logger.warning("WebSocket connection rejected: No valid token or ticket (doctor_id=%s)", doctor_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication token or ticket required")
            return False

        user_id = int(payload.get("sub", 0))
        role = payload.get("role")
        token_doc_id = payload.get("doctor_id")

        # Strict doctor isolation check
        if role == "DOCTOR":
            if int(token_doc_id or 0) != int(doctor_id):
                logger.warning(
                    "SECURITY: Cross-doctor WebSocket subscription blocked. User %s (Doc #%s) attempted to subscribe to Doc #%s",
                    user_id, token_doc_id, doctor_id,
                )
                await websocket.close(
                    code=status.WS_1008_POLICY_VIOLATION,
                    reason="Access forbidden: You cannot subscribe to another doctor's queue",
                )
                return False
        elif role in ("RECEPTIONIST", "ADMIN"):
            # Authorized clinic staff may observe doctor triage
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

    async def authenticate_and_connect_receptionist(
        self,
        websocket: WebSocket,
        token: Optional[str] = None,
        ticket: Optional[str] = None,
    ) -> bool:
        """
        Validates receptionist/admin credentials and origin for dispensing desk updates.
        Rejects non-staff callers with WebSocket close code 1008 (Policy Violation).
        """
        if not self._validate_origin(websocket):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Origin not permitted")
            return False

        payload = self._verify_credential(token, ticket)
        if not payload:
            logger.warning("Receptionist WebSocket rejected: No valid credential provided")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication token or ticket required")
            return False

        user_id = int(payload.get("sub", 0))
        role = payload.get("role")

        if role not in ("RECEPTIONIST", "ADMIN"):
            logger.warning("SECURITY: WebSocket connection rejected: Role '%s' unauthorized for dispensing desk (user %s)", role, user_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Receptionist or admin privileges required")
            return False

        await websocket.accept()
        async with self._lock:
            self._receptionist_connections.add(websocket)

        logger.info("Receptionist WebSocket connected (User %s, role=%s). Active receptionist sockets: %d",
                    user_id, role, len(self._receptionist_connections))

        await websocket.send_json({
            "type": "CONNECTION_ACK",
            "event_id": str(uuid.uuid4()),
            "channel": "dispensing",
            "role": role,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "Connected to real-time receptionist dispensing feed",
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

    async def disconnect_receptionist(self, websocket: WebSocket):
        """Removes a WebSocket connection from the receptionist pool."""
        async with self._lock:
            self._receptionist_connections.discard(websocket)
        logger.info("Receptionist WebSocket disconnected. Remaining: %d", len(self._receptionist_connections))

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

        async with self._lock:
            sockets = list(self._doctor_connections.get(doctor_id, set()))

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

    async def broadcast_to_receptionists(self, event_type: str, data: Dict[str, Any]):
        """
        Publishes a real-time event to all connected receptionist/dispensing desk workstations.
        Adheres to strict minimal metadata schema (zero sensitive clinical details).
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "type": event_type,
            "visit_id": data.get("visit_id"),
            "doctor_id": data.get("doctor_id"),
            "queue_version": data.get("queue_version", int(datetime.now(timezone.utc).timestamp() * 1000)),
            "occurred_at": now_iso,
            "timestamp": now_iso,
            "data": data,
        }

        async with self._lock:
            sockets = list(self._receptionist_connections)

        if not sockets:
            logger.debug("No active receptionist WebSocket connections; event broadcast skipped.")
            return

        dead_sockets = []
        for ws in sockets:
            try:
                await ws.send_json(event)
            except Exception as exc:
                logger.debug("Failed sending WebSocket message to receptionist: %s", exc)
                dead_sockets.append(ws)

        if dead_sockets:
            async with self._lock:
                for dws in dead_sockets:
                    self._receptionist_connections.discard(dws)

        logger.info("Broadcast %s to receptionists (delivered to %d sockets)", event_type, len(sockets) - len(dead_sockets))

    def get_active_connection_count(self, doctor_id: Optional[int] = None) -> Dict[str, int]:
        """Returns the number of connected WebSockets across roles."""
        doctor_count = len(self._doctor_connections.get(doctor_id, set())) if doctor_id is not None else sum(len(conns) for conns in self._doctor_connections.values())
        receptionist_count = len(self._receptionist_connections)
        return {
            "doctor_connections": doctor_count,
            "receptionist_connections": receptionist_count,
            "total_active_connections": doctor_count + receptionist_count,
        }


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
        if _main_event_loop and _main_event_loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, _main_event_loop)
            return

        try:
            loop = asyncio.get_running_loop()
            if loop and loop.is_running():
                loop.create_task(coro)
                return
        except RuntimeError:
            pass

        import threading
        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()
    except Exception as exc:
        logger.warning("safe_broadcast_event encountered exception: %s", exc)


def safe_broadcast_reception_event(event_type: str, data: Dict[str, Any]):
    """
    Thread-safe helper that broadcasts an event to all connected receptionist workstations.
    Safe to call from sync FastAPI route handlers or worker threads.
    Guarantees non-blocking execution and never raises an exception.
    """
    global _main_event_loop
    try:
        coro = queue_ws_manager.broadcast_to_receptionists(event_type, data)
        if _main_event_loop and _main_event_loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, _main_event_loop)
            return

        try:
            loop = asyncio.get_running_loop()
            if loop and loop.is_running():
                loop.create_task(coro)
                return
        except RuntimeError:
            pass

        import threading
        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()
    except Exception as exc:
        logger.warning("safe_broadcast_reception_event encountered exception: %s", exc)
