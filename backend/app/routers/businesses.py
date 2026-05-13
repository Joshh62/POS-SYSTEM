from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime

from app.database import get_db
from app import models
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE
from app.auth import hash_password
from app.utils.plans import PLAN_LIMITS
from app.utils.features import DEFAULT_FEATURES, FEATURE_LABELS, get_features

import cloudinary
import cloudinary.uploader
import os

router = APIRouter(prefix="/businesses", tags=["Businesses"])

# ── Plan branch limits ────────────────────────────────────────────────────────
PLAN_BRANCH_LIMITS = {
    "solo":       1,
    "starter":    1,
    "business":   3,
    "enterprise": -1,   # unlimited
}


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

class SelfBranchCreate(BaseModel):
    """Used by admins to create their own branches (self-service)."""
    name:     str
    location: Optional[str] = None

class AdminCreate(BaseModel):
    full_name:   str
    username:    str
    password:    str
    business_id: int
    branch_id:   int

class PlanUpdate(BaseModel):
    plan: str

class FeatureUpdate(BaseModel):
    features: Dict[str, bool]

class BrandingUpdate(BaseModel):
    name:        Optional[str] = None
    address:     Optional[str] = None
    phone:       Optional[str] = None
    email:       Optional[str] = None
    owner_name:  Optional[str] = None
    brand_color: Optional[str] = None
    report_hour: Optional[int] = None   # 0-23, Lagos time. Default 20 (8PM)

class BranchUpdate(BaseModel):
    name:     Optional[str] = None
    location: Optional[str] = None

class AccountDeletionRequest(BaseModel):
    confirm_text: str   # must equal "DELETE MY ACCOUNT"
    reason:       Optional[str] = None


def _configure_cloudinary():
    cloudinary.config(
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key    = os.getenv("CLOUDINARY_API_KEY"),
        api_secret = os.getenv("CLOUDINARY_API_SECRET"),
        secure     = True,
    )


# ── List businesses (superadmin) ──────────────────────────────────────────────
@router.get("/")
def list_businesses(db: Session = Depends(get_db), user=Depends(require_role([]))):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")

    businesses = db.query(models.Business).order_by(models.Business.created_at.desc()).all()
    result = []
    for b in businesses:
        branch_count = db.query(models.Branch).filter(models.Branch.business_id == b.business_id).count()
        user_count   = db.query(models.User).filter(models.User.business_id == b.business_id).count()
        limits       = PLAN_LIMITS.get(b.plan, PLAN_LIMITS["starter"])
        result.append({
            "business_id":   b.business_id,
            "name":          b.name,
            "address":       b.address,
            "phone":         b.phone,
            "owner_name":    b.owner_name,
            "is_active":     b.is_active,
            "created_at":    b.created_at,
            "plan":          b.plan,
            "max_users":     limits["max_users"],
            "max_branches":  limits["max_branches"],
            "branch_count":  branch_count,
            "user_count":    user_count,
            "features":      get_features(b.features),
            "subscription_status": b.subscription_status,
            "deletion_requested_at": b.deletion_requested_at if hasattr(b, "deletion_requested_at") else None,
        })
    return result


# ── Create business (superadmin) ──────────────────────────────────────────────
@router.post("/")
def create_business(data: BusinessCreate, db: Session = Depends(get_db), user=Depends(require_role([]))):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")
    business = models.Business(**data.dict())
    db.add(business); db.commit(); db.refresh(business)
    return business


# ── Update business (superadmin) ──────────────────────────────────────────────
@router.patch("/{business_id}")
def update_business(business_id: int, data: BusinessUpdate,
                    db: Session = Depends(get_db), user=Depends(require_role([]))):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")
    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    for k, v in data.dict(exclude_none=True).items():
        setattr(biz, k, v)
    db.commit(); db.refresh(biz)
    return biz


