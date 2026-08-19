🏥 CampusCare

A digital campus health-center management system built around NFC-enabled college ID cards.

CampusCare is a Software Engineering project designed to replace a manual, paper-and-token campus health-center workflow with a secure, role-based digital system.

The system connects students, doctors, pharmacists/receptionists, and administrators through one workflow — from NFC check-in and doctor-specific queues to consultation, structured prescriptions, medicine dispensing, and permanent visit history.

✨ What makes CampusCare different?

Most of the project is a conventional health-center management system.

The interesting part is the identity + queue entry point:

College ID Card
      │
      │ NFC / Web NFC
      ▼
   Card UID
      │
      │ secure mapping
      ▼
   Student Identity
      │
      ▼
   CampusCare
      │
      ├── Doctor Selection
      ├── Live Queue
      ├── Consultation
      ├── Prescription
      └── Visit History

The student does not need a new RFID card or dedicated RFID reader.

CampusCare uses the existing NFC-capable college ID card as the physical entry point into the digital health-center workflow.

Technical note: The team's actual college ID card has already been tested with Android Chrome using Web NFC over HTTPS, and the card's unique serial/UID is being read successfully.

📌 Table of Contents

Project Status

Problem

Solution

Core Workflow

User Roles

Architecture

Technology Stack

Core Features

Prescription Model

Queue Model

Security

Project Scope

Repository Structure

Development Workflow

Getting Started

Environment Variables

Database

API

Testing

Deployment

Team

Roadmap

Project Documentation

🚦 Project Status

Current phase: 🟡 Development / Foundation

Overall

Requirements       ░░░░░░░░░░  0%
Architecture       ░░░░░░░░░░  0%
Database           ░░░░░░░░░░  0%
Backend            ░░░░░░░░░░  0%
Frontend           ░░░░░░░░░░  0%
Authentication     ░░░░░░░░░░  0%
Queue System       ░░░░░░░░░░  0%
Prescription       ░░░░░░░░░░  0%
RFID / NFC         ████░░░░░░  40%  ← feasibility test complete
Testing            ░░░░░░░░░░  0%
Deployment         ░░░░░░░░░░  0%

Percentages are intentionally approximate and will be updated as implementation progresses.

🎯 Problem

Campus health centers can become difficult to manage when the workflow depends heavily on paper records and physical queues.

CampusCare targets several concrete problems:

1. Unclear queues

Students may have no reliable way to know:

who is ahead of them

when they will be called

whether the doctor is available

which doctor they are waiting for

2. No easily accessible longitudinal record

A consultation may begin without convenient access to previous:

visits

conditions

allergies

prescriptions

consultation information

3. Handwritten prescriptions

Handwritten prescriptions can be:

difficult to read

misplaced

difficult for students to reference later

difficult to structure for reminders or future analytics

4. No separation between routine care and emergencies

Routine consultations and emergency/trauma cases have different operational requirements.

CampusCare therefore keeps the emergency log separate from the normal doctor queue.

💡 Solution

CampusCare creates one connected workflow:

                    ┌─────────────────┐
                    │  College ID/NFC │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Student Identity│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Check-in     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Doctor Selection│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Doctor's Queue  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Consultation   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Prescription  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Medicine Given  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Visit History  │
                    └─────────────────┘

🔄 Core Workflow

Student

1. Sign in with college Google account
          ↓
2. Complete / maintain health profile
          ↓
3. Tap college ID card
          ↓
4. CampusCare identifies student
          ↓
5. Select available doctor
          ↓
6. Join doctor's queue
          ↓
7. Track queue status
          ↓
8. Doctor calls student
          ↓
9. Consultation
          ↓
10. Prescription created
          ↓
11. Visit moves to medicine collection
          ↓
12. Pharmacist confirms dispensing
          ↓
13. Visit becomes COMPLETED
          ↓
14. Visit appears in medical history

👥 User Roles

🎓 Student

