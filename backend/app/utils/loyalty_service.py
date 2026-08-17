from datetime import datetime, timedelta
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP

from fastapi import HTTPException

from app import models


INACTIVITY_MONTHS = 6
MONEY = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(MONEY, rounding=ROUND_HALF_UP)


def points_for(amount, earn_rate) -> int:
    value = money(amount)
    rate = Decimal(str(earn_rate))
    return int(((value / Decimal("100")) * rate).to_integral_value(rounding=ROUND_FLOOR))


def discount_for(points: int, redeem_rate) -> Decimal:
    return money(Decimal(points) * Decimal(str(redeem_rate)))


def scoped_customer(db, customer_id: int, business_id: int):
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if customer.business_id != business_id:
        raise HTTPException(status_code=403, detail="Customer is outside your business")
    return customer


def locked_loyalty(db, customer_id: int, business_id: int, *, create: bool):
    loyalty = db.query(models.CustomerLoyalty).filter(
        models.CustomerLoyalty.customer_id == customer_id,
        models.CustomerLoyalty.business_id == business_id,
    ).with_for_update().first()
    if loyalty or not create:
        return loyalty
    loyalty = models.CustomerLoyalty(
        business_id=business_id,
        customer_id=customer_id,
        points_balance=0,
        lifetime_earned=0,
        lifetime_redeemed=0,
        lifetime_expired=0,
        last_activity_at=datetime.utcnow(),
    )
    db.add(loyalty)
    db.flush()
    return loyalty


def expire_loyalty(db, loyalty, user_id: int, *, now=None) -> int:
    current_time = now or datetime.utcnow()
    cutoff = current_time - timedelta(days=INACTIVITY_MONTHS * 30)
    if loyalty.points_balance <= 0:
        return 0
    if loyalty.last_activity_at and loyalty.last_activity_at > cutoff:
        return 0

    expired = loyalty.points_balance
    before = loyalty.points_balance
    loyalty.points_balance = 0
    loyalty.lifetime_expired += expired
    loyalty.last_activity_at = current_time
    transaction = models.LoyaltyTransaction(
        loyalty_id=loyalty.loyalty_id,
        business_id=loyalty.business_id,
        customer_id=loyalty.customer_id,
        user_id=user_id,
        tx_type="expire",
        points=-expired,
        balance_before=before,
        balance_after=0,
        monetary_amount=0,
        description=(
            f"{expired} points expired after {INACTIVITY_MONTHS} months of inactivity"
        ),
    )
    db.add(transaction)
    # Persist the account update and its immutable evidence as one flush.  The
    # database trigger verifies that the transaction's ending snapshot equals
    # the locked account balance; a later failure still rolls back the outer
    # transaction.
    db.flush()
    return expired


def apply_sale_loyalty(
    db,
    *,
    sale,
    gross_total,
    points_to_redeem: int,
    business,
    user_id: int,
):
    if not sale.customer_id:
        if points_to_redeem:
            raise HTTPException(
                status_code=400,
                detail="A customer is required to redeem loyalty points",
            )
        return {"discount": Decimal("0.00"), "earned": 0, "redeemed": 0}

    scoped_customer(db, sale.customer_id, business.business_id)
    if sale.payment_method == "credit" and points_to_redeem:
        raise HTTPException(
            status_code=409,
            detail="Loyalty points cannot be redeemed on credit sales",
        )

    loyalty = locked_loyalty(
        db, sale.customer_id, business.business_id, create=True
    )
    expire_loyalty(db, loyalty, user_id)

    redeem_rate = Decimal(str(business.loyalty_redeem_rate or 5))
    earn_rate = Decimal(str(business.loyalty_earn_rate or 1))
    discount = discount_for(points_to_redeem, redeem_rate)
    gross = money(gross_total)
    if points_to_redeem > loyalty.points_balance:
        raise HTTPException(status_code=409, detail="Insufficient loyalty points")
    if discount > gross:
        raise HTTPException(
            status_code=409,
            detail="Loyalty discount exceeds the sale subtotal",
        )

    if points_to_redeem:
        before = loyalty.points_balance
        loyalty.points_balance -= points_to_redeem
        loyalty.lifetime_redeemed += points_to_redeem
        transaction = models.LoyaltyTransaction(
            loyalty_id=loyalty.loyalty_id,
            business_id=business.business_id,
            customer_id=sale.customer_id,
            user_id=user_id,
            tx_type="redeem",
            points=-points_to_redeem,
            sale_id=sale.sale_id,
            balance_before=before,
            balance_after=loyalty.points_balance,
            rate_snapshot=redeem_rate,
            monetary_amount=discount,
            description=(
                f"Redeemed {points_to_redeem} points for a {discount} sale discount"
            ),
        )
        db.add(transaction)
        db.flush()

    net_total = gross - discount
    earned = 0 if sale.payment_method == "credit" else points_for(net_total, earn_rate)
    if earned:
        before = loyalty.points_balance
        loyalty.points_balance += earned
        loyalty.lifetime_earned += earned
        transaction = models.LoyaltyTransaction(
            loyalty_id=loyalty.loyalty_id,
            business_id=business.business_id,
            customer_id=sale.customer_id,
            user_id=user_id,
            tx_type="earn",
            points=earned,
            sale_id=sale.sale_id,
            balance_before=before,
            balance_after=loyalty.points_balance,
            rate_snapshot=earn_rate,
            monetary_amount=net_total,
            description=f"Earned {earned} points on sale value {net_total}",
        )
        db.add(transaction)
        db.flush()

    loyalty.last_activity_at = datetime.utcnow()
    if points_to_redeem or earned:
        db.add(models.AuditLog(
            user_id=user_id,
            action="LOYALTY_SALE_POSTING",
            table_name="customer_loyalty",
            record_id=loyalty.loyalty_id,
            description=(
                f"Sale #{sale.sale_id}: redeemed {points_to_redeem}, "
                f"earned {earned}, balance {loyalty.points_balance}"
            ),
        ))
    return {
        "discount": discount,
        "earned": earned,
        "redeemed": points_to_redeem,
        "balance": loyalty.points_balance,
    }