# ── Change plan (superadmin) ──────────────────────────────────────────────────
@router.patch("/{business_id}/plan")
def update_plan(business_id: int, data: PlanUpdate,
                db: Session = Depends(get_db), user=Depends(require_role([]))):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")
    valid_plans = list(PLAN_LIMITS.keys())
    if data.plan not in valid_plans:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Must be one of: {', '.join(valid_plans)}")
    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    old_plan = biz.plan; biz.plan = data.plan
    db.commit(); db.refresh(biz)
    limits = PLAN_LIMITS[data.plan]
    return {"message": f"Plan updated from {old_plan} to {data.plan}",
            "business_id": biz.business_id, "name": biz.name, "plan": biz.plan,
            "max_users": limits["max_users"], "max_branches": limits["max_branches"]}


# ── Feature flags (superadmin) ────────────────────────────────────────────────
@router.get("/{business_id}/features")
def get_business_features(business_id: int, db: Session = Depends(get_db), user=Depends(require_role([]))):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")
    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    return {"business_id": business_id, "name": biz.name,
            "features": get_features(biz.features), "labels": FEATURE_LABELS}


@router.patch("/{business_id}/features")
def update_business_features(business_id: int, data: FeatureUpdate,
                              db: Session = Depends(get_db), user=Depends(require_role([]))):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")
    biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    valid_flags = set(DEFAULT_FEATURES.keys())
    incoming    = {k: v for k, v in data.features.items() if k in valid_flags}
    if not incoming:
        raise HTTPException(status_code=400, detail="No valid feature flags provided")
    current  = biz.features or {}
    biz.features = {**current, **incoming}
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(biz, "features")
    db.commit(); db.refresh(biz)
    return {"message": f"Features updated for {biz.name}",
            "business_id": business_id, "features": get_features(biz.features)}


# ── My features ───────────────────────────────────────────────────────────────
@router.get("/my/features")
def my_features(db: Session = Depends(get_db),
                user=Depends(require_role(["admin", "manager", "cashier"]))):
    if user.role == SUPERADMIN_ROLE:
        return {f: True for f in DEFAULT_FEATURES}
    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz: return DEFAULT_FEATURES.copy()
    return get_features(biz.features)


# ══════════════════════════════════════════════════════════════════════════════
# BRANCH MANAGEMENT — SELF-SERVICE (admin on Business/Enterprise)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/my/branches")
def list_my_branches(db: Session = Depends(get_db),
                     user=Depends(require_role(["admin", "manager"]))):
    """Returns all branches for the current user's business."""
    branches = db.query(models.Branch).filter(
        models.Branch.business_id == user.business_id
    ).order_by(models.Branch.branch_id).all()
    return branches


@router.post("/my/branches")
def create_my_branch(data: SelfBranchCreate,
                     db: Session = Depends(get_db),
                     user=Depends(require_role(["admin"]))):
    """
    Self-service branch creation for admins on Business and Enterprise plans.
    Solo and Starter plans are limited to 1 branch and cannot add more.
    """
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    # Enforce plan branch limits
    plan       = biz.plan or "starter"
    max_branches = PLAN_BRANCH_LIMITS.get(plan, 1)

    current_count = db.query(models.Branch).filter(
        models.Branch.business_id == user.business_id
    ).count()

    if max_branches != -1 and current_count >= max_branches:
        plan_names  = {"solo": "Solo", "starter": "Starter",
                       "business": "Business", "enterprise": "Enterprise"}
        upgrade_to  = "Business" if plan in ("solo", "starter") else "Enterprise"
        raise HTTPException(
            status_code=403,
            detail=(
                f"Your {plan_names.get(plan, plan)} plan allows {max_branches} "
                f"branch{'es' if max_branches != 1 else ''}. "
                f"You currently have {current_count}. "
                f"Upgrade to {upgrade_to} to add more branches."
            )
        )

    # Validate name uniqueness within business
    existing = db.query(models.Branch).filter(
        models.Branch.business_id == user.business_id,
        models.Branch.name.ilike(data.name.strip())
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"A branch named '{data.name}' already exists.")

    branch = models.Branch(
        name=data.name.strip(),
        location=data.location,
        business_id=user.business_id,
    )
    db.add(branch)

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="CREATE",
        table_name="branches",
        record_id=0,
        description=f"Branch '{data.name}' created by admin {user.username}",
    ))

    db.commit(); db.refresh(branch)
    return {
        "branch_id":   branch.branch_id,
        "name":        branch.name,
        "location":    branch.location,
        "business_id": branch.business_id,
        "message":     f"Branch '{branch.name}' created successfully.",
    }


