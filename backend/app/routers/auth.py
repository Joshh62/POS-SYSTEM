from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional

from app import models, schemas
from app.database import get_db
from app.models import User
from app.auth import hash_password, verify_password, create_access_token
from app.dependencies import require_role, SUPERADMIN_ROLE

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── List users ────────────────────────────────────────────────────────────────
@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    # superadmin sees all users; admin sees only their business
    query = db.query(User)
    if user.role != SUPERADMIN_ROLE:
        query = query.filter(User.business_id == user.business_id)
    return query.order_by(User.created_at.desc()).all()


# ── Register ──────────────────────────────────────────────────────────────────
@router.post("/register")
def register(
    user: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    if len(user.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    new_user = models.User(
        full_name=user.full_name,
        username=user.username,
        password_hash=hash_password(user.password),
        role=user.role,
        branch_id=getattr(user, "branch_id", None),
        business_id=getattr(user, "business_id", None),  # ✅ new
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# ── Login ─────────────────────────────────────────────────────────────────────
@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == form_data.username).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    # ✅ superadmin has no branch — skip branch check
    if user.role != SUPERADMIN_ROLE and not user.branch_id:
        raise HTTPException(status_code=400, detail="User has no branch assigned")

    access_token = create_access_token({
        "sub":         user.username,
        "user_id":     user.user_id,
        "role":        user.role,
        "branch_id":   user.branch_id,    # None for superadmin
        "business_id": user.business_id,  # ✅ new — None for superadmin
    })

    return {
        "access_token": access_token,
        "token_type":   "bearer",
        "user": {
            "user_id":     user.user_id,
            "username":    user.username,
            "full_name":   user.full_name,
            "role":        user.role,
            "branch_id":   user.branch_id,
            "business_id": user.business_id,  # ✅ new
        }
    }


# ── Deactivate / Activate ─────────────────────────────────────────────────────
@router.patch("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin"]))
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # admin can only deactivate users in their own business
    if current_user.role != SUPERADMIN_ROLE and user.business_id != current_user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    user.is_active = False
    db.commit()
    return {"message": "User deactivated"}


@router.patch("/users/{user_id}/activate")
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin"]))
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role != SUPERADMIN_ROLE and user.business_id != current_user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    user.is_active = True
    db.commit()
    return {"message": "User activated"}