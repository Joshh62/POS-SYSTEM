import os
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from dotenv import load_dotenv

load_dotenv()

TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM_NUMBER  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
TO_NUMBER    = os.getenv("SHOP_OWNER_WHATSAPP")
SHOP_NAME    = os.getenv("SHOP_NAME", "Your Shop")


# ── Daily admin report (unchanged) ───────────────────────────────────────────
def build_daily_report(db: Session) -> str:
    from app import models

    today = date.today()

    total_sales = db.query(
        func.sum(models.Sale.total_amount)
    ).filter(func.date(models.Sale.sale_date) == today).scalar() or 0

    txn_count = db.query(
        func.count(models.Sale.sale_id)
    ).filter(func.date(models.Sale.sale_date) == today).scalar() or 0

    profit = db.query(
        func.sum(
            (models.SaleItem.unit_price - models.Product.cost_price)
            * models.SaleItem.quantity
        )
    ).join(models.Product, models.Product.product_id == models.SaleItem.product_id
    ).join(models.Sale,    models.Sale.sale_id       == models.SaleItem.sale_id
    ).filter(func.date(models.Sale.sale_date) == today).scalar() or 0

    top_products = db.query(
        models.Product.product_name,
        func.sum(models.SaleItem.quantity).label("qty")
    ).join(models.SaleItem, models.Product.product_id == models.SaleItem.product_id
    ).join(models.Sale,     models.Sale.sale_id       == models.SaleItem.sale_id
    ).filter(func.date(models.Sale.sale_date) == today
    ).group_by(models.Product.product_name
    ).order_by(func.sum(models.SaleItem.quantity).desc()
    ).limit(3).all()

    low_stock = db.query(
        models.BranchInventory
    ).filter(
        models.BranchInventory.stock_quantity <= models.BranchInventory.reorder_level
    ).all()

    expiry_alerts = db.query(
        models.InventoryBatch,
        models.Product.product_name,
        models.BranchInventory.expiry_alert_days,
    ).join(
        models.Product,
        models.Product.product_id == models.InventoryBatch.product_id
    ).join(
        models.BranchInventory,
        and_(
            models.BranchInventory.product_id == models.InventoryBatch.product_id,
            models.BranchInventory.branch_id  == models.InventoryBatch.branch_id,
        )
    ).filter(
        models.InventoryBatch.expiry_date.isnot(None),
        models.InventoryBatch.quantity > 0,
    ).all()

    expired_items       = []
    expiring_soon_items = []

    for batch, product_name, alert_days in expiry_alerts:
        alert_days = alert_days or 90
        days_left  = (batch.expiry_date - today).days
        if days_left < 0:
            expired_items.append((product_name, batch.expiry_date, abs(days_left)))
        elif days_left <= alert_days:
            expiring_soon_items.append((product_name, batch.expiry_date, days_left))

    expiring_soon_items.sort(key=lambda x: x[2])
    expired_items.sort(key=lambda x: x[2], reverse=True)

    lines = [
        f"📊 *Daily Sales Report — {SHOP_NAME}*",
        f"📅 {today.strftime('%A, %d %B %Y')}",
        "",
        f"💰 *Total Sales:* ₦{float(total_sales):,.2f}",
        f"🧾 *Transactions:* {txn_count}",
        f"📈 *Profit:* ₦{float(profit):,.2f}",
        "",
    ]

    if top_products:
        lines.append("🏆 *Top Products Today:*")
        for i, p in enumerate(top_products, 1):
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
        lines.append("🚨 *EXPIRED PRODUCTS — Action required:*")
        for name, exp_date, days_ago in expired_items[:5]:
            lines.append(f"  • {name} — expired {exp_date} ({days_ago} days ago)")
        lines.append("")

    if expiring_soon_items:
        lines.append("⏰ *Expiring Soon:*")
        for name, exp_date, days_left in expiring_soon_items[:5]:
            lines.append(f"  • {name} — expires {exp_date} ({days_left} days)")
        lines.append("")

    if not expired_items and not expiring_soon_items:
        lines.append("✅ *No expiry alerts*")
        lines.append("")

    lines.append("_Sent automatically by ProfitTrack POS_")
    return "\n".join(lines)


def send_whatsapp_report(db: Session):
    if not TWILIO_SID or not TWILIO_TOKEN or not TO_NUMBER:
        print("[WhatsApp] Missing Twilio credentials — skipping report")
        return

    try:
        from twilio.rest import Client
        client       = Client(TWILIO_SID, TWILIO_TOKEN)
        message_body = build_daily_report(db)
        message      = client.messages.create(
            from_=FROM_NUMBER,
            to=TO_NUMBER,
            body=message_body,
        )
        print(f"[WhatsApp] Report sent. SID: {message.sid}")
        return message.sid
    except ImportError:
        print("[WhatsApp] Twilio not installed.")
    except Exception as e:
        print(f"[WhatsApp] Failed to send report: {e}")


