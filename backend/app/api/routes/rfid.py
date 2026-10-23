"""
NFC / RFID API Routes for CampusCare (Phase NFC-3).

Endpoints:
  POST /api/rfid/lookup                -> Resolves scanned UID to student (Receptionist only)
  POST /api/rfid/cards                 -> Registers / replaces a card for a student (Staff only)
  POST /api/rfid/cards/{card_id}/revoke -> Revokes an active card by card_id (Staff only)
  GET  /api/rfid/student/{roll_number} -> Returns student's active card & card history (Staff only)

Security & Data Integrity Guarantees:
- Scanned UID is sent in the POST body to avoid leaking hardware IDs in URL logs.
- Strict format & length validation + consistent normalization (removes ':', '-', whitespace, uppercased).
- Only active card mappings produce matched=True.
- Inactive / revoked cards return a clear not-found / revoked status with matched=False.
- Never creates a visit or queue entry during lookup.
- Staff identity is securely derived from JWT authentication context.
"""

import logging
import re
from datetime import datetime
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.database import get_db_connection
from app.core.deps import (
    CurrentUser,
    CurrentReceptionist,
    get_current_receptionist,
    get_current_staff,
)

logger = logging.getLogger(__name__)

router = APIRouter()

HEX_CLEAN_RE = re.compile(r"^[0-9A-F]+$")


def normalize_card_uid(raw_uid: Optional[str]) -> str:
    """
    Normalizes RFID / Web NFC UID:
    - Strips whitespace
    - Removes delimiters (':', '-', ' ')
    - Converts to uppercase
    """
    if not raw_uid:
        return ""
    return raw_uid.strip().replace(":", "").replace("-", "").replace(" ", "").upper()


# ── Schemas ────────────────────────────────────────────────────────────

class RFIDLookupRequest(BaseModel):
    card_identifier: Optional[str] = Field(default=None, max_length=100)
    card_uid: Optional[str] = Field(default=None, max_length=100)
    cardUid: Optional[str] = Field(default=None, max_length=100)

    def get_identifier(self) -> str:
        raw = self.card_identifier or self.card_uid or self.cardUid
        if not raw or not raw.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Card identifier (card_identifier / card_uid) is required.",
            )
        norm = normalize_card_uid(raw)
        if len(norm) < 3 or len(norm) > 64:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Card identifier length must be between 3 and 64 characters.",
            )
        if not HEX_CLEAN_RE.match(norm):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Card identifier must be a valid alphanumeric / hexadecimal string.",
            )
        return norm


class RFIDRegisterRequest(BaseModel):
    roll_number: str = Field(..., min_length=1, max_length=30)
    card_identifier: Optional[str] = Field(default=None, max_length=100)
    card_uid: Optional[str] = Field(default=None, max_length=100)

    def get_identifier(self) -> str:
        raw = self.card_identifier or self.card_uid
        if not raw or not raw.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Card identifier is required.",
            )
        norm = normalize_card_uid(raw)
        if len(norm) < 3 or len(norm) > 64:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Card identifier length must be between 3 and 64 characters.",
            )
        if not HEX_CLEAN_RE.match(norm):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Card identifier must be a valid alphanumeric / hexadecimal string.",
            )
        return norm


class RFIDCardRevokeRequest(BaseModel):
    reason: Literal["LOST", "DEACTIVATED"] = "DEACTIVATED"
    notes: Optional[str] = Field(default=None, max_length=255)


