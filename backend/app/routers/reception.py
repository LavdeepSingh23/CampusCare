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
from app.core.deps import CurrentReceptionist, get_current_receptionist
from app.core.util import display_name_from_email
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
            conn.rollback()
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


def _is_mysql(conn) -> bool:
    # local_db.SQLiteConnectionWrapper has no FOR UPDATE; real PyMySQL connections do.
    return not conn.__class__.__name__.startswith("SQLite")