@router.patch("/my/branches/{branch_id}")
def update_my_branch(branch_id: int, data: BranchUpdate,
                     db: Session = Depends(get_db),
                     user=Depends(require_role(["admin"]))):
    """Admin can rename or update location of their own branches."""
    branch = db.query(models.Branch).filter(
        models.Branch.branch_id  == branch_id,
        models.Branch.business_id == user.business_id,
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    # Cannot rename the only branch
    branch_count = db.query(models.Branch).filter(
        models.Branch.business_id == user.business_id
    ).count()
    if branch_count == 1 and data.name and data.name.strip() != branch.name:
        pass  # Allow rename of single branch — it's just a rename

    if data.name:     branch.name     = data.name.strip()
    if data.location is not None: branch.location = data.location

    db.commit(); db.refresh(branch)
    return {"branch_id": branch.branch_id, "name": branch.name,
            "location": branch.location, "message": "Branch updated."}


@router.get("/my/branch-status")
def get_branch_status(db: Session = Depends(get_db),
                      user=Depends(require_role(["admin"]))):
    """Returns current branch count, limit, and whether admin can add more."""
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")

    plan         = biz.plan or "starter"
    max_branches = PLAN_BRANCH_LIMITS.get(plan, 1)
    current      = db.query(models.Branch).filter(
        models.Branch.business_id == user.business_id
    ).count()
    can_add      = max_branches == -1 or current < max_branches

    return {
        "plan":          plan,
        "current_count": current,
        "max_branches":  max_branches,
        "can_add":       can_add,
        "branches_left": None if max_branches == -1 else max(0, max_branches - current),
    }


# ══════════════════════════════════════════════════════════════════════════════
# ACCOUNT DELETION / GDPR
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/my/request-deletion")
def request_account_deletion(data: AccountDeletionRequest,
                              db: Session = Depends(get_db),
                              user=Depends(require_role(["admin"]))):
    """
    Admin requests deletion of their entire business account.

    - Requires typing 'DELETE MY ACCOUNT' to confirm
    - Sets deletion_requested_at timestamp on the business
    - Suspends the account immediately (no new logins for staff)
    - Data is fully deleted after 90 days by a scheduled job
    - Admin receives a WhatsApp confirmation

    This is irreversible after 90 days. To cancel within 90 days,
    contact support or call DELETE /my/cancel-deletion.
    """
    if data.confirm_text.strip().upper() != "DELETE MY ACCOUNT":
        raise HTTPException(
            status_code=400,
            detail="Confirmation text must be exactly: DELETE MY ACCOUNT"
        )

    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    if getattr(biz, "deletion_requested_at", None):
        raise HTTPException(
            status_code=400,
            detail="Account deletion already requested. Contact support to cancel."
        )

    now = datetime.utcnow()

    # Mark deletion requested — actual deletion happens after 90 days
    biz.subscription_status = "deletion_pending"
    if hasattr(biz, "deletion_requested_at"):
        biz.deletion_requested_at = now

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="DELETE_REQUEST",
        table_name="businesses",
        record_id=biz.business_id,
        description=(
            f"Account deletion requested by {user.username}. "
            f"Reason: {data.reason or 'Not provided'}. "
            f"Scheduled deletion: {now.strftime('%Y-%m-%d')} + 90 days."
        ),
    ))

    db.commit()

    # Send WhatsApp confirmation if business has a phone number
    try:
        _send_deletion_whatsapp(biz, user)
    except Exception as e:
        print(f"[Deletion] WhatsApp notification failed: {e}")

    return {
        "message": (
            "Account deletion request received. "
            "Your account access has been suspended. "
            "All data will be permanently deleted in 90 days. "
            "To cancel this request within 90 days, contact support: "
            "+234 815 458 6355 or profittrackng@gmail.com"
        ),
        "deletion_scheduled": True,
        "data_deleted_after": "90 days from today",
        "cancel_contact":     "+234 815 458 6355",
    }


