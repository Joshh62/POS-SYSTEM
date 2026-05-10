"""
scheduler.py
------------
Lightweight asyncio scheduler — no external packages needed.

Jobs:
  1. Daily WhatsApp report      → 8:00 PM Lagos time  (all qualifying businesses)
  2. Due date customer alerts   → 8:00 AM Lagos time  (all active businesses)
  3. Monthly credit summary     → 8:00 AM on 1st of each month
  4. Monthly loyalty expiry     → 9:00 AM on 1st of each month

Multi-business:
  All jobs loop through qualifying businesses automatically.
  New businesses that register are included at the next scheduled run.
  No manual configuration needed per business.

WhatsApp report eligibility:
  - subscription_status IN ('trial', 'active', 'past_due')
  - Trial businesses always receive reports (all plans)
  - Paid businesses require Business or Enterprise plan
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


# ── Daily 8PM — WhatsApp report for all qualifying businesses ─────────────────
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
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Daily report loop error: {e}")

        await asyncio.sleep(60)


# ── Daily 8AM — customer due date alerts for all businesses ───────────────────
async def due_date_alerts_loop():
    """Sends WhatsApp reminders to credit customers due tomorrow — all businesses."""
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
            print(f"[Scheduler] Due date alerts loop error: {e}")

        await asyncio.sleep(60)


# ── Monthly 1st at 8AM — credit account summary for all businesses ────────────
async def monthly_credit_summary_loop():
    """Sends monthly credit balance summary to each business admin."""
    while True:
        now = datetime.now(LAGOS_TZ)

        if now.day == 1 and now.hour < 8:
            target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        else:
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
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Monthly credit summary loop error: {e}")

        await asyncio.sleep(60)


# ── Monthly 1st at 9AM — loyalty points expiry ───────────────────────────────
async def monthly_points_expiry_loop():
    """
    Expires loyalty points for customers inactive for 6+ months.
    Runs on the 1st of each month at 9AM Lagos time.
    Loops through all businesses — uses a real admin user per business.
    """
    while True:
        now = datetime.now(LAGOS_TZ)

        if now.day == 1 and now.hour < 9:
            target = now.replace(hour=9, minute=0, second=0, microsecond=0)
        else:
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
            from datetime import datetime as dt

            db = SessionLocal()
            try:
                cutoff = dt.utcnow() - timedelta(days=180)

                stale = db.query(models.CustomerLoyalty).filter(
                    models.CustomerLoyalty.points_balance   > 0,
                    models.CustomerLoyalty.last_activity_at < cutoff,
                ).all()

                expired_pts      = 0
                expired_accounts = 0
                skipped_accounts = 0

                for loyalty in stale:
                    system_user = db.query(models.User).filter(
                        models.User.business_id == loyalty.business_id,
                        models.User.role.in_(["admin", "superadmin"]),
                        models.User.is_active   == True,
                    ).first()

                    if not system_user:
                        print(f"[Scheduler] Loyalty expiry: no active admin for business {loyalty.business_id} — skipping")
                        skipped_accounts += 1
                        continue

                    pts = loyalty.points_balance
                    loyalty.points_balance   = 0
                    loyalty.last_activity_at = dt.utcnow()

                    db.add(models.LoyaltyTransaction(
                        loyalty_id  = loyalty.loyalty_id,
                        business_id = loyalty.business_id,
                        customer_id = loyalty.customer_id,
                        user_id     = system_user.user_id,
                        tx_type     = "expire",
                        points      = -pts,
                        description = "Points expired after 6 months of inactivity (scheduled)",
                    ))

                    expired_pts      += pts
                    expired_accounts += 1

                db.commit()
                print(
                    f"[Scheduler] Loyalty expiry — "
                    f"{expired_pts} pts from {expired_accounts} accounts"
                    + (f", {skipped_accounts} skipped" if skipped_accounts else "")
                )

            finally:
                db.close()

        except Exception as e:
            print(f"[Scheduler] Loyalty expiry loop error: {e}")

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
    print("[Scheduler] Started — loyalty points expiry on 1st of each month")