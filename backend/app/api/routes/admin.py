import logging
import os
from datetime import date, datetime, timedelta
from typing import Optional
import zoneinfo
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from app.core.security import decode_access_token
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field

from app.core.database import get_db_connection
from app.core.deps import CurrentAdmin, get_current_admin
from app.services.analytics_aggregator import KOLKATA_TZ, aggregate_daily_analytics
from app.services.daily_scheduler import REPORTS_DIR, run_daily_analytics_pipeline
from app.services.pdf_report_generator import generate_analytics_html, render_html_to_pdf


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


class AddFacultyDirectoryRequest(BaseModel):
    institutional_email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=150)
    department: str = Field(..., min_length=2, max_length=100)
    designation: Optional[str] = Field("Faculty Member", max_length=100)
    is_active: bool = True


class UpdateFacultyDirectoryRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    department: Optional[str] = Field(None, min_length=2, max_length=100)
    designation: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/faculty-directory")
def list_faculty_directory(current: CurrentAdmin = Depends(get_current_admin)):
    """
    Lists all approved faculty entries from the admin-maintained directory.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT faculty_dir_id, institutional_email, full_name, department, designation,
                       is_active, account_created, created_at, updated_at
                FROM FACULTY_DIRECTORY
                ORDER BY full_name ASC
                """
            )
            rows = cursor.fetchall()
            return {
                "status": "success",
                "count": len(rows),
                "data": rows,
            }
    finally:
        connection.close()


@router.post("/faculty-directory", status_code=status.HTTP_201_CREATED)
def add_faculty_directory_entry(
    payload: AddFacultyDirectoryRequest,
    current: CurrentAdmin = Depends(get_current_admin),
):
    """
    Adds a new approved institutional faculty email to the directory.
    Prevents duplicates.
    """
    clean_email = payload.institutional_email.strip().lower()
    if not clean_email.endswith("@thapar.edu"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Faculty directory entries must use the institutional @thapar.edu domain.",
        )

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT faculty_dir_id FROM FACULTY_DIRECTORY WHERE institutional_email = %s",
                (clean_email,),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Faculty directory entry for '{clean_email}' already exists.",
                )

            cursor.execute(
                """
                INSERT INTO FACULTY_DIRECTORY (institutional_email, full_name, department, designation, is_active)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (clean_email, payload.full_name.strip(), payload.department.strip(), payload.designation, payload.is_active),
            )
            entry_id = cursor.lastrowid
            connection.commit()

            return {
                "status": "success",
                "message": "Faculty member successfully added to approved directory.",
                "data": {
                    "faculty_dir_id": entry_id,
                    "institutional_email": clean_email,
                    "full_name": payload.full_name.strip(),
                    "department": payload.department.strip(),
                    "designation": payload.designation,
                    "is_active": payload.is_active,
                },
            }
    finally:
        connection.close()


@router.patch("/faculty-directory/{faculty_dir_id}")
def update_faculty_directory_entry(
    faculty_dir_id: int,
    payload: UpdateFacultyDirectoryRequest,
    current: CurrentAdmin = Depends(get_current_admin),
):
    """
    Updates or deactivates an existing approved faculty entry.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT faculty_dir_id, institutional_email, is_active FROM FACULTY_DIRECTORY WHERE faculty_dir_id = %s",
                (faculty_dir_id,),
            )
            existing = cursor.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Faculty directory entry not found.")

            updates = []
            params = []
            if payload.full_name is not None:
                updates.append("full_name = %s")
                params.append(payload.full_name.strip())
            if payload.department is not None:
                updates.append("department = %s")
                params.append(payload.department.strip())
            if payload.designation is not None:
                updates.append("designation = %s")
                params.append(payload.designation.strip())
            if payload.is_active is not None:
                updates.append("is_active = %s")
                params.append(payload.is_active)

            if not updates:
                return {"status": "success", "message": "No changes requested."}

            params.append(faculty_dir_id)
            cursor.execute(
                f"UPDATE FACULTY_DIRECTORY SET {', '.join(updates)}, updated_at = NOW() WHERE faculty_dir_id = %s",
                params,
            )
            connection.commit()

            return {
                "status": "success",
                "message": "Faculty directory entry updated successfully.",
            }
    finally:
        connection.close()


class TriggerAnalyticsReportRequest(BaseModel):
    target_date: Optional[str] = None
    recipient_email: Optional[EmailStr] = None
    force: bool = False


