from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import math

from app.database import get_db
from app import models
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE

router = APIRouter(prefix="/loyalty", tags=["Loyalty"])

INACTIVITY_MONTHS = 6   # points expire after 6 months of no activity


# ── Schemas ───────────────────────────────────────────────────────────────────
class LoyaltySettingsUpdate(BaseModel):
    loyalty_earn_rate:   Optional[float] = None   # points per ₦100 spent
    loyalty_redeem_rate: Optional[float] = None   # naira value per point


class RedeemRequest(BaseModel):
    customer_id: int
    points:      int        # how many points to redeem
    sale_id:     Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_or_create_loyalty(db, customer_id: int, business_id: int) -> models.CustomerLoyalty:
    """Get existing loyalty record or create one."""
    loyalty = db.query(models.CustomerLoyalty).filter(
        models.CustomerLoyalty.customer_id == customer_id,
        models.CustomerLoyalty.business_id == business_id,
    ).first()

    if not loyalty:
        loyalty = models.CustomerLoyalty(
            business_id=business_id,
            customer_id=customer_id,
            points_balance=0,
            lifetime_earned=0,
            lifetime_redeemed=0,
            last_activity_at=datetime.utcnow(),
        )
        db.add(loyalty)
        db.flush()

    return loyalty


def _get_business(db, user) -> models.Business:
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")
    return biz


def _calc_points(amount: float, earn_rate: float) -> int:
    """Calculate points earned for a given sale amount."""
    # earn_rate = points per ₦100
    return math.floor((amount / 100) * earn_rate)


def _calc_discount(points: int, redeem_rate: float) -> float:
    """Calculate naira discount for a given number of points."""
    # redeem_rate = naira value per point
    return points * redeem_rate


def _expire_stale_points(db, loyalty: models.CustomerLoyalty, user_id: int) -> int:
    """
    Expire points if customer has been inactive for 6+ months.
    Returns number of points expired (0 if none).
    """
    if loyalty.points_balance <= 0:
        return 0

    cutoff = datetime.utcnow() - timedelta(days=INACTIVITY_MONTHS * 30)
    if loyalty.last_activity_at and loyalty.last_activity_at > cutoff:
        return 0   # still active — don't expire

    expired = loyalty.points_balance
    loyalty.points_balance   = 0
    loyalty.last_activity_at = datetime.utcnow()

    db.add(models.LoyaltyTransaction(
        loyalty_id  = loyalty.loyalty_id,
        business_id = loyalty.business_id,
        customer_id = loyalty.customer_id,
        user_id     = user_id,
        tx_type     = "expire",
        points      = -expired,
        description = f"{expired} points expired after {INACTIVITY_MONTHS} months of inactivity",
    ))

    return expired


# ── Get customer loyalty info ─────────────────────────────────────────────────
@router.get("/customer/{customer_id}")
def get_customer_loyalty(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Get loyalty balance and history for a customer. Used at checkout."""
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    biz = _get_business(db, user)

    # Expire stale points first
    loyalty = _get_or_create_loyalty(db, customer_id, user.business_id)
    expired = _expire_stale_points(db, loyalty, user.user_id)
    if expired:
        db.commit()
        db.refresh(loyalty)

    earn_rate   = float(biz.loyalty_earn_rate   or 1)
    redeem_rate = float(biz.loyalty_redeem_rate or 5)

    return {
        "customer_id":       customer_id,
        "customer_name":     customer.full_name,
        "points_balance":    loyalty.points_balance,
        "lifetime_earned":   loyalty.lifetime_earned,
        "lifetime_redeemed": loyalty.lifetime_redeemed,
        "points_value":      _calc_discount(loyalty.points_balance, redeem_rate),
        "earn_rate":         earn_rate,
        "redeem_rate":       redeem_rate,
        "last_activity_at":  loyalty.last_activity_at,
        "expired_now":       expired,
    }


# ── Earn points (called after sale completes) ─────────────────────────────────
@router.post("/earn")
def earn_points(
    customer_id: int,
    sale_amount: float,
    sale_id:     Optional[int] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Award loyalty points to a customer after a completed sale.
    Called automatically by the sales flow — not by cashier manually.
    Points not awarded for credit sales.
    """
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    biz       = _get_business(db, user)
    earn_rate = float(biz.loyalty_earn_rate or 1)
    points    = _calc_points(sale_amount, earn_rate)

    if points <= 0:
        return {"points_earned": 0, "message": "No points earned (amount too small)"}

    loyalty = _get_or_create_loyalty(db, customer_id, user.business_id)

    # Check and expire stale points before adding new ones
    _expire_stale_points(db, loyalty, user.user_id)

    loyalty.points_balance   += points
    loyalty.lifetime_earned  += points
    loyalty.last_activity_at  = datetime.utcnow()

    db.add(models.LoyaltyTransaction(
        loyalty_id  = loyalty.loyalty_id,
        business_id = user.business_id,
        customer_id = customer_id,
        user_id     = user.user_id,
        tx_type     = "earn",
        points      = points,
        sale_id     = sale_id,
        description = f"Earned {points} points on ₦{sale_amount:,.2f} purchase",
    ))

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="customer_loyalty",
        record_id=loyalty.loyalty_id,
        description=f"{customer.full_name} earned {points} loyalty points (sale ₦{sale_amount:,.2f})",
    ))

    db.commit()
    db.refresh(loyalty)

    redeem_rate  = float(biz.loyalty_redeem_rate or 5)
    points_value = _calc_discount(loyalty.points_balance, redeem_rate)

    return {
        "points_earned":   points,
        "points_balance":  loyalty.points_balance,
        "points_value":    points_value,
        "customer_name":   customer.full_name,
        "customer_phone":  customer.phone,
        "message":         f"Earned {points} points. Total: {loyalty.points_balance} pts (worth ₦{points_value:,.2f})",
    }


