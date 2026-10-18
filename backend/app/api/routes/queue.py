import logging
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db_connection
from app.core.deps import (
    CurrentDoctor,
    CurrentReceptionist,
    CurrentUser,
    get_current_doctor,
    get_current_receptionist,
    get_current_staff,
)
from app.services import queue_lifecycle as ql

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/queue", tags=["queue"])


# ── Schemas ─────────────────────────────────────────────────────────────

class CheckInRequest(BaseModel):
    roll_number: str = Field(..., description="Student roll number")
    doctor_id: int = Field(..., description="Target doctor ID")
    complaint: Optional[str] = Field("General Consultation", description="Chief complaint / reason for visit")
    via: str = "MANUAL"


class DispenseRequest(BaseModel):
    remarks: Optional[str] = Field(None, description="Dispensing notes or pharmacy remarks")


class ActionReasonRequest(BaseModel):
    reason: Optional[str] = Field(None, description="Reason for cancellation or no-show")


class RequeueRequest(BaseModel):
    target_doctor_id: int = Field(..., description="Doctor ID to assign for the requeue")
    reason: Optional[str] = Field("Patient arrived after no-show", description="Requeue reason")


class RedirectRequest(BaseModel):
    target_doctor_id: int = Field(..., description="Doctor ID to redirect to")
    reason: Optional[str] = Field("Triage referral", description="Redirection reason")


# ── Receptionist-Only Endpoints ─────────────────────────────────────────