# ── Customer due date alerts ──────────────────────────────────────────────────
def send_due_date_alerts(db: Session):
    """
    Sends a WhatsApp reminder to each credit customer whose debit entry
    is due tomorrow. Runs daily at 8AM Lagos time.

    NOTE: Twilio sandbox requires customers to opt in before receiving messages.
    On a paid Twilio plan with approved templates, this works for any number.
    """
    from app import models

    if not TWILIO_SID or not TWILIO_TOKEN:
        print("[WhatsApp] Missing Twilio credentials — skipping due date alerts")
        return

    tomorrow = date.today() + timedelta(days=1)

    # Find all debit entries due tomorrow
    due_entries = db.query(
        models.CustomerLedgerEntry,
        models.Customer,
    ).join(
        models.Customer,
        models.Customer.customer_id == models.CustomerLedgerEntry.customer_id
    ).filter(
        models.CustomerLedgerEntry.entry_type == "debit",
        models.CustomerLedgerEntry.due_date   == tomorrow,
        models.Customer.credit_enabled        == True,
        models.Customer.phone.isnot(None),
    ).all()

    if not due_entries:
        print("[WhatsApp] No due date alerts for tomorrow")
        return

    # Group by customer — one message per customer even if multiple entries
    customer_entries: dict = {}
    for entry, customer in due_entries:
        if customer.customer_id not in customer_entries:
            customer_entries[customer.customer_id] = {"customer": customer, "entries": []}
        customer_entries[customer.customer_id]["entries"].append(entry)

    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
    except Exception as e:
        print(f"[WhatsApp] Twilio init failed: {e}")
        return

    sent = 0
    for cid, data in customer_entries.items():
        customer = data["customer"]
        entries  = data["entries"]
        total_due = sum(float(e.amount) for e in entries)

        # Compute current balance
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
            continue   # already paid — skip alert

        message_body = (
            f"Hello {customer.full_name},\n\n"
            f"This is a friendly reminder from *{SHOP_NAME}*.\n\n"
            f"You have a balance of *₦{balance:,.2f}* due tomorrow ({tomorrow.strftime('%d %b %Y')}).\n\n"
            f"Please visit the store or contact us to settle your account.\n\n"
            f"Thank you for your business! 🙏"
        )

        try:
            # Format phone number for WhatsApp
            phone = customer.phone.strip()
            if not phone.startswith("+"):
                # Assume Nigerian number — add +234
                phone = "+234" + phone.lstrip("0")
            to_number = f"whatsapp:{phone}"

            client.messages.create(
                from_=FROM_NUMBER,
                to=to_number,
                body=message_body,
            )
            sent += 1
            print(f"[WhatsApp] Due date alert sent to {customer.full_name} ({phone})")
        except Exception as e:
            print(f"[WhatsApp] Failed to send to {customer.full_name}: {e}")

    print(f"[WhatsApp] Due date alerts: {sent} sent")


# ── Monthly ledger balance summary (to admin) ─────────────────────────────────
def send_monthly_credit_summary(db: Session):
    """
    Sends a monthly summary of all outstanding credit accounts to the shop admin.
    Runs on the 1st of every month at 8AM Lagos time.
    """
    from app import models

    if not TWILIO_SID or not TWILIO_TOKEN or not TO_NUMBER:
        print("[WhatsApp] Missing Twilio credentials — skipping monthly summary")
        return

    today = date.today()

    # Get all credit-enabled customers with outstanding balances
    credit_customers = db.query(models.Customer).filter(
        models.Customer.credit_enabled == True
    ).all()

    owing = []
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
        print("[WhatsApp] Monthly summary: no outstanding balances")
        return

    owing.sort(key=lambda x: x[1], reverse=True)

    lines = [
        f"📒 *Monthly Credit Account Summary — {SHOP_NAME}*",
        f"📅 {today.strftime('%B %Y')}",
        "",
        f"💰 *Total Outstanding: ₦{total_outstanding:,.2f}*",
        f"👥 *Debtors: {len(owing)}*",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ]

    for i, (name, balance) in enumerate(owing[:15], 1):
        lines.append(f"  {i}. {name} — ₦{balance:,.2f}")

    if len(owing) > 15:
        lines.append(f"  ... and {len(owing) - 15} more")

    lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.append("")
    lines.append("_Sent automatically by ProfitTrack POS_")

    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        message = client.messages.create(
            from_=FROM_NUMBER,
            to=TO_NUMBER,
            body="\n".join(lines),
        )
        print(f"[WhatsApp] Monthly credit summary sent. SID: {message.sid}")
        return message.sid
    except Exception as e:
        print(f"[WhatsApp] Failed to send monthly summary: {e}")