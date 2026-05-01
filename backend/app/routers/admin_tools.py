"""
admin_tools.py
--------------
Emergency admin endpoints protected by a secret key.
Used when locked out of the system or need to inspect DB without Neon console.

SECRET_KEY is set in Render environment variables as ADMIN_TOOLS_SECRET.
Never expose this key publicly.
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import os

from app.database import get_db
from app import models
from app.auth import hash_password

router = APIRouter(prefix="/admin-tools", tags=["Admin Tools"])

TOOLS_SECRET = os.getenv("ADMIN_TOOLS_SECRET", "")


def verify_secret(x_admin_secret: str = Header(...)):
    """All admin-tools endpoints require X-Admin-Secret header."""
    if not TOOLS_SECRET:
        raise HTTPException(status_code=503, detail="Admin tools not configured")
    if x_admin_secret != TOOLS_SECRET:
        raise HTTPException(status_code=403, detail="Invalid secret")
    return True


# ── List all users ────────────────────────────────────────────────────────────
@router.get("/users")
def list_all_users(
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    users = db.query(models.User).order_by(models.User.user_id).all()
    return [
        {
            "user_id":     u.user_id,
            "username":    u.username,
            "full_name":   u.full_name,
            "role":        u.role,
            "branch_id":   u.branch_id,
            "business_id": u.business_id,
            "is_active":   u.is_active,
            "created_at":  str(u.created_at),
        }
        for u in users
    ]


# ── List all businesses ───────────────────────────────────────────────────────
@router.get("/businesses")
def list_all_businesses(
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    return db.query(models.Business).all()


# ── List all branches ─────────────────────────────────────────────────────────
@router.get("/branches")
def list_all_branches(
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    return db.query(models.Branch).all()


# ── Check alembic version ─────────────────────────────────────────────────────
@router.get("/migration-status")
def migration_status(
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    try:
        result = db.execute(text("SELECT version_num FROM alembic_version")).fetchall()
        return {"alembic_versions": [r[0] for r in result]}
    except Exception as e:
        return {"error": str(e), "detail": "alembic_version table may not exist"}


# ── Reset a user's password ───────────────────────────────────────────────────
class PasswordReset(BaseModel):
    username:     str
    new_password: str

@router.post("/reset-password")
def reset_password(
    data: PasswordReset,
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": f"Password reset for {data.username}"}


# ── Create emergency superadmin ───────────────────────────────────────────────
class EmergencyUser(BaseModel):
    full_name:   str
    username:    str
    password:    str
    role:        str = "superadmin"
    branch_id:   Optional[int] = None
    business_id: Optional[int] = None

@router.post("/create-user")
def create_emergency_user(
    data: EmergencyUser,
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    existing = db.query(models.User).filter(models.User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = models.User(
        full_name=data.full_name,
        username=data.username,
        password_hash=hash_password(data.password),
        role=data.role,
        branch_id=data.branch_id,
        business_id=data.business_id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "message": "User created",
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
    }


# ── DB health check ───────────────────────────────────────────────────────────
@router.get("/health")
def db_health(
    db: Session = Depends(get_db),
    _: bool = Depends(verify_secret)
):
    try:
        user_count     = db.query(models.User).count()
        business_count = db.query(models.Business).count()
        branch_count   = db.query(models.Branch).count()
        product_count  = db.query(models.Product).count()
        sale_count     = db.query(models.Sale).count()
        return {
            "status":    "ok",
            "users":     user_count,
            "businesses": business_count,
            "branches":  branch_count,
            "products":  product_count,
            "sales":     sale_count,
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}