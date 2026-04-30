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


def build_daily_report(db: Session) -> str:
    from app import models

    today = date.today()

    # ── Sales summary ─────────────────────────────────────────────────────────
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

    # ── Top 3 products ────────────────────────────────────────────────────────
    top_products = db.query(
        models.Product.product_name,
        func.sum(models.SaleItem.quantity).label("qty")
    ).join(models.SaleItem, models.Product.product_id == models.SaleItem.product_id
    ).join(models.Sale,     models.Sale.sale_id       == models.SaleItem.sale_id
    ).filter(func.date(models.Sale.sale_date) == today
    ).group_by(models.Product.product_name
    ).order_by(func.sum(models.SaleItem.quantity).desc()
    ).limit(3).all()

    # ── Low stock ─────────────────────────────────────────────────────────────
    low_stock = db.query(
        models.BranchInventory
    ).filter(
        models.BranchInventory.stock_quantity <= models.BranchInventory.reorder_level
    ).all()

    # ── Expiry alerts ─────────────────────────────────────────────────────────
    # Get all batches where expiry_date is within branch's alert threshold
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

    expired_items      = []
    expiring_soon_items = []

    for batch, product_name, alert_days in expiry_alerts:
        alert_days = alert_days or 90
        days_left  = (batch.expiry_date - today).days
        if days_left < 0:
            expired_items.append((product_name, batch.expiry_date, abs(days_left)))
        elif days_left <= alert_days:
            expiring_soon_items.append((product_name, batch.expiry_date, days_left))

    expiring_soon_items.sort(key=lambda x: x[2])   # soonest first
    expired_items.sort(key=lambda x: x[2], reverse=True)  # most overdue first

    # ── Build message ─────────────────────────────────────────────────────────
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

    # Low stock
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

    # ── Expiry section ────────────────────────────────────────────────────────
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
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        message_body = build_daily_report(db)
        message = client.messages.create(
            from_=FROM_NUMBER,
            to=TO_NUMBER,
            body=message_body,
        )
        print(f"[WhatsApp] Report sent. SID: {message.sid}")
        return message.sid
    except ImportError:
        print("[WhatsApp] Twilio not installed. Run: pip install twilio")
    except Exception as e:
        print(f"[WhatsApp] Failed to send report: {e}")