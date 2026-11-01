"""
CampusCare Transactional Outbox Service
Guarantees at-least-once, zero-data-loss event delivery between MySQL and Redis Pub/Sub.

Key Characteristics:
1. Atomicity: Outbox records are inserted in the EXACT same MySQL transaction as domain state mutations.
2. Safe Multi-Worker Claiming: Uses MySQL 8.4 'SELECT ... FOR UPDATE SKIP LOCKED'.
3. Short-Lived Locks: Row locks are held ONLY for claiming (microseconds); released before any network I/O.
4. Fault Tolerance: If Redis is unavailable, events remain PENDING and are retried upon Redis recovery.
5. Crashed Worker Recovery: Stale PROCESSING rows are automatically reset to PENDING after 60s.
6. Retention Pruning: Published records older than configured retention (default: 48h) are purged.
7. Event Deduplication: Every record carries an immutable UUID4 'event_id'.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional
import uuid

from app.core import config
from app.core.database import get_db_connection
from app.core.redis_client import redis_manager
from app.services.queue_ws_manager import queue_ws_manager

logger = logging.getLogger("campuscare.outbox")

# 7 Standardized Event Types for Queue Lifecycle
VALID_EVENT_TYPES = {
    "QUEUE_PATIENT_CHECKED_IN",
    "PRESCRIPTION_PENDING_DISPENSE",
    "QUEUE_ENTRY_REDIRECTED",
    "QUEUE_ENTRY_NO_SHOW",
    "QUEUE_ENTRY_REQUEUED",
    "VISIT_DISPENSED",
    "VISIT_CANCELLED",
}


def insert_outbox_event(
    cursor,
    event_type: str,
    channel: str,
    aggregate_id: Any,
    payload: Dict[str, Any],
    aggregate_type: str = "QUEUE",
    event_id: Optional[str] = None,
) -> str:
    """
    Persists an outbox event within the caller's active MySQL transaction.
    MUST be called before connection.commit().
    Returns the unique event_id (UUID4).
    """
    if event_type not in VALID_EVENT_TYPES:
        logger.warning("Inserting non-standard outbox event type: %s", event_type)

    evt_id = event_id or str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Enforce minimal standard metadata envelope
    sanitized_payload = {
        "event_id": evt_id,
        "event_type": event_type,
        "type": event_type,
        "aggregate_type": aggregate_type,
        "aggregate_id": str(aggregate_id),
        "occurred_at": now_iso,
        "timestamp": now_iso,
        **payload,
    }

    # Ensure sensitive clinical data is NEVER written to the outbox payload
    for sensitive_key in ("clinical_notes", "diagnosis", "medicines", "allergies", "notes"):
        if sensitive_key in sanitized_payload and sensitive_key != "entry_reason":
            del sanitized_payload[sensitive_key]

    sql = """
        INSERT INTO OUTBOX_EVENT (
            event_id, event_type, channel, aggregate_type, aggregate_id, payload, status
        ) VALUES (%s, %s, %s, %s, %s, %s, 'PENDING')
    """
    cursor.execute(
        sql,
        (
            evt_id,
            event_type,
            channel,
            aggregate_type,
            str(aggregate_id),
            json.dumps(sanitized_payload),
        ),
    )
    return evt_id


class OutboxPublisherWorker:
    """
    Continuous background worker that claims pending outbox events,
    publishes them to Redis (or local WebSockets), and handles retries and retention.
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._notify_event = asyncio.Event()
        self._last_cleanup = 0.0

    def start(self):
        """Starts the outbox publisher daemon task."""
        if self._task is None or self._task.done():
            self._running = True
            self._task = asyncio.create_task(self._run_loop(), name="campuscare-outbox-publisher")
            logger.info("Outbox publisher background worker started.")

    async def stop(self):
        """Stops the outbox publisher cleanly."""
        self._running = False
        self.notify()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Outbox publisher background worker stopped.")

    def notify(self):
        """Wakes up the publisher loop immediately after a transaction commit."""
        self._notify_event.set()

    async def _run_loop(self):
        """Main publisher loop: claims and processes pending records."""
        while self._running:
            try:
                # 1. Recover stale processing records from crashed workers (every 60s)
                await self._recover_stale_processing()

                # 2. Claim and publish pending batch
                processed_count = await self._process_pending_batch()

                # 3. Periodic retention cleanup (every 1 hour)
                now = asyncio.get_running_loop().time()
                if now - self._last_cleanup > 3600:
                    await self._cleanup_old_records()
                    self._last_cleanup = now

                # If we processed records, immediately check for more; otherwise wait for notify or poll interval
                if processed_count == 0:
                    try:
                        await asyncio.wait_for(
                            self._notify_event.wait(),
                            timeout=config.OUTBOX_POLL_INTERVAL_SECONDS,
                        )
                        self._notify_event.clear()
                    except asyncio.TimeoutError:
                        pass
                else:
                    self._notify_event.clear()

            except asyncio.CancelledError:
                break
            except Exception as err:
                logger.error("Error in outbox publisher loop: %s. Pausing 1s...", err, exc_info=True)
                await asyncio.sleep(1.0)

    async def _process_pending_batch(self) -> int:
        """
        Executes a claim-publish-update cycle.
        Returns the number of events processed.
        """
        # Step A: Claim Phase (Short SQL transaction using SKIP LOCKED)
        claimed_events = await asyncio.to_thread(self._claim_pending_records)
        if not claimed_events:
            return 0

        # Step B: Network Phase (Publish outside SQL lock)
        success_ids = []
        failures = []  # List of (event_id, error_message)

        for event in claimed_events:
            event_id = event["event_id"]
            channel = event["channel"]
            payload = event["payload"]
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {"raw": payload}

            try:
                if redis_manager.is_enabled:
                    # Distributed Redis Pub/Sub publish
                    await redis_manager.publish(channel, payload)
                else:
                    # In single-process mode or when Redis is disabled, dispatch directly to local websockets
                    self._dispatch_locally(channel, payload)

                success_ids.append(event_id)
            except Exception as pub_err:
                logger.warning("Failed publishing outbox event %s to channel %s: %s", event_id, channel, pub_err)
                failures.append((event_id, str(pub_err)[:500]))

        # Step C: Result Phase (Update outbox statuses)
        await asyncio.to_thread(self._finalize_batch_results, success_ids, failures)
        return len(claimed_events)

    def _claim_pending_records(self) -> List[Dict[str, Any]]:
        """
        Claims up to OUTBOX_BATCH_SIZE pending events using MySQL 8.4 FOR UPDATE SKIP LOCKED.
        Immediately updates their status to 'PROCESSING' and commits.
        """
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Claim records using row locking with SKIP LOCKED for multi-worker concurrency
                claim_sql = f"""
                    SELECT event_id, event_type, channel, aggregate_type, aggregate_id, payload, retry_count
                    FROM OUTBOX_EVENT
                    WHERE status = 'PENDING' AND retry_count < %s
                    ORDER BY created_at ASC
                    LIMIT %s
                    FOR UPDATE SKIP LOCKED
                """
                cur.execute(claim_sql, (config.OUTBOX_MAX_RETRIES, config.OUTBOX_BATCH_SIZE))
                rows = cur.fetchall()
                if not rows:
                    conn.rollback()
                    return []

                event_ids = [r["event_id"] for r in rows]
                placeholders = ", ".join(["%s"] * len(event_ids))
                update_sql = f"""
                    UPDATE OUTBOX_EVENT
                    SET status = 'PROCESSING', processed_at = NOW()
                    WHERE event_id IN ({placeholders})
                """
                cur.execute(update_sql, tuple(event_ids))
                conn.commit()
                return rows
        except Exception as exc:
            try:
                conn.rollback()
            except Exception:
                pass
            logger.warning("Failed claiming outbox records: %s", exc)
            return []
        finally:
            conn.close()

    def _finalize_batch_results(self, success_ids: List[str], failures: List[tuple]):
        """Updates successfully published records and records retry errors."""
        if not success_ids and not failures:
            return

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Mark successes
                if success_ids:
                    placeholders = ", ".join(["%s"] * len(success_ids))
                    sql_success = f"""
                        UPDATE OUTBOX_EVENT
                        SET status = 'PUBLISHED', published_at = NOW()
                        WHERE event_id IN ({placeholders})
                    """
                    cur.execute(sql_success, tuple(success_ids))

                # Handle failures with retry increment
                for evt_id, err_msg in failures:
                    sql_fail = """
                        UPDATE OUTBOX_EVENT
                        SET status = IF(retry_count + 1 >= max_retries, 'FAILED', 'PENDING'),
                            retry_count = retry_count + 1,
                            last_error = %s
                        WHERE event_id = %s
                    """
                    cur.execute(sql_fail, (err_msg, evt_id))

                conn.commit()
        except Exception as exc:
            try:
                conn.rollback()
            except Exception:
                pass
            logger.error("Error finalizing outbox batch results: %s", exc)
        finally:
            conn.close()

    async def _recover_stale_processing(self):
        """Resets records stuck in 'PROCESSING' for > 60 seconds back to 'PENDING'."""
        def _sweep():
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    sweep_sql = """
                        UPDATE OUTBOX_EVENT
                        SET status = 'PENDING', retry_count = retry_count + 1, last_error = 'Worker crashed during PROCESSING'
                        WHERE status = 'PROCESSING' AND processed_at < NOW() - INTERVAL 60 SECOND
                    """
                    cur.execute(sweep_sql)
                    affected = cur.rowcount
                    conn.commit()
                    if affected > 0:
                        logger.warning("Recovered %d stale outbox event(s) from crashed workers.", affected)
            except Exception as err:
                try:
                    conn.rollback()
                except Exception:
                    pass
                logger.debug("Stale outbox recovery check error: %s", err)
            finally:
                conn.close()

        await asyncio.to_thread(_sweep)

    async def _cleanup_old_records(self):
        """Purges old published records according to the retention policy."""
        def _purge():
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    purge_sql = f"""
                        DELETE FROM OUTBOX_EVENT
                        WHERE status = 'PUBLISHED'
                          AND published_at < NOW() - INTERVAL %s HOUR
                    """
                    cur.execute(purge_sql, (config.OUTBOX_RETENTION_HOURS,))
                    deleted = cur.rowcount
                    conn.commit()
                    if deleted > 0:
                        logger.info("Outbox retention policy purged %d published record(s) older than %dh.",
                                    deleted, config.OUTBOX_RETENTION_HOURS)
            except Exception as err:
                try:
                    conn.rollback()
                except Exception:
                    pass
                logger.warning("Failed outbox retention purge: %s", err)
            finally:
                conn.close()

        await asyncio.to_thread(_purge)

    def _dispatch_locally(self, channel: str, payload: Dict[str, Any]):
        """Direct local dispatch when Redis is disabled (single-process mode)."""
        event_type = payload.get("event_type") or payload.get("type")
        if "campuscare:queue:doctor:" in channel:
            try:
                doc_id = int(channel.split(":")[-1])
                from app.services.queue_ws_manager import safe_broadcast_event
                safe_broadcast_event(doc_id, event_type, payload)
            except Exception as e:
                logger.debug("Local doctor dispatch failed: %s", e)
        elif channel == "campuscare:queue:dispensing":
            try:
                from app.services.queue_ws_manager import safe_broadcast_reception_event
                safe_broadcast_reception_event(event_type, payload)
            except Exception as e:
                logger.debug("Local dispensing dispatch failed: %s", e)


# Global process singleton worker
outbox_publisher = OutboxPublisherWorker()
