"""
CampusCare Daily Analytics Trigger CLI Tool
Usage:
    python scripts/trigger_daily_analytics.py [--date YYYY-MM-DD] [--recipient email@example.com] [--force] [--dry-run]
"""

import argparse
from datetime import datetime, timedelta
import logging
import os
from pathlib import Path
import sys
import zoneinfo

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.core.config import ANALYTICS_REPORT_RECIPIENT, ANALYTICS_TIMEZONE
from app.services.analytics_aggregator import aggregate_daily_analytics
from app.services.daily_scheduler import REPORTS_DIR, run_daily_analytics_pipeline
from app.services.pdf_report_generator import generate_analytics_html, render_html_to_pdf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trigger_analytics")


def main():
    parser = argparse.ArgumentParser(description="Trigger CampusCare Daily Analytics Generation and Delivery.")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Target reporting date in YYYY-MM-DD format (defaults to yesterday).",
    )
    parser.add_argument(
        "--recipient",
        type=str,
        default=None,
        help="Target recipient email (defaults to configured admin email).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force execution even if already recorded as dispatched in database.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate PDF and print summary without transmitting via Resend.",
    )

    args = parser.parse_args()

    kolkata_tz = zoneinfo.ZoneInfo(ANALYTICS_TIMEZONE)
    if args.date:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target_date = (datetime.now(kolkata_tz) - timedelta(days=1)).date()

    target_email = args.recipient or ANALYTICS_REPORT_RECIPIENT

    logger.info("Target reporting date: %s", target_date)
    logger.info("Target recipient: %s", target_email)

    if args.dry_run:
        logger.info("[DRY-RUN] Aggregating analytics data...")
        data = aggregate_daily_analytics(target_date)
        logger.info("Visits: %d, Consultations: %d, Prescriptions: %d, Emergencies: %d",
                    data["visits"]["total"], data["consultations"]["total"],
                    data["prescriptions"]["total"], data["emergencies"]["total"])
        html = generate_analytics_html(data)
        out_pdf = REPORTS_DIR / f"CampusCare_Analytics_{target_date}_dryrun.pdf"
        render_html_to_pdf(html, str(out_pdf))
        logger.info("[DRY-RUN] Successfully generated PDF at %s (%d bytes)", out_pdf, os.path.getsize(out_pdf))
        return

    logger.info("Running full daily analytics pipeline...")
    result = run_daily_analytics_pipeline(
        target_date=target_date,
        recipient_email=target_email,
        force=args.force,
    )
    logger.info("Pipeline Execution Result:")
    for k, v in result.items():
        logger.info("  %s: %s", k, v)


if __name__ == "__main__":
    main()
