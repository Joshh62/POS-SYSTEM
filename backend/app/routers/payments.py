"""
payments.py
-----------
Handles ProfitTrack subscription billing via Paystack.

Endpoints:
  POST /payments/initialize   — create Paystack transaction for plan payment
  POST /payments/verify       — verify payment after redirect
  POST /payments/webhook      — Paystack webhook handler
  GET  /payments/subscription — get current subscription status
  POST /payments/cancel       — cancel subscription
  GET  /payments/plans        — list available plans with pricing
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import hashlib
import hmac
import httpx
import os
import pytz

from app.database import get_db
from app import models
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE

router = APIRouter(prefix="/payments", tags=["Payments"])

LAGOS = pytz.timezone("Africa/Lagos")

# ── Plan definitions ──────────────────────────────────────────────────────────
PLANS = {
    "solo": {
        "name":          "Solo",
        "monthly_price": 500000,    # in kobo (₦5,000)
        "annual_price":  5000000,   # in kobo (₦50,000)
        "description":   "1 branch, 1 user, full POS and inventory",
    },
    "starter": {
        "name":          "Starter",
        "monthly_price": 1200000,   # ₦12,000
        "annual_price":  12000000,  # ₦120,000
        "description":   "1 branch, 3 users, all core features",
    },
    "business": {
        "name":          "Business",
        "monthly_price": 2500000,   # ₦25,000
        "annual_price":  25000000,  # ₦250,000
        "description":   "3 branches, 10 users, analytics + WhatsApp",
    },
    "enterprise": {
        "name":          "Enterprise",
        "monthly_price": 5000000,   # ₦50,000
        "annual_price":  50000000,  # ₦500,000
        "description":   "Unlimited branches, white-label branding",
    },
}

TRIAL_DAYS = 14


# ── Paystack helper ───────────────────────────────────────────────────────────
def _paystack_headers():
    secret = os.getenv("PAYSTACK_SECRET_KEY")
    if not secret:
        raise HTTPException(status_code=500, detail="Payment system not configured")
    return {
        "Authorization": f"Bearer {secret}",
        "Content-Type":  "application/json",
    }


async def _paystack_post(path: str, data: dict) -> dict:
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"https://api.paystack.co{path}",
            json=data,
            headers=_paystack_headers(),
            timeout=30,
        )
    result = res.json()
    if not result.get("status"):
        raise HTTPException(status_code=400, detail=result.get("message", "Paystack error"))
    return result["data"]


async def _paystack_get(path: str) -> dict:
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"https://api.paystack.co{path}",
            headers=_paystack_headers(),
            timeout=30,
        )
    result = res.json()
    if not result.get("status"):
        raise HTTPException(status_code=400, detail=result.get("message", "Paystack error"))
    return result["data"]


# ── Schemas ───────────────────────────────────────────────────────────────────
class InitializePaymentRequest(BaseModel):
    plan:     str    # solo | starter | business | enterprise
    billing:  str    # monthly | annual
    email:    str


class PublicSignupRequest(BaseModel):
    # Business details
    business_name: str
    address:       Optional[str] = None
    phone:         Optional[str] = None
    # Admin user details
    full_name:  str
    username:   str
    password:   str
    email:      str
    # Plan selection
    plan:       str = "starter"


# ── GET plans ─────────────────────────────────────────────────────────────────
@router.get("/plans")
def get_plans():
    """Public endpoint — returns plan details for pricing page."""
    result = []
    for key, plan in PLANS.items():
        result.append({
            "key":           key,
            "name":          plan["name"],
            "monthly_price": plan["monthly_price"] / 100,   # convert kobo to naira
            "annual_price":  plan["annual_price"]  / 100,
            "description":   plan["description"],
            "trial_days":    TRIAL_DAYS,
        })
    return result


# ── Public signup ─────────────────────────────────────────────────────────────
@router.post("/signup")
async def public_signup(data: PublicSignupRequest, db: Session = Depends(get_db)):
    """
    Self-service business registration.
    Creates business + admin user + 14-day trial.
    No payment required upfront.
    """
    from app.auth import hash_password

    # Validate plan
    if data.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Choose: {', '.join(PLANS.keys())}")

    # Check username not taken
    existing = db.query(models.User).filter(models.User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    # Check business name not taken
    existing_biz = db.query(models.Business).filter(
        models.Business.name.ilike(data.business_name.strip())
    ).first()
    if existing_biz:
        raise HTTPException(status_code=400, detail="A business with this name already exists")

    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    now        = datetime.utcnow()
    trial_ends = now + timedelta(days=TRIAL_DAYS)

    try:
        # Create business
        business = models.Business(
            name=data.business_name.strip(),
            address=data.address,
            phone=data.phone,
            email=data.email,
            plan=data.plan,
            is_active=True,
            subscription_status="trial",
            trial_ends_at=trial_ends,
        )
        db.add(business)
        db.flush()

        # Create default main branch
        branch = models.Branch(
            name="Main Branch",
            business_id=business.business_id,
        )
        db.add(branch)
        db.flush()

        # Create admin user
        admin = models.User(
            full_name=data.full_name,
            username=data.username,
            password_hash=hash_password(data.password),
            role="admin",
            business_id=business.business_id,
            branch_id=branch.branch_id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(business)
        db.refresh(admin)

        return {
            "message":       f"Welcome to ProfitTrack! Your {TRIAL_DAYS}-day free trial has started.",
            "business_id":   business.business_id,
            "business_name": business.name,
            "username":      admin.username,
            "trial_ends_at": trial_ends.isoformat(),
            "plan":          data.plan,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ── GET subscription status ───────────────────────────────────────────────────
@router.get("/subscription")
def get_subscription(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Returns current subscription status for the logged-in user's business."""
    if user.role == SUPERADMIN_ROLE:
        return {"subscription_status": "active", "plan": "enterprise", "trial": False}

    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    now          = datetime.utcnow()
    trial_active = biz.subscription_status == "trial" and biz.trial_ends_at and biz.trial_ends_at > now
    trial_days_left = max(0, (biz.trial_ends_at - now).days) if trial_active else 0

    # Check if trial has expired but status not yet updated
    if biz.subscription_status == "trial" and biz.trial_ends_at and biz.trial_ends_at <= now:
        biz.subscription_status = "expired"
        db.commit()

    return {
        "subscription_status":    biz.subscription_status,
        "plan":                   biz.plan,
        "trial_active":           trial_active,
        "trial_days_left":        trial_days_left,
        "trial_ends_at":          biz.trial_ends_at.isoformat() if biz.trial_ends_at else None,
        "current_period_end":     biz.current_period_end.isoformat() if biz.current_period_end else None,
        "has_active_subscription": biz.subscription_status in ("trial", "active", "past_due", "cancelled"),
    }


