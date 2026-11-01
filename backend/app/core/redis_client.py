"""
CampusCare Enterprise Redis Infrastructure & Connection Pool Manager
Provides managed, pooled, resilient async Redis connections using redis.asyncio.

Guarantees:
1. One managed ConnectionPool per backend process.
2. TLS/SSL support automatically negotiated via 'rediss://' URI scheme.
3. Health checks, socket timeouts, and connect timeouts configured.
4. Resilient subscriber loop with exponential backoff and jitter.
5. Clean startup and shutdown lifecycle management.
6. Zero hardcoded credentials (configured via REDIS_URL and USE_REDIS_PUBSUB).
"""

import asyncio
import json
import logging
import random
from typing import Any, Callable, Coroutine, Dict, Optional

import redis.asyncio as aioredis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError, TimeoutError as RedisTimeoutError

from app.core import config

logger = logging.getLogger("campuscare.redis")

CHANNEL_DOCTOR_PATTERN = "campuscare:queue:doctor:*"
CHANNEL_DISPENSING = "campuscare:queue:dispensing"


def get_doctor_channel(doctor_id: int) -> str:
    """Returns the dedicated Redis channel for a specific doctor."""
    return f"campuscare:queue:doctor:{doctor_id}"


class RedisManager:
    """
    Manages process-level Redis connection pool, publication, and resilient pub/sub subscription.
    """

    def __init__(self):
        self._pool: Optional[aioredis.ConnectionPool] = None
        self._client: Optional[aioredis.Redis] = None
        self._subscriber_task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()

    @property
    def is_enabled(self) -> bool:
        """Indicates whether Redis Pub/Sub is enabled via configuration."""
        return config.USE_REDIS_PUBSUB

    async def initialize(self) -> bool:
        """
        Initializes the Redis connection pool and verifies connectivity.
        Does not block application startup if Redis is temporarily unreachable.
        """
        if not self.is_enabled:
            logger.info("Redis Pub/Sub is disabled (USE_REDIS_PUBSUB=False). Operating in single-process mode.")
            return False

        async with self._lock:
            if self._client is not None:
                return True

            logger.info("Initializing Redis connection pool: %s (timeouts: connect=%ss, socket=%ss, health_check=%ss)",
                        config.REDIS_URL.split("@")[-1],  # redact credentials from logs
                        config.REDIS_CONNECT_TIMEOUT,
                        config.REDIS_SOCKET_TIMEOUT,
                        config.REDIS_HEALTH_CHECK_INTERVAL)
            try:
                # SSL is automatically negotiated when URI begins with rediss://
                is_ssl = config.REDIS_URL.startswith("rediss://")
                ssl_kwargs = {"ssl_cert_reqs": "none"} if is_ssl else {}

                self._pool = aioredis.ConnectionPool.from_url(
                    config.REDIS_URL,
                    max_connections=config.REDIS_MAX_CONNECTIONS,
                    socket_connect_timeout=config.REDIS_CONNECT_TIMEOUT,
                    socket_timeout=config.REDIS_SOCKET_TIMEOUT,
                    health_check_interval=config.REDIS_HEALTH_CHECK_INTERVAL,
                    retry_on_timeout=True,
                    decode_responses=True,
                    **ssl_kwargs,
                )
                self._client = aioredis.Redis(connection_pool=self._pool)
                self._running = True

                # Test connectivity
                await self._client.ping()
                logger.info("Redis connectivity successfully verified.")
                return True
            except Exception as exc:
                logger.warning("Redis initial ping failed (%s). Outbox worker will retry on background loop.", exc)
                # Keep pool created so future retry attempts can reconnect
                return False

    async def close(self):
        """Cleanly terminates subscriber tasks and drains connection pool."""
        self._running = False
        if self._subscriber_task and not self._subscriber_task.done():
            self._subscriber_task.cancel()
            try:
                await self._subscriber_task
            except asyncio.CancelledError:
                pass
            self._subscriber_task = None

        async with self._lock:
            if self._client:
                try:
                    await self._client.aclose()
                except Exception as exc:
                    logger.debug("Error closing Redis client: %s", exc)
                self._client = None

            if self._pool:
                try:
                    await self._pool.disconnect()
                except Exception as exc:
                    logger.debug("Error disconnecting Redis pool: %s", exc)
                self._pool = None

        logger.info("Redis client and connection pool closed.")

    async def is_healthy(self) -> bool:
        """Performs a non-blocking health check ping against Redis."""
        if not self._client or not self._running:
            return False
        try:
            return await self._client.ping() is True
        except Exception:
            return False

    async def publish(self, channel: str, message: Dict[str, Any]) -> int:
        """
        Publishes a JSON payload to the specified channel.
        Raises RedisError on connection or socket failures so outbox worker can handle retries.
        """
        if not self._client:
            raise RedisConnectionError("Redis client is not initialized")

        payload_str = json.dumps(message)
        receivers = await self._client.publish(channel, payload_str)
        logger.debug("Published event %s to %s (active subscribers: %d)",
                     message.get("event_type"), channel, receivers)
        return receivers

    def start_subscriber(self, message_dispatch_callback: Callable[[str, Dict[str, Any]], Coroutine]):
        """
        Starts the background subscriber loop with exponential backoff and jitter.
        """
        if not self.is_enabled:
            return

        if self._subscriber_task is None or self._subscriber_task.done():
            self._subscriber_task = asyncio.create_task(
                self._run_subscriber_loop(message_dispatch_callback),
                name="campuscare-redis-subscriber",
            )
            logger.info("Started Redis Pub/Sub background subscriber task.")

    async def _run_subscriber_loop(self, callback: Callable[[str, Dict[str, Any]], Coroutine]):
        """
        Subscribes to doctor pattern and dispensing channels.
        Re-establishes subscriptions automatically on connection loss using exponential backoff with jitter.
        """
        base_delay = 1.0
        max_delay = 30.0
        attempt = 0

        while self._running:
            pubsub = None
            try:
                if not self._client:
                    await self.initialize()

                if not self._client:
                    raise RedisConnectionError("Cannot connect to Redis")

                pubsub = self._client.pubsub()
                await pubsub.psubscribe(CHANNEL_DOCTOR_PATTERN)
                await pubsub.subscribe(CHANNEL_DISPENSING)
                logger.info("Redis Pub/Sub active: subscribed to '%s' and '%s'",
                            CHANNEL_DOCTOR_PATTERN, CHANNEL_DISPENSING)

                # Reset backoff on successful connection
                attempt = 0

                while self._running:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if message is None:
                        await asyncio.sleep(0.01)
                        continue

                    msg_type = message.get("type")
                    if msg_type in ("message", "pmessage"):
                        channel = message.get("channel", "")
                        data_str = message.get("data", "")
                        try:
                            data = json.loads(data_str)
                            # Invoke consumer dispatch callback
                            asyncio.create_task(callback(channel, data))
                        except json.JSONDecodeError as err:
                            logger.warning("Dropped malformed Redis Pub/Sub message on channel '%s': %s", channel, err)
                        except Exception as err:
                            logger.error("Error processing Redis message on channel '%s': %s", channel, err, exc_info=True)

            except asyncio.CancelledError:
                break
            except (RedisConnectionError, RedisTimeoutError, OSError) as conn_err:
                attempt += 1
                delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
                jitter = random.uniform(0.1, 0.5) * delay
                total_wait = delay + jitter
                logger.warning("Redis Pub/Sub connection lost (%s). Reconnecting in %.2fs (attempt %d)...",
                               conn_err, total_wait, attempt)
                await asyncio.sleep(total_wait)
            except Exception as unexpected:
                attempt += 1
                logger.error("Unexpected Redis subscriber error: %s. Retrying in 5s...", unexpected, exc_info=True)
                await asyncio.sleep(5.0)
            finally:
                if pubsub:
                    try:
                        await pubsub.aclose()
                    except Exception:
                        pass


# Process-level singleton instance
redis_manager = RedisManager()