# ── 1. POST /api/rfid/lookup ───────────────────────────────────────────
@router.post("/lookup")
def lookup_rfid_card(
    payload: RFIDLookupRequest,
    me: CurrentReceptionist = Depends(get_current_receptionist),
):
    """
    Resolves a scanned card UID to an active student identity.
    - Requires receptionist authorization.
    - Operates purely in read-only mode (never creates a visit).
    - Returns matched=True with student record when active.
    - Returns matched=False with clear status when unknown or revoked.
    """
    norm_uid = payload.get_identifier()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Query card mapping and joined student details
            cur.execute(
                """
                SELECT rc.rfid_card_id, rc.card_uid, rc.status AS card_status,
                       rc.issued_at, rc.deactivated_at,
                       st.roll_number, st.full_name, st.blood_group, st.status AS student_status,
                       ua.email
                FROM RFID_CARD rc
                JOIN STUDENT st ON st.roll_number = rc.roll_number
                JOIN USER_ACCOUNT ua ON ua.user_id = st.user_id
                WHERE rc.card_uid = %s
                LIMIT 1
                """,
                (norm_uid,),
            )
            card = cur.fetchone()

            if not card:
                logger.info("RFID lookup: UID %s not registered in system.", norm_uid)
                return {
                    "matched": False,
                    "status": "NOT_FOUND",
                    "card_identifier": norm_uid,
                    "message": f"Card UID '{norm_uid}' is not registered in the system.",
                    "student": None,
                }

            # Check if card is revoked / inactive
            if card["card_status"] != "ACTIVE":
                logger.info("RFID lookup: UID %s has inactive status %s.", norm_uid, card["card_status"])
                return {
                    "matched": False,
                    "status": "REVOKED",
                    "card_status": card["card_status"],
                    "card_id": card["rfid_card_id"],
                    "card_identifier": norm_uid,
                    "message": f"Card '{norm_uid}' is marked as {card['card_status']} and is not active for check-in.",
                    "student": None,
                }

            # Check if student account is inactive
            if card.get("student_status") == "INACTIVE":
                logger.warning("RFID lookup: UID %s belongs to inactive student %s.", norm_uid, card["roll_number"])
                return {
                    "matched": False,
                    "status": "STUDENT_INACTIVE",
                    "card_id": card["rfid_card_id"],
                    "card_identifier": norm_uid,
                    "message": f"Student record for roll number '{card['roll_number']}' is currently inactive.",
                    "student": None,
                }

            # Successfully resolved active student mapping
            issued_str = (
                card["issued_at"].isoformat()
                if hasattr(card["issued_at"], "isoformat")
                else str(card["issued_at"])
            )

            return {
                "matched": True,
                "status": "ACTIVE",
                "student": {
                    "roll_number": card["roll_number"],
                    "rollNumber": card["roll_number"],
                    "name": card["full_name"],
                    "full_name": card["full_name"],
                    "blood_group": card.get("blood_group"),
                    "bloodGroup": card.get("blood_group"),
                    "email": card["email"],
                },
                "card": {
                    "card_id": card["rfid_card_id"],
                    "cardId": card["rfid_card_id"],
                    "card_identifier": card["card_uid"],
                    "cardUid": card["card_uid"],
                    "status": "ACTIVE",
                    "issued_at": issued_str,
                },
            }
    finally:
        conn.close()


# ── 2. POST /api/rfid/cards ───────────────────────────────────────────
@router.post("/cards", status_code=status.HTTP_201_CREATED)
def register_rfid_card(
    payload: RFIDRegisterRequest,
    me: CurrentUser = Depends(get_current_staff),
):
    """
    Registers or replaces an RFID card for a student.
    - Enforces format and length.
    - Prevents one card from being assigned to multiple students (409 Conflict).
    - Automatically marks student's prior active card as REPLACED.
    - Stores staff identity (issued_by_user_id) from token context.
    """
    roll = payload.roll_number.strip()
    norm_uid = payload.get_identifier()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Verify student exists
            cur.execute("SELECT roll_number, full_name, status FROM STUDENT WHERE roll_number = %s", (roll,))
            st = cur.fetchone()
            if not st:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Student '{roll}' not found.")
            if st.get("status") == "INACTIVE":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign card to inactive student.")

            # 2. Check if card_uid already exists in RFID_CARD
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
                        # Card is already active for this exact student
                        return {
                            "success": True,
                            "card_id": existing_card["rfid_card_id"],
                            "cardId": existing_card["rfid_card_id"],
                            "roll_number": roll,
                            "rollNumber": roll,
                            "card_identifier": norm_uid,
                            "cardUid": norm_uid,
                            "status": "ACTIVE",
                            "student_name": st["full_name"],
                            "message": "Card is already actively assigned to this student.",
                        }

                # Card exists in inactive state: reactivate / reassign
                # A. Retire any existing active card for this student
                cur.execute(
                    """
                    UPDATE RFID_CARD
                    SET status = 'REPLACED', deactivated_at = NOW(), revoked_by_user_id = %s
                    WHERE roll_number = %s AND status = 'ACTIVE' AND rfid_card_id != %s
                    """,
                    (me.user_id, roll, existing_card["rfid_card_id"]),
                )
                # B. Reactivate existing card row
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
                # Fresh card:
                # A. Retire any existing active card for this student
                cur.execute(
                    """
                    UPDATE RFID_CARD
                    SET status = 'REPLACED', deactivated_at = NOW(), revoked_by_user_id = %s
                    WHERE roll_number = %s AND status = 'ACTIVE'
                    """,
                    (me.user_id, roll),
                )
                # B. Insert new active card
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
        "success": True,
        "card_id": card_id,
        "cardId": card_id,
        "roll_number": roll,
        "rollNumber": roll,
        "card_identifier": norm_uid,
        "cardUid": norm_uid,
        "status": "ACTIVE",
        "student_name": st["full_name"],
        "message": f"Card '{norm_uid}' registered successfully for student '{roll}'.",
    }


