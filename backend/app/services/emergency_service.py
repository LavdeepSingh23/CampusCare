"""
Emergency and Ambulance Dispatch Service for CampusCare.

Handles:
1. Logging urgent trauma and emergency cases directly to EMERGENCY_LOG.
2. Managing on-campus and municipal ambulance dispatches via AMBULANCE_DISPATCH.
3. Accessing student emergency contacts via EMERGENCY_CONTACT.
4. Strict separation from routine OPD queues: emergencies bypass VISIT/QUEUE_ENTRY entirely.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

VALID_SEVERITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
VALID_AMBULANCE_STATUSES = ("REQUESTED", "DISPATCHED", "ARRIVED", "COMPLETED", "CANCELLED")


class EmergencyServiceError(Exception):
    """Base exception for emergency domain errors."""
    pass


class ResourceNotFoundError(EmergencyServiceError):
    """Raised when an emergency log, student, or dispatch cannot be found."""
    pass


class InvalidTransitionError(EmergencyServiceError):
    """Raised when an illegal ambulance dispatch status transition is attempted."""
    pass


def create_emergency_log(
    conn,
    roll_number: str,
    recorded_by_user_id: int,
    emergency_type: str,
    description: str,
    severity: str,
    action_taken: str,
    ambulance_required: bool = False,
    occurred_at: Optional[datetime] = None,
    called_at: Optional[datetime] = None,
    ambulance_details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Records an emergency or trauma case into EMERGENCY_LOG and optionally registers
    an AMBULANCE_DISPATCH record in one atomic transaction.
    Emergency cases bypass routine OPD queues completely.
    """
    severity_upper = severity.upper().strip()
    if severity_upper not in VALID_SEVERITIES:
        raise ValueError(f"Invalid severity '{severity}'. Must be one of: {', '.join(VALID_SEVERITIES)}")

    now_dt = datetime.now()
    occurred_dt = occurred_at or now_dt
    called_dt = called_at if called_at is not None else (occurred_dt if ambulance_required else None)

    with conn.cursor() as cur:
        # 1. Verify student exists
        cur.execute(
            "SELECT roll_number, full_name, blood_group FROM STUDENT WHERE roll_number = %s",
            (roll_number.strip(),),
        )
        student = cur.fetchone()
        if not student:
            raise ResourceNotFoundError(f"Student with roll number '{roll_number}' not found.")

        # 2. Insert emergency record
        cur.execute(
            """
            INSERT INTO EMERGENCY_LOG (
                roll_number,
                recorded_by_user_id,
                occurred_at,
                emergency_type,
                description,
                severity,
                action_taken,
                ambulance_required,
                called_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                roll_number.strip(),
                recorded_by_user_id,
                occurred_dt,
                emergency_type.strip(),
                description.strip(),
                severity_upper,
                action_taken.strip(),
                bool(ambulance_required),
                called_dt,
            ),
        )
        emergency_id = cur.lastrowid

        # 3. Create ambulance dispatch record if required
        ambulance_record = None
        if ambulance_required:
            details = ambulance_details or {}
            provider = details.get("ambulance_provider") or "Campus Health Center Ambulance Unit"
            contact = details.get("contact_number") or "+91-175-2393108"
            if contact:
                contact = contact[:20]
            vehicle = details.get("vehicle_number")
            if vehicle:
                vehicle = vehicle[:30]
            dest = details.get("destination") or "Rajindra Hospital, Patiala"

            cur.execute(
                """
                INSERT INTO AMBULANCE_DISPATCH (
                    emergency_id,
                    ambulance_provider,
                    contact_number,
                    vehicle_number,
                    called_at,
                    destination,
                    status
                ) VALUES (%s, %s, %s, %s, %s, %s, 'REQUESTED')
                """,
                (
                    emergency_id,
                    provider,
                    contact,
                    vehicle,
                    called_dt,
                    dest,
                ),
            )
            dispatch_id = cur.lastrowid
            ambulance_record = {
                "ambulance_dispatch_id": dispatch_id,
                "ambulanceDispatchId": dispatch_id,
                "emergency_id": emergency_id,
                "emergencyId": emergency_id,
                "ambulance_provider": provider,
                "ambulanceProvider": provider,
                "contact_number": contact,
                "contactNumber": contact,
                "vehicle_number": vehicle,
                "vehicleNumber": vehicle,
                "called_at": called_dt.isoformat() if called_dt else None,
                "calledAt": called_dt.isoformat() if called_dt else None,
                "arrived_at": None,
                "arrivedAt": None,
                "departure_at": None,
                "departureAt": None,
                "destination": dest,
                "status": "REQUESTED",
            }

        # 4. Fetch emergency contact for student if available
        cur.execute(
            """
            SELECT emergency_contact_id, roll_number, name, relationship, phone_number, updated_at
            FROM EMERGENCY_CONTACT
            WHERE roll_number = %s
            """,
            (roll_number.strip(),),
        )
        ec_row = cur.fetchone()
        emergency_contact = None
        if ec_row:
            emergency_contact = {
                "emergency_contact_id": ec_row["emergency_contact_id"],
                "emergencyContactId": ec_row["emergency_contact_id"],
                "roll_number": ec_row["roll_number"],
                "rollNumber": ec_row["roll_number"],
                "name": ec_row["name"],
                "relationship": ec_row["relationship"],
                "phone_number": ec_row["phone_number"],
                "phoneNumber": ec_row["phone_number"],
                "updated_at": ec_row["updated_at"].isoformat() if ec_row.get("updated_at") else None,
            }

    return {
        "emergency_id": emergency_id,
        "emergencyId": emergency_id,
        "roll_number": student["roll_number"],
        "rollNumber": student["roll_number"],
        "student_name": student["full_name"],
        "studentName": student["full_name"],
        "blood_group": student.get("blood_group"),
        "bloodGroup": student.get("blood_group"),
        "recorded_by_user_id": recorded_by_user_id,
        "recordedByUserId": recorded_by_user_id,
        "occurred_at": occurred_dt.isoformat() if occurred_dt else None,
        "occurredAt": occurred_dt.isoformat() if occurred_dt else None,
        "emergency_type": emergency_type.strip(),
        "emergencyType": emergency_type.strip(),
        "description": description.strip(),
        "severity": severity_upper,
        "action_taken": action_taken.strip(),
        "actionTaken": action_taken.strip(),
        "ambulance_required": bool(ambulance_required),
        "ambulanceRequired": bool(ambulance_required),
        "called_at": called_dt.isoformat() if called_dt else None,
        "calledAt": called_dt.isoformat() if called_dt else None,
        "created_at": now_dt.isoformat(),
        "createdAt": now_dt.isoformat(),
        "ambulance": ambulance_record,
        "emergency_contact": emergency_contact,
        "emergencyContact": emergency_contact,
    }


def list_emergency_logs(
    conn,
    severity: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Returns recent emergency cases ordered by occurrence time descending.
    Includes student info, recorder email, and ambulance dispatch status.
    """
    with conn.cursor() as cur:
        sql = """
            SELECT el.emergency_id, el.roll_number, el.recorded_by_user_id, el.occurred_at,
                   el.emergency_type, el.description, el.severity, el.action_taken,
                   el.ambulance_required, el.called_at, el.created_at,
                   st.full_name AS student_name, st.blood_group,
                   ua.email AS recorded_by_email,
                   ad.ambulance_dispatch_id, ad.ambulance_provider, ad.contact_number AS ambulance_contact,
                   ad.vehicle_number, ad.called_at AS dispatch_called_at, ad.arrived_at,
                   ad.departure_at, ad.destination, ad.status AS ambulance_status,
                   ec.name AS contact_name, ec.relationship AS contact_relationship, ec.phone_number AS contact_phone
            FROM EMERGENCY_LOG el
            JOIN STUDENT st ON st.roll_number = el.roll_number
            JOIN USER_ACCOUNT ua ON ua.user_id = el.recorded_by_user_id
            LEFT JOIN AMBULANCE_DISPATCH ad ON ad.emergency_id = el.emergency_id
            LEFT JOIN EMERGENCY_CONTACT ec ON ec.roll_number = el.roll_number
        """
        params = []
        if severity:
            sql += " WHERE el.severity = %s"
            params.append(severity.upper().strip())

        sql += " ORDER BY el.occurred_at DESC LIMIT %s"
        params.append(limit)

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

    results = []
    for r in rows:
        ambulance = None
        if r.get("ambulance_dispatch_id"):
            ambulance = {
                "ambulance_dispatch_id": r["ambulance_dispatch_id"],
                "ambulanceDispatchId": r["ambulance_dispatch_id"],
                "emergency_id": r["emergency_id"],
                "emergencyId": r["emergency_id"],
                "ambulance_provider": r["ambulance_provider"],
                "ambulanceProvider": r["ambulance_provider"],
                "contact_number": r["ambulance_contact"],
                "contactNumber": r["ambulance_contact"],
                "vehicle_number": r["vehicle_number"],
                "vehicleNumber": r["vehicle_number"],
                "called_at": r["dispatch_called_at"].isoformat() if r.get("dispatch_called_at") else None,
                "calledAt": r["dispatch_called_at"].isoformat() if r.get("dispatch_called_at") else None,
                "arrived_at": r["arrived_at"].isoformat() if r.get("arrived_at") else None,
                "arrivedAt": r["arrived_at"].isoformat() if r.get("arrived_at") else None,
                "departure_at": r["departure_at"].isoformat() if r.get("departure_at") else None,
                "departureAt": r["departure_at"].isoformat() if r.get("departure_at") else None,
                "destination": r["destination"],
                "status": r["ambulance_status"],
            }

        contact = None
        if r.get("contact_name"):
            contact = {
                "name": r["contact_name"],
                "relationship": r["contact_relationship"],
                "phone_number": r["contact_phone"],
                "phoneNumber": r["contact_phone"],
            }

        occ_iso = r["occurred_at"].isoformat() if r.get("occurred_at") else None
        called_iso = r["called_at"].isoformat() if r.get("called_at") else None
        created_iso = r["created_at"].isoformat() if r.get("created_at") else None

        results.append({
            "emergency_id": r["emergency_id"],
            "emergencyId": r["emergency_id"],
            "roll_number": r["roll_number"],
            "rollNumber": r["roll_number"],
            "student_name": r["student_name"],
            "studentName": r["student_name"],
            "blood_group": r.get("blood_group"),
            "bloodGroup": r.get("blood_group"),
            "recorded_by_user_id": r["recorded_by_user_id"],
            "recordedByUserId": r["recorded_by_user_id"],
            "recorded_by_email": r["recorded_by_email"],
            "recordedByEmail": r["recorded_by_email"],
            "occurred_at": occ_iso,
            "occurredAt": occ_iso,
            "emergency_type": r["emergency_type"],
            "emergencyType": r["emergency_type"],
            "description": r["description"],
            "severity": r["severity"],
            "action_taken": r["action_taken"],
            "actionTaken": r["action_taken"],
            "ambulance_required": bool(r["ambulance_required"]),
            "ambulanceRequired": bool(r["ambulance_required"]),
            "called_at": called_iso,
            "calledAt": called_iso,
            "created_at": created_iso,
            "createdAt": created_iso,
            "ambulance": ambulance,
            "emergency_contact": contact,
            "emergencyContact": contact,
        })

    return results


def get_emergency_log(conn, emergency_id: int) -> Dict[str, Any]:
    """Retrieves full detail of a specific emergency incident."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT el.emergency_id, el.roll_number, el.recorded_by_user_id, el.occurred_at,
                   el.emergency_type, el.description, el.severity, el.action_taken,
                   el.ambulance_required, el.called_at, el.created_at,
                   st.full_name AS student_name, st.blood_group,
                   ua.email AS recorded_by_email,
                   ad.ambulance_dispatch_id, ad.ambulance_provider, ad.contact_number AS ambulance_contact,
                   ad.vehicle_number, ad.called_at AS dispatch_called_at, ad.arrived_at,
                   ad.departure_at, ad.destination, ad.status AS ambulance_status,
                   ec.name AS contact_name, ec.relationship AS contact_relationship, ec.phone_number AS contact_phone
            FROM EMERGENCY_LOG el
            JOIN STUDENT st ON st.roll_number = el.roll_number
            JOIN USER_ACCOUNT ua ON ua.user_id = el.recorded_by_user_id
            LEFT JOIN AMBULANCE_DISPATCH ad ON ad.emergency_id = el.emergency_id
            LEFT JOIN EMERGENCY_CONTACT ec ON ec.roll_number = el.roll_number
            WHERE el.emergency_id = %s
            """,
            (emergency_id,),
        )
        r = cur.fetchone()
        if not r:
            raise ResourceNotFoundError(f"Emergency incident #{emergency_id} not found.")

    ambulance = None
    if r.get("ambulance_dispatch_id"):
        ambulance = {
            "ambulance_dispatch_id": r["ambulance_dispatch_id"],
            "ambulanceDispatchId": r["ambulance_dispatch_id"],
            "emergency_id": r["emergency_id"],
            "emergencyId": r["emergency_id"],
            "ambulance_provider": r["ambulance_provider"],
            "ambulanceProvider": r["ambulance_provider"],
            "contact_number": r["ambulance_contact"],
            "contactNumber": r["ambulance_contact"],
            "vehicle_number": r["vehicle_number"],
            "vehicleNumber": r["vehicle_number"],
            "called_at": r["dispatch_called_at"].isoformat() if r.get("dispatch_called_at") else None,
            "calledAt": r["dispatch_called_at"].isoformat() if r.get("dispatch_called_at") else None,
            "arrived_at": r["arrived_at"].isoformat() if r.get("arrived_at") else None,
            "arrivedAt": r["arrived_at"].isoformat() if r.get("arrived_at") else None,
            "departure_at": r["departure_at"].isoformat() if r.get("departure_at") else None,
            "departureAt": r["departure_at"].isoformat() if r.get("departure_at") else None,
            "destination": r["destination"],
            "status": r["ambulance_status"],
        }

    contact = None
    if r.get("contact_name"):
        contact = {
            "name": r["contact_name"],
            "relationship": r["contact_relationship"],
            "phone_number": r["contact_phone"],
            "phoneNumber": r["contact_phone"],
        }

    occ_iso = r["occurred_at"].isoformat() if r.get("occurred_at") else None
    called_iso = r["called_at"].isoformat() if r.get("called_at") else None
    created_iso = r["created_at"].isoformat() if r.get("created_at") else None

    return {
        "emergency_id": r["emergency_id"],
        "emergencyId": r["emergency_id"],
        "roll_number": r["roll_number"],
        "rollNumber": r["roll_number"],
        "student_name": r["student_name"],
        "studentName": r["student_name"],
        "blood_group": r.get("blood_group"),
        "bloodGroup": r.get("blood_group"),
        "recorded_by_user_id": r["recorded_by_user_id"],
        "recordedByUserId": r["recorded_by_user_id"],
        "recorded_by_email": r["recorded_by_email"],
        "recordedByEmail": r["recorded_by_email"],
        "occurred_at": occ_iso,
        "occurredAt": occ_iso,
        "emergency_type": r["emergency_type"],
        "emergencyType": r["emergency_type"],
        "description": r["description"],
        "severity": r["severity"],
        "action_taken": r["action_taken"],
        "actionTaken": r["action_taken"],
        "ambulance_required": bool(r["ambulance_required"]),
        "ambulanceRequired": bool(r["ambulance_required"]),
        "called_at": called_iso,
        "calledAt": called_iso,
        "created_at": created_iso,
        "createdAt": created_iso,
        "ambulance": ambulance,
        "emergency_contact": contact,
        "emergencyContact": contact,
    }


