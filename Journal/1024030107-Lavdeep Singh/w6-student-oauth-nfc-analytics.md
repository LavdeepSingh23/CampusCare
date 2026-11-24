# Week 6 — Student Google Login, NFC Integration, Faculty Portal & Daily Analytics

| Ticket | Description | Status |
|--------|-------------|--------|
| LD-5 | Connect `@thapar.edu` Google sign-in, first-time student onboarding, and medical profile views to the backend | Done |
| LD-6 | Map RFID/NFC card UIDs to students and hook up the Web NFC check-in flow over HTTPS | Done |
| LD-7 | Set up the 4-portal auth layout (Student, Faculty, Doctor, Receptionist), faculty employee code lookup, and community check-in | Done |
| LD-8 | Build daily analytics aggregation, PDF generation, and scheduled 9:00 AM IST email reports via Resend | Done |

## Notes

- Finished wiring the student side so logging in with a college Google account takes new students through onboarding first, and once saved, lets them check their allergies, past visits, and prescriptions directly from the backend.
- Tested real college ID cards with Web NFC on Android Chrome over HTTPS and mapped the card UIDs in the database so tapping at the reception desk automatically resolves the student and drops them into the queue.
- Realized the campus health centre isn't only for students, so I expanded the auth and check-in flows to handle faculty (with employee code lookup and dependent selection) as well as walk-in community members.
- Also put together an automated daily analytics job that compiles a clinic summary PDF and sends it out every morning at 9:00 AM via Resend.
- Covers Oct 21 – Oct 31, 2026.

## Commits this week

| Commit | Message | Date |
|--------|---------|------|
| `969dc11` | authenticated the student portal using google auth | Oct 22, 2026 |
| `559257f` | authenticated student profile onbarding on dashboard | Oct 22, 2026 |
| `e084a73` | addedfeature that allows  student to view medical details | Oct 22, 2026 |
| `ed9cdf1` | connected student dashboard to backend | Oct 22, 2026 |
| `07c5b7c` | chnged std dshbrd | Oct 23, 2026 |
| `7507822` | mapped rfid card to each individual student | Oct 23, 2026 |
| `b77ed48` | built nfc ui | Oct 23, 2026 |
| `5e8fa11` | fully integrated nfc card with the site | Oct 23, 2026 |
| `a877d4b` | fixed account section in student dashboard | Oct 27, 2026 |
| `bfb730e` | fixed the prescription studio and the prescription slip | Oct 28, 2026 |
| `b1c2ca6` | local host made secure | Oct 28, 2026 |
| `314c6ea` | made checkin for other community members | Oct 30, 2026 |
| `aecf9e8` | feat: four-portal authentication architecture, faculty identity system, and unified portal UI | Oct 30, 2026 |
| `82ea7ad` | feat(analytics): automated daily analytics PDF generation and Resend email reporting | Oct 30, 2026 |
| `d03d77b` | feat(auth): focus portal selector on student and faculty for mobile PWA, direct access for doctor and receptionist | Oct 31, 2026 |
| `544a579` | feat(reception): integrate faculty & student check-in with employee code lookup and auto-deduced dependent gender | Oct 31, 2026 |
