# Week 6 — SQL Mitigations (`26`–`32`), Queue Constraints & Identity Extensions

| Ticket | Description | Status |
|--------|-------------|--------|
| KR-4 | Write SQL mitigation `26_fix_queue_entry.sql` so completed or cancelled visits don't block future re-queue or check-in constraints | Done |
| KR-5 | Add `27_rfid_card_staff_audit.sql` to log which receptionist enrolled or updated a student's RFID card | Done |
| KR-6 | Create `28_community_identity.sql`, `29_faculty_identity.sql`, and `32_faculty_employee_code.sql` for non-student and faculty dependents | Done |
| KR-7 | Add `30_clinical_case_category.sql` and `31_analytics_report_log.sql` for disease grouping and daily report logs | Done |

## Notes

- Ran into constraint errors during testing when the same student finished or cancelled a visit and tried checking in again or getting redirected between doctors. Wrote `26_fix_queue_entry.sql` to mitigate the uniqueness constraint issue cleanly while still preventing two genuinely active visits at the same time.
- As NFC enrollment, walk-in community patients, and faculty/dependent check-ins were added on the frontend, wrote migrations `27` through `32` so everything landed cleanly in Aiven MySQL without touching existing patient records.
- Also added tables for clinical case categorization and daily analytics email logs so the admin dashboard and automated reports had proper historical backing.
- Covers Oct 21 – Oct 31, 2026.

## Commits this week

| Commit | Message | Date |
|--------|---------|------|
| `7507822` | mapped rfid card to each individual student | Oct 23, 2026 |
| `314c6ea` | made checkin for other community members | Oct 30, 2026 |
| `aecf9e8` | feat: four-portal authentication architecture, faculty identity system, and unified portal UI | Oct 30, 2026 |
| `82ea7ad` | feat(analytics): automated daily analytics PDF generation and Resend email reporting | Oct 30, 2026 |
| `544a579` | feat(reception): integrate faculty & student check-in with employee code lookup and auto-deduced dependent gender | Oct 31, 2026 |