def update_ambulance_dispatch(
    conn,
    emergency_id: int,
    update_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Updates the ambulance dispatch record for an emergency case.
    Validates state transitions (REQUESTED -> DISPATCHED -> ARRIVED -> COMPLETED, or CANCELLED)
    and populates lifecycle timestamps automatically.
    """
    with conn.cursor() as cur:
        # Check emergency exists
        cur.execute(
            "SELECT emergency_id, ambulance_required FROM EMERGENCY_LOG WHERE emergency_id = %s",
            (emergency_id,),
        )
        el = cur.fetchone()
        if not el:
            raise ResourceNotFoundError(f"Emergency case #{emergency_id} not found.")

        # Check existing ambulance dispatch
        cur.execute(
            """
            SELECT ambulance_dispatch_id, emergency_id, ambulance_provider, contact_number,
                   vehicle_number, called_at, arrived_at, departure_at, destination, status
            FROM AMBULANCE_DISPATCH
            WHERE emergency_id = %s
            """,
            (emergency_id,),
        )
        existing = cur.fetchone()

        now_dt = datetime.now()

        # If no dispatch row exists yet, create one
        if not existing:
            dest = update_data.get("destination") or "Rajindra Hospital, Patiala"
            status = (update_data.get("status") or "REQUESTED").upper()
            if status not in VALID_AMBULANCE_STATUSES:
                raise ValueError(f"Invalid ambulance status: {status}")

            c_num = update_data.get("contact_number") or "+91-175-2393108"
            if c_num:
                c_num = c_num[:20]
            v_num = update_data.get("vehicle_number")
            if v_num:
                v_num = v_num[:30]

            cur.execute(
                """
                INSERT INTO AMBULANCE_DISPATCH (
                    emergency_id,
                    ambulance_provider,
                    contact_number,
                    vehicle_number,
                    called_at,
                    destination,
                    status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    emergency_id,
                    update_data.get("ambulance_provider") or "Campus Health Center Ambulance Unit",
                    c_num,
                    v_num,
                    update_data.get("called_at") or now_dt,
                    dest,
                    status,
                ),
            )
            # Ensure EMERGENCY_LOG reflects ambulance_required = TRUE
            cur.execute(
                "UPDATE EMERGENCY_LOG SET ambulance_required = TRUE WHERE emergency_id = %s",
                (emergency_id,),
            )
            dispatch_id = cur.lastrowid
        else:
            dispatch_id = existing["ambulance_dispatch_id"]
            current_status = existing["status"]
            new_status = (update_data.get("status") or current_status).upper()

            if new_status not in VALID_AMBULANCE_STATUSES:
                raise ValueError(f"Invalid ambulance status: {new_status}")

            # State transition rules:
            # - Terminal states (COMPLETED, CANCELLED) cannot be reopened
            # - CANCELLED is allowed from REQUESTED, DISPATCHED, ARRIVED
            # - Forward progression: REQUESTED -> DISPATCHED -> ARRIVED -> COMPLETED
            # - Idempotent updates (same status) are permitted
            status_order = {"REQUESTED": 0, "DISPATCHED": 1, "ARRIVED": 2, "COMPLETED": 3, "CANCELLED": 4}
            if current_status in ("COMPLETED", "CANCELLED") and new_status != current_status:
                raise InvalidTransitionError(
                    f"Ambulance dispatch is already {current_status} and cannot transition to {new_status}."
                )

            if new_status != "CANCELLED" and current_status != new_status:
                if status_order.get(new_status, 0) < status_order.get(current_status, 0):
                    raise InvalidTransitionError(
                        f"Cannot transition ambulance dispatch backward from {current_status} to {new_status}."
                    )

            # Auto-populate timestamps if not explicitly supplied
            called_at = update_data.get("called_at") or existing["called_at"]
            arrived_at = update_data.get("arrived_at") or existing["arrived_at"]
            departure_at = update_data.get("departure_at") or existing["departure_at"]

            if new_status == "DISPATCHED" and not called_at:
                called_at = now_dt
            elif new_status == "ARRIVED" and not arrived_at:
                arrived_at = now_dt
            elif new_status == "COMPLETED" and not departure_at:
                departure_at = now_dt

            cur.execute(
                """
                UPDATE AMBULANCE_DISPATCH
                SET status = %s,
                    ambulance_provider = COALESCE(%s, ambulance_provider),
                    contact_number = COALESCE(%s, contact_number),
                    vehicle_number = COALESCE(%s, vehicle_number),
                    called_at = COALESCE(%s, called_at),
                    arrived_at = COALESCE(%s, arrived_at),
                    departure_at = COALESCE(%s, departure_at),
                    destination = COALESCE(%s, destination)
                WHERE ambulance_dispatch_id = %s
                """,
                (
                    new_status,
                    update_data.get("ambulance_provider"),
                    update_data.get("contact_number"),
                    update_data.get("vehicle_number"),
                    called_at,
                    arrived_at,
                    departure_at,
                    update_data.get("destination"),
                    dispatch_id,
                ),
            )

        # Re-fetch updated row
        cur.execute(
            """
            SELECT ambulance_dispatch_id, emergency_id, ambulance_provider, contact_number,
                   vehicle_number, called_at, arrived_at, departure_at, destination, status
            FROM AMBULANCE_DISPATCH
            WHERE ambulance_dispatch_id = %s
            """,
            (dispatch_id,),
        )
        updated = cur.fetchone()

    return {
        "ambulance_dispatch_id": updated["ambulance_dispatch_id"],
        "ambulanceDispatchId": updated["ambulance_dispatch_id"],
        "emergency_id": updated["emergency_id"],
        "emergencyId": updated["emergency_id"],
        "ambulance_provider": updated["ambulance_provider"],
        "ambulanceProvider": updated["ambulance_provider"],
        "contact_number": updated["contact_number"],
        "contactNumber": updated["contact_number"],
        "vehicle_number": updated["vehicle_number"],
        "vehicleNumber": updated["vehicle_number"],
        "called_at": updated["called_at"].isoformat() if updated.get("called_at") else None,
        "calledAt": updated["called_at"].isoformat() if updated.get("called_at") else None,
        "arrived_at": updated["arrived_at"].isoformat() if updated.get("arrived_at") else None,
        "arrivedAt": updated["arrived_at"].isoformat() if updated.get("arrived_at") else None,
        "departure_at": updated["departure_at"].isoformat() if updated.get("departure_at") else None,
        "departureAt": updated["departure_at"].isoformat() if updated.get("departure_at") else None,
        "destination": updated["destination"],
        "status": updated["status"],
    }


