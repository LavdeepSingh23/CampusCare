# Week 2 — DFD (Level 2 — Sub-process Breakdown)

| Ticket | Description | Status |
|--------|-------------|--------|
| CC-3 | Document Level 2 DFD — decompose each of the 6 Level 1 processes into detailed sub-processes (1.1–6.6) | Done |

## Contents

- [4.1 Process 1.0 — Registration & Queue Management](#41-process-10--registration--queue-management)
- [4.2 Process 2.0 — Doctor Dashboard & Patient History](#42-process-20--doctor-dashboard--patient-history)
- [4.3 Process 3.0 — Prescription Management](#43-process-30--prescription-management)
- [4.4 Process 4.0 — Notification Management](#44-process-40--notification-management)
- [4.5 Process 5.0 — Visit Completion & Queue Update](#45-process-50--visit-completion--queue-update)
- [4.6 Process 6.0 — Disease & Seasonal Analytics](#46-process-60--disease--seasonal-analytics)

## 4.1 Process 1.0 — Registration & Queue Management

Opens up how a student's roll number turns into an actual place in the consultation queue. The student is validated against the Student Master before any queue entry is created.

| No. | Sub-process | Description |
|-----|-------------|-------------|
| 1.1 | Enter Roll Number | Captures the roll number the student enters to begin registration. |
| 1.2 | Validate Student | Checks the roll number against D1 Student Master and retrieves the matching student record. |
| 1.3 | Create Queue Entry | Creates a new entry for the validated student in D2 Live Queue. |
| 1.4 | Generate Queue Number | Assigns the student's position/number in the current queue. |
| 1.5 | Display Queue Status | Returns the queue number and current status to the student. |

## 4.2 Process 2.0 — Doctor Dashboard & Patient History

Shows how the doctor moves from the live queue to a full picture of one student — their personal details, past visits, and past prescriptions — before the consultation begins.

| No. | Sub-process | Description |
|-----|-------------|-------------|
| 2.1 | Load Current Queue | Retrieves the list of active/waiting patients from D2 Live Queue. |
| 2.2 | Select Patient | Lets the doctor pick one student from the loaded queue. |
| 2.3 | Retrieve Student Details | Fetches the selected student's information from D1 Student Master. |
| 2.4 | Retrieve Visit History | Fetches the student's previous visits from D3 Visit & Prescription Records. |
| 2.5 | Retrieve Prescription History | Fetches the student's previous prescriptions from D3. |
| 2.6 | Display Patient Dashboard | Combines the queue, details, and history into one view for the doctor. |

## 4.3 Process 3.0 — Prescription Management

The most detailed process in the system. Walks through how the doctor builds up a complete prescription — medicine, dosage, timing slot, and general instructions — before it is validated and saved.

| No. | Sub-process | Description |
|-----|-------------|-------------|
| 3.1 | Start New Prescription | Begins a new prescription for the currently selected student. |
| 3.2 | Enter Medicine | Captures the medicine name. |
| 3.3 | Enter Dosage | Captures the dosage / quantity instructions for that medicine. |
| 3.4 | Assign Time Slot | Assigns the medicine to a Morning, Evening, and/or Night schedule. |
| 3.5 | Enter General Instructions | Adds free-text instructions or non-scheduled medication notes. |
| 3.6 | Validate Prescription | Checks that all required prescription fields have been filled in. |
| 3.7 | Save Prescription | Stores the completed prescription in D3 Visit & Prescription Records. |
| 3.8 | Confirm Prescription | Returns a save confirmation to the doctor and makes it available to the student. |

## 4.4 Process 4.0 — Notification Management

Shows how a saved medicine schedule is turned into a timely reminder sent to the student, and how the outcome of that reminder is recorded back against the same prescription.

| No. | Sub-process | Description |
|-----|-------------|-------------|
| 4.1 | Read Prescription Schedule | Retrieves the medicine schedule from D3. |
| 4.2 | Identify Current Time Slot | Determines whether the reminder falls in the morning, evening, or night slot. |
| 4.3 | Generate Reminder | Builds the reminder message for that medicine and slot. |
| 4.4 | Send Notification | Sends the reminder to the student. |
| 4.5 | Record Notification Status | Records whether the reminder was sent/acknowledged, back into D3. |

## 4.5 Process 5.0 — Visit Completion & Queue Update

Shows what happens once a doctor finishes a consultation: the visit is closed out, the live queue is updated, and the next waiting student is brought forward.

| No. | Sub-process | Description |
|-----|-------------|-------------|
| 5.1 | Consultation Complete | Captures the doctor marking the consultation as "Done". |
| 5.2 | Update Visit Status | Marks the current visit as completed in D3. |
| 5.3 | Update Live Queue | Removes the completed patient from D2 Live Queue. |
| 5.4 | Identify Next Patient | Retrieves the next waiting student from the queue. |
| 5.5 | Display Updated Queue | Shows the refreshed queue to the doctor. |

## 4.6 Process 6.0 — Disease & Seasonal Analytics

Shows how a single completed visit contributes to a bigger picture: cases are logged, grouped by season, counted, and compared against a threshold so the admin can be alerted to a surge.

| No. | Sub-process | Description |
|-----|-------------|-------------|
| 6.1 | Capture Symptoms / Diagnosis | Records the symptom or diagnosis category from a completed visit. |
| 6.2 | Log Disease Case | Saves the case into D4 Disease Case Log. |
| 6.3 | Categorize by Season | Tags the case by season (e.g. Summer/heat, Monsoon/viral, Winter/respiratory). |
| 6.4 | Aggregate Cases | Counts cases by disease/symptom, date, month, and season, using D4's historical data. |
| 6.5 | Compare With Threshold | Compares the current case count against a predefined surge threshold. |
| 6.6 | Generate Analytics / Advisory | Produces the seasonal report, and a surge advisory when an unusual increase is detected. |

## Notes

DFD balancing rule maintained — every flow entering or leaving a Level 1 process reappears inside its Level 2 decomposition here, with no new/unrelated flows introduced. This is documentation/design work for the Software Engineering Lab submission; no new frontend or backend code was added this week. Frontend (`Doctors_Dashboard.jsx`) still runs on mock data as noted in Week 1.