# ── 3. POST /api/rfid/cards/{card_id}/revoke ───────────────────────────
@router.post("/cards/{card_id}/revoke")
def revoke_card_by_id(
    card_id: int,
    payload: RFIDCardRevokeRequest = RFIDCardRevokeRequest(),
    me: CurrentUser = Depends(get_current_staff),
):
    """
    Revokes an active card by internal card_id.
    - Requires authorized staff credentials.
    - Sets status to LOST or DEACTIVATED.
    - Records revocation timestamp and staff user_id.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT rfid_card_id, roll_number, card_uid, status FROM RFID_CARD WHERE rfid_card_id = %s",
                (card_id,),
            )
            card = cur.fetchone()
            if not card:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"RFID card with ID #{card_id} not found.",
                )

            if card["status"] != "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Card #{card_id} ('{card['card_uid']}') is already in status '{card['status']}'.",
                )

            cur.execute(
                """
                UPDATE RFID_CARD
                SET status = %s, deactivated_at = NOW(), revoked_by_user_id = %s
                WHERE rfid_card_id = %s
                """,
                (payload.reason, me.user_id, card_id),
            )
        conn.commit()
    finally:
        conn.close()

    now_iso = datetime.now().isoformat()
    return {
        "success": True,
        "card_id": card_id,
        "cardId": card_id,
        "roll_number": card["roll_number"],
        "rollNumber": card["roll_number"],
        "card_identifier": card["card_uid"],
        "cardUid": card["card_uid"],
        "status": payload.reason,
        "deactivated_at": now_iso,
        "message": f"Card #{card_id} ({card['card_uid']}) assigned to {card['roll_number']} has been marked as {payload.reason}.",
    }


# ── 4. GET /api/rfid/student/{roll_number} ─────────────────────────────
@router.get("/student/{roll_number}")
def get_student_cards(
    roll_number: str,
    _: CurrentUser = Depends(get_current_staff),
):
    """Returns student's active card and full assignment history."""
    roll = roll_number.strip()
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT roll_number, full_name, blood_group FROM STUDENT WHERE roll_number = %s", (roll,))
            st = cur.fetchone()
            if not st:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Student '{roll}' not found.")

            cur.execute(
                """
                SELECT rfid_card_id, card_uid, status, issued_at, deactivated_at, issued_by_user_id, revoked_by_user_id
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
            "roll_number": st["roll_number"],
            "rollNumber": st["roll_number"],
            "name": st["full_name"],
            "blood_group": st.get("blood_group"),
        },
        "active_card": (
            {
                "card_id": active_card["rfid_card_id"],
                "card_identifier": active_card["card_uid"],
                "status": active_card["status"],
                "issued_at": active_card["issued_at"].isoformat() if hasattr(active_card["issued_at"], "isoformat") else str(active_card["issued_at"]),
            }
            if active_card
            else None
        ),
        "history": [
            {
                "card_id": c["rfid_card_id"],
                "card_identifier": c["card_uid"],
                "status": c["status"],
                "issued_at": c["issued_at"].isoformat() if hasattr(c["issued_at"], "isoformat") else str(c["issued_at"]),
                "deactivated_at": c["deactivated_at"].isoformat() if c["deactivated_at"] and hasattr(c["deactivated_at"], "isoformat") else (str(c["deactivated_at"]) if c["deactivated_at"] else None),
            }
            for c in cards
        ],
    }

