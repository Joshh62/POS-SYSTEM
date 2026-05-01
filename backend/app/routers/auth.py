from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel

from app import models, schemas
from app.database import get_db
from app.models import User, Business
from app.auth import hash_password, verify_password, create_access_token
from app.dependencies import require_role, SUPERADMIN_ROLE
from app.utils.plans import get_plan_limits, is_user_limit_reached

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _count_business_users(db: Session, business_id: int) -> int:
    """Count all active users in a business including admin/owner."""
    return db.query(func.count(User.user_id)).filter(
        User.business_id == business_id,
        User.is_active   == True,
    ).scalar() or 0


# ── List users ────────────────────────────────────────────────────────────────
@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    query = db.query(User)
    if user.role != SUPERADMIN_ROLE:
        query = query.filter(User.business_id == user.business_id)
    return query.order_by(User.created_at.desc()).all()


# ── Plan info ─────────────────────────────────────────────────────────────────
@router.get("/plan-info")
def plan_info(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin"]))
):
    """
    Returns the current plan, user limit, and how many users are active.
    Counts ALL users including admin/owner toward the limit.
    Superadmin is not subject to plan limits.
    """
    if current_user.role == SUPERADMIN_ROLE:
        return {
            "plan":       "enterprise",
            "max_users":  -1,
            "used_users": 0,
            "at_limit":   False,
        }

    business = db.query(Business).filter(
        Business.business_id == current_user.business_id
    ).first()

    plan   = business.plan if business else "starter"
    limits = get_plan_limits(plan)

    # Count ALL active users in this business including admin
    used_users = _count_business_users(db, current_user.business_id)

    return {
        "plan":       plan,
        "max_users":  limits["max_users"],  # -1 means unlimited
        "used_users": used_users,
        "at_limit":   is_user_limit_reached(plan, used_users),
    }


# ── Register ──────────────────────────────────────────────────────────────────
@router.post("/register")
def register(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin"]))
):
    # ── Basic validation ──────────────────────────────────────────────────────
    if len(user.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    # ── Plan limit check (superadmin is exempt) ───────────────────────────────
    if current_user.role != SUPERADMIN_ROLE:
        business = db.query(Business).filter(
            Business.business_id == current_user.business_id
        ).first()

        plan = business.plan if business else "starter"

        # Count ALL active users including admin
        current_count = _count_business_users(db, current_user.business_id)

        if is_user_limit_reached(plan, current_count):
            limits = get_plan_limits(plan)
            raise HTTPException(
                status_code=403,
                detail=(
                    f"User limit reached for your {plan.title()} plan "
                    f"({limits['max_users']} users allowed). "
                    f"Upgrade your plan to add more users."
                )
            )

    # ── Create the user ───────────────────────────────────────────────────────
    new_user = models.User(
        full_name=user.full_name,
        username=user.username,
        password_hash=hash_password(user.password),
        role=user.role,
        branch_id=getattr(user, "branch_id", None),
        business_id=getattr(user, "business_id", None),
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


class LoginRequest(BaseModel):
    username: str
    password: str


# ── Login ─────────────────────────────────────────────────────────────────────
@router.post("/login")
def login(
    form_data: LoginRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == form_data.username).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    if user.role != SUPERADMIN_ROLE and not user.branch_id:
        raise HTTPException(status_code=400, detail="User has no branch assigned")

    access_token = create_access_token({
        "sub":         user.username,
        "user_id":     user.user_id,
        "role":        user.role,
        "branch_id":   user.branch_id,
        "business_id": user.business_id,
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
            "business_id": user.business_id,
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