@router.post("/reports/analytics/trigger")
def trigger_daily_analytics_report(
    payload: TriggerAnalyticsReportRequest = TriggerAnalyticsReportRequest(),
    current: CurrentAdmin = Depends(get_current_admin),
):
    """
    On-demand execution of the automated daily analytics PDF report generation
    and Resend email dispatch.
    """
    parsed_date = None
    if payload.target_date:
        try:
            parsed_date = datetime.strptime(payload.target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid target_date format. Must be YYYY-MM-DD.")

    try:
        result = run_daily_analytics_pipeline(
            target_date=parsed_date,
            recipient_email=payload.recipient_email,
            force=payload.force,
        )
        return {"status": "success", "result": result}
    except Exception as exc:
        logger.error("Failed on-demand analytics report trigger: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate and email analytics report: {exc}")


_bearer_scheme = HTTPBearer(auto_error=False)


def verify_admin_token(
    token: Optional[str] = Query(None),
    auth: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
):
    raw_token = auth.credentials if auth else token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a Bearer token or token query parameter.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(raw_token)
    except JWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {err}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Admin privileges required.",
        )
    return payload


@router.get("/reports/analytics/preview")
def preview_daily_analytics_pdf(
    target_date: Optional[str] = None,
    current: dict = Depends(verify_admin_token),
):
    """
    Generates (if not cached) and streams the landscape analytics dashboard PDF
    for browser preview or download.
    Supports target_date='all' for cumulative report across everyone.
    """
    is_all = (target_date and str(target_date).lower() == "all")
    if is_all:
        rep_date_str = "AllTime"
        pdf_path = str(REPORTS_DIR / f"CampusCare_Analytics_AllTime.pdf")
        try:
            data = aggregate_daily_analytics(target_date="all", scope="all")
            html = generate_analytics_html(data)
            render_html_to_pdf(html, pdf_path)
        except Exception as exc:
            logger.error("Failed to generate all-time analytics PDF: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to generate all-time analytics PDF: {exc}")
    else:
        if target_date:
            try:
                parsed_date = datetime.strptime(target_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid target_date format. Must be YYYY-MM-DD.")
        else:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT MAX(DATE(checked_in_at)) as max_d FROM VISIT")
                    r_max = cur.fetchone()
                    parsed_date = r_max["max_d"] if r_max and r_max.get("max_d") else (datetime.now(KOLKATA_TZ) - timedelta(days=1)).date()
            finally:
                conn.close()

        rep_date_str = parsed_date.strftime("%Y-%m-%d")
        pdf_path = str(REPORTS_DIR / f"CampusCare_Analytics_{rep_date_str}.pdf")

        try:
            data = aggregate_daily_analytics(parsed_date)
            html = generate_analytics_html(data)
            render_html_to_pdf(html, pdf_path)
        except Exception as exc:
            logger.error("Failed to generate analytics PDF: %s", exc, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to generate analytics PDF: {exc}")

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"CampusCare_Analytics_{rep_date_str}.pdf",
    )


@router.get("/reports/analytics/logs")
def get_analytics_report_logs(
    limit: int = 30,
    current: CurrentAdmin = Depends(get_current_admin),
):
    """
    Fetches historical dispatch audit logs from DAILY_ANALYTICS_REPORT_LOG.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT report_id, reporting_date, recipient_email, status,
                       resend_email_id, pdf_file_path, pdf_size_bytes,
                       total_visits, total_consultations, total_prescriptions, total_emergencies,
                       error_message, attempt_count, generated_at, sent_at, created_at, updated_at
                FROM DAILY_ANALYTICS_REPORT_LOG
                ORDER BY reporting_date DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cursor.fetchall()
            return {"status": "success", "count": len(rows), "data": rows}
    finally:
        connection.close()




@router.get("/analytics")
def get_admin_analytics_dashboard(
    date: Optional[str] = None,
    scope: Optional[str] = None,
    current: CurrentAdmin = Depends(get_current_admin),
):
    """
    Returns comprehensive analytics telemetry for the CampusCare Admin Analytics Dashboard:
    - Authoritative aggregated data (supports scope='all' for everyone, or specific date)
    - 7-day volume trend for the interactive chart
    - Recent consultation log for the operations table
    """
    is_all = (scope == "all" or (date and str(date).lower() == "all"))
    if is_all:
        analytics_data = aggregate_daily_analytics(target_date="all", scope="all")
        parsed_date = (datetime.now(KOLKATA_TZ) - timedelta(days=1)).date()
    else:
        if date:
            try:
                parsed_date = datetime.strptime(date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Must be YYYY-MM-DD.")
        else:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT MAX(DATE(checked_in_at)) as max_d FROM VISIT")
                    r_max = cur.fetchone()
                    parsed_date = r_max["max_d"] if r_max and r_max.get("max_d") else (datetime.now(KOLKATA_TZ) - timedelta(days=1)).date()
            finally:
                conn.close()

        analytics_data = aggregate_daily_analytics(parsed_date)

    trend_7d = []
    recent_consultations = []

    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            from app.services.analytics_aggregator import get_reporting_window
            from datetime import time

            seven_days_ago = parsed_date - timedelta(days=6)
            s_start, _, _, _ = get_reporting_window(seven_days_ago)
            _, _, _, s_end = get_reporting_window(parsed_date)

            cursor.execute(
                """
                SELECT checked_in_at
                FROM VISIT
                WHERE checked_in_at >= %s AND checked_in_at < %s
                """,
                (s_start, s_end),
            )
            v_rows = cursor.fetchall() or []

            cursor.execute(
                """
                SELECT occurred_at
                FROM EMERGENCY_LOG
                WHERE occurred_at >= %s AND occurred_at < %s
                """,
                (s_start, s_end),
            )
            em_rows = cursor.fetchall() or []

            def get_shift_date(dt: datetime) -> date:
                if dt.time() < time(6, 0, 0):
                    return (dt - timedelta(days=1)).date()
                return dt.date()

            v_counts = {}
            for row in v_rows:
                dt_val = row["checked_in_at"]
                if isinstance(dt_val, datetime):
                    d_val = get_shift_date(dt_val)
                    v_counts[d_val] = v_counts.get(d_val, 0) + 1

            em_counts = {}
            for row in em_rows:
                dt_val = row["occurred_at"]
                if isinstance(dt_val, datetime):
                    d_val = get_shift_date(dt_val)
                    em_counts[d_val] = em_counts.get(d_val, 0) + 1

            for i in range(6, -1, -1):
                day = parsed_date - timedelta(days=i)
                trend_7d.append({
                    "date": day.isoformat(),
                    "label": day.strftime("%b %d"),
                    "day_name": day.strftime("%a"),
                    "visits": v_counts.get(day, 0),
                    "emergencies": em_counts.get(day, 0),
                    "is_selected": day == parsed_date,
                })

            s1_cur, _, _, ed_cur = get_reporting_window(parsed_date)
            if is_all:
                cursor.execute(
                    """
                    SELECT 
                        v.visit_id,
                        v.checked_in_at,
                        v.status,
                        p.patient_type,
                        COALESCE(NULLIF(TRIM(c.diagnosis), ''), 'General OPD Evaluation') as diagnosis,
                        COALESCE(NULLIF(TRIM(c.case_category), ''), 'UNSPECIFIED') as category,
                        COALESCE(ua.email, 'Medical Officer') as doctor_email
                    FROM VISIT v
                    LEFT JOIN PATIENT p ON p.patient_id = v.patient_id
                    LEFT JOIN CONSULTATION c ON c.visit_id = v.visit_id
                    LEFT JOIN DOCTOR d ON d.doctor_id = c.doctor_id
                    LEFT JOIN STAFF s ON s.staff_id = d.staff_id
                    JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                    WHERE v.checked_in_at IS NOT NULL
                    ORDER BY v.checked_in_at DESC
                    LIMIT 20
                    """
                )
            else:
                cursor.execute(
                    """
                    SELECT 
                        v.visit_id,
                        v.checked_in_at,
                        v.status,
                        p.patient_type,
                        COALESCE(NULLIF(TRIM(c.diagnosis), ''), 'General OPD Evaluation') as diagnosis,
                        COALESCE(NULLIF(TRIM(c.case_category), ''), 'UNSPECIFIED') as category,
                        COALESCE(ua.email, 'Medical Officer') as doctor_email
                    FROM VISIT v
                    LEFT JOIN PATIENT p ON p.patient_id = v.patient_id
                    LEFT JOIN CONSULTATION c ON c.visit_id = v.visit_id
                    LEFT JOIN DOCTOR d ON d.doctor_id = c.doctor_id
                    LEFT JOIN STAFF s ON s.staff_id = d.staff_id
                    JOIN USER_ACCOUNT ua ON ua.user_id = s.user_id
                    WHERE v.checked_in_at >= %s AND v.checked_in_at < %s
                    ORDER BY v.checked_in_at DESC
                    LIMIT 20
                    """,
                    (s1_cur, ed_cur),
                )
            raw_consults = cursor.fetchall() or []
            for r in raw_consults:
                chk_dt = r["checked_in_at"]
                time_str = chk_dt.strftime("%I:%M %p") if isinstance(chk_dt, datetime) else str(chk_dt)
                date_str = chk_dt.strftime("%d %b %Y") if isinstance(chk_dt, datetime) else ""
                doc_name = r["doctor_email"].split("@")[0].replace(".", " ").title()
                if "Dr" not in doc_name:
                    doc_name = f"Dr. {doc_name}"
                recent_consultations.append({
                    "visit_id": r["visit_id"],
                    "diagnosis": r["diagnosis"],
                    "category": r["category"].replace("_", " ").title(),
                    "patient_type": (r["patient_type"] or "STUDENT").replace("_", " ").title(),
                    "status": r["status"] or "COMPLETED",
                    "time": time_str,
                    "date": date_str,
                    "doctor": doc_name,
                })
    finally:
        connection.close()

    return {
        "status": "success",
        "data": {
            "analytics": analytics_data,
            "trend_7d": trend_7d,
            "recent_consultations": recent_consultations,
        },
    }
