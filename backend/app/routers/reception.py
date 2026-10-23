"""
Receptionist endpoints for CampusCare (MySQL schema from backend/sql/*.sql).

  GET  /api/reception/students/{roll_number}   -> 404 "Record not found" if unknown
  GET  /api/reception/doctors                  -> doctors + current waiting count
  POST /api/reception/checkin                  -> creates VISIT + QUEUE_ENTRY (WAITING)
  GET  /api/reception/queue                    -> live queue for the front desk

Everything is authorized on the server: only a valid RECEPTIONIST token works.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.database import get_db_connection
from app.core.deps import CurrentReceptionist, get_current_receptionist, CurrentUser, get_current_staff
from typing import Literal, Dict, Any, List
from app.core.util import display_name_from_email
from app.schemas.dispensing import DispenseRequest
from app.services import queue_lifecycle as ql

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reception", tags=["reception"])

# A student with a visit in any of these states may not check in again.
ACTIVE_VISIT_STATES = (
    "CHECKED_IN",
    "WAITING_FOR_DOCTOR",
    "CALLED",
    "IN_CONSULTATION",
    "WAITING_FOR_MEDICINE",
)


class CheckInRequest(BaseModel):
    roll_number: Optional[str] = Field(default=None, max_length=30)
    rollNumber: Optional[str] = Field(default=None, max_length=30)
    doctor_id: Optional[int] = None
    doctorId: Optional[int] = None
    complaint: Optional[str] = Field(default=None, max_length=300)
    via: str = "MANUAL"  # "RFID" when card tap is active

    def get_roll_number(self) -> str:
        val = self.roll_number or self.rollNumber
        if not val or not val.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Student identifier (roll_number / rollNumber) is required",
            )
        return val.strip()

    def get_doctor_id(self) -> int:
        val = self.doctor_id if self.doctor_id is not None else self.doctorId
        if val is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Selected doctor (doctor_id / doctorId) is required",
            )
        return val


def _active_visit(cursor, roll_number: str):
    placeholders = ",".join(["%s"] * len(ACTIVE_VISIT_STATES))
    cursor.execute(
        f"""SELECT visit_id, status FROM VISIT
            WHERE roll_number = %s AND status IN ({placeholders})
            ORDER BY checked_in_at DESC LIMIT 1""",
        (roll_number, *ACTIVE_VISIT_STATES),
    )
    return cursor.fetchone()


# ── 1. lookup: "Record not found" happens here ─────────────────────────
@router.get("/students/{roll_number}")
def lookup_student(roll_number: str, _: CurrentReceptionist = Depends(get_current_receptionist)):
    roll_number = roll_number.strip()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT roll_number, full_name, date_of_birth, blood_group, status
                   FROM STUDENT WHERE roll_number = %s""",
                (roll_number,),
            )
            st = cur.fetchone()
            if not st:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Record not found")
            if st.get("status") == "INACTIVE":
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Student record is inactive")

            cur.execute(
                "SELECT allergen, severity FROM ALLERGY WHERE roll_number = %s AND ended_at IS NULL",
                (roll_number,),
            )
            allergies = ", ".join(a["allergen"] for a in cur.fetchall()) or "None recorded"

            active = _active_visit(cur, roll_number)
            cur.execute(
                "SELECT card_uid, status, issued_at FROM RFID_CARD WHERE roll_number = %s AND status = 'ACTIVE' LIMIT 1",
                (roll_number,),
            )
            active_card = cur.fetchone()
    finally:
        conn.close()

    return {
        "rollNumber": st["roll_number"],
        "name": st["full_name"],
        "bloodGroup": st["blood_group"],
        "blood": st["blood_group"],  # Compatible with receptionist.jsx student.blood
        "allergies": allergies,
        "alreadyInQueue": active is not None,
        "activeVisitStatus": active["status"] if active else None,
        "program": "B.Tech",
        "dept": "",
        "semester": None,
        "activeCardUid": active_card["card_uid"] if active_card else None,
        "activeCard": (
            {
                "cardUid": active_card["card_uid"],
                "status": active_card["status"],
                "issuedAt": active_card["issued_at"].isoformat() if hasattr(active_card["issued_at"], "isoformat") else str(active_card["issued_at"]),
            }
            if active_card
            else None
        ),
    }


# ── 2. doctors the receptionist can pick from ──────────────────────────
@router.get("/doctors")
def list_doctors(_: CurrentReceptionist = Depends(get_current_receptionist)):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.doctor_id, ua.email, sp.name AS specialty,
                       (SELECT COUNT(*) FROM QUEUE_ENTRY qe
                         WHERE qe.doctor_id = d.doctor_id AND qe.status = 'WAITING') AS waiting,
                       (SELECT da.status FROM DOCTOR_AVAILABILITY da
                         WHERE da.doctor_id = d.doctor_id
                           AND da.availability_date = CURDATE() LIMIT 1) AS today_status
                FROM DOCTOR d
                JOIN STAFF s ON s.staff_id = d.staff_id AND s.status = 'ACTIVE'
                JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id AND ua.status = 'ACTIVE'
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                ORDER BY d.doctor_id
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    result = []
    for r in rows:
        raw_name = display_name_from_email(r["email"])
        doc_name = raw_name if raw_name.startswith("Dr ") else f"Dr {raw_name}"
        result.append(
            {
                "doctorId": r["doctor_id"],
                "name": doc_name,
                "specialty": r["specialty"] or "General Physician",
                "room": f"Room {103 + r['doctor_id']}",
                "waiting": r["waiting"],
                "queueCount": r["waiting"],  # Compatible with receptionist.jsx d.queueCount
                # No availability row = available. Only explicit UNAVAILABLE blocks.
                "available": r["today_status"] != "UNAVAILABLE",
            }
        )
    return result


