"""
CampusCare Resend Email Dispatcher
Delivers executive daily analytics PDF reports to health centre administrators.
Handles base64 encoding of PDF attachments, exponential backoff retries,
and responsive HTML email templates with zero emojis.
"""

import base64
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request

from app.core.config import (
    ANALYTICS_REPORT_RECIPIENT,
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
)

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


class ResendDeliveryError(Exception):
    """Raised when Resend API delivery fails after retry attempts."""
    pass


def build_email_html(reporting_date_str: str, gen_timestamp: str, metrics: Dict[str, Any]) -> str:
    """
    Constructs an executive-grade, responsive HTML email body.
    Strictly zero emojis used anywhere.
    """
    total_visits = metrics.get("total_visits", 0)
    total_consultations = metrics.get("total_consultations", 0)
    total_prescriptions = metrics.get("total_prescriptions", 0)
    total_emergencies = metrics.get("total_emergencies", 0)
    s1_count = metrics.get("shift_1_visits", 0)
    s2_count = metrics.get("shift_2_visits", 0)
    s3_count = metrics.get("shift_3_visits", 0)
    active_doctors = metrics.get("active_doctors", 0)
    top_categories = metrics.get("top_categories", "None recorded")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CampusCare Daily Health Centre Analytics</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f4f6f8;
      color: #1a202c;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }}
    .email-container {{
      max-width: 640px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
    }}
    .header {{
      background: #0B192C;
      padding: 28px 32px;
      color: #ffffff;
    }}
    .header-tag {{
      display: inline-block;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
      color: #34d399;
      background: rgba(52, 211, 153, 0.12);
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 8px;
    }}
    .header h1 {{
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #ffffff;
    }}
    .header p {{
      margin: 6px 0 0 0;
      font-size: 13px;
      color: #94a3b8;
    }}
    .body-content {{
      padding: 32px;
    }}
    .greeting {{
      font-size: 15px;
      font-weight: 500;
      color: #334155;
      margin-bottom: 16px;
    }}
    .intro {{
      font-size: 14px;
      color: #64748b;
      margin-bottom: 24px;
    }}
    .metrics-grid {{
      display: table;
      width: 100%;
      margin-bottom: 24px;
      border-spacing: 8px;
    }}
    .metric-cell {{
      display: table-cell;
      width: 50%;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      vertical-align: top;
    }}
    .metric-label {{
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 4px;
    }}
    .metric-value {{
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
    }}
    .shift-table {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }}
    .shift-table th {{
      text-align: left;
      padding: 10px 12px;
      background: #f1f5f9;
      color: #475569;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e2e8f0;
    }}
    .shift-table td {{
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }}
    .attachment-notice {{
      background: #ecfdf5;
      border-left: 4px solid #10b981;
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 24px;
    }}
    .attachment-notice p {{
      margin: 0;
      font-size: 13px;
      color: #065f46;
      line-height: 1.5;
    }}
    .attachment-notice strong {{
      color: #047857;
    }}
    .footer {{
      background: #f8fafc;
      padding: 20px 32px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
    }}
    .footer a {{
      color: #059669;
      text-decoration: none;
    }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <div class="header-tag">CampusCare Executive Intelligence</div>
      <h1>Daily Health Centre Analytics</h1>
      <p>Reporting Period: {reporting_date_str} (Completed Shifts 1, 2 &amp; 3)</p>
    </div>
    <div class="body-content">
      <div class="greeting">Health Centre Administrator,</div>
      <div class="intro">
        The consolidated health centre operations summary for <strong>{reporting_date_str}</strong> has been aggregated.
        All three shifts (Shift 1: 06:00-14:00, Shift 2: 14:00-20:00, and Shift 3: 20:00-06:00 next day) have fully concluded.
      </div>

      <div class="metrics-grid">
        <div style="display: table-row;">
          <div class="metric-cell">
            <div class="metric-label">Total Patient Visits</div>
            <div class="metric-value">{total_visits}</div>
          </div>
          <div class="metric-cell">
            <div class="metric-label">Consultations Completed</div>
            <div class="metric-value">{total_consultations}</div>
          </div>
        </div>
        <div style="display: table-row;">
          <div class="metric-cell">
            <div class="metric-label">Prescriptions Issued</div>
            <div class="metric-value">{total_prescriptions}</div>
          </div>
          <div class="metric-cell">
            <div class="metric-label">Emergency Cases</div>
            <div class="metric-value">{total_emergencies}</div>
          </div>
        </div>
      </div>

      <h3 style="font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
        Shift Breakdown
      </h3>
      <table class="shift-table">
        <thead>
          <tr>
            <th>Shift Window</th>
            <th>Timing</th>
            <th style="text-align: right;">Visits</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Shift 1</strong> (Morning)</td>
            <td>06:00 - 14:00</td>
            <td style="text-align: right; font-weight: 600;">{s1_count}</td>
          </tr>
          <tr>
            <td><strong>Shift 2</strong> (Afternoon / Evening)</td>
            <td>14:00 - 20:00</td>
            <td style="text-align: right; font-weight: 600;">{s2_count}</td>
          </tr>
          <tr>
            <td><strong>Shift 3</strong> (Night / Overnight)</td>
            <td>20:00 - 06:00</td>
            <td style="text-align: right; font-weight: 600;">{s3_count}</td>
          </tr>
        </tbody>
      </table>

      <div class="attachment-notice">
        <p>
          <strong>Comprehensive PDF Report Attached:</strong> The complete executive analytics visual dashboard is attached to this email (<code>CampusCare_Analytics_{reporting_date_str}.pdf</code>). It contains full shift telemetry, doctor consultation distributions, disease category analysis, and clinical capacity metrics.
        </p>
      </div>

      <p style="font-size: 12px; color: #64748b; margin: 0;">
        <strong>Privacy Notice:</strong> In strict compliance with CampusCare patient privacy protocols, this report contains aggregated administrative intelligence only. Zero patient identifiers or individually attributable clinical records are transmitted.
      </p>
    </div>
    <div class="footer">
      Generated automatically at {gen_timestamp} Asia/Kolkata.<br>
      CampusCare Health Centre Management Platform &bull; Thapar Institute of Engineering and Technology
    </div>
  </div>
</body>
</html>
"""


def send_daily_analytics_report(
    pdf_path: str,
    reporting_date_str: str,
    gen_timestamp: str,
    metrics: Dict[str, Any],
    recipient_email: Optional[str] = None,
    max_retries: int = 3,
) -> Dict[str, Any]:
    """
    Transmits the daily analytics report with attached PDF via Resend API.
    Implements retry logic with exponential backoff.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"Analytics PDF report not found at {pdf_path}")

    target_email = recipient_email or ANALYTICS_REPORT_RECIPIENT
    from_email = RESEND_FROM_EMAIL
    api_key = RESEND_API_KEY

    if not api_key:
        raise ValueError("RESEND_API_KEY is not configured in environment or config.")

    # Read and base64 encode PDF
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()
    pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")

    filename = f"CampusCare_Analytics_{reporting_date_str}.pdf"
    subject = f"CampusCare | Daily Health Centre Analytics | {reporting_date_str}"
    html_content = build_email_html(reporting_date_str, gen_timestamp, metrics)

    payload = {
        "from": from_email,
        "to": [target_email],
        "subject": subject,
        "html": html_content,
        "attachments": [
            {
                "filename": filename,
                "content": pdf_base64,
            }
        ],
    }

    payload_data = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "resend-python/0.8.0",
        "Accept": "application/json",
    }

    last_error: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(
                RESEND_ENDPOINT,
                data=payload_data,
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_body = resp.read().decode("utf-8")
                res_data = json.loads(resp_body)
                email_id = res_data.get("id")
                logger.info(
                    "Daily analytics report successfully delivered via Resend. Email ID: %s, Recipient: %s, Date: %s",
                    email_id,
                    target_email,
                    reporting_date_str,
                )
                return {
                    "success": True,
                    "email_id": email_id,
                    "recipient": target_email,
                    "subject": subject,
                    "pdf_size_bytes": len(pdf_bytes),
                    "attempts": attempt,
                }
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="replace")
            logger.warning(
                "Resend delivery attempt %d/%d failed with HTTP %d: %s",
                attempt,
                max_retries,
                exc.code,
                err_msg,
            )
            last_error = RuntimeError(f"Resend HTTP {exc.code}: {err_msg}")
            # If 4xx client validation error other than 429 rate limit, do not retry
            if exc.code < 500 and exc.code != 429:
                break
        except Exception as exc:
            logger.warning("Resend delivery attempt %d/%d network error: %s", attempt, max_retries, exc)
            last_error = exc

        if attempt < max_retries:
            backoff_secs = 2 ** attempt
            time.sleep(backoff_secs)

    raise ResendDeliveryError(
        f"Failed to dispatch daily analytics report to {target_email} after {max_retries} attempts: {last_error}"
    )
