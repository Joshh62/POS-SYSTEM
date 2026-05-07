"""
scheduler.py
------------
Lightweight asyncio scheduler — no external packages needed.

Jobs:
  1. Daily WhatsApp report      → 8:00 PM Lagos time (existing)
  2. Due date customer alerts   → 8:00 AM Lagos time (new)
  3. Monthly credit summary     → 8:00 AM on 1st of each month (new)
"""

import asyncio
from datetime import datetime, timedelta
import pytz

LAGOS_TZ = pytz.timezone("Africa/Lagos")


def seconds_until(hour: int, minute: int = 0) -> float:
    """Calculate seconds until next occurrence of a given hour:minute Lagos time."""
    now    = datetime.now(LAGOS_TZ)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


# ── Daily 8PM — admin WhatsApp report ────────────────────────────────────────
async def daily_report_loop():
    while True:
        wait = seconds_until(20, 0)
        h, m = int(wait // 3600), int((wait % 3600) // 60)
        print(f"[Scheduler] Next WhatsApp report in {h}h {m}m")
        await asyncio.sleep(wait)

        try:
            from app.database import SessionLocal
            from app.whatsapp_report import send_whatsapp_report
            db = SessionLocal()
            try:
                send_whatsapp_report(db)
                print("[Scheduler] Daily WhatsApp report sent successfully")
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Failed to send daily report: {e}")

        await asyncio.sleep(60)


# ── Daily 8AM — customer due date alerts ─────────────────────────────────────
async def due_date_alerts_loop():
    """Sends WhatsApp reminders to customers whose debt is due tomorrow."""
    while True:
        wait = seconds_until(8, 0)
        h, m = int(wait // 3600), int((wait % 3600) // 60)
        print(f"[Scheduler] Next due date alerts in {h}h {m}m")
        await asyncio.sleep(wait)

        try:
            from app.database import SessionLocal
            from app.whatsapp_report import send_due_date_alerts
            db = SessionLocal()
            try:
                send_due_date_alerts(db)
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Failed to send due date alerts: {e}")

        await asyncio.sleep(60)


# ── Monthly 1st at 8AM — credit account summary to admin ─────────────────────
async def monthly_credit_summary_loop():
    """Sends monthly credit account balance summary to the shop owner."""
    while True:
        now = datetime.now(LAGOS_TZ)

        # Calculate next 1st of month at 8AM Lagos
        if now.day == 1 and now.hour < 8:
            # Today is 1st and it's before 8AM — fire today
            target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        else:
            # Next month 1st at 8AM
            if now.month == 12:
                target = now.replace(year=now.year + 1, month=1, day=1, hour=8, minute=0, second=0, microsecond=0)
            else:
                target = now.replace(month=now.month + 1, day=1, hour=8, minute=0, second=0, microsecond=0)

        wait = (target - now).total_seconds()
        days = int(wait // 86400)
        print(f"[Scheduler] Next monthly credit summary in {days} day(s)")
        await asyncio.sleep(wait)

        try:
            from app.database import SessionLocal
            from app.whatsapp_report import send_monthly_credit_summary
            db = SessionLocal()
            try:
                send_monthly_credit_summary(db)
                print("[Scheduler] Monthly credit summary sent successfully")
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Failed to send monthly credit summary: {e}")

        await asyncio.sleep(60)


async def monthly_points_expiry_loop():
    """Run loyalty point expiry check on the 1st of each month."""
    while True:
        now = datetime.now(LAGOS_TZ)
        if now.month == 12:
            target = now.replace(year=now.year + 1, month=1, day=1, hour=9, minute=0, second=0, microsecond=0)
        else:
            target = now.replace(month=now.month + 1, day=1, hour=9, minute=0, second=0, microsecond=0)
 
        wait = (target - now).total_seconds()
        days = int(wait // 86400)
        print(f"[Scheduler] Next loyalty points expiry check in {days} day(s)")
        await asyncio.sleep(wait)
 
        try:
            from app.database import SessionLocal
            from app import models
            from sqlalchemy import func
            from datetime import timedelta
 
            db = SessionLocal()
            try:
                cutoff = datetime.utcnow() - timedelta(days=180)
                stale  = db.query(models.CustomerLoyalty).filter(
                    models.CustomerLoyalty.points_balance   > 0,
                    models.CustomerLoyalty.last_activity_at < cutoff,
                ).all()
                expired = 0
                for loyalty in stale:
                    pts = loyalty.points_balance
                    loyalty.points_balance   = 0
                    loyalty.last_activity_at = datetime.utcnow()
                    db.add(models.LoyaltyTransaction(
                        loyalty_id  = loyalty.loyalty_id,
                        business_id = loyalty.business_id,
                        customer_id = loyalty.customer_id,
                        user_id     = 1,
                        tx_type     = "expire",
                        points      = -pts,
                        description = "Points expired after 6 months of inactivity (scheduled)",
                    ))
                    expired += pts
                db.commit()
                print(f"[Scheduler] Loyalty expiry: {expired} points expired from {len(stale)} accounts")
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Loyalty expiry failed: {e}")
 
        await asyncio.sleep(60)


# ── Start all scheduler tasks ─────────────────────────────────────────────────
def start_scheduler():
    loop = asyncio.get_event_loop()
    loop.create_task(daily_report_loop())
    loop.create_task(due_date_alerts_loop())
    loop.create_task(monthly_credit_summary_loop())
    loop.create_task(monthly_points_expiry_loop())
    print("[Scheduler] Started — daily WhatsApp report at 8:00 PM Lagos time")
    print("[Scheduler] Started — customer due date alerts at 8:00 AM Lagos time")
    print("[Scheduler] Started — monthly credit summary on 1st of each month")