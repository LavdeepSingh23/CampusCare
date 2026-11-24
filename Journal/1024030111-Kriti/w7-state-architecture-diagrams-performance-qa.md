# Week 7 — System Diagrams, Dispensing SQL Audit & Outbox Table Verification

| Ticket | Description | Status |
|--------|-------------|--------|
| KR-8 | Design updated `High_Level_Architecture.jpeg`, `User_case_dig.png`, and `Visit_State_Machine.png` diagrams | Done |
| KR-9 | Verify allergy alerts, zero-item prescriptions, and patient ordering after the dispensing SQL `IN`-clause optimization | Done |
| KR-10 | Review `33_outbox_event.sql` indexes and verify `FOR UPDATE SKIP LOCKED` behavior on Aiven MySQL 8.4 | Done |

## Notes

- Updated our visual diagrams (`High_Level_Architecture.jpeg`, `User_case_dig.png`, and `Visit_State_Machine.png`) so the final documentation accurately matches the real React + FastAPI + Aiven MySQL + Redis Pub/Sub setup and all side paths in the visit lifecycle (no-show, requeue, redirect, cancel).
- Double-checked the optimized dispensing SQL query (`get_prescriptions_awaiting_dispense`) against edge cases — making sure patients with no allergies or empty prescriptions don't disappear or show duplicate rows from `JOIN`s, and that queue order stays intact.
- Reviewed the `OUTBOX_EVENT` schema (`33_outbox_event.sql`) and composite index `(status, created_at)` in MySQL 8.4 before multi-worker outbox testing ran.
- Covers Nov 1 – Nov 2, 2026.

## Commits this week

| Commit | Message | Date |
|--------|---------|------|
| `b4c9a20` | feat(hardening): production connection pool, real-time WebSockets, rate limiting, and performance audit | Nov 1, 2026 |
| `d69ce6b` | perf(dispense): murder the 26 sequential SQL queries before MySQL files a restraining order | Nov 2, 2026 |
| `9f58909` | feat(outbox-redis): transactional outbox and redis pub-sub so multi-instance Render doesn't get amnesia | Nov 2, 2026 |
