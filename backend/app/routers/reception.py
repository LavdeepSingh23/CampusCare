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
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.database import get_db_connection
from app.core.deps import CurrentReceptionist, get_current_receptionist
from app.core.util import display_name_from_email

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
    roll_number: str = Field(min_length=1, max_length=30)
    doctor_id: int
    complaint: Optional[str] = Field(default=None, max_length=300)
    via: str = "MANUAL"  # "RFID" when card tap is active


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
@router.post("/checkin", status_code=201)
def check_in(body: CheckInRequest, me: CurrentReceptionist = Depends(get_current_receptionist)):
    roll_number = body.roll_number.strip()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Lock student row so two simultaneous check-ins serialize.
            cur.execute(
                "SELECT roll_number, full_name, status FROM STUDENT WHERE roll_number = %s FOR UPDATE"
                if _is_mysql(conn)
                else "SELECT roll_number, full_name, status FROM STUDENT WHERE roll_number = %s",
                (roll_number,),
            )
            st = cur.fetchone()
            if not st:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Record not found")
            if st.get("status") == "INACTIVE":
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Student record is inactive")

            if _active_visit(cur, roll_number):
                raise HTTPException(status.HTTP_409_CONFLICT, "Student is already in the queue")

            cur.execute("SELECT doctor_id FROM DOCTOR WHERE doctor_id = %s", (body.doctor_id,))
            if not cur.fetchone():
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor not found")
            cur.execute(
                """SELECT status FROM DOCTOR_AVAILABILITY
                   WHERE doctor_id = %s AND availability_date = CURDATE() LIMIT 1""",
                (body.doctor_id,),
            )
            av = cur.fetchone()
            if av and av["status"] == "UNAVAILABLE":
                raise HTTPException(status.HTTP_409_CONFLICT, "Doctor is not available today")

            cur.execute(
                "INSERT INTO VISIT (roll_number, doctor_id, status) VALUES (%s, %s, 'WAITING_FOR_DOCTOR')",
                (roll_number, body.doctor_id),
            )
            visit_id = cur.lastrowid

            # Next sequence number for this doctor today.
            cur.execute(
                """SELECT COALESCE(MAX(queue_sequence), 0) + 1 AS nxt FROM QUEUE_ENTRY
                   WHERE doctor_id = %s AND DATE(entered_at) = CURDATE()""",
                (body.doctor_id,),
            )
            seq_row = cur.fetchone()
            seq = seq_row["nxt"] if seq_row else 1

            cur.execute(
                """INSERT INTO QUEUE_ENTRY
                     (visit_id, doctor_id, queue_sequence, status, queue_data, entry_reason)
                   VALUES (%s, %s, %s, 'WAITING', NOW(), 'INITIAL_CHECKIN')""",
                (visit_id, body.doctor_id, seq),
            )

            note = f"{body.via} check-in" + (f" - {body.complaint}" if body.complaint else "")
            cur.execute(
                """INSERT INTO VISIT_EVENT (visit_id, event_type, performed_by_user_id, notes)
                   VALUES (%s, 'CHECKED_IN', %s, %s)""",
                (visit_id, me.user_id, note[:500]),
            )

            cur.execute(
                "SELECT COUNT(*) AS n FROM QUEUE_ENTRY WHERE doctor_id = %s AND status = 'WAITING'",
                (body.doctor_id,),
            )
            position = cur.fetchone()["n"]
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        logger.error("Reception check-in transaction error for roll %s: %s", roll_number, exc, exc_info=True)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not complete check-in: {exc}",
        )
    finally:
        conn.close()

    return {
        "visitId": visit_id,
        "queueNo": seq,
        "position": position,
        "doctorId": body.doctor_id,
        "name": st["full_name"],
        "status": "WAITING",
    }


# ── 4. live queue for the front-desk screen (poll every few seconds) ───
@router.get("/queue")
def front_desk_queue(_: CurrentReceptionist = Depends(get_current_receptionist)):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT qe.queue_entry_id, qe.doctor_id, qe.queue_sequence, qe.entered_at,
                       v.visit_id, v.roll_number, st.full_name
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                WHERE qe.status = 'WAITING'
                ORDER BY qe.doctor_id, qe.queue_sequence
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return [
        {
            "queueEntryId": r["queue_entry_id"],
            "visitId": r["visit_id"],
            "doctorId": r["doctor_id"],
            "queueNo": r["queue_sequence"],
            "rollNumber": r["roll_number"],
            "name": r["full_name"],
            "waitingSince": r["entered_at"].strftime("%I:%M %p") if r["entered_at"] else None,
        }
        for r in rows
    ]


def _is_mysql(conn) -> bool:
    # local_db.SQLiteConnectionWrapper has no FOR UPDATE; real PyMySQL connections do.
    return not conn.__class__.__name__.startswith("SQLite")
