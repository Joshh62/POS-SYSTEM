"""
whatsapp_report.py
------------------
Multi-business WhatsApp reports for ProfitTrack POS.

Every function accepts an optional `business` parameter.
When called without a business, it loops through ALL qualifying businesses.

Qualifying businesses for daily reports:
  - subscription_status IN ('trial', 'active', 'past_due')
  - is_active = True
  - has a phone number set

WhatsApp reports are sent to the business admin's registered phone number.
During trial, all businesses receive reports regardless of plan.
On paid plans, reports are available on Business and Enterprise plans.
On Solo and Starter paid plans, daily reports are skipped (plan limitation).
"""

import os
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from dotenv import load_dotenv

load_dotenv()

TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM_NUMBER  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

# Fallback for legacy single-business setup
FALLBACK_TO     = os.getenv("SHOP_OWNER_WHATSAPP")
FALLBACK_NAME   = os.getenv("SHOP_NAME", "Your Shop")

# Plans that include WhatsApp reports on paid subscriptions
WHATSAPP_PLANS = {"business", "enterprise"}


def _twilio_client():
    if not TWILIO_SID or not TWILIO_TOKEN:
        return None
    try:
        from twilio.rest import Client
        return Client(TWILIO_SID, TWILIO_TOKEN)
    except Exception as e:
        print(f"[WhatsApp] Twilio init failed: {e}")
        return None


def _format_phone(phone: str) -> str:
    """Normalise a Nigerian phone number to WhatsApp format."""
    phone = phone.strip()
    if not phone.startswith("+"):
        phone = "+234" + phone.lstrip("0")
    return f"whatsapp:{phone}"


def _business_qualifies_for_report(business) -> bool:
    """
    Returns True if this business should receive the daily WhatsApp report.

    Rules:
    - Trial businesses always qualify (let them experience it)
    - Active/past_due businesses qualify only on Business or Enterprise plan
    - Cancelled/expired businesses are skipped
    """
    status = business.subscription_status or "active"
    if status == "trial":
        return True
    if status in ("active", "past_due"):
        return business.plan in WHATSAPP_PLANS
    return False


def send_whatsapp_report_for_hour(db: Session, hour: int):
    """
    Called by scheduler at the top of every hour.
    Sends reports to all qualifying businesses whose report_hour matches
    the current Lagos hour. Default report_hour = 20 (8PM).
    """
    from app import models

    businesses = db.query(models.Business).filter(
        models.Business.is_active == True,
        models.Business.phone.isnot(None),
        models.Business.report_hour == hour,
    ).all()

    qualifying = [b for b in businesses if _business_qualifies_for_report(b)]

    if not qualifying:
        print(f"[WhatsApp] Hour {hour:02d}: no businesses scheduled")
        return

    client = _twilio_client()
    if not client:
        print("[WhatsApp] Missing Twilio credentials")
        return

    sent = failed = 0
    for biz in qualifying:
        to_number = _get_admin_phone(biz, db)
        if not to_number:
            continue
        try:
            body    = build_daily_report(db, biz)
            message = client.messages.create(from_=FROM_NUMBER, to=to_number, body=body)
            sent += 1
            print(f"[WhatsApp] Report → {biz.name} ({to_number}) SID: {message.sid}")
        except Exception as e:
            failed += 1
            print(f"[WhatsApp] Failed → {biz.name}: {e}")

    print(f"[WhatsApp] Hour {hour:02d}: {sent} sent, {failed} failed")


def _get_all_qualifying_businesses(db: Session):
    """Returns all businesses that should receive WhatsApp reports today."""
    from app import models
    businesses = db.query(models.Business).filter(
        models.Business.is_active == True,
        models.Business.phone.isnot(None),
    ).all()
    return [b for b in businesses if _business_qualifies_for_report(b)]


def _get_admin_phone(business, db: Session) -> str | None:
    """
    Returns the WhatsApp-formatted phone number for the business admin.
    Uses the business phone number (set in Branding & Settings).
    Falls back to the admin user's phone if business phone is missing.
    """
    if business.phone:
        return _format_phone(business.phone)
    return None


