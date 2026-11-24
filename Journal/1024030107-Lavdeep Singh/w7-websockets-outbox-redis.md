# Week 7 — Connection Pooling, Real-Time WebSockets, Outbox & Redis Pub/Sub

| Ticket | Description | Status |
|--------|-------------|--------|
| LD-9 | Redesign the Admin Analytics dashboard and replace per-request MySQL TLS handshakes with a custom connection pool | Done |
| LD-10 | Fix the N+1 query loop in `get_prescriptions_awaiting_dispense()` using batched `IN` queries | Done |
| LD-11 | Update the Doctor OPD queue right away from WebSocket payloads and add a dedicated Receptionist WebSocket for dispensing | Done |
| LD-12 | Add the `OUTBOX_EVENT` table (`33_outbox_event.sql`) with `SKIP LOCKED` and a Redis Pub/Sub bridge for multi-process sync | Done |

## Notes

- Noticed check-ins and completed prescriptions were taking several seconds to show up on the doctor and receptionist screens. Auditing it showed two bottlenecks: every API call was opening a fresh TLS connection to Aiven MySQL, and `get_prescriptions_awaiting_dispense()` was firing dozens of sequential SQL queries inside nested loops.
- Added a pre-warmed PyMySQL connection pool plus basic rate limiting, and collapsed the dispensing queries down to 3 batched calls. On the React side, stopped the doctor dashboard from re-fetching profile and stats every time a patient checked in, and gave `DispensingDesk.jsx` its own ticket-authenticated WebSocket instead of polling every 4.5 seconds.
- To make sure events don't get lost across multiple backend workers or temporary network hiccups, added a MySQL transactional outbox (`33_outbox_event.sql`) using `FOR UPDATE SKIP LOCKED` and wired it to an async Redis Pub/Sub bridge (`campuscare:queue:doctor:{id}` and `campuscare:queue:dispensing`) with backoff retries. Also cleaned up the public portal modal so Admin login stays hidden.
- Covers Nov 1 – Nov 2, 2026.

## Commits this week

| Commit | Message | Date |
|--------|---------|------|
| `5d6061c` | feat(analytics): refine daily analytics email template with 12-section administrative hierarchy and deep link | Nov 1, 2026 |
| `f570f1d` | feat(admin): redesign analytics dashboard inspired by Oripio design reference | Nov 1, 2026 |
| `b4c9a20` | feat(hardening): production connection pool, real-time WebSockets, rate limiting, and performance audit | Nov 1, 2026 |
| `2290dad` | Merge branch 'main' of https://github.com/LavdeepSingh23/CampusCare | Nov 1, 2026 |
| `d69ce6b` | perf(dispense): murder the 26 sequential SQL queries before MySQL files a restraining order | Nov 2, 2026 |
| `6e6c617` | perf(doctor): stop making doctors wait for the universe to align before seeing who checked in | Nov 2, 2026 |
| `c28814f` | feat(reception): teach DispensingDesk what a WebSocket is so it stops DDoS-ing Render every 4s | Nov 2, 2026 |
| `9f58909` | feat(outbox-redis): transactional outbox and redis pub-sub so multi-instance Render doesn't get amnesia | Nov 2, 2026 |
| `bfb5994` | refactor(auth): evict administrator login from portal selector so only students and faculty remain | Nov 2, 2026 |
