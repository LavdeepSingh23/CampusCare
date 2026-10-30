"""
CampusCare Daily Analytics Pipeline & Scheduler
Orchestrates daily health centre report aggregation, landscape PDF generation,
and Resend email delivery at 09:00 AM Asia/Kolkata.
Ensures idempotency, audit logging, and zero patient data leakage.
"""

import asyncio
from datetime import date, datetime, timedelta
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional
import zoneinfo

from app.core.config import (
    ANALYTICS_REPORT_RECIPIENT,
    ANALYTICS_SCHEDULE_HOUR,
    ANALYTICS_SCHEDULE_MINUTE,
    ANALYTICS_TIMEZONE,
)
from app.core.database import get_db_connection
from app.services.analytics_aggregator import aggregate_daily_analytics
from app.services.pdf_report_generator import generate_analytics_html, render_html_to_pdf
from app.services.resend_mailer import send_daily_analytics_report

logger = logging.getLogger(__name__)

KOLKATA_TZ = zoneinfo.ZoneInfo(ANALYTICS_TIMEZONE)

# Persistent reports storage directory inside backend
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPORTS_DIR = BACKEND_DIR / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

_scheduler_task: Optional[asyncio.Task] = None


def check_if_already_dispatched(reporting_date: date) -> Optional[Dict[str, Any]]:
    """
    Checks if a successful report dispatch has already been logged for the given date.
    Returns the log entry dict if found, else None.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT report_id, reporting_date, recipient_email, status,
                       resend_email_id, pdf_file_path, pdf_size_bytes,
                       total_visits, total_consultations, total_prescriptions, total_emergencies,
                       sent_at, created_at
                FROM DAILY_ANALYTICS_REPORT_LOG
                WHERE reporting_date = %s AND status = 'SUCCESS'
                LIMIT 1
                """,
                (reporting_date,),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def record_report_start(reporting_date: date, recipient_email: str) -> int:
    """
    Upserts a PENDING report execution row in DAILY_ANALYTICS_REPORT_LOG.
    Returns the report_id.
    """
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO DAILY_ANALYTICS_REPORT_LOG (
                    reporting_date, recipient_email, status,
                    attempt_count, generated_at, created_at, updated_at
                )
                VALUES (%s, %s, 'PENDING', 1, NOW(), NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    recipient_email = VALUES(recipient_email),
                    status = 'PENDING',
                    attempt_count = attempt_count + 1,
                    generated_at = NOW(),
                    error_message = NULL,
                    updated_at = NOW()
                """,
                (reporting_date, recipient_email),
            )
            connection.commit()

            cursor.execute(
                "SELECT report_id FROM DAILY_ANALYTICS_REPORT_LOG WHERE reporting_date = %s",
                (reporting_date,),
            )
            row = cursor.fetchone()
            return row["report_id"] if row else 0
    finally:
        connection.close()


def record_report_success(
    reporting_date: date,
    resend_email_id: str,
    pdf_path: str,
    pdf_size: int,
    metrics: Dict[str, Any],
):
    """Marks the report row as SUCCESS with dispatch metadata."""
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE DAILY_ANALYTICS_REPORT_LOG
                SET status = 'SUCCESS',
                    resend_email_id = %s,
                    pdf_file_path = %s,
                    pdf_size_bytes = %s,
                    total_visits = %s,
                    total_consultations = %s,
                    total_prescriptions = %s,
                    total_emergencies = %s,
                    sent_at = NOW(),
                    updated_at = NOW()
                WHERE reporting_date = %s
                """,
                (
                    resend_email_id,
                    pdf_path,
                    pdf_size,
                    metrics.get("total_visits", 0),
                    metrics.get("total_consultations", 0),
                    metrics.get("total_prescriptions", 0),
                    metrics.get("total_emergencies", 0),
                    reporting_date,
                ),
            )
            connection.commit()
    finally:
        connection.close()