# ── 3. check-in: visit + queue entry in ONE transaction ────────────────
@router.post("/check-ins", status_code=status.HTTP_201_CREATED)
@router.post("/checkin", status_code=status.HTTP_201_CREATED)
def check_in(body: CheckInRequest, me: CurrentReceptionist = Depends(get_current_receptionist)):
    """
    Task 5.1 Check-in Endpoint:
    - Authenticates the receptionist via server-validated JWT.
    - Validates student identifier and selected doctor.
    - Validates doctor availability rules on CURDATE().
    - Enforces single active visit policy (rejects 409 Conflict).
    - Allocates server-side sequence safely under exclusive doctor row lock.
    - Creates VISIT, QUEUE_ENTRY, and VISIT_EVENT atomically.
    - Retries transparently on transient MySQL deadlocks.
    - Returns persisted visit_id, queue_number, doctor_id, and status.
    """
    roll_number = body.get_roll_number()
    doctor_id = body.get_doctor_id()

    max_retries = 3
    for attempt in range(max_retries):
        conn = get_db_connection()
        try:
            result = ql.check_in_student(
                conn=conn,
                roll_number=roll_number,
                doctor_id=doctor_id,
                performed_by_user_id=me.user_id,
                complaint=body.complaint,
                via=body.via,
            )
            conn.commit()
            return {
                "visit_id": result["visitId"],
                "visitId": result["visitId"],
                "queue_number": result["queueNo"],
                "queueNo": result["queueNo"],
                "sequence": result["queueNo"],
                "doctor_id": result["doctorId"],
                "doctorId": result["doctorId"],
                "status": result["status"],
                "position": result["position"],
                "name": result["name"],
                "roll_number": result["rollNumber"],
                "rollNumber": result["rollNumber"],
                "queue_entry_id": result["queueEntryId"],
                "queueEntryId": result["queueEntryId"],
            }
        except ql.ResourceNotFoundError as exc:
            conn.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
        except ql.ActiveVisitConflictError as exc:
            conn.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
        except ql.DoctorUnavailableError as exc:
            conn.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
        except ql.InvalidTransitionError as exc:
            conn.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
        except Exception as exc:
            try:
                conn.rollback()
            except Exception:
                pass
            is_deadlock = hasattr(exc, "args") and len(exc.args) > 0 and exc.args[0] == 1213
            if is_deadlock and attempt < max_retries - 1:
                import time
                time.sleep(0.05 * (attempt + 1))
                continue
            logger.error("Reception check-in transaction error for roll %s: %s", roll_number, exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Could not complete check-in: {exc}",
            )
        finally:
            conn.close()


