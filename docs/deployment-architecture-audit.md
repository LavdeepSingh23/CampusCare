# CampusCare — Deployment Architecture Audit

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-01  
**Target Environment:** Render Cloud Platform (Web Service) & Aiven Cloud MySQL  
**Scope:** Phase 0 — Deployment Discovery

---

## 1. Executive Summary

This audit assesses the deployment architecture, runtime execution model, and database infrastructure of the CampusCare dispensary management system. The purpose of this assessment is to prepare the platform for a controlled, real-world university healthcare centre pilot, identify the architectural bottlenecks causing high-latency queue synchronization, and define the technical foundations for authenticated real-time WebSockets and database scalability.

---

## 2. Infrastructure & Deployment Matrix

| Component | Current State | Evidence / Source | Pilot Risk Level |
|---|---|---|---|
| **Repository Deployment Config** | No `render.yaml` or `Dockerfile` in repository | Git tree search (`Get-ChildItem -Recurse -Filter *render*`) | **Medium** (Manual GUI config drift) |
| **Backend Service Instance Count** | Undetermined from repo (Assumed 1 default on Render) | Codebase inspection (no multi-instance orchestration) | **High** (Dictates WebSocket Pub/Sub architecture) |
| **Autoscaling Configuration** | Unknown in repo (Render GUI managed) | Render Platform standard behavior | **High** (If enabled, in-memory WebSockets drop cross-instance events) |
| **Application Workers** | Single worker (`uvicorn` default if unspecified) | Start scripts & `backend/main.py` | **High** (Multi-worker requires IPC/PubSub for WebSockets) |
| **Application Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (inferred) | `backend/main.py` entry point | **Low** |
| **Health Checks** | Liveness `/health`, Readiness `/ready` | `backend/app/api/routes/health.py`, `app/main.py` | **Low** (Fully implemented in FastAPI) |
| **Restart Behavior** | Process abort on DB failure in production; Render auto-restart | `backend/app/main.py` lines 44-46 | **Low** |
| **Existing WebSocket Support** | **None** (0 endpoints in backend, 0 clients in frontend) | Full codebase audit (`git grep -i "websocket"`) | **Critical** (Currently causes 4s polling overload) |
| **Database Connection Pooling** | **None** (New TCP + TLS handshake per HTTP request) | `backend/app/core/database.py` line 89 | **Critical** (100–300ms WAN TLS latency per request) |
| **Queue Synchronization** | Client polling every 4000ms with N+1 nested fetches | `Doctors_Dashboard.jsx` lines 398–508 | **Critical** (~10-second end-to-end sync delay) |

---

## 3. Detailed Component Findings

### 3.1. Render Service Instance Count & Autoscaling
* **Repository Findings**: The codebase contains no declarative infrastructure-as-code files (`render.yaml`, `Procfile`, or `Dockerfile`). Render services created manually via the dashboard default to a single instance running in a containerized Linux environment.
* **Autoscaling Impact**: 
  * If the Render service is running a **single instance**, a fast, zero-dependency **in-memory WebSocket Connection Manager** can manage doctor connections and publish queue events reliably with zero external dependencies.
  * If the Render service has **autoscaling enabled** or is configured with **multiple instances (>1)**, incoming WebSocket connections from doctors will terminate on different physical container instances. An in-memory connection manager on Instance A would be unaware of doctors connected to Instance B, causing silent notification loss unless backed by an external distributed message broker (e.g., Redis Pub/Sub).
* **Rule Compliance**: As mandated by Global Rule 5 (*"Do not introduce Redis without architectural justification"*), we must not prematurely add Redis if Render is operating as a single instance. However, the system architecture must cleanly abstract the event broadcaster so a Redis Pub/Sub adapter can be swapped in without modifying queue lifecycle logic.

