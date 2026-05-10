from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
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

import cloudinary
import cloudinary.uploader
import os

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

class BrandingUpdate(BaseModel):
    name:        Optional[str] = None
    address:     Optional[str] = None
    phone:       Optional[str] = None
    email:       Optional[str] = None
    owner_name:  Optional[str] = None
    brand_color: Optional[str] = None   # hex color e.g. "#185FA5"
 
 
def _configure_cloudinary():
    cloudinary.config(
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key    = os.getenv("CLOUDINARY_API_KEY"),
        api_secret = os.getenv("CLOUDINARY_API_SECRET"),
        secure     = True,
    )


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


# ── GET my business branding ──────────────────────────────────────────────────
@router.get("/my/branding")
def get_my_branding(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager", "cashier"]))
):
    """Returns branding info for the current user's business. Used to render
    the invoice, receipts, and WhatsApp messages with correct shop details."""
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
 
    return {
        "business_id": biz.business_id,
        "name":        biz.name,
        "address":     biz.address,
        "phone":       biz.phone,
        "email":       biz.email,
        "owner_name":  biz.owner_name,
        "logo_url":    biz.logo_url,
        "brand_color": biz.brand_color or "#185FA5",
        "plan":        biz.plan,
    }
 
 
# ── UPDATE branding settings ──────────────────────────────────────────────────
@router.patch("/my/branding")
def update_my_branding(
    data: BrandingUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    """Admin updates business name, address, phone, email, brand color."""
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
 
    if data.name        is not None: biz.name        = data.name.strip()
    if data.address     is not None: biz.address     = data.address.strip()
    if data.phone       is not None: biz.phone       = data.phone.strip()
    if data.email       is not None: biz.email       = data.email.strip()
    if data.owner_name  is not None: biz.owner_name  = data.owner_name.strip()
    if data.brand_color is not None:
        # Validate hex color
        color = data.brand_color.strip()
        if not (color.startswith("#") and len(color) in (4, 7)):
            raise HTTPException(status_code=400, detail="brand_color must be a valid hex color e.g. #185FA5")
        biz.brand_color = color
 
    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="businesses",
        record_id=biz.business_id,
        description=f"Branding settings updated for '{biz.name}'",
    ))
 
    db.commit()
    db.refresh(biz)
 
    return {
        "business_id": biz.business_id,
        "name":        biz.name,
        "address":     biz.address,
        "phone":       biz.phone,
        "email":       biz.email,
        "owner_name":  biz.owner_name,
        "logo_url":    biz.logo_url,
        "brand_color": biz.brand_color or "#185FA5",
    }
 
 
# ── UPLOAD logo ───────────────────────────────────────────────────────────────
@router.post("/my/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    """
    Upload a business logo to Cloudinary.
    Accepts: JPG, PNG, WebP, SVG
    Max size: 2MB
    Returns the Cloudinary URL stored on the business record.
    """
    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG, WebP, or SVG files are accepted"
        )
 
    # Validate file size (2MB max)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo must be under 2MB")
 
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
 
    # Configure and upload to Cloudinary
    _configure_cloudinary()
    try:
        # Delete old logo if exists
        if biz.logo_url and "cloudinary" in biz.logo_url:
            # Extract public_id from URL
            try:
                public_id = biz.logo_url.split("/")[-1].split(".")[0]
                folder_id = f"profittrack/{user.business_id}"
                cloudinary.uploader.destroy(f"{folder_id}/{public_id}")
            except Exception:
                pass  # Don't fail if old logo deletion fails
 
        result = cloudinary.uploader.upload(
            contents,
            folder=f"profittrack/{user.business_id}",
            public_id="logo",
            overwrite=True,
            resource_type="image",
            transformation=[
                {"width": 400, "height": 400, "crop": "limit"},  # max 400x400
                {"quality": "auto"},
                {"fetch_format": "auto"},
            ],
        )
        logo_url = result["secure_url"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logo upload failed: {str(e)}")
 
    biz.logo_url = logo_url
 
    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="businesses",
        record_id=biz.business_id,
        description=f"Logo updated for '{biz.name}'",
    ))
 
    db.commit()
    return {"logo_url": logo_url, "message": "Logo uploaded successfully"}
 
 
# ── DELETE logo ───────────────────────────────────────────────────────────────
@router.delete("/my/logo")
def delete_logo(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
 
    if biz.logo_url and "cloudinary" in biz.logo_url:
        _configure_cloudinary()
        try:
            folder_id = f"profittrack/{user.business_id}"
            cloudinary.uploader.destroy(f"{folder_id}/logo")
        except Exception:
            pass
 
    biz.logo_url = None
    db.commit()
    return {"message": "Logo removed"}