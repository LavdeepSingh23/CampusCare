import time
import threading
from typing import Dict, List, Tuple
from fastapi import Request, HTTPException, status

class SlidingWindowRateLimiter:
    """
    Thread-safe, zero-dependency in-memory sliding window rate limiter.
    Enforces request limits per client IP address.
    """
    def __init__(self, requests_per_minute: int = 60, cleanup_interval: float = 60.0):
        self.requests_per_minute = requests_per_minute
        self.cleanup_interval = cleanup_interval
        # ip -> list of unix timestamps
        self._requests: Dict[str, List[float]] = {}
        self._lock = threading.Lock()
        self._last_cleanup = time.time()

    def is_allowed(self, client_ip: str, limit: int = None) -> Tuple[bool, int]:
        """
        Returns (allowed: bool, retry_after_seconds: int).
        """
        max_req = limit or self.requests_per_minute
        now = time.time()
        window_start = now - 60.0

        with self._lock:
            # Periodic lazy cleanup of stale entries
            if now - self._last_cleanup > self.cleanup_interval:
                self._cleanup(now)
                self._last_cleanup = now

            timestamps = self._requests.get(client_ip, [])
            # Filter timestamps within current 60s window
            valid_timestamps = [t for t in timestamps if t > window_start]

            if len(valid_timestamps) >= max_req:
                oldest_in_window = valid_timestamps[0]
                retry_after = max(1, int(60.0 - (now - oldest_in_window)))
                self._requests[client_ip] = valid_timestamps
                return False, retry_after

            valid_timestamps.append(now)
            self._requests[client_ip] = valid_timestamps
            return True, 0

    def _cleanup(self, now: float):
        window_start = now - 60.0
        keys_to_delete = []
        for ip, t_list in self._requests.items():
            valid = [t for t in t_list if t > window_start]
            if valid:
                self._requests[ip] = valid
            else:
                keys_to_delete.append(ip)
        for ip in keys_to_delete:
            del self._requests[ip]


# Singleton instances for different security domains
auth_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=15)
checkin_rate_limiter = SlidingWindowRateLimiter(requests_per_minute=60)


def limit_auth_requests(request: Request):
    """
    FastAPI dependency restricting brute-force attacks on authentication routes.
    Limits to 15 attempts per minute per IP.
    """
    client_ip = request.client.host if request.client else "unknown"
    # Honor X-Forwarded-For if behind Render proxy
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    allowed, retry_after = auth_rate_limiter.is_allowed(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Please wait {retry_after} seconds before trying again.",
            headers={"Retry-After": str(retry_after)},
        )


def limit_checkin_requests(request: Request):
    """
    FastAPI dependency protecting rapid NFC scan/checkin endpoints.
    Limits to 60 requests per minute per IP.
    """
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    allowed, retry_after = checkin_rate_limiter.is_allowed(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Check-in rate limit exceeded. Please wait {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