# ── Preview redemption ────────────────────────────────────────────────────────
@router.get("/redeem/preview")
def preview_redemption(
    customer_id:  int,
    points:       int,
    sale_total:   float,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Preview how much discount applying X points would give.
    Used at checkout to show cashier the discount before confirming.
    """
    loyalty = db.query(models.CustomerLoyalty).filter(
        models.CustomerLoyalty.customer_id == customer_id,
        models.CustomerLoyalty.business_id == user.business_id,
    ).first()

    if not loyalty or loyalty.points_balance <= 0:
        raise HTTPException(status_code=400, detail="Customer has no loyalty points")

    if points > loyalty.points_balance:
        raise HTTPException(status_code=400, detail=f"Customer only has {loyalty.points_balance} points")

    biz         = _get_business(db, user)
    redeem_rate = float(biz.loyalty_redeem_rate or 5)
    discount    = float(_calc_discount(points, redeem_rate))
    sale_total  = float(sale_total)
    new_total   = max(0.0, sale_total - discount)

    return {
        "points_to_redeem":    points,
        "discount_amount":     round(discount, 2),
        "original_total":      round(sale_total, 2),
        "new_total":           round(new_total, 2),
        "points_remaining":    loyalty.points_balance - points,
        "redeem_rate":         redeem_rate,
    }


# ── Redeem points ─────────────────────────────────────────────────────────────
@router.post("/redeem")
def redeem_points(
    data: RedeemRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)   # all roles — cashier can redeem
):
    """
    Redeem loyalty points for a discount on a sale.
    Only valid for direct sales — not credit/charge-to-account.
    Returns the discount amount to apply to the sale total.
    """
    if data.points <= 0:
        raise HTTPException(status_code=400, detail="Points must be greater than zero")

    loyalty = db.query(models.CustomerLoyalty).filter(
        models.CustomerLoyalty.customer_id == data.customer_id,
        models.CustomerLoyalty.business_id == user.business_id,
    ).first()

    if not loyalty:
        raise HTTPException(status_code=404, detail="No loyalty record found for this customer")

    if loyalty.points_balance <= 0:
        raise HTTPException(status_code=400, detail="Customer has no loyalty points")

    if data.points > loyalty.points_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient points. Available: {loyalty.points_balance}, requested: {data.points}"
        )

    biz         = _get_business(db, user)
    redeem_rate = float(biz.loyalty_redeem_rate or 5)
    discount    = float(_calc_discount(data.points, redeem_rate))

    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == data.customer_id
    ).first()

    loyalty.points_balance    -= data.points
    loyalty.lifetime_redeemed += data.points
    loyalty.last_activity_at   = datetime.utcnow()

    db.add(models.LoyaltyTransaction(
        loyalty_id  = loyalty.loyalty_id,
        business_id = user.business_id,
        customer_id = data.customer_id,
        user_id     = user.user_id,
        tx_type     = "redeem",
        points      = -data.points,
        sale_id     = data.sale_id,
        description = f"Redeemed {data.points} points for ₦{discount:,.2f} discount",
    ))

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="customer_loyalty",
        record_id=loyalty.loyalty_id,
        description=f"{customer.full_name if customer else 'Customer'} redeemed {data.points} points — ₦{discount:,.2f} discount",
    ))

    db.commit()
    db.refresh(loyalty)

    return {
        "points_redeemed":  data.points,
        "discount_amount":  round(discount, 2),
        "points_remaining": loyalty.points_balance,
        "points_value":     float(_calc_discount(loyalty.points_balance, redeem_rate)),
        "message":          f"Redeemed {data.points} points for ₦{discount:,.2f} discount. Remaining: {loyalty.points_balance} pts",
    }


# ── Get loyalty transaction history ──────────────────────────────────────────
@router.get("/customer/{customer_id}/history")
def loyalty_history(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    txs = db.query(models.LoyaltyTransaction).filter(
        models.LoyaltyTransaction.customer_id == customer_id,
        models.LoyaltyTransaction.business_id == user.business_id,
    ).order_by(models.LoyaltyTransaction.created_at.desc()).limit(50).all()

    return [
        {
            "tx_id":       t.tx_id,
            "tx_type":     t.tx_type,
            "points":      t.points,
            "description": t.description,
            "sale_id":     t.sale_id,
            "created_at":  t.created_at,
        }
        for t in txs
    ]


# ── Loyalty settings (admin only) ─────────────────────────────────────────────
@router.get("/settings")
def get_loyalty_settings(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    biz = _get_business(db, user)
    earn_rate   = float(biz.loyalty_earn_rate   or 1)
    redeem_rate = float(biz.loyalty_redeem_rate or 5)
    return {
        "earn_rate":         earn_rate,
        "redeem_rate":       redeem_rate,
        "earn_description":  f"{earn_rate} point(s) per ₦100 spent",
        "redeem_description": f"₦{redeem_rate} value per point (100 pts = ₦{100 * redeem_rate:,.0f} discount)",
        "effective_rate":    f"{(earn_rate * redeem_rate) / 100 * 100:.1f}% effective discount",
    }


@router.patch("/settings")
def update_loyalty_settings(
    data: LoyaltySettingsUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    biz = _get_business(db, user)

    if data.loyalty_earn_rate is not None:
        if data.loyalty_earn_rate <= 0:
            raise HTTPException(status_code=400, detail="Earn rate must be greater than 0")
        biz.loyalty_earn_rate = data.loyalty_earn_rate

    if data.loyalty_redeem_rate is not None:
        if data.loyalty_redeem_rate <= 0:
            raise HTTPException(status_code=400, detail="Redeem rate must be greater than 0")
        biz.loyalty_redeem_rate = data.loyalty_redeem_rate

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="businesses",
        record_id=biz.business_id,
        description=f"Loyalty settings updated: earn={biz.loyalty_earn_rate} pts/₦100, redeem=₦{biz.loyalty_redeem_rate}/pt",
    ))

    db.commit()
    db.refresh(biz)

    return {
        "earn_rate":   float(biz.loyalty_earn_rate),
        "redeem_rate": float(biz.loyalty_redeem_rate),
        "message":     "Loyalty settings updated successfully",
    }


# ── Expire stale points — called by scheduler ─────────────────────────────────
@router.post("/expire-stale")
def expire_stale_points_batch(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    """
    Admin-triggered batch expiry of stale points.
    Also called by scheduler monthly.
    """
    cutoff = datetime.utcnow() - timedelta(days=INACTIVITY_MONTHS * 30)

    stale = db.query(models.CustomerLoyalty).filter(
        models.CustomerLoyalty.points_balance  > 0,
        models.CustomerLoyalty.last_activity_at < cutoff,
        models.CustomerLoyalty.business_id == user.business_id,
    ).all()

    expired_count    = 0
    total_pts_expired = 0

    for loyalty in stale:
        pts = _expire_stale_points(db, loyalty, user.user_id)
        if pts > 0:
            expired_count     += 1
            total_pts_expired += pts

    db.commit()

    return {
        "customers_affected": expired_count,
        "total_points_expired": total_pts_expired,
        "message": f"Expired {total_pts_expired} points from {expired_count} inactive accounts",
    }