def record_report_failure(reporting_date: date, error_message: str):
    """Marks the report row as FAILED with detailed diagnostic error message."""
    connection = get_db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE DAILY_ANALYTICS_REPORT_LOG
                SET status = 'FAILED',
                    error_message = %s,
                    updated_at = NOW()
                WHERE reporting_date = %s
                """,
                (error_message[:2000], reporting_date),
            )
            connection.commit()
    finally:
        connection.close()


def run_daily_analytics_pipeline(
    target_date: Optional[date] = None,
    recipient_email: Optional[str] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Authoritative pipeline executing:
      1. Aggregation of health centre telemetry for target_date.
      2. Rendering of high-fidelity landscape A4 PDF dashboard.
      3. Secure dispatch via Resend API to the administrator.
      4. Database audit logging in DAILY_ANALYTICS_REPORT_LOG.
    """
    now_kolkata = datetime.now(KOLKATA_TZ)
    if target_date is None:
        # Defaults to yesterday so all 3 shifts (ending at 06:00 AM today) are complete
        target_date = (now_kolkata - timedelta(days=1)).date()

    target_recipient = recipient_email or ANALYTICS_REPORT_RECIPIENT
    rep_date_str = target_date.strftime("%Y-%m-%d")

    logger.info(
        "Starting Daily Analytics Pipeline for reporting date %s -> recipient %s (force=%s)",
        rep_date_str,
        target_recipient,
        force,
    )

    # 1. Idempotency Check
    if not force:
        existing = check_if_already_dispatched(target_date)
        if existing:
            logger.info("Report for %s already successfully sent (Resend ID: %s). Skipping duplicate.", rep_date_str, existing.get("resend_email_id"))
            return {
                "status": "SKIPPED",
                "message": f"Daily analytics for {rep_date_str} already dispatched successfully.",
                "reporting_date": rep_date_str,
                "resend_email_id": existing.get("resend_email_id"),
                "sent_at": str(existing.get("sent_at")),
            }

    # 2. Record Start (PENDING)
    record_report_start(target_date, target_recipient)

    try:
        # 3. Aggregate Data
        analytics_data = aggregate_daily_analytics(target_date)

        # 4. Render HTML & PDF
        html_content = generate_analytics_html(analytics_data)
        pdf_path = str(REPORTS_DIR / f"CampusCare_Analytics_{rep_date_str}.pdf")
        render_html_to_pdf(html_content, pdf_path)

        if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
            raise RuntimeError(f"Generated PDF file is missing or empty at {pdf_path}")

        pdf_size = os.path.getsize(pdf_path)
        logger.info("Generated PDF for %s: %s (%d bytes)", rep_date_str, pdf_path, pdf_size)

        # 5. Extract Summary Metrics for Email
        metrics = {
            "total_visits": analytics_data.get("visits", {}).get("total", 0),
            "total_consultations": analytics_data.get("consultations", {}).get("total", 0),
            "total_prescriptions": analytics_data.get("prescriptions", {}).get("total", 0),
            "total_emergencies": analytics_data.get("emergencies", {}).get("total", 0),
            "shift_1_visits": analytics_data.get("visits", {}).get("shifts", {}).get("shift_1", {}).get("count", 0),
            "shift_2_visits": analytics_data.get("visits", {}).get("shifts", {}).get("shift_2", {}).get("count", 0),
            "shift_3_visits": analytics_data.get("visits", {}).get("shifts", {}).get("shift_3", {}).get("count", 0),
            "active_doctors": analytics_data.get("doctor_distribution", {}).get("active_doctors", 0),
        }

        # 6. Dispatch via Resend
        send_result = send_daily_analytics_report(
            pdf_path=pdf_path,
            reporting_date_str=rep_date_str,
            gen_timestamp=analytics_data.get("generation_timestamp", ""),
            metrics=metrics,
            recipient_email=target_recipient,
        )

        resend_id = send_result.get("email_id", "")

        # 7. Record Success in Database
        record_report_success(
            reporting_date=target_date,
            resend_email_id=resend_id,
            pdf_path=pdf_path,
            pdf_size=pdf_size,
            metrics=metrics,
        )

        return {
            "status": "SUCCESS",
            "message": f"Daily analytics for {rep_date_str} generated and emailed to {target_recipient}.",
            "reporting_date": rep_date_str,
            "resend_email_id": resend_id,
            "pdf_file_path": pdf_path,
            "pdf_size_bytes": pdf_size,
            "metrics": metrics,
        }

    except Exception as exc:
        logger.error("Daily analytics pipeline failed for %s: %s", rep_date_str, exc, exc_info=True)
        record_report_failure(target_date, str(exc))
        raise


async def _scheduler_loop():
    """
    Persistent background loop checking every 30 seconds.
    Triggers run_daily_analytics_pipeline precisely at 09:00 AM Asia/Kolkata.
    """
    logger.info(
        "CampusCare Daily Analytics Scheduler active. Scheduled for %02d:%02d daily (%s).",
        ANALYTICS_SCHEDULE_HOUR,
        ANALYTICS_SCHEDULE_MINUTE,
        ANALYTICS_TIMEZONE,
    )
    last_triggered_date: Optional[date] = None

    while True:
        try:
            now = datetime.now(KOLKATA_TZ)
            today_date = now.date()

            if (
                now.hour == ANALYTICS_SCHEDULE_HOUR
                and now.minute == ANALYTICS_SCHEDULE_MINUTE
                and last_triggered_date != today_date
            ):
                yesterday = today_date - timedelta(days=1)
                logger.info("09:00 AM IST reached. Triggering daily report for %s...", yesterday)
                last_triggered_date = today_date
                # Run the blocking pipeline in a separate thread so asyncio loop is not blocked
                await asyncio.to_thread(run_daily_analytics_pipeline, yesterday)
                # Sleep briefly past the current minute
                await asyncio.sleep(65)

        except asyncio.CancelledError:
            logger.info("Daily Analytics Scheduler loop received cancel signal.")
            break
        except Exception as exc:
            logger.error("Unexpected error in daily analytics scheduler loop: %s", exc, exc_info=True)

        await asyncio.sleep(30)


def start_scheduler() -> asyncio.Task:
    """Launches the daily analytics background task."""
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        loop = asyncio.get_event_loop()
        _scheduler_task = loop.create_task(_scheduler_loop())
        logger.info("CampusCare daily analytics scheduler task created.")
    return _scheduler_task


def stop_scheduler():
    """Cancels the daily analytics background task during app shutdown."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        logger.info("CampusCare daily analytics scheduler task cancelled.")
        _scheduler_task = None