@router.post("/checkin")
def check_in_student(
    payload: CheckInRequest,
    receptionist: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist-only operation: Checks a student into the clinic OPD queue.
    Rejects doctors and students with 403 Forbidden.
    Identity recorded in audit events comes strictly from the validated receptionist token.
    """
    max_retries = 3
    for attempt in range(max_retries):
        connection = get_db_connection()
        try:
            result = ql.check_in_student(
                conn=connection,
                roll_number=payload.roll_number,
                doctor_id=payload.doctor_id,
                performed_by_user_id=receptionist.user_id,
                complaint=payload.complaint,
                via=payload.via,
            )
            connection.commit()
            return result
        except ql.ResourceNotFoundError as exc:
            connection.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
        except ql.ActiveVisitConflictError as exc:
            connection.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
        except ql.DoctorUnavailableError as exc:
            connection.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
        except ql.InvalidTransitionError as exc:
            connection.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
        except Exception as exc:
            connection.rollback()
            # If MySQL deadlock (code 1213), retry transparently
            is_deadlock = hasattr(exc, "args") and len(exc.args) > 0 and exc.args[0] == 1213
            if is_deadlock and attempt < max_retries - 1:
                import time
                time.sleep(0.05 * (attempt + 1))
                continue
            logger.error("Queue checkin transaction failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to check in student to queue: {exc}",
            )
        finally:
            connection.close()


@router.post("/{visit_id}/dispense")
def dispense_medicine(
    visit_id: int,
    payload: Optional[DispenseRequest] = None,
    receptionist: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist-only operation: Confirms medication dispensing and finalizes the student visit.
    Rejects doctors and students with 403 Forbidden.
    """
    connection = get_db_connection()
    try:
        remarks = payload.remarks if payload and payload.remarks else "Medicines dispensed at front desk"
        result = ql.dispense_medication(
            conn=connection,
            visit_id=visit_id,
            performed_by_user_id=receptionist.user_id,
            remarks=remarks,
        )
        connection.commit()
        return result
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        logger.error("Dispense transaction failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record dispensing for visit #{visit_id}: {exc}",
        )
    finally:
        connection.close()


@router.post("/{visit_id}/requeue")
def requeue_visit(
    visit_id: int,
    payload: RequeueRequest,
    receptionist: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Receptionist-only operation: Requeues a NO_SHOW visit into an active doctor queue.
    """
    connection = get_db_connection()
    try:
        result = ql.requeue_patient(
            conn=connection,
            visit_id=visit_id,
            target_doctor_id=payload.target_doctor_id,
            performed_by_user_id=receptionist.user_id,
            reason=payload.reason or "Patient arrived after no-show",
        )
        connection.commit()
        return result
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (ql.InvalidTransitionError, ql.DoctorUnavailableError, ql.ActiveVisitConflictError) as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        logger.error("Requeue transaction failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to requeue visit: {exc}")
    finally:
        connection.close()


# ── Staff-Only Endpoints (Doctors & Receptionists) ──────────────────────

@router.post("/{visit_id}/redirect")
def redirect_visit(
    visit_id: int,
    payload: RedirectRequest,
    staff: CurrentUser = Depends(get_current_staff),
):
    """
    Staff operation: Redirects an active visit to another doctor's line.
    If caller is a DOCTOR, verifies the visit belongs to their clinic.
    """
    connection = get_db_connection()
    try:
        curr_doc = staff.doctor_id if staff.role == "DOCTOR" else None
        result = ql.redirect_patient(
            conn=connection,
            visit_id=visit_id,
            target_doctor_id=payload.target_doctor_id,
            performed_by_user_id=staff.user_id,
            current_doctor_id=curr_doc,
            reason=payload.reason or "Clinical referral",
        )
        connection.commit()
        return result
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (ql.InvalidTransitionError, ql.DoctorUnavailableError) as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        logger.error("Redirect transaction failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to redirect visit: {exc}")
    finally:
        connection.close()


@router.post("/{visit_id}/no-show")
def mark_no_show_queue(
    visit_id: int,
    payload: Optional[ActionReasonRequest] = None,
    staff: CurrentUser = Depends(get_current_staff),
):
    """
    Staff operation: Marks an active or waiting visit as NO_SHOW.
    If caller is a DOCTOR, verifies the visit is assigned to their clinic.
    """
    connection = get_db_connection()
    try:
        doc_id = staff.doctor_id if staff.role == "DOCTOR" else None
        reason = payload.reason if payload and payload.reason else "Patient did not report when called"
        result = ql.mark_no_show(
            conn=connection,
            visit_id=visit_id,
            doctor_id=doc_id,
            performed_by_user_id=staff.user_id,
            reason=reason,
        )
        connection.commit()
        return result
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        logger.error("No-show transaction failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to mark no-show: {exc}")
    finally:
        connection.close()


@router.post("/{visit_id}/start-consultation")
def start_consultation_queue(
    visit_id: int,
    current: CurrentDoctor = Depends(get_current_doctor),
):
    """
    Doctor workstation operation: Explicitly starts consultation for a specific visit assigned to this doctor.
    """
    connection = get_db_connection()
    try:
        result = ql.start_consultation(
            conn=connection,
            doctor_id=current.doctor_id,
            visit_id=visit_id,
            performed_by_user_id=current.user_id,
        )
        connection.commit()
        return result
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        logger.error("Start consultation transaction failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start consultation: {exc}")
    finally:
        connection.close()


@router.post("/{visit_id}/cancel")
def cancel_visit(
    visit_id: int,
    payload: Optional[ActionReasonRequest] = None,
    staff: CurrentUser = Depends(get_current_staff),
):
    """
    Staff operation: Cancels an active or waiting visit.
    """
    connection = get_db_connection()
    try:
        reason = payload.reason if payload and payload.reason else "Cancelled by front desk"
        result = ql.cancel_visit(
            conn=connection,
            visit_id=visit_id,
            performed_by_user_id=staff.user_id,
            cancel_reason=reason,
        )
        connection.commit()
        return result
    except ql.ResourceNotFoundError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ql.InvalidTransitionError as exc:
        connection.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        connection.rollback()
        logger.error("Cancel transaction failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to cancel visit: {exc}")
    finally:
        connection.close()


@router.get("/live")
def get_live_queue(
    staff: CurrentUser = Depends(get_current_staff),
):
    """
    Staff-only endpoint: Returns live OPD queue status across all active doctors.
    Rejects students with 403 Forbidden.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    qe.queue_entry_id,
                    qe.queue_sequence,
                    qe.status AS queue_status,
                    qe.entered_at,
                    qe.called_at,
                    v.visit_id,
                    v.roll_number,
                    st.full_name,
                    st.blood_group,
                    d.doctor_id,
                    sp.name AS specialty_name,
                    ua.email AS doctor_email
                FROM QUEUE_ENTRY qe
                JOIN VISIT v ON v.visit_id = qe.visit_id
                JOIN STUDENT st ON st.roll_number = v.roll_number
                JOIN DOCTOR d ON d.doctor_id = qe.doctor_id
                JOIN STAFF s ON s.staff_id = d.staff_id
                JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                LEFT JOIN SPECIALTY sp ON sp.specialty_id = d.specialty_id
                WHERE qe.status IN ('WAITING', 'IN_CONSULTATION')
                ORDER BY qe.doctor_id, qe.queue_sequence ASC
                """
            )
            rows = cursor.fetchall()

            return [
                {
                    "queueEntryId": r["queue_entry_id"],
                    "sequence": r["queue_sequence"],
                    "status": r["queue_status"],
                    "enteredAt": str(r["entered_at"]) if r["entered_at"] else None,
                    "calledAt": str(r["called_at"]) if r["called_at"] else None,
                    "visitId": r["visit_id"],
                    "rollNumber": r["roll_number"],
                    "patientName": r["full_name"],
                    "bloodGroup": r["blood_group"],
                    "doctorId": r["doctor_id"],
                    "doctorSpecialty": r["specialty_name"] or "General",
                    "doctorEmail": r["doctor_email"],
                }
                for r in rows
            ]
    finally:
        connection.close()