# ── Initialize payment ────────────────────────────────────────────────────────
@router.post("/initialize")
async def initialize_payment(
    data: InitializePaymentRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """
    Creates a Paystack transaction for plan subscription.
    Returns a payment URL to redirect the user to.
    """
    if data.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Choose: {', '.join(PLANS.keys())}")
    if data.billing not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="billing must be 'monthly' or 'annual'")

    plan   = PLANS[data.plan]
    amount = plan["annual_price"] if data.billing == "annual" else plan["monthly_price"]

    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    # Build callback URL
    frontend_url = os.getenv("FRONTEND_URL", "https://www.profittrack.ng")
    callback_url = f"{frontend_url}/?payment=success&plan={data.plan}&billing={data.billing}"

    payload = {
        "email":        data.email,
        "amount":       amount,
        "currency":     "NGN",
        "callback_url": callback_url,
        "metadata": {
            "business_id":   user.business_id,
            "business_name": biz.name,
            "plan":          data.plan,
            "billing":       data.billing,
            "user_id":       user.user_id,
        },
        "channels": ["card", "bank", "ussd", "bank_transfer"],
    }

    result = await _paystack_post("/transaction/initialize", payload)

    return {
        "payment_url":  result["authorization_url"],
        "reference":    result["reference"],
        "amount":       amount / 100,
        "plan":         data.plan,
        "billing":      data.billing,
    }