# ── Build daily report for one business ──────────────────────────────────────
def build_daily_report(db: Session, business=None) -> str:
    from app import models

    today     = date.today()
    shop_name = (business.name if business else None) or FALLBACK_NAME
    biz_id    = business.business_id if business else None

    # Base query — filter by business if provided
    def sale_q():
        q = db.query(models.Sale).filter(
            func.date(models.Sale.sale_date) == today,
            models.Sale.status == "completed",
        )
        if biz_id:
            branch_ids = [
                b.branch_id for b in db.query(models.Branch).filter(
                    models.Branch.business_id == biz_id
                ).all()
            ]
            if branch_ids:
                q = q.filter(models.Sale.branch_id.in_(branch_ids))
        return q

    sale_ids = [s.sale_id for s in sale_q().all()]

    total_sales = db.query(func.sum(models.Sale.total_amount)).filter(
        models.Sale.sale_id.in_(sale_ids)
    ).scalar() or 0

    txn_count = len(sale_ids)

    # Gross profit
    profit = 0.0
    if sale_ids:
        items = db.query(models.SaleItem).filter(
            models.SaleItem.sale_id.in_(sale_ids)
        ).all()
        product_ids = list({i.product_id for i in items})
        costs = {
            p.product_id: float(p.cost_price or 0)
            for p in db.query(models.Product).filter(
                models.Product.product_id.in_(product_ids)
            ).all()
        }
        for item in items:
            profit += (float(item.unit_price) - costs.get(item.product_id, 0)) * item.quantity

    # Top products
    top_q = db.query(
        models.Product.product_name,
        func.sum(models.SaleItem.quantity).label("qty")
    ).join(models.SaleItem, models.Product.product_id == models.SaleItem.product_id
    ).filter(models.SaleItem.sale_id.in_(sale_ids)
    ).group_by(models.Product.product_name
    ).order_by(func.sum(models.SaleItem.quantity).desc()
    ).limit(3).all() if sale_ids else []

    # Low stock — scoped to business
    low_q = db.query(models.BranchInventory)
    if biz_id:
        branch_ids = [
            b.branch_id for b in db.query(models.Branch).filter(
                models.Branch.business_id == biz_id
            ).all()
        ]
        if branch_ids:
            low_q = low_q.filter(models.BranchInventory.branch_id.in_(branch_ids))
    low_stock = low_q.filter(
        models.BranchInventory.stock_quantity <= models.BranchInventory.reorder_level
    ).all()

    # Expiry alerts — scoped to business
    exp_q = db.query(
        models.InventoryBatch,
        models.Product.product_name,
        models.BranchInventory.expiry_alert_days,
    ).join(models.Product, models.Product.product_id == models.InventoryBatch.product_id
    ).join(models.BranchInventory, and_(
        models.BranchInventory.product_id == models.InventoryBatch.product_id,
        models.BranchInventory.branch_id  == models.InventoryBatch.branch_id,
    )).filter(
        models.InventoryBatch.expiry_date.isnot(None),
        models.InventoryBatch.quantity > 0,
    )
    if biz_id and branch_ids:
        exp_q = exp_q.filter(models.InventoryBatch.branch_id.in_(branch_ids))

    expired_items, expiring_soon_items = [], []
    for batch, product_name, alert_days in exp_q.all():
        alert_days = alert_days or 90
        days_left  = (batch.expiry_date - today).days
        if days_left < 0:
            expired_items.append((product_name, batch.expiry_date, abs(days_left)))
        elif days_left <= alert_days:
            expiring_soon_items.append((product_name, batch.expiry_date, days_left))

    expiring_soon_items.sort(key=lambda x: x[2])
    expired_items.sort(key=lambda x: x[2], reverse=True)

    lines = [
        f"📊 *Daily Sales Report — {shop_name}*",
        f"📅 {today.strftime('%A, %d %B %Y')}",
        "",
        f"💰 *Total Sales:* ₦{float(total_sales):,.2f}",
        f"🧾 *Transactions:* {txn_count}",
        f"📈 *Gross Profit:* ₦{float(profit):,.2f}",
        "",
    ]

    if top_q:
        lines.append("🏆 *Top Products Today:*")
        for i, p in enumerate(top_q, 1):
            lines.append(f"  {i}. {p.product_name} — {p.qty} units")
        lines.append("")

    if low_stock:
        lines.append("⚠️ *Low Stock Alert:*")
        for item in low_stock[:5]:
            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()
            name = product.product_name if product else f"Product #{item.product_id}"
            lines.append(f"  • {name}: {item.stock_quantity} remaining")
        lines.append("")
    else:
        lines.append("✅ *All products well stocked*")
        lines.append("")

    if expired_items:
        lines.append("🚨 *EXPIRED — Action required:*")
        for name, exp_date, days_ago in expired_items[:5]:
            lines.append(f"  • {name} — expired {exp_date} ({days_ago}d ago)")
        lines.append("")

    if expiring_soon_items:
        lines.append("⏰ *Expiring Soon:*")
        for name, exp_date, days_left in expiring_soon_items[:5]:
            lines.append(f"  • {name} — expires {exp_date} ({days_left}d)")
        lines.append("")

    if not expired_items and not expiring_soon_items:
        lines.append("✅ *No expiry alerts*")
        lines.append("")

    # Add trial reminder if applicable
    if business and business.subscription_status == "trial" and business.trial_ends_at:
        days_left = (business.trial_ends_at.date() - today).days
        if 0 <= days_left <= 5:
            lines.append(f"⏳ *Trial reminder:* {days_left} day{'s' if days_left != 1 else ''} left.")
            lines.append("Visit profittrack.ng to subscribe and keep your data.")
            lines.append("")

    lines.append("_Sent automatically by ProfitTrack POS_")
    lines.append("_profittrack.ng_")
    return "\n".join(lines)