Students can:

authenticate using their college Google account

create and maintain their health profile

check in using NFC

use staff-assisted manual check-in when required

select an available doctor

view their current queue status

view their own medical history

view prescriptions

view completed visits

Students cannot:

change their role

access other students' records

create prescriptions

modify completed clinical records

🩺 Doctor

Doctors can:

view their own queue

call the next student

view the student's medical history

view relevant health-profile information

record consultation details

create structured prescriptions

redirect a student to the other doctor

mark the consultation complete

💊 Pharmacist / Receptionist

The receptionist is also the authorized medicine dispenser in the CampusCare workflow.

They can:

perform staff-assisted manual check-in

view the information required for their operational duties

view medical history according to the project's access policy

view prescriptions

confirm medicine dispensing

record medicine substitutions or deviations

log emergency/trauma cases

🛠️ Administrator

Admins can:

create/manage doctor accounts

create/manage pharmacist/receptionist accounts

manage system users

mark doctors available/unavailable

enroll RFID cards

revoke RFID credentials

view system-level records/logs

🏗️ Architecture

CampusCare follows a conventional three-tier web architecture.

┌─────────────────────────────────────────────────────┐
│                    CLIENT LAYER                     │
│                                                     │
│ React + Vite + Tailwind + PWA                      │
│                                                     │
│ Student │ Doctor │ Pharmacist │ Admin              │
└─────────────────────────┬───────────────────────────┘
                          │ HTTPS / REST
                          ▼
┌─────────────────────────────────────────────────────┐
│                  APPLICATION LAYER                 │
│                                                     │
│ Python + FastAPI                                    │
│                                                     │
│ Authentication                                      │
│ Authorization                                       │
│ Queue logic                                         │
│ Consultation logic                                  │
│ Prescription logic                                  │
│ RFID identity mapping                               │
│ Emergency logging                                   │
└─────────────────────────┬───────────────────────────┘
                          │ SQL
                          ▼
┌─────────────────────────────────────────────────────┐
│                     DATA LAYER                     │
│                                                     │
│ PostgreSQL                                          │
│                                                     │
│ Raw SQL + version-controlled migrations             │
└─────────────────────────────────────────────────────┘

📡 NFC Architecture

The RFID/NFC flow is intentionally simple.

Android device
      │
      ▼
Chrome + Web NFC
      │
      ▼
College ID Card
      │
      ▼
Unique UID / serial
      │
      ▼
Client-side processing
      │
      ▼
Secure server request
      │
      ▼
Stored credential mapping
      │
      ▼
Student
      │
      ▼
Check-in

Important

CampusCare does not treat the UID itself as a student's identity.

The system maintains a controlled mapping:

RFID credential
       ↓
Student
       ↓
CampusCare account

The UID is hashed before storage.

🔐 Authentication & Authorization

Students use the college Google identity flow.

Staff users have role-controlled access.

The backend is authoritative for permissions.

Frontend
   │
   │ request
   ▼
FastAPI
   │
   ├── authenticate
   ├── identify user
   ├── verify role
   ├── verify resource access
   │
   ▼
PostgreSQL

The frontend hiding a button is not considered authorization.

Every protected API endpoint performs server-side authorization.

🩺 Medical Record Model

A student's information is divided conceptually into:

Health Profile

Longer-lived information such as:

allergies

known conditions

blood group

current medications

emergency contact

other relevant health information

Visit History

Each completed visit can contain:

doctor

consultation information

prescription

dispensing record

timestamps

redirection information where applicable

This allows a doctor to see the patient's longitudinal history instead of treating every consultation as an isolated event.

💊 Prescription Model

CampusCare intentionally avoids a single free-text prescription box.

Prescription items use structured fields.

Conceptually:

Medicine
   │
   ├── Strength
   ├── Form
   ├── Route
   ├── Dose
   ├── Morning
   ├── Afternoon
   ├── Night
   ├── Duration
   ├── Food instruction
   ├── PRN
   └── Additional instructions