### 3.2. Application Workers & Concurrency Model
* **Worker Execution Model**: 
  * In standard FastAPI deployments on Render, Uvicorn is invoked as:
    ```bash
    uvicorn app.main:app --host 0.0.0.0 --port $PORT
    ```
    This runs a **single worker process** on the asyncio event loop.
  * If Gunicorn with Uvicorn workers is used (e.g., `gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`), each worker runs in an isolated Python process with its own private heap memory. In-memory WebSockets in Worker 1 cannot notify doctor WebSockets connected to Worker 2.
* **Pilot Recommendation**: For the university dispensary pilot (estimated peak concurrent traffic: 4–6 clinic staff, 20–50 students), **1 worker process with asyncio** handles thousands of concurrent WebSocket connections and I/O-bound requests effortlessly while keeping memory shared and state simple.

### 3.3. Application Start Command & Entry Point
* **Entry Point**: `backend/main.py` imports and re-exports `app` from `app.main`:
  ```python
  from app.main import app
  __all__ = ["app"]
  ```
* **FastAPI Instance**: Defined in `backend/app/main.py` with lifespan context manager, CORS middleware, exception handlers, and routing.

### 3.4. Health Checks & Probes
FastAPI provides two standardized probe endpoints:
1. **Liveness Probe**: `GET /health`
   * Fast, non-blocking HTTP 200 response (`{"status": "healthy", "service": "CampusCare API"}`).
   * Does not touch the database. Suitable for Render's container health monitor to verify the Python event loop is responsive.
2. **Readiness Probe**: `GET /ready`
   * Executes `check_database_readiness()`, which performs an active test query on MySQL (`SELECT 1`, verifies TLS cipher and latency).
   * Returns HTTP 200 if connected; returns HTTP 503 if the database is unreachable or rejecting connections.
3. **Root Status**: `GET /`
   * Returns basic operational telemetry (`status`, `environment`, `database_mode`).

### 3.5. Restart & Lifespan Behavior
* In `backend/app/main.py` (`lifespan` context manager):
  ```python
  if ENVIRONMENT == "production":
      raise RuntimeError(f"Refusing to start production backend without valid database connection: {exc}")
  ```
* If Aiven MySQL is unreachable at startup in production, the application refuses to start and fails fast, preventing zombie instances from serving error pages.
* On shutdown, the lifespan safely terminates the background daily analytics scheduler (`stop_scheduler()`).

### 3.6. Existing WebSocket Support
* **Backend**: There are currently **no** `@app.websocket` endpoints or WebSocket routing anywhere in `backend/`.
* **Frontend**: There are **no** `new WebSocket(...)` connections or Socket.io libraries in `Code/frontend/`.
* **Render Platform WebSocket Compatibility**: Render's HTTP reverse proxy fully supports WebSockets on standard ports (port 80/443 with TLS).
  * *Crucial Render Requirement*: Render terminates idle TCP connections after **100 seconds**. Any WebSocket implementation **must implement client/server heartbeats (ping/pong) every 30–45 seconds** to prevent Render's proxy from abruptly terminating quiet connections.

### 3.7. Database Connection Pool Configuration
* **Current Implementation (`backend/app/core/database.py`)**:
  ```python
  def _connect_mysql():
      ...
      connection = pymysql.connect(**connect_kwargs)
      return connection
  ```
* **Deficiency Identified**:
  * **Zero connection pooling**. Every single API call invokes `get_db_connection()`, which opens a raw TCP socket, completes TLS 1.3 handshake negotiation over WAN with Aiven Cloud (`campuscare-db-campuscare23.h.aivencloud.com`), executes SQL statements, and terminates the connection.
  * **Latency Penalty**: Each TLS handshake across the WAN introduces ~100–300ms of latency before the first SQL byte is sent.
  * **Connection Thrashing**: Under concurrent requests, hundreds of transient connections are negotiated, threatening Aiven's connection limit (`max_connections`) and causing socket exhaustion.

### 3.8. Frontend API Configuration & Polling Overhead
* In `Code/frontend/src/api.js`:
  ```javascript
  const BASE = import.meta.env.VITE_API_URL ?? ''
  ```
