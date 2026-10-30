import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.core.database import get_db_connection
from app.core.deps import CurrentAdmin, get_current_admin

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