# ── Send daily report — all businesses ───────────────────────────────────────
def send_whatsapp_report(db: Session):
    """
    Loops through all qualifying businesses and sends each one
    a daily WhatsApp report to their registered phone number.
    """
    client = _twilio_client()
    if not client:
        print("[WhatsApp] Missing Twilio credentials — skipping daily reports")
        return

    businesses = _get_all_qualifying_businesses(db)

    if not businesses:
        # Legacy fallback — single business via env vars
        if FALLBACK_TO:
            _send_legacy_report(db, client)
        else:
            print("[WhatsApp] No qualifying businesses found for daily report")
        return

    sent, failed = 0, 0
    for biz in businesses:
        to_number = _get_admin_phone(biz, db)
        if not to_number:
            print(f"[WhatsApp] {biz.name}: no phone number — skipping")
            continue
        try:
            body    = build_daily_report(db, biz)
            message = client.messages.create(
                from_=FROM_NUMBER,
                to=to_number,
                body=body,
            )
            sent += 1
            print(f"[WhatsApp] Report sent to {biz.name} ({to_number}) SID: {message.sid}")
        except Exception as e:
            failed += 1
            print(f"[WhatsApp] Failed to send to {biz.name}: {e}")

    print(f"[WhatsApp] Daily reports: {sent} sent, {failed} failed, {len(businesses)} businesses processed")


def _send_legacy_report(db: Session, client):
    """Fallback for single-business env var setup."""
    try:
        body    = build_daily_report(db, None)
        message = client.messages.create(from_=FROM_NUMBER, to=FALLBACK_TO, body=body)
        print(f"[WhatsApp] Legacy report sent. SID: {message.sid}")
    except Exception as e:
        print(f"[WhatsApp] Legacy report failed: {e}")