* In `Code/frontend/src/Components/Doctors/Doctors_Dashboard.jsx`:
  * A `setInterval` timer triggers `loadBackendData(false)` every **4000 milliseconds**.
  * Within `loadBackendData`:
    1. `fetchDoctorQueue(doctorId)` -> `GET /api/doctor/${doctorId}/queue`
    2. `fetchActiveConsultation(doctorId)` -> `GET /api/doctor/${doctorId}/consultation/active`
    3. **N+1 Nested Fetches**: For every single student in the returned queue array, it executes `fetchPatientSummary(roll)` in parallel via `Promise.all(queueData.map(...))`!
    4. Each `fetchPatientSummary` triggers a separate backend API call, which opens a separate database connection over TLS to Aiven MySQL.
  * **Result**: A queue of 6 patients triggers **8 HTTP requests and 8 separate TLS handshakes every 4 seconds** for one doctor dashboard. With multiple active clinic staff, the backend and database are inundated with repetitive polling traffic.

---

## 4. Manual Render Dashboard Verification Checklist

Because Render configuration is managed via the Render Web Dashboard rather than declarative repository files, the administrator must inspect the following settings in the Render Console (`dashboard.render.com`):

### Checklist for Backend Service (`campuscare-backend`):
- [ ] **Instance Count**: Navigate to *Settings -> General -> Instance Count*.
  - *Expected Value*: `1`. (If >1, verify whether autoscaling is active).
- [ ] **Instance Type / Plan**: Check plan tier (e.g., Free, Starter, Standard).
  - *Note*: Free instances spin down after 15 min of inactivity; paid instances remain hot 24/7.
- [ ] **Autoscaling**: Navigate to *Settings -> Autoscaling*.
  - *Expected Value*: Disabled for initial pilot, or documented min/max instances.
- [ ] **Start Command**: Navigate to *Settings -> Build & Deploy -> Start Command*.
  - *Expected Value*: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (or `uvicorn backend.app.main:app ...` depending on root directory setting).
  - *Check*: Ensure `--workers` is NOT set >1 unless Redis Pub/Sub is active.
- [ ] **Health Check Path**: Navigate to *Settings -> General -> Health Check Path*.
  - *Expected Value*: `/health` (Liveness) or `/ready` (Readiness).
- [ ] **Auto-Deploy**: Check if GitHub branch `main` triggers auto-deployment on push.
- [ ] **Environment Variables**: Verify presence of:
  - `ENVIRONMENT=production`
  - `DB_MODE=mysql`
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_MODE=REQUIRED`
  - `JWT_SECRET_KEY`
  - `CORS_ORIGINS` (including frontend Render URL and local testing domains)

---

## 5. Architectural Recommendations for Phase 1 & Phase 2

1. **Phase 1 Baseline Measurement**:
   * Measure the exact check-in to doctor dashboard timeline.
   * Quantify the impact of the 4-second polling cycle and the N+1 `fetchPatientSummary` loop.
2. **Phase 2 WebSocket Architecture**:
   * Implement an authenticated FastAPI WebSocket endpoint (`/api/ws/doctor/{doctor_id}`) requiring valid Bearer JWT.
   * Provide an in-memory `ConnectionManager` with strict doctor identity isolation (Doctor A cannot receive Doctor B's queue events).
   * Maintain a modular adapter interface so that if Render autoscaling or multi-worker deployment is enabled in the future, Redis Pub/Sub can be attached without touching business logic.
   * Implement 30-second ping/pong keepalives to prevent Render's 100-second idle timeout drop.
   * Keep polling as an automatic fallback if WebSocket connectivity fails or disconnects.
3. **Phase 3 Database Connection Pool**:
   * Replace one-off `pymysql.connect()` with an application-level connection pool (e.g. `DBUtils.PooledDB` or PyMySQL pool) with pre-warmed TLS connections, connection recycling (`pool_recycle=300s`), and health validation.