def get_student_emergency_contact(conn, roll_number: str) -> Optional[Dict[str, Any]]:
    """Retrieves registered emergency contact for a student."""
    with conn.cursor() as cur:
        # Check student exists
        cur.execute("SELECT roll_number, full_name FROM STUDENT WHERE roll_number = %s", (roll_number.strip(),))
        st = cur.fetchone()
        if not st:
            raise ResourceNotFoundError(f"Student '{roll_number}' not found.")

        cur.execute(
            """
            SELECT emergency_contact_id, roll_number, name, relationship, phone_number, updated_at
            FROM EMERGENCY_CONTACT
            WHERE roll_number = %s
            """,
            (roll_number.strip(),),
        )
        ec = cur.fetchone()
        if not ec:
            return None

    return {
        "emergency_contact_id": ec["emergency_contact_id"],
        "emergencyContactId": ec["emergency_contact_id"],
        "roll_number": ec["roll_number"],
        "rollNumber": ec["roll_number"],
        "name": ec["name"],
        "relationship": ec["relationship"],
        "phone_number": ec["phone_number"],
        "phoneNumber": ec["phone_number"],
        "updated_at": ec["updated_at"].isoformat() if ec.get("updated_at") else None,
    }


def upsert_student_emergency_contact(
    conn,
    roll_number: str,
    name: str,
    relationship: str,
    phone_number: str,
) -> Dict[str, Any]:
    """Inserts or updates registered emergency contact details for a student."""
    with conn.cursor() as cur:
        # Check student exists
        cur.execute("SELECT roll_number, full_name FROM STUDENT WHERE roll_number = %s", (roll_number.strip(),))
        st = cur.fetchone()
        if not st:
            raise ResourceNotFoundError(f"Student '{roll_number}' not found.")

        cur.execute(
            """
            INSERT INTO EMERGENCY_CONTACT (roll_number, name, relationship, phone_number)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                relationship = VALUES(relationship),
                phone_number = VALUES(phone_number),
                updated_at = NOW()
            """,
            (roll_number.strip(), name.strip(), relationship.strip(), phone_number.strip()),
        )

        cur.execute(
            """
            SELECT emergency_contact_id, roll_number, name, relationship, phone_number, updated_at
            FROM EMERGENCY_CONTACT
            WHERE roll_number = %s
            """,
            (roll_number.strip(),),
        )
        ec = cur.fetchone()

    return {
        "emergency_contact_id": ec["emergency_contact_id"],
        "emergencyContactId": ec["emergency_contact_id"],
        "roll_number": ec["roll_number"],
        "rollNumber": ec["roll_number"],
        "name": ec["name"],
        "relationship": ec["relationship"],
        "phone_number": ec["phone_number"],
        "phoneNumber": ec["phone_number"],
        "updated_at": ec["updated_at"].isoformat() if ec.get("updated_at") else None,
    }