Example:

Medicine: Example Medicine
Strength: 500 mg
Form: Tablet
Route: Oral

Morning:   1
Afternoon: 0
Night:     1

Duration: 5 days
Food: After food

The exact prescription fields will be finalized with the project requirements before implementation.

🧑‍⚕️ Queue Model

Each doctor has an independent queue.

Doctor A
──────────────
Student 01
Student 04
Student 09

Doctor B
──────────────
Student 02
Student 05
Student 07

Queue position is derived from queue state and ordering information rather than being treated as a permanently stored number.

No-show handling

When a doctor calls a student:

WAITING
   ↓
CALLED
   ↓
Student appears
   ↓
IN_CONSULTATION

If the student does not appear within the configured buffer:

CALLED
   ↓
NO_SHOW
   ↓
re-enter at end of queue

The no-show event is retained as part of the visit/queue history.

Doctor redirection

If a student selected the wrong doctor:

Doctor A
   │
   │ redirect
   ▼
Doctor B

The visit itself remains the same clinical encounter.

The system changes the operational routing rather than silently creating an unrelated second visit.

🚨 Emergency Workflow

Emergency/trauma cases intentionally bypass the normal queue.

Emergency
    │
    ▼
Authorized staff member
    │
    ▼
Emergency log

There is:

no normal doctor queue

no student queue position

no doctor-selection screen

no requirement to route the emergency through the routine consultation flow

This separation reflects the actual campus operational workflow.

🗃️ Database

CampusCare uses PostgreSQL.

The project intentionally uses:

raw SQL

foreign keys

constraints

indexes

transactions

version-controlled SQL migrations

An ORM is not currently planned.

Conceptual entities include:

Users
Students
Staff
Doctors
RFID Credentials
Health Profiles
Visits
Queue Entries
Consultations
Prescriptions
Prescription Items
Dispensing Records
Emergency Cases
Audit Logs

🧪 Testing Philosophy

CampusCare will test both:

Functional correctness

Does the feature work?

and:

Failure behavior

What happens when:
- card is unknown?
- card is revoked?
- student is already checked in?
- doctor is unavailable?
- student doesn't show?
- two requests arrive simultaneously?
- session expires?
- network fails?

A feature is considered complete only when its normal and important failure paths are handled.

🔒 Security Principles

CampusCare deals with sensitive student health information, so security is treated as a first-class engineering concern.

Key principles:

server-side authorization

least-privilege role access where applicable

secure authentication

hashed RFID identifiers

HTTPS in deployed environments

secrets stored outside source control

database constraints

transaction-safe queue operations

audit logging for important actions

synthetic data for development/testing

no real medical records in public demo environments

Development and demonstration environments should use synthetic data unless appropriate authorization and safeguards have been established for real data.

📦 Project Scope

✅ Core — Semester Deliverable

Google-based student authentication

Student account/profile

Health profile

NFC/RFID check-in

Staff-assisted manual check-in

Doctor selection

Doctor availability

Doctor-specific queues

Queue position

No-show handling

Doctor redirection

Consultation records

Medical history

Structured prescriptions

Pharmacist dispensing

Medicine substitution logging

Emergency log

Role-based access

Admin panel

Audit logging

Deployment

Testing

🟡 Stretch Goals

Only after the core system is stable:

Medication reminders

Seasonal disease-surge analytics

❌ Explicitly Out of Scope

For the current semester:

Medicine inventory management

AI diagnosis

Symptom-based automated triage

Automated medical decision-making

Payment processing

Insurance integration

Native Android application

Hospital/ambulance integration

Scope discipline is intentional.

🗂️ Repository Structure