@router.delete("/my/cancel-deletion")
def cancel_account_deletion(db: Session = Depends(get_db),
                             user=Depends(get_current_user)):
    """
    Cancel a pending account deletion request.
    Can be called by the admin or by superadmin on their behalf.
    Must be within the 90-day window.
    """
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    if biz.subscription_status != "deletion_pending":
        raise HTTPException(status_code=400, detail="No pending deletion request found.")

    # Restore to previous status
    biz.subscription_status = "cancelled"   # keeps data, no active subscription
    if hasattr(biz, "deletion_requested_at"):
        biz.deletion_requested_at = None

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="DELETE_CANCELLED",
        table_name="businesses",
        record_id=biz.business_id,
        description=f"Account deletion cancelled by {user.username}.",
    ))
    db.commit()

    return {
        "message": "Account deletion cancelled. Your data has been retained. "
                   "You can reactivate your subscription from Plan & Billing.",
    }


def _send_deletion_whatsapp(biz, user):
    import os
    from twilio.rest import Client

    TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID")
    TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
    FROM_NUMBER  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    if not TWILIO_SID or not TWILIO_TOKEN or not biz.phone:
        return

    phone = biz.phone.strip()
    if not phone.startswith("+"): phone = "+234" + phone.lstrip("0")

    client = Client(TWILIO_SID, TWILIO_TOKEN)
    client.messages.create(
        from_=FROM_NUMBER,
        to=f"whatsapp:{phone}",
        body=(
            f"⚠️ ProfitTrack Account Deletion Requested\n\n"
            f"Hi {user.full_name or user.username},\n\n"
            f"We've received a request to delete the ProfitTrack account for "
            f"*{biz.name}*.\n\n"
            f"Your account has been suspended. All data will be permanently "
            f"deleted in *90 days*.\n\n"
            f"If this was a mistake, contact us within 90 days:\n"
            f"📱 +234 815 458 6355\n"
            f"📧 profittrackng@gmail.com\n\n"
            f"— ProfitTrack"
        ),
    )


# ══════════════════════════════════════════════════════════════════════════════
# BRANDING (unchanged)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/my/branding")
def get_my_branding(db: Session = Depends(get_db),
                    user=Depends(require_role(["admin", "manager", "cashier"]))):
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    return {
        "business_id": biz.business_id, "name": biz.name,
        "address": biz.address, "phone": biz.phone, "email": biz.email,
        "owner_name": biz.owner_name, "logo_url": biz.logo_url,
        "brand_color": biz.brand_color or "#185FA5", "plan": biz.plan,
        "report_hour": getattr(biz, "report_hour", 20),
    }


