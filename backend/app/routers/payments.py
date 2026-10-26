"""
payments.py — ProfitTrack subscription billing via Paystack.
Emails sent via email_service.py on every payment event.
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
from app.dependencies import require_role, require_tenant_role, get_current_user, get_current_user_for_billing, SUPERADMIN_ROLE
from app.utils.subscriptions import (
    reconcile_business_subscription,
    subscription_has_access,
    subscription_snapshot,
)

router = APIRouter(prefix="/payments", tags=["Payments"])

PLANS = {
    "starter":    {"name": "Starter",    "monthly_price": 500000,  "annual_price": 5000000,  "rank": 1, "description": "1 branch, 3 staff, full POS and inventory"},
    "business":   {"name": "Business",   "monthly_price": 1500000, "annual_price": 15000000, "rank": 2, "description": "3 branches, 10 staff, analytics + WhatsApp"},
    "enterprise": {"name": "Enterprise", "monthly_price": 3000000, "annual_price": 30000000, "rank": 3, "description": "Unlimited branches, white-label branding"},
}
TRIAL_DAYS = 30


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


def _fmt_date(dt: datetime) -> str:
    if not dt: return "—"
    return dt.strftime("%-d %B %Y")


def _fmt_datetime(dt: datetime) -> str:
    if not dt: return "—"
    lagos = pytz.timezone("Africa/Lagos")
    local = dt.replace(tzinfo=pytz.utc).astimezone(lagos)
    return local.strftime("%-d %B %Y at %-I:%M %p")


def _get_admin(db: Session, business_id: int):
    return db.query(models.User).filter(
        models.User.business_id == business_id,
        models.User.role == "admin",
        models.User.is_active == True,
    ).first()


class InitializePaymentRequest(BaseModel):
    plan:    str
    billing: str
    email:   Optional[str] = None


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
    from app.email_service import welcome as send_welcome

    if data.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(models.Business).filter(models.Business.name.ilike(data.business_name.strip())).first():
        raise HTTPException(status_code=400, detail="A business with this name already exists")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    now = datetime.utcnow()
    trial_ends = now + timedelta(days=TRIAL_DAYS)
    try:
        business = models.Business(
            name=data.business_name.strip(), address=data.address,
            phone=data.phone, email=data.email, plan=data.plan, is_active=True,
            subscription_status="trial", trial_ends_at=trial_ends,
        )
        db.add(business); db.flush()
        branch = models.Branch(name="Main Branch", business_id=business.business_id)
        db.add(branch); db.flush()
        admin = models.User(
            full_name=data.full_name, username=data.username,
            password_hash=hash_password(data.password), role="admin",
            business_id=business.business_id, branch_id=branch.branch_id, is_active=True,
        )
        db.add(admin); db.commit(); db.refresh(business); db.refresh(admin)

        send_welcome(
            to_email=data.email,
            full_name=data.full_name,
            business_name=business.name,
            username=data.username,
            plan=data.plan,
            trial_ends_at=_fmt_date(trial_ends),
        )

        return {
            "message":       f"Welcome! Your {TRIAL_DAYS}-day free trial has started.",
            "business_id":   business.business_id,
            "business_name": business.name,
            "username":      admin.username,
            "trial_ends_at": trial_ends.isoformat(),
            "plan":          data.plan,
        }
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscription")
def get_subscription(db: Session = Depends(get_db), user=Depends(get_current_user_for_billing)):
    if user.role == SUPERADMIN_ROLE:
        return {"subscription_status": "active", "plan": "enterprise", "trial": False}

    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")

    now = datetime.utcnow()
    reconciliation = reconcile_business_subscription(biz, now)
    if reconciliation.changed:
        db.commit()

    if reconciliation.trial_expired:
        try:
            from app.email_service import trial_expired as send_trial_expired
            if biz.email:
                admin = _get_admin(db, biz.business_id)
                send_trial_expired(
                    to_email=biz.email,
                    full_name=admin.full_name if admin else "Admin",
                    business_name=biz.name,
                    plan=biz.plan,
                )
        except Exception as e:
            print(f"[Email] trial_expired failed: {e}")

    snapshot = subscription_snapshot(biz, now)

    return {
        **snapshot,
        "plan":                    biz.plan,
        "current_period_end":      biz.current_period_end.isoformat() if biz.current_period_end else None,
        "pending_plan":            biz.pending_plan,
        "pending_billing":         biz.pending_billing,
        "has_active_subscription": subscription_has_access(biz, now),
    }


@router.post("/initialize")
async def initialize_payment(
    data: InitializePaymentRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_for_billing),
):
    from app.email_service import downgrade_scheduled as send_downgrade

    if user.role != "admin" or not user.business_id:
        raise HTTPException(status_code=403, detail="Tenant administrator required for billing")
    if data.plan not in PLANS: raise HTTPException(status_code=400, detail="Invalid plan")
    if data.billing not in ("monthly", "annual"): raise HTTPException(status_code=400, detail="Invalid billing")

    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz: raise HTTPException(status_code=404, detail="Business not found")

    current_billing = "monthly"
    upgrade = _is_upgrade(biz.plan, current_billing, data.plan, data.billing)

    if not upgrade and biz.subscription_status == "active" and data.plan != biz.plan:
        biz.pending_plan = data.plan
        biz.pending_billing = data.billing
        db.commit()
        period_str = _fmt_date(biz.current_period_end) if biz.current_period_end else "next renewal"
        try:
            if biz.email:
                admin = _get_admin(db, biz.business_id)
                send_downgrade(
                    to_email=biz.email,
                    full_name=admin.full_name if admin else "Admin",
                    business_name=biz.name,
                    current_plan=biz.plan,
                    new_plan=data.plan,
                    applies_on=period_str,
                )
        except Exception as e:
            print(f"[Email] downgrade_scheduled failed: {e}")
        return {
            "type":       "downgrade_scheduled",
            "message":    f"Downgrade to {PLANS[data.plan]['name']} scheduled for {period_str}. "
                          f"Your {PLANS[biz.plan]['name']} plan continues until then.",
            "plan":       data.plan,
            "billing":    data.billing,
            "applies_on": biz.current_period_end.isoformat() if biz.current_period_end else None,
        }

    plan   = PLANS[data.plan]
    amount = plan["annual_price"] if data.billing == "annual" else plan["monthly_price"]
    frontend_url = os.getenv("FRONTEND_URL", "https://www.profittrack.ng")
    billing_email = (biz.email or "").strip()
    if not billing_email:
        raise HTTPException(status_code=400, detail="Add a registered business email before renewing")
    result = await _paystack_post("/transaction/initialize", {
        "email":        billing_email,
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
            "email": billing_email, "plan": data.plan, "billing": data.billing, "is_upgrade": upgrade}


def _validate_successful_payment(result, reference, expected_business_id=None):
    """Never grant entitlement from browser/webhook-supplied metadata alone."""
    if result.get("status") != "success" or result.get("reference") != reference:
        raise HTTPException(status_code=400, detail="Transaction not verified as successful")
    metadata = result.get("metadata") or {}
    try:
        business_id = int(metadata["business_id"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid payment business")
    if expected_business_id is not None and business_id != expected_business_id:
        raise HTTPException(status_code=403, detail="Payment does not belong to this business")
    plan, billing = metadata.get("plan"), metadata.get("billing")
    if plan not in PLANS or billing not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="Invalid payment plan")
    amount = PLANS[plan]["annual_price" if billing == "annual" else "monthly_price"]
    if result.get("currency") != "NGN" or type(result.get("amount")) is not int or result["amount"] != amount:
        raise HTTPException(status_code=400, detail="Payment amount or currency mismatch")
    return business_id, plan, billing, amount


def _apply_verified_payment(db, result, reference, expected_business_id=None):
    """Atomic, replay-safe activation. Unique reference protects concurrent callbacks."""
    from sqlalchemy.exc import IntegrityError

    business_id, plan, billing, amount = _validate_successful_payment(
        result, reference, expected_business_id
    )
    # Serialize activations for a business so concurrent distinct payments
    # cannot overwrite one another without ordering.
    biz = db.query(models.Business).filter(
        models.Business.business_id == business_id
    ).with_for_update().first()
    if biz is None:
        raise HTTPException(status_code=404, detail="Business not found")
    existing = db.query(models.SubscriptionPaymentActivation).filter(
        models.SubscriptionPaymentActivation.reference == reference
    ).first()
    if existing:
        if (existing.business_id, existing.plan, existing.billing, existing.amount, existing.currency) != (
            business_id, plan, billing, amount, "NGN"
        ):
            raise HTTPException(status_code=409, detail="Conflicting payment reference")
        return biz, False
    now = datetime.utcnow()
    # Renewal extends an existing paid term; expired/trial accounts start today.
    start = max(now, biz.current_period_end) if biz.subscription_status == "active" and biz.current_period_end else now
    period_end = start + timedelta(days=365 if billing == "annual" else 30)
    db.add(models.SubscriptionPaymentActivation(
        reference=reference, business_id=business_id, plan=plan,
        billing=billing, amount=amount, currency="NGN", activated_at=now,
    ))
    biz.plan = plan
    biz.subscription_status = "active"
    biz.current_period_end = period_end
    biz.pending_plan = None
    biz.pending_billing = None
    customer = result.get("customer") or {}
    if customer.get("customer_code"):
        biz.paystack_customer_code = customer["customer_code"]
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Payment activation conflict; retry verification")
    return biz, True


@router.get("/verify/{reference}")
async def verify_payment(reference: str, db: Session = Depends(get_db), user=Depends(get_current_user_for_billing)):
    from app.email_service import payment_success as send_payment_success

    if user.role != "admin" or not user.business_id:
        raise HTTPException(status_code=403, detail="Tenant administrator required for billing")
    result = await _paystack_get(f"/transaction/verify/{reference}")
    biz, newly_applied = _apply_verified_payment(db, result, reference, user.business_id)
    metadata = result["metadata"]
    plan, billing = metadata["plan"], metadata["billing"]
    if newly_applied:
        try:
            if biz.email:
                admin = _get_admin(db, biz.business_id)
                send_payment_success(
                    to_email=biz.email, full_name=admin.full_name if admin else "Admin",
                    business_name=biz.name, plan=plan, billing=billing,
                    amount_paid=result["amount"] / 100,
                    period_end=_fmt_date(biz.current_period_end), reference=reference,
                )
        except Exception as e:
            print(f"[Email] payment_success failed: {e}")
    return {"message": "Payment verified. Subscription active.",
            "plan": plan, "billing": billing,
            "period_end": biz.current_period_end.isoformat(),
            "amount_paid": result["amount"] / 100, "already_applied": not newly_applied}


@router.delete("/pending-downgrade")
def cancel_pending_downgrade(db: Session = Depends(get_db), user=Depends(require_tenant_role(["admin"]))):
    biz = db.query(models.Business).filter(models.Business.business_id == user.business_id).first()
    if not biz or not biz.pending_plan:
        raise HTTPException(status_code=404, detail="No pending downgrade found")
    biz.pending_plan = None; biz.pending_billing = None; db.commit()
    return {"message": "Pending downgrade cancelled. Your current plan will continue."}


@router.post("/webhook")
async def paystack_webhook(request: Request, db: Session = Depends(get_db),
                            x_paystack_signature: Optional[str] = Header(None)):
    from app.email_service import (
        payment_success as send_payment_success,
        payment_failed  as send_payment_failed,
    )

    body         = await request.body()
    secret       = os.getenv("PAYSTACK_SECRET_KEY")
    if not secret:
        raise HTTPException(status_code=503, detail="Payment webhook unavailable")
    expected_sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()
    if x_paystack_signature != expected_sig:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json
    payload = json.loads(body); event = payload.get("event"); data = payload.get("data", {})
    print(f"[Webhook] {event}")

    if event == "charge.success":
        reference = data.get("reference")
        if not isinstance(reference, str) or not reference:
            raise HTTPException(status_code=400, detail="Missing transaction reference")
        # Signed event is only a notification: independently fetch the verified
        # Paystack transaction before applying entitlement.
        verified = await _paystack_get(f"/transaction/verify/{reference}")
        # Signed and independently verified Paystack callback has no tenant JWT.
        # Scope the privileged context to this activation only and restore it.
        from app.database import _rls_business_id
        token = _rls_business_id.set(0)
        try:
            biz, newly_applied = _apply_verified_payment(db, verified, reference)
        finally:
            _rls_business_id.reset(token)
        if newly_applied:
            try:
                if biz.email:
                    admin = _get_admin(db, biz.business_id)
                    metadata = verified["metadata"]
                    send_payment_success(
                        to_email=biz.email, full_name=admin.full_name if admin else "Admin",
                        business_name=biz.name, plan=metadata["plan"], billing=metadata["billing"],
                        amount_paid=verified["amount"] / 100,
                        period_end=_fmt_date(biz.current_period_end), reference=reference,
                    )
            except Exception as exc:
                print(f"[Webhook] payment_success email failed: {exc}")

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
                    admin = _get_admin(db, biz.business_id)
                    if biz.email:
                        send_payment_failed(
                            to_email=biz.email,
                            full_name=admin.full_name if admin else "Admin",
                            business_name=biz.name,
                            plan=biz.plan,
                        )
                    if admin and biz.phone:
                        _send_payment_failed_whatsapp(biz, admin)
                except Exception as e:
                    print(f"[Webhook] payment_failed notifications failed: {e}")

    elif event == "subscription.create":
        sc = data.get("subscription_code"); cc = data.get("customer", {}).get("customer_code")
        if cc and sc:
            biz = db.query(models.Business).filter(models.Business.paystack_customer_code == cc).first()
            if biz: biz.paystack_subscription_code = sc; db.commit()

    return {"status": "ok"}


@router.post("/cancel")
async def cancel_subscription(db: Session = Depends(get_db), user=Depends(require_tenant_role(["admin"]))):
    from app.email_service import subscription_cancelled as send_cancelled

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
    try:
        if biz.email:
            admin = _get_admin(db, biz.business_id)
            access_until    = _fmt_date(biz.current_period_end)
            data_kept_until = _fmt_date(biz.current_period_end + timedelta(days=90)) if biz.current_period_end else "90 days from now"
            send_cancelled(
                to_email=biz.email,
                full_name=admin.full_name if admin else "Admin",
                business_name=biz.name, plan=biz.plan,
                access_until=access_until, data_kept_until=data_kept_until,
            )
    except Exception as e:
        print(f"[Email] subscription_cancelled failed: {e}")
    return {"message": "Subscription cancelled. Access continues until the end of your current period.",
            "period_end": biz.current_period_end.isoformat() if biz.current_period_end else None}


def _send_payment_failed_whatsapp(biz, admin):
    import twilio.rest
    TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID"); TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
    FROM_NUMBER  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    if not TWILIO_SID or not TWILIO_TOKEN or not biz.phone: return
    phone = biz.phone.strip()
    if not phone.startswith("+"): phone = "+234" + phone.lstrip("0")
    client = twilio.rest.Client(TWILIO_SID, TWILIO_TOKEN)
    client.messages.create(from_=FROM_NUMBER, to=f"whatsapp:{phone}",
        body=(f"⚠️ ProfitTrack Payment Failed\n\nHi {admin.full_name}, your ProfitTrack "
              f"subscription payment for *{biz.name}* has failed.\n\nPlease update your "
              f"payment method at *profittrack.ng* within 3 days to avoid service interruption.\n\n"
              f"Need help? Reply here or call 09012984122."))