campuscare/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── schemas/
│   │   ├── auth/
│   │   └── ...
│   ├── tests/
│   ├── requirements.txt
│   └── ...
│
├── database/
│   ├── migrations/
│   └── seed/
│
├── docs/
│   ├── requirements.md
│   ├── use-cases.md
│   ├── permissions.md
│   ├── architecture.md
│   ├── decisions.md
│   └── ...
│
├── .gitignore
├── README.md
└── ...

🧑‍💻 Development Workflow

CampusCare uses feature branches and pull requests.

main
  │
  └── develop
         │
         ├── feature/student-auth
         ├── feature/queue-system
         ├── feature/rfid-checkin
         └── feature/prescription

Rules

Do not push directly to main.

One feature → one branch.

Open a pull request.

At least one teammate reviews the change.

Tests should pass before merging.

Keep commits focused.

Never commit secrets.

Never commit real student medical records.

🛠️ Technology Stack

Layer

Technology

Frontend

React

Build Tool

Vite

Styling

Tailwind CSS

App Model

Progressive Web App

Backend

Python

API Framework

FastAPI

Database

PostgreSQL

Database Access

Raw SQL

Authentication

Google Identity + application session

RFID/NFC

Web NFC

Real-time V1

Polling

Real-time V2

WebSockets

Version Control

Git + GitHub

Frontend Hosting

Vercel / Netlify

Backend Hosting

Render / similar

Database Hosting

Managed PostgreSQL

🚀 Getting Started

The exact setup commands will be finalized as the implementation is created.

Prerequisites

Install:

Git

Node.js LTS

Python 3.11+

PostgreSQL

VS Code or another IDE

Optional but recommended:

Postman / Bruno / Insomnia

pgAdmin / DBeaver

Android device with NFC for Web NFC testing

Clone

git clone <repository-url>
cd campuscare

Frontend

cd frontend
npm install
npm run dev

Backend

cd backend

python -m venv .venv

Windows

.venv\Scripts\activate

macOS / Linux

source .venv/bin/activate

Install dependencies:

pip install -r requirements.txt

Start FastAPI:

uvicorn app.main:app --reload

🔑 Environment Variables

Never commit actual secrets.

Use:

.env
.env.example

Example:

DATABASE_URL=
GOOGLE_CLIENT_ID=
JWT_SECRET=
CORS_ORIGINS=

The .env.example file should contain variable names but no real credentials.

🗄️ Database Setup

Create the PostgreSQL database.

Then apply migrations in order:

001_initial.sql
002_...
003_...

Seed development data:

seed.sql

Development data must be synthetic.

📡 NFC Development

Web NFC requires an appropriate secure context and compatible browser/device environment.

CampusCare's NFC implementation is targeted at:

Android
+
Chrome
+
HTTPS
+
NFC enabled

The project has already completed an initial real-card feasibility test:

College ID
    ↓
Android NFC
    ↓
Chrome Web NFC
    ↓
UID / serial successfully read

The production implementation will add the secure server-side credential lookup and check-in workflow around that capability.

🌐 Deployment

Target architecture:

                 ┌───────────────────┐
                 │       Users       │
                 └─────────┬─────────┘
                           │ HTTPS
                           ▼
                 ┌───────────────────┐
                 │ Frontend Hosting  │
                 │ Vercel / Netlify  │
                 └─────────┬─────────┘
                           │ HTTPS
                           ▼
                 ┌───────────────────┐
                 │ FastAPI Backend   │
                 │ Render / similar  │
                 └─────────┬─────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │ Managed PostgreSQL│
                 └───────────────────┘

Public deployment will use synthetic test data.

🧭 Development Roadmap