# ── Verify payment ────────────────────────────────────────────────────────────
@router.get("/verify/{reference}")
async def verify_payment(
    reference: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Called after Paystack redirects back to confirm payment succeeded."""
    result = await _paystack_get(f"/transaction/verify/{reference}")

    if result["status"] != "success":
        raise HTTPException(status_code=400, detail=f"Payment not successful: {result['status']}")

    metadata = result.get("metadata", {})
    plan     = metadata.get("plan", "starter")
    billing  = metadata.get("billing", "monthly")

    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    now        = datetime.utcnow()
    period_end = now + timedelta(days=365 if billing == "annual" else 30)

    biz.plan                = plan
    biz.subscription_status = "active"
    biz.current_period_end  = period_end

    # Store Paystack customer code if provided
    customer = result.get("customer", {})
    if customer.get("customer_code"):
        biz.paystack_customer_code = customer["customer_code"]

    db.commit()

    return {
        "message":         "Payment successful! Your subscription is now active.",
        "plan":            plan,
        "billing":         billing,
        "period_end":      period_end.isoformat(),
        "amount_paid":     result["amount"] / 100,
    }


# ── Webhook handler ───────────────────────────────────────────────────────────
@router.post("/webhook")
async def paystack_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_paystack_signature: Optional[str] = Header(None),
):
    """
    Handles Paystack webhook events.
    Validates signature, processes subscription events.
    """
    body = await request.body()

    # Verify webhook signature
    secret = os.getenv("PAYSTACK_SECRET_KEY", "")
    expected_sig = hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha512,
    ).hexdigest()

    if x_paystack_signature != expected_sig:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json
    payload = json.loads(body)
    event   = payload.get("event")
    data    = payload.get("data", {})

    print(f"[Webhook] Received event: {event}")

    # ── charge.success ────────────────────────────────────────────────────────
    if event == "charge.success":
        metadata    = data.get("metadata", {})
        business_id = metadata.get("business_id")
        plan        = metadata.get("plan", "starter")
        billing     = metadata.get("billing", "monthly")

        if business_id:
            biz = db.query(models.Business).filter(
                models.Business.business_id == business_id
            ).first()
            if biz:
                now        = datetime.utcnow()
                period_end = now + timedelta(days=365 if billing == "annual" else 30)

                biz.plan                = plan
                biz.subscription_status = "active"
                biz.current_period_end  = period_end

                customer = data.get("customer", {})
                if customer.get("customer_code"):
                    biz.paystack_customer_code = customer["customer_code"]

                db.commit()
                print(f"[Webhook] Business {business_id} activated on {plan} plan")

    # ── subscription.disable ──────────────────────────────────────────────────
    elif event == "subscription.disable":
        customer_code = data.get("customer", {}).get("customer_code")
        if customer_code:
            biz = db.query(models.Business).filter(
                models.Business.paystack_customer_code == customer_code
            ).first()
            if biz:
                biz.subscription_status = "cancelled"
                db.commit()
                print(f"[Webhook] Business {biz.business_id} subscription cancelled")

    # ── invoice.payment_failed ────────────────────────────────────────────────
    elif event == "invoice.payment_failed":
        customer_code = data.get("customer", {}).get("customer_code")
        if customer_code:
            biz = db.query(models.Business).filter(
                models.Business.paystack_customer_code == customer_code
            ).first()
            if biz:
                biz.subscription_status = "past_due"
                db.commit()
                print(f"[Webhook] Business {biz.business_id} payment failed — marked past_due")

                # Send WhatsApp alert to business admin
                try:
                    admin = db.query(models.User).filter(
                        models.User.business_id == biz.business_id,
                        models.User.role.in_(["admin"]),
                        models.User.is_active == True,
                    ).first()
                    if admin and biz.phone:
                        _send_payment_failed_whatsapp(biz, admin)
                except Exception as e:
                    print(f"[Webhook] WhatsApp alert failed: {e}")

    # ── subscription.create ───────────────────────────────────────────────────
    elif event == "subscription.create":
        subscription_code = data.get("subscription_code")
        customer_code     = data.get("customer", {}).get("customer_code")
        if customer_code and subscription_code:
            biz = db.query(models.Business).filter(
                models.Business.paystack_customer_code == customer_code
            ).first()
            if biz:
                biz.paystack_subscription_code = subscription_code
                db.commit()

    return {"status": "ok"}


# ── Cancel subscription ───────────────────────────────────────────────────────
@router.post("/cancel")
async def cancel_subscription(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    """Cancel the current subscription. Access continues until period end."""
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first()
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found")

    if not biz.paystack_subscription_code:
        raise HTTPException(status_code=400, detail="No active subscription found")

    # Disable subscription on Paystack
    try:
        await _paystack_post("/subscription/disable", {
            "code":  biz.paystack_subscription_code,
            "token": biz.paystack_customer_code or "",
        })
    except Exception as e:
        print(f"[Cancel] Paystack disable failed: {e}")

    biz.subscription_status = "cancelled"
    db.commit()

    return {
        "message":      "Subscription cancelled. Access continues until your current period ends.",
        "period_end":   biz.current_period_end.isoformat() if biz.current_period_end else None,
    }


# ── WhatsApp payment failed alert ─────────────────────────────────────────────
def _send_payment_failed_whatsapp(biz, admin):
    import twilio.rest
    TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID")
    TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
    FROM_NUMBER  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    if not TWILIO_SID or not TWILIO_TOKEN or not biz.phone:
        return

    phone = biz.phone.strip()
    if not phone.startswith("+"):
        phone = "+234" + phone.lstrip("0")

    client = twilio.rest.Client(TWILIO_SID, TWILIO_TOKEN)
    client.messages.create(
        from_=FROM_NUMBER,
        to=f"whatsapp:{phone}",
        body=(
            f"⚠️ ProfitTrack Payment Failed\n\n"
            f"Hi {admin.full_name}, your ProfitTrack subscription payment for "
            f"*{biz.name}* has failed.\n\n"
            f"Please update your payment method at *profittrack.ng* within 3 days "
            f"to avoid service interruption.\n\n"
            f"Need help? Reply to this message or call 08154586355."
        ),
    )