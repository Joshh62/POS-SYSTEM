"""
whatsapp_report.py
------------------
Sends a daily sales summary to the shop owner via WhatsApp
using the Twilio WhatsApp API.

Schedule this to run every day at 8PM via:
  - APScheduler (added to main.py)
  - OR a cron job on your server

Setup:
  1. Create free Twilio account at twilio.com
  2. Enable WhatsApp Sandbox in Twilio console
  3. Add to .env:
       TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxx
       TWILIO_AUTH_TOKEN=your_auth_token
       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
       SHOP_OWNER_WHATSAPP=whatsapp:+2348012345678
       SHOP_NAME=My Cosmetics Shop
"""

import os
from datetime import date, datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from dotenv import load_dotenv

load_dotenv()

TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM_NUMBER  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
TO_NUMBER    = os.getenv("SHOP_OWNER_WHATSAPP")
SHOP_NAME    = os.getenv("SHOP_NAME", "Your Shop")


def build_daily_report(db: Session) -> str:
    """Query today's data and build the WhatsApp message."""
    from app import models

    today = date.today()

    # Total sales today
    total_sales = db.query(
        func.sum(models.Sale.total_amount)
    ).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar() or 0

    # Transaction count
    txn_count = db.query(
        func.count(models.Sale.sale_id)
    ).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar() or 0

    # Today's profit
    profit = db.query(
        func.sum(
            (models.SaleItem.unit_price - models.Product.cost_price)
            * models.SaleItem.quantity
        )
    ).join(
        models.Product, models.Product.product_id == models.SaleItem.product_id
    ).join(
        models.Sale, models.Sale.sale_id == models.SaleItem.sale_id
    ).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar() or 0

    # Top 3 products today
    top_products = db.query(
        models.Product.product_name,
        func.sum(models.SaleItem.quantity).label("qty")
    ).join(
        models.SaleItem, models.Product.product_id == models.SaleItem.product_id
    ).join(
        models.Sale, models.Sale.sale_id == models.SaleItem.sale_id
    ).filter(
        func.date(models.Sale.sale_date) == today
    ).group_by(
        models.Product.product_name
    ).order_by(
        func.sum(models.SaleItem.quantity).desc()
    ).limit(3).all()

    # Low stock items
    low_stock = db.query(models.BranchInventory).join(
        models.Product,
        models.Product.product_id == models.BranchInventory.product_id
    ).filter(
        models.BranchInventory.stock_quantity <= models.BranchInventory.reorder_level
    ).all()

    # Build message
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

    lines.append("_Sent automatically by POS System_")

    return "\n".join(lines)


def send_whatsapp_report(db: Session):
    """Build and send the daily report via Twilio WhatsApp."""
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