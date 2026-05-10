"""
payments.py — ProfitTrack subscription billing via Paystack.

Plan change rules:
- Upgrade (higher tier or monthly→annual): activates immediately, full price charged
- Downgrade (lower tier or annual→monthly): scheduled for next renewal, auto-applied
- Same plan + same billing: blocked at frontend
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

PLANS = {
    "solo":       {"name": "Solo",       "monthly_price": 500000,  "annual_price": 5000000,  "rank": 1, "description": "1 branch, 1 user, full POS and inventory"},
    "starter":    {"name": "Starter",    "monthly_price": 1200000, "annual_price": 12000000, "rank": 2, "description": "1 branch, 3 users, all core features"},
    "business":   {"name": "Business",   "monthly_price": 2500000, "annual_price": 25000000, "rank": 3, "description": "3 branches, 10 users, analytics + WhatsApp"},
    "enterprise": {"name": "Enterprise", "monthly_price": 5000000, "annual_price": 50000000, "rank": 4, "description": "Unlimited branches, white-label branding"},
}
TRIAL_DAYS = 14


def _is_upgrade(current_plan, current_billing, new_plan, new_billing) -> bool:
    cr = PLANS.get(current_plan, {}).get("rank", 0)
    nr = PLANS.get(new_plan,     {}).get("rank", 0)
    if nr > cr: return True
    if nr == cr and current_billing == "monthly" and new_billing == "annual": return True
    return False


def _paystack_headers():
    secret = os.getenv("PAYSTACK_SECRET_KEY")
    if not secret:
        raise HTTPException(status_code=500, detail="Payment system not configured")
    return {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}


async def _paystack_post(path, data):
    async with httpx.AsyncClient() as client:
        res = await client.post(f"https://api.paystack.co{path}", json=data, headers=_paystack_headers(), timeout=30)
    result = res.json()
    if not result.get("status"):
        raise HTTPException(status_code=400, detail=result.get("message", "Paystack error"))
    return result["data"]


async def _paystack_get(path):
    async with httpx.AsyncClient() as client:
        res = await client.get(f"https://api.paystack.co{path}", headers=_paystack_headers(), timeout=30)
    result = res.json()
    if not result.get("status"):
        raise HTTPException(status_code=400, detail=result.get("message", "Paystack error"))
    return result["data"]


class InitializePaymentRequest(BaseModel):
    plan:    str
    billing: str
    email:   str

class PublicSignupRequest(BaseModel):
    business_name: str
    address:       Optional[str] = None
    phone:         Optional[str] = None
    full_name:     str
    username:      str
    password:      str
    email:         str
    plan:          str = "starter"


@router.get("/plans")
def get_plans():
    return [{"key": k, "name": v["name"], "monthly_price": v["monthly_price"]/100,
             "annual_price": v["annual_price"]/100, "description": v["description"],
             "trial_days": TRIAL_DAYS} for k, v in PLANS.items()]


@router.post("/signup")
async def public_signup(data: PublicSignupRequest, db: Session = Depends(get_db)):
    from app.auth import hash_password
    if data.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan")
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(models.Business).filter(models.Business.name.ilike(data.business_name.strip())).first():
        raise HTTPException(status_code=400, detail="A business with this name already exists")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    now = datetime.utcnow()
    trial_ends = now + timedelta(days=TRIAL_DAYS)
    try:
        business = models.Business(name=data.business_name.strip(), address=data.address,
            phone=data.phone, email=data.email, plan=data.plan, is_active=True,
            subscription_status="trial", trial_ends_at=trial_ends)
        db.add(business); db.flush()
        branch = models.Branch(name="Main Branch", business_id=business.business_id)
        db.add(branch); db.flush()
        admin = models.User(full_name=data.full_name, username=data.username,
            password_hash=hash_password(data.password), role="admin",
            business_id=business.business_id, branch_id=branch.branch_id, is_active=True)
        db.add(admin); db.commit(); db.refresh(business); db.refresh(admin)
        return {"message": f"Welcome! Your {TRIAL_DAYS}-day free trial has started.",
                "business_id": business.business_id, "business_name": business.name,
                "username": admin.username, "trial_ends_at": trial_ends.isoformat(), "plan": data.plan}
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscription")
def get_subscription(db: Session = Depends(get_db), user=Depends(get_current_user)):
    if user.role == SUPERADMIN_ROLE:
        return {"subscription_status": "active", "plan": "enterprise", "trial": False}

    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")

    now          = datetime.utcnow()
    trial_active = biz.subscription_status == "trial" and biz.trial_ends_at and biz.trial_ends_at > now
    trial_days_left = max(0, (biz.trial_ends_at - now).days) if trial_active else 0

    if biz.subscription_status == "trial" and biz.trial_ends_at and biz.trial_ends_at <= now:
        biz.subscription_status = "expired"; db.commit()

    # Auto-apply pending downgrade if period ended
    if (biz.pending_plan and biz.current_period_end and
            biz.current_period_end <= now and biz.subscription_status in ("active", "cancelled")):
        biz.plan = biz.pending_plan; biz.pending_plan = None; biz.pending_billing = None; db.commit()

    return {
        "subscription_status":     biz.subscription_status,
        "plan":                    biz.plan,
        "trial_active":            trial_active,
        "trial_days_left":         trial_days_left,
        "trial_ends_at":           biz.trial_ends_at.isoformat() if biz.trial_ends_at else None,
        "current_period_end":      biz.current_period_end.isoformat() if biz.current_period_end else None,
        "pending_plan":            biz.pending_plan,
        "pending_billing":         biz.pending_billing,
        "has_active_subscription": biz.subscription_status in ("trial", "active", "past_due", "cancelled"),
    }


@router.post("/initialize")
async def initialize_payment(data: InitializePaymentRequest,
                              db: Session = Depends(get_db), user=Depends(get_current_user)):
    if data.plan not in PLANS: raise HTTPException(status_code=400, detail="Invalid plan")
    if data.billing not in ("monthly", "annual"): raise HTTPException(status_code=400, detail="Invalid billing")

    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")

    current_billing = "monthly"   # default — billing not stored per-business yet
    upgrade = _is_upgrade(biz.plan, current_billing, data.plan, data.billing)

    # Downgrade on active paid subscription — schedule, don't charge
    if (not upgrade and biz.subscription_status == "active" and
            data.plan != biz.plan):
        biz.pending_plan = data.plan; biz.pending_billing = data.billing; db.commit()
        period_str = biz.current_period_end.strftime("%d %b %Y") if biz.current_period_end else "next renewal"
        return {
            "type":       "downgrade_scheduled",
            "message":    f"Downgrade to {PLANS[data.plan]['name']} scheduled for {period_str}. Your {PLANS[biz.plan]['name']} plan continues until then.",
            "plan":       data.plan,
            "billing":    data.billing,
            "applies_on": biz.current_period_end.isoformat() if biz.current_period_end else None,
        }

    plan   = PLANS[data.plan]
    amount = plan["annual_price"] if data.billing == "annual" else plan["monthly_price"]
    frontend_url = os.getenv("FRONTEND_URL", "https://www.profittrack.ng")

    result = await _paystack_post("/transaction/initialize", {
        "email":        data.email,
        "amount":       amount,
        "currency":     "NGN",
        "callback_url": f"{frontend_url}/?payment=success&plan={data.plan}&billing={data.billing}",
        "metadata":     {"business_id": user.business_id, "business_name": biz.name,
                         "plan": data.plan, "billing": data.billing,
                         "user_id": user.user_id, "is_upgrade": upgrade},
        "channels":     ["card", "bank", "ussd", "bank_transfer"],
    })

    return {"type": "payment_required", "payment_url": result["authorization_url"],
            "reference": result["reference"], "amount": amount / 100,
            "plan": data.plan, "billing": data.billing, "is_upgrade": upgrade}


@router.get("/verify/{reference}")
async def verify_payment(reference: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    result = await _paystack_get(f"/transaction/verify/{reference}")
    if result["status"] != "success":
        raise HTTPException(status_code=400, detail=f"Payment not successful: {result['status']}")

    metadata   = result.get("metadata", {})
    plan       = metadata.get("plan", "starter")
    billing    = metadata.get("billing", "monthly")

    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")

    now        = datetime.utcnow()
    period_end = now + timedelta(days=365 if billing == "annual" else 30)
    biz.plan = plan; biz.subscription_status = "active"; biz.current_period_end = period_end
    biz.pending_plan = None; biz.pending_billing = None
    customer = result.get("customer", {})
    if customer.get("customer_code"): biz.paystack_customer_code = customer["customer_code"]
    db.commit()

    return {"message": "Payment successful! Your subscription is now active.",
            "plan": plan, "billing": billing, "period_end": period_end.isoformat(),
            "amount_paid": result["amount"] / 100}


@router.delete("/pending-downgrade")
def cancel_pending_downgrade(db: Session = Depends(get_db), user=Depends(require_role(["admin"]))):
    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz or not biz.pending_plan:
        raise HTTPException(status_code=404, detail="No pending downgrade found")
    biz.pending_plan = None; biz.pending_billing = None; db.commit()
    return {"message": "Pending downgrade cancelled. Your current plan will continue."}


@router.post("/webhook")
async def paystack_webhook(request: Request, db: Session = Depends(get_db),
                            x_paystack_signature: Optional[str] = Header(None)):
    body         = await request.body()
    secret       = os.getenv("PAYSTACK_SECRET_KEY", "")
    expected_sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()
    if x_paystack_signature != expected_sig:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json
    payload = json.loads(body); event = payload.get("event"); data = payload.get("data", {})
    print(f"[Webhook] {event}")

    if event == "charge.success":
        metadata    = data.get("metadata", {})
        business_id = metadata.get("business_id")
        plan        = metadata.get("plan", "starter")
        billing     = metadata.get("billing", "monthly")
        if business_id:
            biz = db.query(models.Business).filter(models.Business.business_id == business_id).first()
            if biz:
                now = datetime.utcnow()
                period_end = now + timedelta(days=365 if billing == "annual" else 30)
                biz.plan = plan; biz.subscription_status = "active"
                biz.current_period_end = period_end
                biz.pending_plan = None; biz.pending_billing = None
                customer = data.get("customer", {})
                if customer.get("customer_code"): biz.paystack_customer_code = customer["customer_code"]
                db.commit()

    elif event == "subscription.disable":
        cc = data.get("customer", {}).get("customer_code")
        if cc:
            biz = db.query(models.Business).filter(models.Business.paystack_customer_code == cc).first()
            if biz: biz.subscription_status = "cancelled"; db.commit()

    elif event == "invoice.payment_failed":
        cc = data.get("customer", {}).get("customer_code")
        if cc:
            biz = db.query(models.Business).filter(models.Business.paystack_customer_code == cc).first()
            if biz:
                biz.subscription_status = "past_due"; db.commit()
                try:
                    admin = db.query(models.User).filter(models.User.business_id == biz.business_id,
                        models.User.role.in_(["admin"]), models.User.is_active == True).first()
                    if admin and biz.phone: _send_payment_failed_whatsapp(biz, admin)
                except Exception as e:
                    print(f"[Webhook] WhatsApp failed: {e}")

    elif event == "subscription.create":
        sc = data.get("subscription_code"); cc = data.get("customer", {}).get("customer_code")
        if cc and sc:
            biz = db.query(models.Business).filter(models.Business.paystack_customer_code == cc).first()
            if biz: biz.paystack_subscription_code = sc; db.commit()

    return {"status": "ok"}


@router.post("/cancel")
async def cancel_subscription(db: Session = Depends(get_db), user=Depends(require_role(["admin"]))):
    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")
    if not biz.paystack_subscription_code:
        raise HTTPException(status_code=400, detail="No active subscription found")
    try:
        await _paystack_post("/subscription/disable",
            {"code": biz.paystack_subscription_code, "token": biz.paystack_customer_code or ""})
    except Exception as e:
        print(f"[Cancel] {e}")
    biz.subscription_status = "cancelled"; db.commit()
    return {"message": "Subscription cancelled. Access continues until your current period ends.",
            "period_end": biz.current_period_end.isoformat() if biz.current_period_end else None}


def _send_payment_failed_whatsapp(biz, admin):
    import twilio.rest
    TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID"); TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
    FROM_NUMBER = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    if not TWILIO_SID or not TWILIO_TOKEN or not biz.phone: return
    phone = biz.phone.strip()
    if not phone.startswith("+"): phone = "+234" + phone.lstrip("0")
    client = twilio.rest.Client(TWILIO_SID, TWILIO_TOKEN)
    client.messages.create(from_=FROM_NUMBER, to=f"whatsapp:{phone}",
        body=f"⚠️ ProfitTrack Payment Failed\n\nHi {admin.full_name}, your ProfitTrack subscription "
             f"payment for *{biz.name}* has failed.\n\nPlease update your payment method at "
             f"*profittrack.ng* within 3 days to avoid service interruption.\n\n"
             f"Need help? Reply to this message or call 08154586355.")