┌──────────────────────────────────────────────┐
│ 1. Requirements                              │
│    ↓                                         │
│ 2. Architecture + ERD                        │
│    ↓                                         │
│ 3. Database + migrations                     │
│    ↓                                         │
│ 4. Authentication                            │
│    ↓                                         │
│ 5. Walking skeleton                          │
│    ↓                                         │
│ 6. Student portal                            │
│    ↓                                         │
│ 7. Doctor workflow                            │
│    ↓                                         │
│ 8. Prescription + dispensing                 │
│    ↓                                         │
│ 9. Second doctor + redirect + no-show        │
│    ↓                                         │
│10. Queue polling                             │
│    ↓                                         │
│11. RFID/NFC integration                      │
│    ↓                                         │
│12. Admin + emergency                         │
│    ↓                                         │
│13. Security + audit                          │
│    ↓                                         │
│14. Testing                                   │
│    ↓                                         │
│15. Deployment                                │
│    ↓                                         │
│16. Pilot + hardening                         │
│    ↓                                         │
│17. Optional stretch goals                    │
└──────────────────────────────────────────────┘

📅 Target Timeline

Phase

Target

Requirements & architecture

Week 1

Database & backend foundation

Week 2

Walking skeleton

Week 3

Student + doctor workflows

Weeks 4–5

Queue + redirect + no-show

Week 6

RFID + admin + emergency

Week 7

Security + testing

Week 8

Deployment + integration testing

Week 9

Pilot + documentation + demo

Week 10

Buffer / stretch

Remaining time

The project follows a walking-skeleton-first strategy: a small end-to-end workflow is made functional before expanding the system.

🧱 Definition of Done

A CampusCare feature is not considered complete merely because its UI exists.

A feature is considered done when:

Requirement
    ↓
Database
    ↓
Backend
    ↓
Authorization
    ↓
Frontend
    ↓
Error handling
    ↓
Testing
    ↓
Documentation

are all addressed.

For example, RFID check-in is not "done" merely because the phone can read a UID.

It is done when:

NFC card
   ↓
UID read
   ↓
Credential verified
   ↓
Student identified
   ↓
Duplicate check
   ↓
Visit created
   ↓
Queue entry created
   ↓
Student sees queue
   ↓
Invalid/revoked card rejected

📚 Project Documentation

Documentation will live under /docs.

Planned documents:

requirements.md

use-cases.md

permissions.md

architecture.md

decisions.md

Database design

API specification

State machines

Testing strategy

Deployment guide

📊 Engineering Principles

CampusCare is being built around a few simple principles:

1. Correctness over feature count

A smaller system that works reliably is better than a large system full of unfinished features.

2. Backend is authoritative

The client never gets to decide:

role

permissions

queue state

identity

prescription ownership

3. Explicit state transitions

Visits move through known states rather than arbitrary status changes.

4. Structured clinical data

Information that needs to be queried later should not unnecessarily be stored as unstructured text.

5. Privacy by design

Development environments use synthetic data.

6. Scope discipline

Features are added only when they have a clear place in the semester deliverable.

👨‍💻 Team

CampusCare Team — 4 members

Responsibility

Owner

Backend / API

TBD

Frontend / PWA

TBD

Database / Clinical Workflow

TBD

Infrastructure / Integration / RFID

TBD

Team assignments will be maintained as the project develops.

🎓 Academic Context

CampusCare is being developed as a 5th-semester Software Engineering project.

The project is intentionally designed to demonstrate practical software engineering rather than only UI development:

requirements engineering

system design

relational database design

REST API development

authentication and authorization

state management

concurrency considerations

hardware/browser integration

testing

deployment

version control

team collaboration

technical documentation

⭐ Why this belongs on a CV

CampusCare combines several practical engineering areas in one project:

React
+
FastAPI
+
PostgreSQL
+
Raw SQL
+
Authentication
+
RBAC
+
NFC / Web NFC
+
REST APIs
+
PWA
+
Real-time queueing
+
Transactions
+
Testing
+
Cloud deployment

The strongest part of the project is not the number of technologies.

It is the end-to-end workflow connecting physical identity, software identity, queue management, clinical records, prescriptions, and dispensing.

📜 License

License to be decided by the team.

<p align="center">
  <b>CampusCare</b><br>
  From ID card tap → to completed care.
</p>