@router.patch("/my/branding")
def update_my_branding(data: BrandingUpdate, db: Session = Depends(get_db),
                       user=Depends(require_role(["admin"]))):
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")

    if data.name        is not None: biz.name        = data.name.strip()
    if data.address     is not None: biz.address     = data.address.strip()
    if data.phone       is not None: biz.phone       = data.phone.strip()
    if data.email       is not None: biz.email       = data.email.strip()
    if data.owner_name  is not None: biz.owner_name  = data.owner_name.strip()
    if data.brand_color is not None:
        color = data.brand_color.strip()
        if not (color.startswith("#") and len(color) in (4, 7)):
            raise HTTPException(status_code=400, detail="brand_color must be a valid hex color e.g. #185FA5")
        biz.brand_color = color
    if data.report_hour is not None:
        if not (0 <= data.report_hour <= 23):
            raise HTTPException(status_code=400, detail="report_hour must be between 0 and 23")
        if hasattr(biz, "report_hour"):
            biz.report_hour = data.report_hour

    db.add(models.AuditLog(user_id=user.user_id, action="UPDATE",
        table_name="businesses", record_id=biz.business_id,
        description=f"Branding settings updated for '{biz.name}'"))
    db.commit(); db.refresh(biz)
    return {"business_id": biz.business_id, "name": biz.name, "address": biz.address,
            "phone": biz.phone, "email": biz.email, "owner_name": biz.owner_name,
            "logo_url": biz.logo_url, "brand_color": biz.brand_color or "#185FA5"}


@router.post("/my/logo")
async def upload_logo(file: UploadFile = File(...), db: Session = Depends(get_db),
                      user=Depends(require_role(["admin"]))):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP, or SVG files are accepted")
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo must be under 2MB")
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    _configure_cloudinary()
    try:
        if biz.logo_url and "cloudinary" in biz.logo_url:
            try:
                cloudinary.uploader.destroy(f"profittrack/{user.business_id}/logo")
            except Exception: pass
        result = cloudinary.uploader.upload(contents,
            folder=f"profittrack/{user.business_id}", public_id="logo",
            overwrite=True, resource_type="image",
            transformation=[{"width":400,"height":400,"crop":"limit"},
                            {"quality":"auto"},{"fetch_format":"auto"}])
        logo_url = result["secure_url"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logo upload failed: {str(e)}")
    biz.logo_url = logo_url
    db.add(models.AuditLog(user_id=user.user_id, action="UPDATE",
        table_name="businesses", record_id=biz.business_id,
        description=f"Logo updated for '{biz.name}'"))
    db.commit()
    return {"logo_url": logo_url, "message": "Logo uploaded successfully"}


@router.delete("/my/logo")
def delete_logo(db: Session = Depends(get_db), user=Depends(require_role(["admin"]))):
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    if biz.logo_url and "cloudinary" in biz.logo_url:
        _configure_cloudinary()
        try: cloudinary.uploader.destroy(f"profittrack/{user.business_id}/logo")
        except Exception: pass
    biz.logo_url = None; db.commit()
    return {"message": "Logo removed"}


# ── Superadmin branch creation (unchanged) ────────────────────────────────────
@router.get("/{business_id}/branches")
def list_branches(business_id: int, db: Session = Depends(get_db),
                  user=Depends(require_role(["admin"]))):
    if user.role != SUPERADMIN_ROLE and user.business_id != business_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(models.Branch).filter(
        models.Branch.business_id == business_id).all()


@router.post("/branches")
def create_branch(data: BranchCreate, db: Session = Depends(get_db),
                  user=Depends(require_role(["admin"]))):
    if user.role != SUPERADMIN_ROLE and user.business_id != data.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    branch = models.Branch(name=data.name, location=data.location,
                           business_id=data.business_id)
    db.add(branch); db.commit(); db.refresh(branch)
    return branch


@router.post("/admin")
def create_business_admin(data: AdminCreate, db: Session = Depends(get_db),
                          user=Depends(require_role([]))):
    if user.role != SUPERADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Superadmin only")
    existing = db.query(models.User).filter(models.User.username == data.username).first()
    if existing: raise HTTPException(status_code=400, detail="Username already exists")
    admin = models.User(full_name=data.full_name, username=data.username,
        password_hash=hash_password(data.password), role="admin",
        business_id=data.business_id, branch_id=data.branch_id, is_active=True)
    db.add(admin); db.commit(); db.refresh(admin)
    return {"message": "Admin created", "user_id": admin.user_id, "username": admin.username}