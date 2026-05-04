from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime

from app.database import get_db
from app import models
from app.dependencies import require_role, SUPERADMIN_ROLE
from app.auth import hash_password
from app.utils.plans import PLAN_LIMITS
from app.utils.features import DEFAULT_FEATURES, FEATURE_LABELS, get_features

router = APIRouter(prefix="/businesses", tags=["Businesses"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class BusinessCreate(BaseModel):
    name:       str
    address:    Optional[str] = None
    phone:      Optional[str] = None
    owner_name: Optional[str] = None

class BusinessUpdate(BaseModel):
    name:       Optional[str] = None
    address:    Optional[str] = None
    phone:      Optional[str] = None
    owner_name: Optional[str] = None
    is_active:  Optional[bool] = None

class BranchCreate(BaseModel):
    name:        str
    location:    Optional[str] = None
    business_id: int

class AdminCreate(BaseModel):
    full_name:   str
    username:    str
    password:    str
    business_id: int
    branch_id:   int

class PlanUpdate(BaseModel):
    plan: str   # solo | starter | business | enterprise

class FeatureUpdate(BaseModel):
    features: Dict[str, bool]   # partial update — only send changed flags


# ── List businesses ───────────────────────────────────────────────────────────
@router.get("/")
def list_businesses(
    db: Session = Depends(get_db),
    user=Depends(require_role([]))
):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    businesses = db.query(models.Business).order_by(models.Business.created_at.desc()).all()
    result = []
    for b in businesses:
        branch_count = db.query(models.Branch).filter(models.Branch.business_id == b.business_id).count()
        user_count   = db.query(models.User).filter(models.User.business_id == b.business_id).count()
        limits       = PLAN_LIMITS.get(b.plan, PLAN_LIMITS["starter"])
        result.append({
            "business_id":  b.business_id,
            "name":         b.name,
            "address":      b.address,
            "phone":        b.phone,
            "owner_name":   b.owner_name,
            "is_active":    b.is_active,
            "created_at":   b.created_at,
            "plan":         b.plan,
            "max_users":    limits["max_users"],
            "max_branches": limits["max_branches"],
            "branch_count": branch_count,
            "user_count":   user_count,
            "features":     get_features(b.features),
        })
    return result


# ── Create business ───────────────────────────────────────────────────────────
@router.post("/")
def create_business(
    data: BusinessCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role([]))
):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    business = models.Business(**data.dict())
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


# ── Update business ───────────────────────────────────────────────────────────
@router.patch("/{business_id}")
def update_business(
    business_id: int,
    data: BusinessUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role([]))
):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    for k, v in data.dict(exclude_none=True).items():
        setattr(biz, k, v)
    db.commit()
    db.refresh(biz)
    return biz


# ── Change plan ───────────────────────────────────────────────────────────────
@router.patch("/{business_id}/plan")
def update_plan(
    business_id: int,
    data: PlanUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role([]))
):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    valid_plans = list(PLAN_LIMITS.keys())
    if data.plan not in valid_plans:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan '{data.plan}'. Must be one of: {', '.join(valid_plans)}"
        )

    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    old_plan = biz.plan
    biz.plan = data.plan
    db.commit()
    db.refresh(biz)

    limits = PLAN_LIMITS[data.plan]
    return {
        "message":      f"Plan updated from {old_plan} to {data.plan}",
        "business_id":  biz.business_id,
        "name":         biz.name,
        "plan":         biz.plan,
        "max_users":    limits["max_users"],
        "max_branches": limits["max_branches"],
    }


# ── Get feature flags for a business ─────────────────────────────────────────
@router.get("/{business_id}/features")
def get_business_features(
    business_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role([]))
):
    """Returns resolved feature flags for a business (merges with defaults)."""
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    resolved = get_features(biz.features)
    return {
        "business_id": business_id,
        "name":        biz.name,
        "features":    resolved,
        "labels":      FEATURE_LABELS,
    }


# ── Update feature flags for a business ──────────────────────────────────────
@router.patch("/{business_id}/features")
def update_business_features(
    business_id: int,
    data: FeatureUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role([]))
):
    """
    Superadmin only — toggle feature flags for a specific business.
    Accepts a partial update — only the flags you send get changed.
    Unrecognised flag keys are silently ignored.
    """
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    # Only allow known flag keys
    valid_flags = set(DEFAULT_FEATURES.keys())
    incoming    = {k: v for k, v in data.features.items() if k in valid_flags}

    if not incoming:
        raise HTTPException(status_code=400, detail="No valid feature flags provided")

    # Merge with existing — preserve flags not being updated
    current  = biz.features or {}
    updated  = {**current, **incoming}
    biz.features = updated

    # SQLAlchemy won't detect in-place dict mutation — force update
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(biz, "features")

    db.commit()
    db.refresh(biz)

    return {
        "message":     f"Features updated for {biz.name}",
        "business_id": business_id,
        "features":    get_features(biz.features),
    }


# ── Current user's own feature flags ─────────────────────────────────────────
@router.get("/my/features")
def my_features(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager", "cashier"]))
):
    """
    Returns feature flags for the logged-in user's business.
    Used by the frontend FeatureContext on login.
    Superadmin gets all features enabled.
    """
    if user.role == SUPERADMIN_ROLE:
        return {f: True for f in DEFAULT_FEATURES}

    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()

    if not biz:
        return DEFAULT_FEATURES.copy()

    return get_features(biz.features)


# ── List branches ─────────────────────────────────────────────────────────────
@router.get("/{business_id}/branches")
def list_branches(
    business_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    if user.role != SUPERADMIN_ROLE and user.business_id != business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    branches = db.query(models.Branch).filter(
        models.Branch.business_id == business_id
    ).all()
    return branches


# ── Create branch ─────────────────────────────────────────────────────────────
@router.post("/branches")
def create_branch(
    data: BranchCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    if user.role != SUPERADMIN_ROLE and user.business_id != data.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    branch = models.Branch(
        name=data.name,
        location=data.location,
        business_id=data.business_id
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


# ── Create business admin ─────────────────────────────────────────────────────
@router.post("/admin")
def create_business_admin(
    data: AdminCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role([]))
):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    existing = db.query(models.User).filter(models.User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    admin = models.User(
        full_name=data.full_name,
        username=data.username,
        password_hash=hash_password(data.password),
        role="admin",
        business_id=data.business_id,
        branch_id=data.branch_id,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"message": "Admin created", "user_id": admin.user_id, "username": admin.username}