# ── 4. live queue for the front-desk screen (poll every few seconds) ───
@router.get("/queue")
def front_desk_queue(
    doctor_id: Optional[int] = Query(None, description="Optional doctor ID filter"),
    _: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist queue view: Returns active queue entries across all doctors,
    or filtered for a specific doctor if `doctor_id` is provided.
    Each entry includes visit, student, doctor, queue sequence, status, and check-in time.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT qe.queue_entry_id, qe.doctor_id, qe.queue_sequence, qe.entered_at, qe.called_at,
                       qe.status AS queue_status, qe.entry_reason,
                       v.visit_id, v.roll_number, v.status AS visit_status, v.checked_in_at,
                       st.full_name, st.blood_group,
                       ua.email AS doctor_email,
                       sp.name AS specialty,
                       (SELECT ve.notes FROM VISIT_EVENT ve
                        WHERE ve.visit_id = v.visit_id AND ve.event_type = 'CHECKED_IN'
                        ORDER BY ve.event_id DESC LIMIT 1) AS checkin_notes
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                JOIN DOCTOR d ON d.doctor_id = qe.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                WHERE qe.status IN ('WAITING', 'IN_CONSULTATION')
            """
            params = []
            if doctor_id is not None:
                sql += " AND qe.doctor_id = %s"
                params.append(doctor_id)

            sql += " ORDER BY qe.doctor_id, FIELD(qe.status, 'IN_CONSULTATION', 'WAITING'), qe.queue_sequence ASC, qe.entered_at ASC"

            cur.execute(sql, tuple(params))
            rows = cur.fetchall()
    finally:
        conn.close()

    result = []
    for r in rows:
        raw_name = display_name_from_email(r["doctor_email"])
        doc_name = raw_name if raw_name.startswith("Dr ") else f"Dr {raw_name}"

        # Extract chief complaint if recorded at check-in
        complaint = ""
        notes = r.get("checkin_notes")
        if notes:
            if " - " in notes:
                complaint = notes.split(" - ", 1)[1].strip()
            elif not any(term in notes.lower() for term in ("check-in", "checkin")):
                complaint = notes.strip()
        if not complaint and r.get("entry_reason") and r["entry_reason"] != "INITIAL_CHECKIN":
            complaint = r["entry_reason"]

        chk_time = r.get("checked_in_at") or r.get("entered_at")
        chk_iso = chk_time.isoformat() if chk_time else None
        entered_iso = r["entered_at"].isoformat() if r.get("entered_at") else None
        called_iso = r["called_at"].isoformat() if r.get("called_at") else None
        waiting_since = r["entered_at"].strftime("%I:%M %p") if r.get("entered_at") else None
        called_at = r["called_at"].strftime("%I:%M %p") if r.get("called_at") else None

        result.append({
            # Identifiers
            "queueEntryId": r["queue_entry_id"],
            "queue_entry_id": r["queue_entry_id"],
            "visitId": r["visit_id"],
            "visit_id": r["visit_id"],
            "rollNumber": r["roll_number"],
            "roll_number": r["roll_number"],
            "rollNo": r["roll_number"],
            "name": r["full_name"],
            "student_name": r["full_name"],
            "bloodGroup": r.get("blood_group"),
            "blood_group": r.get("blood_group"),

            # Doctor Information
            "doctorId": r["doctor_id"],
            "doctor_id": r["doctor_id"],
            "doctorName": doc_name,
            "doctor_name": doc_name,
            "doctorEmail": r["doctor_email"],
            "doctor_email": r["doctor_email"],
            "specialty": r.get("specialty") or "General Physician",
            "room": f"Room {103 + r['doctor_id']}",

            # Queue Sequence and Status
            "queueNo": r["queue_sequence"],
            "queue_number": r["queue_sequence"],
            "queue_sequence": r["queue_sequence"],
            "status": "In Consultation" if r["queue_status"] == "IN_CONSULTATION" else "Waiting",
            "statusCode": r["queue_status"],
            "status_code": r["queue_status"],
            "queueStatus": r["queue_status"],
            "queue_status": r["queue_status"],
            "visitStatus": r["visit_status"],
            "visit_status": r["visit_status"],

            # Timing
            "checkInTime": chk_iso,
            "check_in_time": chk_iso,
            "checkedInAt": chk_iso,
            "checked_in_at": chk_iso,
            "enteredAt": entered_iso,
            "entered_at": entered_iso,
            "waitingSince": waiting_since,
            "calledAt": called_at,
            "called_at": called_iso,

            # Clinical details
            "complaint": complaint,
        })

    return result


# ── 5. Prescriptions awaiting dispensing & medicine fulfillment ─────────
@router.get("/prescriptions/awaiting-dispense")
@router.get("/dispensing")
def list_prescriptions_awaiting_dispense(
    doctor_id: Optional[int] = Query(None, description="Optional doctor ID filter"),
    _: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist dispensing view: Returns all visits currently in WAITING_FOR_MEDICINE,
    along with patient details, allergies, doctor information, and full prescribed medicines
    with dosages, timing schedules, and calculated quantities.
    """
    conn = get_db_connection()
    try:
        return ql.get_prescriptions_awaiting_dispense(conn=conn, doctor_id=doctor_id)
    finally:
        conn.close()


@router.get("/prescriptions/{visit_id}")
def get_prescription_by_visit(
    visit_id: int,
    _: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist prescription view: Returns finalized prescription details for a specific visit.
    """
    conn = get_db_connection()
    try:
        return ql.get_visit_prescription_detail(conn=conn, visit_id=visit_id)
    except ql.ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    finally:
        conn.close()


@router.post("/dispense/{visit_id}")
def dispense_visit_prescription(
    visit_id: int,
    payload: Optional[DispenseRequest] = None,
    receptionist: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist dispensing action: Records medicine dispensing and discharges student visit.
    Supports full dispensing, partial dispensing with reason, and item-level quantities.
    """
    conn = get_db_connection()
    try:
        remarks = payload.remarks if payload and payload.remarks else "Medicines dispensed at front desk"
        status_val = payload.get_status() if payload else None
        reason_val = payload.get_change_reason() if payload else None
        items_val = [it.model_dump() for it in payload.items] if payload and payload.items else None

        result = ql.dispense_medication(
            conn=conn,
            visit_id=visit_id,
            performed_by_user_id=receptionist.user_id,
            remarks=remarks,
            dispensing_status=status_val,
            change_reason=reason_val,
            items=items_val,
        )
        conn.commit()
        return result
    except ql.ResourceNotFoundError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        conn.rollback()
        logger.error("Reception dispense failed for visit #%s: %s", visit_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to record dispensing: {exc}")
    finally:
        conn.close()





# ── 6. Student Directory Search & Medical Profile History ──────────────
@router.get("/students")
def search_students(
    q: Optional[str] = Query(None, description="Search term for name, roll number, or email"),
    dept: Optional[str] = Query(None, description="Department filter"),
    limit: int = Query(50, ge=1, le=200, description="Max results"),
    offset: int = Query(0, ge=0, description="Result offset"),
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Search and list registered students with pagination, contact info, and medical telemetry.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            sql_count = "SELECT COUNT(*) AS total FROM STUDENT st JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id WHERE 1=1"
            sql_data = """
                SELECT st.roll_number, st.full_name, st.date_of_birth, st.sex, st.phone_number,
                       st.blood_group, st.status,
                       ua.email,
                       ec.name AS ec_name, ec.relationship AS ec_relation, ec.phone_number AS ec_phone
                FROM STUDENT st
                JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id
                LEFT JOIN EMERGENCY_CONTACT ec ON ec.roll_number = st.roll_number
                WHERE 1=1
            """
            params = []
            if q and q.strip():
                term = f"%{q.strip()}%"
                clause = " AND (st.roll_number LIKE %s OR st.full_name LIKE %s OR ua.email LIKE %s)"
                sql_count += clause
                sql_data += clause
                params.extend([term, term, term])

            cur.execute(sql_count, tuple(params))
            total = cur.fetchone()["total"]

            sql_data += " ORDER BY st.roll_number ASC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cur.execute(sql_data, tuple(params))
            rows = cur.fetchall()

            # Active visits map
            placeholders = ",".join(["%s"] * len(ACTIVE_VISIT_STATES))
            cur.execute(
                f"""SELECT roll_number, visit_id, status FROM VISIT
                    WHERE status IN ({placeholders})""",
                tuple(ACTIVE_VISIT_STATES),
            )
            active_map = {r["roll_number"]: r for r in cur.fetchall()}
    finally:
        conn.close()

    students = []
    for r in rows:
        active = active_map.get(r["roll_number"])
        ec = None
        if r.get("ec_name"):
            ec = {
                "name": r["ec_name"],
                "relationship": r["ec_relation"],
                "phoneNumber": r["ec_phone"],
                "phone_number": r["ec_phone"],
            }

        students.append({
            "rollNumber": r["roll_number"],
            "roll_number": r["roll_number"],
            "rollNo": r["roll_number"],
            "name": r["full_name"],
            "full_name": r["full_name"],
            "email": r["email"],
            "bloodGroup": r.get("blood_group"),
            "blood_group": r.get("blood_group"),
            "blood": r.get("blood_group"),
            "phone": r.get("phone_number"),
            "phoneNumber": r.get("phone_number"),
            "status": r["status"],
            "program": "B.Tech",
            "dept": dept or "Computer Science",
            "semester": 6,
            "alreadyInQueue": active is not None,
            "activeVisitStatus": active["status"] if active else None,
            "emergencyContact": ec,
            "emergency_contact": ec,
            "emergencyPhone": r.get("ec_phone"),
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "students": students,
    }


@router.get("/students/{roll_number}/history")
@router.get("/students/{roll_number}/profile")
def get_student_history(
    roll_number: str,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Returns verified medical telemetry, active/past allergies, emergency contacts,
    and past visit history for a specific student.
    """
    roll_number = roll_number.strip()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Student Info
            cur.execute(
                """
                SELECT st.roll_number, st.full_name, st.date_of_birth, st.sex, st.phone_number,
                       st.blood_group, st.status, st.created_at,
                       ua.email
                FROM STUDENT st
                JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id
                WHERE st.roll_number = %s
                """,
                (roll_number,),
            )
            student = cur.fetchone()
            if not student:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Student '{roll_number}' not found.")

            # 2. Allergies
            cur.execute(
                """
                SELECT allergy_id, allergen, reaction, severity, recorded_at, ended_at
                FROM ALLERGY WHERE roll_number = %s
                ORDER BY recorded_at DESC
                """,
                (roll_number,),
            )
            allergies = cur.fetchall()

            # 3. Emergency Contact
            cur.execute(
                """
                SELECT emergency_contact_id, name, relationship, phone_number, updated_at
                FROM EMERGENCY_CONTACT WHERE roll_number = %s
                """,
                (roll_number,),
            )
            ec = cur.fetchone()

            # 4. Past Visits
            cur.execute(
                """
                SELECT v.visit_id, v.doctor_id, v.status AS visit_status,
                       v.checked_in_at, v.consultation_started_at, v.consultation_completed_at, v.completed_at,
                       ua.email AS doctor_email, sp.name AS specialty,
                       c.reason_for_visit, c.diagnosis, c.clinical_notes,
                       disp.status AS dispensing_status,
                       (SELECT COUNT(*) FROM PRESCRIPTION_ITEM pi
                        JOIN PRESCRIPTION p ON p.prescription_id = pi.prescription_id
                        WHERE p.consultation_id = c.consultation_id) AS medicines_count
                FROM VISIT v
                JOIN DOCTOR d ON d.doctor_id = v.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                LEFT JOIN CONSULTATION c ON c.visit_id = v.visit_id
                LEFT JOIN DISPENSING disp ON disp.visit_id = v.visit_id
                WHERE v.roll_number = %s
                ORDER BY v.checked_in_at DESC
                """,
                (roll_number,),
            )
            visits = cur.fetchall()
    finally:
        conn.close()

    formatted_visits = []
    for v in visits:
        doc_raw = display_name_from_email(v["doctor_email"])
        doc_name = doc_raw if doc_raw.startswith("Dr ") else f"Dr {doc_raw}"
        formatted_visits.append({
            "visitId": v["visit_id"],
            "visit_id": v["visit_id"],
            "doctorId": v["doctor_id"],
            "doctor_id": v["doctor_id"],
            "doctorName": doc_name,
            "doctor_name": doc_name,
            "specialty": v.get("specialty") or "General Physician",
            "status": v["visit_status"],
            "checkedInAt": v["checked_in_at"].isoformat() if v.get("checked_in_at") else None,
            "completedAt": v["completed_at"].isoformat() if v.get("completed_at") else None,
            "reasonForVisit": v.get("reason_for_visit"),
            "diagnosis": v.get("diagnosis"),
            "clinicalNotes": v.get("clinical_notes"),
            "dispensingStatus": v.get("dispensing_status"),
            "medicinesCount": v.get("medicines_count") or 0,
        })

    ec_data = None
    if ec:
        ec_data = {
            "name": ec["name"],
            "relationship": ec["relationship"],
            "phoneNumber": ec["phone_number"],
            "phone_number": ec["phone_number"],
            "updatedAt": ec["updated_at"].isoformat() if ec.get("updated_at") else None,
        }

    return {
        "rollNumber": student["roll_number"],
        "roll_number": student["roll_number"],
        "name": student["full_name"],
        "fullName": student["full_name"],
        "email": student["email"],
        "dateOfBirth": student["date_of_birth"].isoformat() if student.get("date_of_birth") else None,
        "sex": student.get("sex"),
        "phoneNumber": student.get("phone_number"),
        "bloodGroup": student.get("blood_group"),
        "blood": student.get("blood_group"),
        "status": student["status"],
        "program": "B.Tech",
        "dept": "Computer Science",
        "semester": 6,
        "allergies": [
            {
                "allergyId": a["allergy_id"],
                "allergen": a["allergen"],
                "reaction": a.get("reaction"),
                "severity": a["severity"],
                "recordedAt": a["recorded_at"].isoformat() if a.get("recorded_at") else None,
                "isActive": a.get("ended_at") is None,
            }
            for a in allergies
        ],
        "emergencyContact": ec_data,
        "emergency_contact": ec_data,
        "visits": formatted_visits,
        "pastVisitsCount": len(formatted_visits),
    }


# ── 7. Completed OPD Visits ─────────────────────────────────────────────
@router.get("/visits/completed")
@router.get("/completed")
def list_completed_visits(
    doctor_id: Optional[int] = Query(None, description="Optional doctor ID filter"),
    date: Optional[str] = Query(None, description="Date filter YYYY-MM-DD or 'ALL' (defaults to CURDATE())"),
    q: Optional[str] = Query(None, description="Search student name or roll number"),
    limit: int = Query(50, ge=1, le=200, description="Max results"),
    offset: int = Query(0, ge=0, description="Result offset"),
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Returns list of discharged / completed OPD visits with patient telemetry,
    consultation timestamps, and dispensing fulfillment records.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT v.visit_id, v.roll_number, v.doctor_id, v.status AS visit_status,
                       v.checked_in_at, v.consultation_started_at, v.consultation_completed_at, v.completed_at,
                       st.full_name AS student_name, st.blood_group,
                       ua.email AS doctor_email, sp.name AS specialty,
                       disp.dispensing_id, disp.status AS dispensing_status, disp.change_reason,
                       (SELECT ve.notes FROM VISIT_EVENT ve
                        WHERE ve.visit_id = v.visit_id AND ve.event_type = 'CHECKED_IN'
                        ORDER BY ve.event_id DESC LIMIT 1) AS checkin_notes
                FROM VISIT v
                JOIN STUDENT st ON st.roll_number = v.roll_number
                JOIN DOCTOR d ON d.doctor_id = v.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                LEFT JOIN DISPENSING disp ON disp.visit_id = v.visit_id
                WHERE v.status = 'COMPLETED'
            """
            params = []
            if doctor_id is not None:
                sql += " AND v.doctor_id = %s"
                params.append(doctor_id)

            if date and date.upper() != "ALL":
                sql += " AND DATE(v.completed_at) = %s"
                params.append(date)
            elif not date:
                # Default to today's completed visits
                sql += " AND (DATE(v.completed_at) = CURDATE() OR v.completed_at IS NULL)"

            if q and q.strip():
                term = f"%{q.strip()}%"
                sql += " AND (st.roll_number LIKE %s OR st.full_name LIKE %s)"
                params.extend([term, term])

            sql += " ORDER BY v.completed_at DESC, v.visit_id DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cur.execute(sql, tuple(params))
            rows = cur.fetchall()
    finally:
        conn.close()

    results = []
    for r in rows:
        raw_name = display_name_from_email(r["doctor_email"])
        doc_name = raw_name if raw_name.startswith("Dr ") else f"Dr {raw_name}"

        complaint = ""
        notes = r.get("checkin_notes")
        if notes and " - " in notes:
            complaint = notes.split(" - ", 1)[1].strip()
        elif notes:
            complaint = notes.strip()

        chk_iso = r["checked_in_at"].isoformat() if r.get("checked_in_at") else None
        comp_iso = r["completed_at"].isoformat() if r.get("completed_at") else None
        consult_comp_iso = r["consultation_completed_at"].isoformat() if r.get("consultation_completed_at") else None

        disp_status = r.get("dispensing_status") or "DISPENSED"
        if disp_status in ("FULL", "DISPENSED"):
            disp_status_display = "Dispensed as prescribed"
        elif disp_status in ("PARTIAL", "PARTIALLY_DISPENSED"):
            disp_status_display = "Partially dispensed"
        elif disp_status == "PENDING":
            disp_status_display = "Pending dispensing"
        else:
            disp_status_display = disp_status

        results.append({
            "id": r["visit_id"],
            "visitId": r["visit_id"],
            "visit_id": r["visit_id"],
            "rollNo": r["roll_number"],
            "rollNumber": r["roll_number"],
            "roll_number": r["roll_number"],
            "name": r["student_name"],
            "studentName": r["student_name"],
            "student_name": r["student_name"],
            "bloodGroup": r.get("blood_group"),
            "doctorId": r["doctor_id"],
            "doctor_id": r["doctor_id"],
            "doctorName": doc_name,
            "doctor_name": doc_name,
            "specialty": r.get("specialty") or "General Physician",
            "checkedIn": chk_iso,
            "checkedInAt": chk_iso,
            "checked_in_at": chk_iso,
            "consultationCompletedAt": consult_comp_iso,
            "dispensedAt": comp_iso,
            "completedAt": comp_iso,
            "completed_at": comp_iso,
            "dispensingStatus": disp_status_display,
            "dispensing_status": disp_status_display,
            "dispensing": {
                "type": disp_status_display,
                "status": disp_status,
                "changeReason": r.get("change_reason"),
            },
            "complaint": complaint,
        })

    return results


# ── 8. Activity / Audit History Feed ───────────────────────────────────
@router.get("/activity")
@router.get("/activity-log")
def list_activity_log(
    event_type: Optional[str] = Query(None, description="Optional filter by event_type"),
    date: Optional[str] = Query(None, description="Date filter YYYY-MM-DD or 'ALL' (defaults to CURDATE())"),
    limit: int = Query(50, ge=1, le=200, description="Max events to return"),
    offset: int = Query(0, ge=0, description="Event offset"),
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Returns audit event stream from VISIT_EVENT with human-readable event kinds,
    student names, timestamps, and performer identities.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT ve.event_id, ve.visit_id, ve.event_type, ve.performed_by_user_id,
                       ve.created_at, ve.notes,
                       v.roll_number,
                       st.full_name AS student_name,
                       ua.email AS performed_by_email
                FROM VISIT_EVENT ve
                JOIN VISIT v ON v.visit_id = ve.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                LEFT JOIN USER_ACCOUNT ua ON ua.user_id = ve.performed_by_user_id
                WHERE 1=1
            """
            params = []
            if event_type and event_type.strip():
                sql += " AND ve.event_type = %s"
                params.append(event_type.strip().upper())

            if date and date.upper() != "ALL":
                sql += " AND DATE(ve.created_at) = %s"
                params.append(date)
            elif not date:
                sql += " AND DATE(ve.created_at) = CURDATE()"

            sql += " ORDER BY ve.event_id DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cur.execute(sql, tuple(params))
            rows = cur.fetchall()
    finally:
        conn.close()

    EVENT_TITLES = {
        "CHECKED_IN": "STUDENT CHECK-IN",
        "QUEUED_JOINED_PATIENT": "QUEUE JOINED",
        "CALLED": "PATIENT CALLED",
        "NO_SHOW": "MARKED NO-SHOW",
        "REDIRECTED": "DOCTOR REDIRECT",
        "CONSULTATION_STARTED": "CONSULTATION STARTED",
        "CONSULTATION_COMPLETED": "CONSULTATION COMPLETED",
        "PRESCRIPTION_CREATED": "PRESCRIPTION FINALIZED",
        "WAITING_FOR_MEDICINE": "QUEUED FOR DISPENSING",
        "MEDICINE_DISPENSED": "MEDICINE DISPENSED",
        "COMPLETED": "VISIT COMPLETED",
        "CANCELLED": "VISIT CANCELLED",
    }

    results = []
    for r in rows:
        evt_type = r["event_type"]
        kind = EVENT_TITLES.get(evt_type, evt_type.replace("_", " ").title())
        t_iso = r["created_at"].isoformat() if r.get("created_at") else None

        st_name = r.get("student_name") or r["roll_number"]
        notes = r.get("notes") or ""
        text = f"{st_name} ({r['roll_number']}): {notes}" if notes else f"{st_name} ({r['roll_number']})"

        results.append({
            "event_id": r["event_id"],
            "eventId": r["event_id"],
            "visit_id": r["visit_id"],
            "visitId": r["visit_id"],
            "event_type": evt_type,
            "eventType": evt_type,
            "kind": kind,
            "text": text,
            "notes": notes,
            "student_name": r.get("student_name"),
            "studentName": r.get("student_name"),
            "roll_number": r["roll_number"],
            "rollNumber": r["roll_number"],
            "performed_by_email": r.get("performed_by_email"),
            "timestamp": t_iso,
            "t": t_iso,
        })

    return results


# ── 9. Supported Settings & Administrative Operations ──────────────────
class DoctorAvailabilityUpdateRequest(BaseModel):
    status: Literal["AVAILABLE", "UNAVAILABLE"]
    date: Optional[str] = None


class RFIDEnrollRequest(BaseModel):
    roll_number: str = Field(..., min_length=1, max_length=30)
    card_uid: str = Field(..., min_length=3, max_length=100)


class RFIDRevokeRequest(BaseModel):
    roll_number: Optional[str] = Field(default=None, max_length=30)
    card_uid: Optional[str] = Field(default=None, max_length=100)
    reason: Literal["LOST", "DEACTIVATED"] = "DEACTIVATED"


def normalize_card_uid(raw_uid: Optional[str]) -> str:
    """Normalizes RFID / Web NFC UID: removes delimiters, strips whitespace, converts to uppercase."""
    if not raw_uid:
        return ""
    return raw_uid.strip().replace(":", "").replace("-", "").replace(" ", "").upper()


@router.get("/settings")
@router.get("/terminal-info")
def get_terminal_settings(
    me: CurrentUser = Depends(get_current_staff),
):
    """
    Returns reception desk terminal information, operational parameters,
    and live clinical readiness telemetry.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS active_doctors
                FROM DOCTOR d
                JOIN STAFF s ON s.staff_id = d.staff_id AND s.status = 'ACTIVE'
                WHERE (SELECT da.status FROM DOCTOR_AVAILABILITY da
                       WHERE da.doctor_id = d.doctor_id AND da.availability_date = CURDATE() LIMIT 1) != 'UNAVAILABLE'
                """
            )
            active_docs = cur.fetchone()["active_doctors"]
    finally:
        conn.close()

    return {
        "deskStation": "Front Desk • Station 1",
        "station": "Front Desk • Station 1",
        "operationalHours": "09:00 AM - 05:00 PM",
        "connectedAccount": me.email,
        "connectedUserRole": me.role,
        "rfidScannerState": "Connected",
        "rfidScannerConnected": True,
        "emergencyHotline": "108 / +91-175-2393108",
        "activeDoctorsCount": active_docs,
        "facility": "Thapar Institute Health Centre",
        "campus": "Patiala Main Campus",
    }


@router.post("/doctors/{doctor_id}/availability")
def update_doctor_availability(
    doctor_id: int,
    payload: DoctorAvailabilityUpdateRequest,
    me: CurrentUser = Depends(get_current_staff),
):
    """
    Administrative control: Updates doctor availability on CURDATE() (or specified date).
    Used by receptionists to open/close doctor queues.
    """
    status_val = payload.status.upper()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (doctor_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Doctor #{doctor_id} not found.")

            target_date = payload.date if payload.date else None
            date_clause = "%s" if target_date else "CURDATE()"
            params = [doctor_id]
            if target_date:
                params.append(target_date)
            params.extend([status_val, me.user_id, status_val])

            cur.execute(
                f"""
                INSERT INTO DOCTOR_AVAILABILITY (doctor_id, availability_date, status, created_by_user_id)
                VALUES (%s, {date_clause}, %s, %s)
                ON DUPLICATE KEY UPDATE status = %s
                """,
                tuple(params),
            )
        conn.commit()
    finally:
        conn.close()

    return {
        "doctor_id": doctor_id,
        "doctorId": doctor_id,
        "status": status_val,
        "updated_by": me.email,
    }


@router.get("/rfid/lookup/{card_uid}")
def lookup_rfid_card(
    card_uid: str,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Administrative operation: Looks up student enrolled to an RFID card UID for rapid check-in.
    """
    raw_uid = card_uid.strip()
    norm_uid = normalize_card_uid(raw_uid)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT rc.rfid_card_id, rc.card_uid, rc.status AS card_status,
                       rc.issued_at, rc.deactivated_at,
                       st.roll_number, st.full_name, st.blood_group,
                       ua.email
                FROM RFID_CARD rc
                JOIN STUDENT st ON st.roll_number = rc.roll_number
                JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id
                WHERE (rc.card_uid = %s OR rc.card_uid = %s)
                LIMIT 1
                """,
                (norm_uid, raw_uid),
            )
            card = cur.fetchone()
            if not card:
                cur.execute(
                    "SELECT card_uid, status FROM RFID_CARD WHERE card_uid = %s OR card_uid = %s LIMIT 1",
                    (norm_uid, raw_uid),
                )
                inactive = cur.fetchone()
                if inactive:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Card '{norm_uid}' is marked as {inactive['status']} and is not active.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No student mapped to RFID card '{raw_uid}'.",
                )
            if card["card_status"] != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Card '{norm_uid}' is marked as {card['card_status']} and is not active.",
                )
    finally:
        conn.close()

    return {
        "rfidCardId": card["rfid_card_id"],
        "cardUid": card["card_uid"],
        "card_uid": card["card_uid"],
        "rollNumber": card["roll_number"],
        "roll_number": card["roll_number"],
        "name": card["full_name"],
        "studentName": card["full_name"],
        "bloodGroup": card.get("blood_group"),
        "email": card["email"],
        "status": card["card_status"],
        "issuedAt": card["issued_at"].isoformat() if hasattr(card["issued_at"], "isoformat") else str(card["issued_at"]),
    }


@router.get("/rfid/student/{roll_number}")
def get_student_rfid(
    roll_number: str,
    _: CurrentUser = Depends(get_current_staff),
):
    """
    Returns the student's active card and card assignment history.
    """
    roll = roll_number.strip()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT roll_number, full_name, blood_group FROM STUDENT WHERE roll_number = %s",
                (roll,),
            )
            st = cur.fetchone()
            if not st:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Student '{roll}' not found.")

            cur.execute(
                """
                SELECT rfid_card_id, card_uid, status, issued_at, deactivated_at, issued_by_user_id
                FROM RFID_CARD
                WHERE roll_number = %s
                ORDER BY issued_at DESC
                """,
                (roll,),
            )
            cards = cur.fetchall()
            active_card = next((c for c in cards if c["status"] == "ACTIVE"), None)
    finally:
        conn.close()

    return {
        "student": {
            "rollNumber": st["roll_number"],
            "name": st["full_name"],
            "bloodGroup": st.get("blood_group"),
        },
        "activeCard": (
            {
                "rfidCardId": active_card["rfid_card_id"],
                "cardUid": active_card["card_uid"],
                "status": active_card["status"],
                "issuedAt": active_card["issued_at"].isoformat() if hasattr(active_card["issued_at"], "isoformat") else str(active_card["issued_at"]),
            }
            if active_card
            else None
        ),
        "history": [
            {
                "rfidCardId": c["rfid_card_id"],
                "cardUid": c["card_uid"],
                "status": c["status"],
                "issuedAt": c["issued_at"].isoformat() if hasattr(c["issued_at"], "isoformat") else str(c["issued_at"]),
                "deactivatedAt": c["deactivated_at"].isoformat() if c["deactivated_at"] and hasattr(c["deactivated_at"], "isoformat") else (str(c["deactivated_at"]) if c["deactivated_at"] else None),
            }
            for c in cards
        ],
    }


@router.post("/rfid/enroll", status_code=status.HTTP_201_CREATED)
def enroll_rfid_card(
    payload: RFIDEnrollRequest,
    me: CurrentUser = Depends(get_current_staff),
):
    """
    Administrative operation: Enrolls or replaces an RFID card for a registered student.
    Enforces cross-student uniqueness, active replacement rules, and audit logging.
    """
    roll = payload.roll_number.strip()
    norm_uid = normalize_card_uid(payload.card_uid)
    if not norm_uid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Card UID cannot be empty.")

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT roll_number, full_name FROM STUDENT WHERE roll_number = %s", (roll,))
            st = cur.fetchone()
            if not st:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Student '{roll}' not found.")

            # Check if card_uid is already in RFID_CARD
            cur.execute(
                "SELECT rfid_card_id, roll_number, status FROM RFID_CARD WHERE card_uid = %s",
                (norm_uid,),
            )
            existing_card = cur.fetchone()

            if existing_card:
                if existing_card["status"] == "ACTIVE":
                    if existing_card["roll_number"] != roll:
                        cur.execute("SELECT full_name FROM STUDENT WHERE roll_number = %s", (existing_card["roll_number"],))
                        other = cur.fetchone()
                        other_name = other["full_name"] if other else existing_card["roll_number"]
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail=f"Card UID '{norm_uid}' is currently actively assigned to student {existing_card['roll_number']} ({other_name}). Please revoke or replace that card first.",
                        )
                    else:
                        return {
                            "rfid_card_id": existing_card["rfid_card_id"],
                            "rfidCardId": existing_card["rfid_card_id"],
                            "roll_number": roll,
                            "rollNumber": roll,
                            "card_uid": norm_uid,
                            "cardUid": norm_uid,
                            "student_name": st["full_name"],
                            "status": "ACTIVE",
                            "message": "Card is already actively assigned to this student.",
                        }

                # Reactivating/reassigning an inactive card row
                # 1. Retire any other active card for this student
                cur.execute(
                    """
                    UPDATE RFID_CARD
                    SET status = 'REPLACED', deactivated_at = NOW(), revoked_by_user_id = %s
                    WHERE roll_number = %s AND status = 'ACTIVE' AND rfid_card_id != %s
                    """,
                    (me.user_id, roll, existing_card["rfid_card_id"]),
                )
                # 2. Update existing card row to ACTIVE
                cur.execute(
                    """
                    UPDATE RFID_CARD
                    SET roll_number = %s, status = 'ACTIVE', issued_at = NOW(),
                        deactivated_at = NULL, issued_by_user_id = %s, revoked_by_user_id = NULL
                    WHERE rfid_card_id = %s
                    """,
                    (roll, me.user_id, existing_card["rfid_card_id"]),
                )
                card_id = existing_card["rfid_card_id"]
            else:
                # 1. Retire previous active card for student
                cur.execute(
                    """
                    UPDATE RFID_CARD
                    SET status = 'REPLACED', deactivated_at = NOW(), revoked_by_user_id = %s
                    WHERE roll_number = %s AND status = 'ACTIVE'
                    """,
                    (me.user_id, roll),
                )
                # 2. Insert new card
                cur.execute(
                    """
                    INSERT INTO RFID_CARD (roll_number, card_uid, status, issued_at, issued_by_user_id)
                    VALUES (%s, %s, 'ACTIVE', NOW(), %s)
                    """,
                    (roll, norm_uid, me.user_id),
                )
                card_id = cur.lastrowid

        conn.commit()
    finally:
        conn.close()

    return {
        "rfid_card_id": card_id,
        "rfidCardId": card_id,
        "roll_number": roll,
        "rollNumber": roll,
        "card_uid": norm_uid,
        "cardUid": norm_uid,
        "student_name": st["full_name"],
        "status": "ACTIVE",
    }


@router.post("/rfid/revoke")
def revoke_rfid_card(
    payload: RFIDRevokeRequest,
    me: CurrentUser = Depends(get_current_staff),
):
    """
    Administrative operation: Revokes/deactivates an RFID card for a student or card UID.
    Reason can be LOST or DEACTIVATED.
    """
    card_uid = normalize_card_uid(payload.card_uid) if payload.card_uid else None
    roll = payload.roll_number.strip() if payload.roll_number else None

    if not card_uid and not roll:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either card_uid or roll_number must be specified to revoke an RFID card.",
        )

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if card_uid:
                cur.execute(
                    "SELECT rfid_card_id, roll_number, card_uid, status FROM RFID_CARD WHERE card_uid = %s",
                    (card_uid,),
                )
            else:
                cur.execute(
                    "SELECT rfid_card_id, roll_number, card_uid, status FROM RFID_CARD WHERE roll_number = %s AND status = 'ACTIVE'",
                    (roll,),
                )
            card = cur.fetchone()
            if not card or card["status"] != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No active RFID card found to revoke for the given identifier.",
                )

            cur.execute(
                """
                UPDATE RFID_CARD
                SET status = %s, deactivated_at = NOW(), revoked_by_user_id = %s
                WHERE rfid_card_id = %s
                """,
                (payload.reason, me.user_id, card["rfid_card_id"]),
            )
        conn.commit()
    finally:
        conn.close()

    return {
        "success": True,
        "rfidCardId": card["rfid_card_id"],
        "rollNumber": card["roll_number"],
        "cardUid": card["card_uid"],
        "status": payload.reason,
        "message": f"RFID card '{card['card_uid']}' assigned to student '{card['roll_number']}' has been marked as {payload.reason}.",
    }


def _is_mysql(conn) -> bool:
    # local_db.SQLiteConnectionWrapper has no FOR UPDATE; real PyMySQL connections do.
    return not conn.__class__.__name__.startswith("SQLite")