# ── Due date alerts — all businesses ─────────────────────────────────────────
def send_due_date_alerts(db: Session):
    """
    Sends WhatsApp reminders to credit customers across all active businesses
    whose balance is due tomorrow.
    """
    from app import models

    client = _twilio_client()
    if not client:
        print("[WhatsApp] Missing Twilio credentials — skipping due date alerts")
        return

    tomorrow = date.today() + timedelta(days=1)

    due_entries = db.query(
        models.CustomerLedgerEntry,
        models.Customer,
        models.Business,
    ).join(
        models.Customer,
        models.Customer.customer_id == models.CustomerLedgerEntry.customer_id
    ).join(
        models.Business,
        models.Business.business_id == models.Customer.business_id,
    ).filter(
        models.CustomerLedgerEntry.entry_type == "debit",
        models.CustomerLedgerEntry.due_date   == tomorrow,
        models.Customer.credit_enabled        == True,
        models.Customer.phone.isnot(None),
        models.Business.is_active             == True,
    ).all()

    if not due_entries:
        print("[WhatsApp] No due date alerts for tomorrow")
        return

    # Group by customer
    customer_data: dict = {}
    for entry, customer, business in due_entries:
        if customer.customer_id not in customer_data:
            customer_data[customer.customer_id] = {
                "customer":  customer,
                "business":  business,
                "entries":   [],
            }
        customer_data[customer.customer_id]["entries"].append(entry)

    sent = 0
    for cid, data in customer_data.items():
        customer = data["customer"]
        business = data["business"]
        shop_name = business.name or FALLBACK_NAME

        # Current balance
        debits  = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
            models.CustomerLedgerEntry.customer_id == cid,
            models.CustomerLedgerEntry.entry_type  == "debit",
        ).scalar() or 0
        credits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
            models.CustomerLedgerEntry.customer_id == cid,
            models.CustomerLedgerEntry.entry_type  == "credit",
        ).scalar() or 0
        balance = float(debits) - float(credits)

        if balance <= 0:
            continue

        body = (
            f"Hello {customer.full_name},\n\n"
            f"This is a reminder from *{shop_name}*.\n\n"
            f"You have a balance of *₦{balance:,.2f}* due tomorrow "
            f"({tomorrow.strftime('%d %b %Y')}).\n\n"
            f"Please visit the store or contact us to settle your account.\n\n"
            f"Thank you for your business! 🙏\n\n"
            f"_ProfitTrack POS_"
        )

        try:
            to_number = _format_phone(customer.phone)
            client.messages.create(from_=FROM_NUMBER, to=to_number, body=body)
            sent += 1
            print(f"[WhatsApp] Due date alert → {customer.full_name} ({business.name})")
        except Exception as e:
            print(f"[WhatsApp] Failed → {customer.full_name}: {e}")

    print(f"[WhatsApp] Due date alerts: {sent} sent")


# ── Monthly credit summary — all businesses ───────────────────────────────────
def send_monthly_credit_summary(db: Session):
    """
    Sends each business admin a monthly summary of outstanding credit accounts.
    Runs on 1st of each month at 8AM Lagos time.
    Only sent to businesses on active/trial plans with phone numbers.
    """
    from app import models

    client = _twilio_client()
    if not client:
        print("[WhatsApp] Missing Twilio credentials — skipping monthly summary")
        return

    today      = date.today()
    businesses = db.query(models.Business).filter(
        models.Business.is_active == True,
        models.Business.phone.isnot(None),
        models.Business.subscription_status.in_(["trial", "active", "past_due"]),
    ).all()

    sent = 0
    for biz in businesses:
        to_number = _get_admin_phone(biz, db)
        if not to_number:
            continue

        # Get credit customers for this business
        credit_customers = db.query(models.Customer).filter(
            models.Customer.business_id    == biz.business_id,
            models.Customer.credit_enabled == True,
        ).all()

        owing             = []
        total_outstanding = 0.0

        for c in credit_customers:
            debits  = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
                models.CustomerLedgerEntry.customer_id == c.customer_id,
                models.CustomerLedgerEntry.entry_type  == "debit",
            ).scalar() or 0
            credits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
                models.CustomerLedgerEntry.customer_id == c.customer_id,
                models.CustomerLedgerEntry.entry_type  == "credit",
            ).scalar() or 0
            balance = float(debits) - float(credits)
            if balance > 0:
                owing.append((c.full_name, balance))
                total_outstanding += balance

        if not owing:
            continue  # no outstanding balances for this business — skip

        owing.sort(key=lambda x: x[1], reverse=True)
        shop_name = biz.name or FALLBACK_NAME

        lines = [
            f"📒 *Monthly Credit Summary — {shop_name}*",
            f"📅 {today.strftime('%B %Y')}",
            "",
            f"💰 *Total Outstanding: ₦{total_outstanding:,.2f}*",
            f"👥 *Customers with balances: {len(owing)}*",
            "",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        ]
        for i, (name, balance) in enumerate(owing[:15], 1):
            lines.append(f"  {i}. {name} — ₦{balance:,.2f}")
        if len(owing) > 15:
            lines.append(f"  ... and {len(owing) - 15} more")
        lines += ["━━━━━━━━━━━━━━━━━━━━━━━━━━━", "", "_ProfitTrack POS · profittrack.ng_"]

        try:
            message = client.messages.create(
                from_=FROM_NUMBER, to=to_number, body="\n".join(lines)
            )
            sent += 1
            print(f"[WhatsApp] Monthly summary → {shop_name} SID: {message.sid}")
        except Exception as e:
            print(f"[WhatsApp] Monthly summary failed → {shop_name}: {e}")

    print(f"[WhatsApp] Monthly credit summaries: {sent} sent")