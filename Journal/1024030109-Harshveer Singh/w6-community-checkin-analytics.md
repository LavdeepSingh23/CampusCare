# Week 6 — Community Check-in, Doctor Flow & Admin Analytics

| Ticket | Description | Status |
|--------|-------------|--------|
| CC-14 | Text clean-up across screens; add `loginStudent` to `api.js` | Done |
| CC-15 | Check-in for non-students straight into the live queue; fix "404 Visit not found" | Done |
| CC-16 | Attend-before-prescribe flow in doctor dashboard; auto prescription download off | Done |
| CC-17 | Portal selector clean-up and Administrator login link | Done |
| CC-18 | Admin analytics dashboard — disease charts, shift-wise demographics, PDF export | Done |

## Notes

- Non-students are checked in by direct form fill (new `reception.py` endpoint).
- Doctors must press **Attend** before prescribing, and only one consultation can be active at a time.
- Analytics uses real database figures; the exported PDF now renders the actual dashboard.
- Covers Harshveer Singh's commits only, Oct 28 – Nov 2, 2026.

## Commits this week

| Ticket | Commits | Summary | Date |
|--------|---------|---------|------|
| CC-14 | `582cd4c` | Modified texts | Oct 29, 2026 |
| CC-15 | `f9a5b36`, `baccc06`, `cc29ebd` | Community/non-student check-in straight into live queue; fixed 404 Visit not found on starting consultation | Oct 30, 2026 |
| CC-16 | `5372901`, `5119805` | Modified check-in cards and attending flow in live queue; removed auto prescription download | Nov 1, 2026 |
| CC-17 | `d84a88a`, `56211d5` | Removed Portal suffix/subtitle from sign-in options; added Administrator login link | Nov 1–2, 2026 |
| CC-18 | `d1d31e4`, `c77ca01`, `1660869`, `29a5822` | Disease intelligence, real database figures, disease distribution and shift-wise demographics charts, PDF export fixes | Nov 2, 2026 |
