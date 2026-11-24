# Week 8 — Render Cloud Deployment, Auth Routing Fixes & Final EST Package

| Ticket | Description | Status |
|--------|-------------|--------|
| LD-13 | Fix unauthenticated `ProtectedRoute` redirects and the receptionist logout bug pointing to `/admin/login` | Done |
| LD-14 | Fix missing production Python packages (`redis`, `requests`) and deploy the FastAPI backend to Render (`Virginia US East`) | Done |
| LD-15 | Verify CORS, WebSockets, and Aiven MySQL health on Render, and push the final EST report (`Est_Report/`) | Done |

## Notes

- Moved off temporary ngrok tunnels and deployed the FastAPI backend properly on Render (`campuscarebackend-j203.onrender.com`) in Virginia US East so it sits close to our New York Aiven MySQL database — query latency dropped from ~500ms locally down to ~36ms over TLSv1.3.
- Hit a couple of startup crashes on Render because `redis` and `google-auth[requests]` weren't pinned in `backend/requirements.txt`; added both and verified `/health`, `/ready`, and CORS preflights from the live Render frontend (`campuscare-zpl9.onrender.com`).
- During live browser checks, noticed two routing bugs: visiting `/doctor_dashboard` or `/reception_dashboard` while logged out bounced users to the Student/Faculty page, and logging out of the Receptionist desk redirected to `/admin/login` because `ProtectedRoute` checked `ADMIN` before `RECEPTIONIST`. Fixed both in `App.jsx` and `receptionist.jsx`.
- Wrapped up by committing all the individual LaTeX files, screenshots, diagrams, and final compiled PDF in `Est_Report/`.
- Covers Nov 24 – Nov 25, 2026.

## Commits this week

| Commit | Message | Date |
|--------|---------|------|
| `6bc1fd2` | fix(routing): route unauthenticated doctor and receptionist users directly to signin rather than student portal | Nov 24, 2026 |
| `6d3fd44` | chore(deps): add redis to backend requirements so Render doesn't immediately crash on import | Nov 25, 2026 |
| `afd8709` | fix(deps): add requests for google-auth transport so Render actually boots | Nov 25, 2026 |
| `bc2f117` | fix(auth): stop kicking logging-out receptionists straight into the admin login page | Nov 25, 2026 |
| `3cf6d6e` | added final est_report | Nov 25, 2026 |
| `301735f` | added Est_Report pdf | Nov 25, 2026 |
