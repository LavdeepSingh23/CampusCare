# Week 8 — Final Live Site QA on Render & EST Report Package

| Ticket | Description | Status |
|--------|-------------|--------|
| KR-11 | Run full live browser testing across all 4 portals (Student, Faculty, Doctor, Receptionist) on Render (`campuscare-zpl9.onrender.com`) | Done |
| KR-12 | Verify direct SPA route rewrites, WebSocket live updates, logout redirects, and finalize the EST report package (`Est_Report/`) | Done |

## Notes

- Tested the live deployed site end-to-end once the Render backend and frontend were wired together. Checked the landing page, portal selector modal, direct URL reloads, student/faculty sign-in screens, Doctor OPD dashboard, and Receptionist check-in, live queue, and dispensing tabs.
- Testing caught two real bugs right away: opening sub-routes like `/signin/doctor` directly returned a 404 until the `/* -> /index.html` Render rewrite rule was added, and hitting Logout from the Receptionist sidebar wrongly kicked users to `/admin/login` (fixed in `bc2f117`).
- Re-tested everything after the fixes — student roll lookup (`1024030107`), Doctor and Dispensing WebSockets (`Live` / `Real-Time Push`), and logout redirects all worked cleanly with zero console or network errors. Wrapped up by finalizing `Est_Report/main.tex`, screenshots, and the final PDF.
- Covers Nov 24 – Nov 25, 2026.

## Commits this week

| Commit | Message | Date |
|--------|---------|------|
| `6bc1fd2` | fix(routing): route unauthenticated doctor and receptionist users directly to signin rather than student portal | Nov 24, 2026 |
| `bc2f117` | fix(auth): stop kicking logging-out receptionists straight into the admin login page | Nov 25, 2026 |
| `3cf6d6e` | added final est_report | Nov 25, 2026 |
| `301735f` | added Est_Report pdf | Nov 25, 2026 |
