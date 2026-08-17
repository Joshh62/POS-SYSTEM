from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.utils.loyalty_service import (
    INACTIVITY_MONTHS,
    discount_for,
    expire_loyalty,
    locked_loyalty,
    scoped_customer,
)

router = APIRouter(prefix="/loyalty", tags=["Loyalty"])


class LoyaltySettingsUpdate(BaseModel):
    loyalty_earn_rate: Optional[float] = Field(default=None, gt=0)
    loyalty_redeem_rate: Optional[float] = Field(default=None, gt=0)


class RedeemRequest(BaseModel):
    customer_id: int = Field(gt=0)
    points: int = Field(gt=0)
    sale_id: int = Field(gt=0)


def _business(db, user):
    business = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


def _scoped_sale(db, sale_id: int, customer_id: int, user):
    sale = db.query(models.Sale).filter(models.Sale.sale_id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    branch = db.query(models.Branch).filter(
        models.Branch.branch_id == sale.branch_id
    ).first()
    if not branch or branch.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Sale is outside your business")
    if sale.customer_id != customer_id:
        raise HTTPException(status_code=409, detail="Sale customer does not match")
    return sale


def _rollback_http(db, exc):
    db.rollback()
    raise exc


@router.get("/customer/{customer_id}")
def get_customer_loyalty(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    customer = scoped_customer(db, customer_id, user.business_id)
    loyalty = locked_loyalty(db, customer_id, user.business_id, create=False)
    business = _business(db, user)
    balance = loyalty.points_balance if loyalty else 0
    return {
        "customer_id": customer_id,
        "customer_name": customer.full_name,
        "points_balance": balance,
        "lifetime_earned": loyalty.lifetime_earned if loyalty else 0,
        "lifetime_redeemed": loyalty.lifetime_redeemed if loyalty else 0,
        "lifetime_expired": loyalty.lifetime_expired if loyalty else 0,
        "points_value": float(discount_for(balance, business.loyalty_redeem_rate or 5)),
        "earn_rate": float(business.loyalty_earn_rate or 1),
        "redeem_rate": float(business.loyalty_redeem_rate or 5),
        "last_activity_at": loyalty.last_activity_at if loyalty else None,
        "expired_now": 0,
    }


@router.post("/earn")
def earn_points(
    customer_id: int,
    sale_amount: float,
    sale_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Compatibility endpoint: return the sale-transaction posting once."""
    sale = _scoped_sale(db, sale_id, customer_id, user)
    tx = db.query(models.LoyaltyTransaction).filter(
        models.LoyaltyTransaction.sale_id == sale.sale_id,
        models.LoyaltyTransaction.tx_type == "earn",
        models.LoyaltyTransaction.business_id == user.business_id,
    ).first()
    if not tx:
        raise HTTPException(
            status_code=409,
            detail="Loyalty earning must be posted atomically during sale creation",
        )
    if round(float(tx.monetary_amount), 2) != round(float(sale_amount), 2):
        raise HTTPException(status_code=409, detail="Sale amount does not match loyalty evidence")
    return {
        "points_earned": tx.points,
        "points_balance": tx.balance_after,
        "points_value": float(
            discount_for(tx.balance_after, _business(db, user).loyalty_redeem_rate or 5)
        ),
        "message": "Loyalty earning already posted with the sale",
    }


@router.get("/redeem/preview")
def preview_redemption(
    customer_id: int,
    points: int,
    sale_total: float,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if points <= 0 or sale_total <= 0:
        raise HTTPException(status_code=400, detail="Points and sale total must be positive")
    scoped_customer(db, customer_id, user.business_id)
    loyalty = locked_loyalty(db, customer_id, user.business_id, create=False)
    if not loyalty or points > loyalty.points_balance:
        raise HTTPException(status_code=409, detail="Insufficient loyalty points")
    business = _business(db, user)
    discount = discount_for(points, business.loyalty_redeem_rate or 5)
    if discount > sale_total:
        raise HTTPException(status_code=409, detail="Loyalty discount exceeds sale total")
    return {
        "points_to_redeem": points,
        "discount_amount": float(discount),
        "original_total": round(float(sale_total), 2),
        "new_total": round(float(sale_total) - float(discount), 2),
        "points_remaining": loyalty.points_balance - points,
        "redeem_rate": float(business.loyalty_redeem_rate or 5),
    }


@router.post("/redeem")
def redeem_points(
    data: RedeemRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Compatibility endpoint: return the sale-transaction redemption once."""
    sale = _scoped_sale(db, data.sale_id, data.customer_id, user)
    tx = db.query(models.LoyaltyTransaction).filter(
        models.LoyaltyTransaction.sale_id == sale.sale_id,
        models.LoyaltyTransaction.tx_type == "redeem",
        models.LoyaltyTransaction.business_id == user.business_id,
    ).first()
    if not tx:
        raise HTTPException(
            status_code=409,
            detail="Loyalty redemption must be posted atomically during sale creation",
        )
    if -tx.points != data.points:
        raise HTTPException(status_code=409, detail="Redeemed points do not match sale evidence")
    return {
        "points_redeemed": -tx.points,
        "discount_amount": float(tx.monetary_amount),
        "points_remaining": tx.balance_after,
        "points_value": float(
            discount_for(tx.balance_after, _business(db, user).loyalty_redeem_rate or 5)
        ),
        "message": "Loyalty redemption already posted with the sale",
    }


@router.get("/customer/{customer_id}/history")
def loyalty_history(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    scoped_customer(db, customer_id, user.business_id)
    txs = db.query(models.LoyaltyTransaction).filter(
        models.LoyaltyTransaction.customer_id == customer_id,
        models.LoyaltyTransaction.business_id == user.business_id,
    ).order_by(models.LoyaltyTransaction.created_at.desc()).limit(50).all()
    return [
        {
            "tx_id": tx.tx_id,
            "tx_type": tx.tx_type,
            "points": tx.points,
            "balance_before": tx.balance_before,
            "balance_after": tx.balance_after,
            "monetary_amount": float(tx.monetary_amount),
            "description": tx.description,
            "sale_id": tx.sale_id,
            "created_at": tx.created_at,
        }
        for tx in txs
    ]


@router.get("/settings")
def get_loyalty_settings(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    business = _business(db, user)
    earn_rate = float(business.loyalty_earn_rate or 1)
    redeem_rate = float(business.loyalty_redeem_rate or 5)
    return {
        "earn_rate": earn_rate,
        "redeem_rate": redeem_rate,
        "earn_description": f"{earn_rate} point(s) per ₦100 spent",
        "redeem_description": f"₦{redeem_rate} value per point",
        "effective_rate": f"{earn_rate * redeem_rate:.1f}% effective discount",
    }


@router.patch("/settings")
def update_loyalty_settings(
    data: LoyaltySettingsUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"])),
):
    try:
        business = _business(db, user)
        if data.loyalty_earn_rate is not None:
            business.loyalty_earn_rate = data.loyalty_earn_rate
        if data.loyalty_redeem_rate is not None:
            business.loyalty_redeem_rate = data.loyalty_redeem_rate
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="LOYALTY_SETTINGS_UPDATE",
            table_name="businesses",
            record_id=business.business_id,
            description=(
                f"Loyalty settings updated: earn={business.loyalty_earn_rate}, "
                f"redeem={business.loyalty_redeem_rate}"
            ),
        ))
        db.commit()
        return {
            "earn_rate": float(business.loyalty_earn_rate),
            "redeem_rate": float(business.loyalty_redeem_rate),
            "message": "Loyalty settings updated successfully",
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Loyalty settings conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Loyalty settings update failed") from exc


@router.post("/expire-stale")
def expire_stale_points_batch(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"])),
):
    try:
        cutoff = datetime.utcnow() - timedelta(days=INACTIVITY_MONTHS * 30)
        stale = db.query(models.CustomerLoyalty).filter(
            models.CustomerLoyalty.points_balance > 0,
            models.CustomerLoyalty.last_activity_at < cutoff,
            models.CustomerLoyalty.business_id == user.business_id,
        ).order_by(models.CustomerLoyalty.loyalty_id).with_for_update().all()
        expired_count = 0
        total_expired = 0
        for loyalty in stale:
            expired = expire_loyalty(db, loyalty, user.user_id)
            if expired:
                expired_count += 1
                total_expired += expired
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="LOYALTY_EXPIRY_BATCH",
            table_name="customer_loyalty",
            record_id=user.business_id,
            description=(
                f"Expired {total_expired} points from {expired_count} loyalty accounts"
            ),
        ))
        db.commit()
        return {
            "customers_affected": expired_count,
            "total_points_expired": total_expired,
            "message": (
                f"Expired {total_expired} points from {expired_count} inactive accounts"
            ),
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Loyalty expiry conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Loyalty expiry failed") from exc
