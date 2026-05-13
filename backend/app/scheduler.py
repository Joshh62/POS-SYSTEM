"""
scheduler.py — ProfitTrack
Runs at the top of every hour, sends WhatsApp reports to businesses
whose report_hour matches the current Lagos time hour.
"""

import asyncio
from datetime import datetime, timedelta
import pytz

LAGOS_TZ            = pytz.timezone("Africa/Lagos")
DELETION_GRACE_DAYS = 90


def seconds_until(hour: int, minute: int = 0) -> float:
    now    = datetime.now(LAGOS_TZ)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def seconds_until_next_hour() -> float:
    now    = datetime.now(LAGOS_TZ)
    target = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return (target - now).total_seconds()


# ── Hourly — WhatsApp reports ─────────────────────────────────────────────────
async def daily_report_loop():
    """
    Runs at the top of every hour (00:00, 01:00, ... 23:00 Lagos time).
    Sends WhatsApp reports to businesses whose report_hour matches current hour.
    Default report_hour = 20 (8PM Lagos).
    Admins can change their report time from Branding & Settings.
    """
    wait = seconds_until_next_hour()
    print(f"[Scheduler] WhatsApp reports: first run in {int(wait//3600)}h {int((wait%3600)//60)}m")
    await asyncio.sleep(wait)

    while True:
        current_hour = datetime.now(LAGOS_TZ).hour
        print(f"[Scheduler] WhatsApp report check — Lagos hour: {current_hour:02d}:00")
        try:
            from app.database import SessionLocal
            from app.whatsapp_report import send_whatsapp_report_for_hour
            db = SessionLocal()
            try:
                send_whatsapp_report_for_hour(db, current_hour)
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Report loop error: {e}")
        await asyncio.sleep(seconds_until_next_hour())


# ── Daily 8AM — due date alerts ───────────────────────────────────────────────
async def due_date_alerts_loop():
    while True:
        wait = seconds_until(8, 0)
        print(f"[Scheduler] Next due date alerts in {int(wait//3600)}h {int((wait%3600)//60)}m")
        await asyncio.sleep(wait)
        try:
            from app.database import SessionLocal
            from app.whatsapp_report import send_due_date_alerts
            db = SessionLocal()
            try: send_due_date_alerts(db)
            finally: db.close()
        except Exception as e:
            print(f"[Scheduler] Due date alerts error: {e}")
        await asyncio.sleep(60)


# ── Monthly 1st 8AM — credit summary ─────────────────────────────────────────
async def monthly_credit_summary_loop():
    while True:
        now = datetime.now(LAGOS_TZ)
        if now.day == 1 and now.hour < 8:
            target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        else:
            m = now.month % 12 + 1
            y = now.year + (1 if now.month == 12 else 0)
            target = now.replace(year=y, month=m, day=1, hour=8, minute=0, second=0, microsecond=0)
        await asyncio.sleep((target - now).total_seconds())
        try:
            from app.database import SessionLocal
            from app.whatsapp_report import send_monthly_credit_summary
            db = SessionLocal()
            try: send_monthly_credit_summary(db)
            finally: db.close()
        except Exception as e:
            print(f"[Scheduler] Monthly credit summary error: {e}")
        await asyncio.sleep(60)


# ── Monthly 1st 9AM — loyalty expiry ─────────────────────────────────────────
async def monthly_points_expiry_loop():
    while True:
        now = datetime.now(LAGOS_TZ)
        if now.day == 1 and now.hour < 9:
            target = now.replace(hour=9, minute=0, second=0, microsecond=0)
        else:
            m = now.month % 12 + 1
            y = now.year + (1 if now.month == 12 else 0)
            target = now.replace(year=y, month=m, day=1, hour=9, minute=0, second=0, microsecond=0)
        await asyncio.sleep((target - now).total_seconds())
        try:
            from app.database import SessionLocal
            from app import models
            from datetime import datetime as dt
            db = SessionLocal()
            try:
                cutoff = dt.utcnow() - timedelta(days=180)
                stale  = db.query(models.CustomerLoyalty).filter(
                    models.CustomerLoyalty.points_balance > 0,
                    models.CustomerLoyalty.last_activity_at < cutoff).all()
                expired_pts = expired_accs = skipped = 0
                for loyalty in stale:
                    su = db.query(models.User).filter(
                        models.User.business_id == loyalty.business_id,
                        models.User.role.in_(["admin","superadmin"]),
                        models.User.is_active == True).first()
                    if not su: skipped += 1; continue
                    pts = loyalty.points_balance
                    loyalty.points_balance = 0
                    loyalty.last_activity_at = dt.utcnow()
                    db.add(models.LoyaltyTransaction(
                        loyalty_id=loyalty.loyalty_id, business_id=loyalty.business_id,
                        customer_id=loyalty.customer_id, user_id=su.user_id,
                        tx_type="expire", points=-pts,
                        description="Points expired after 6 months of inactivity (scheduled)"))
                    expired_pts += pts; expired_accs += 1
                db.commit()
                print(f"[Scheduler] Loyalty: {expired_pts} pts from {expired_accs} accounts"
                      + (f", {skipped} skipped" if skipped else ""))
            finally: db.close()
        except Exception as e:
            print(f"[Scheduler] Loyalty expiry error: {e}")
        await asyncio.sleep(60)


# ── Daily 2AM — account deletion cleanup ─────────────────────────────────────
async def account_deletion_cleanup_loop():
    while True:
        wait = seconds_until(2, 0)
        print(f"[Scheduler] Next deletion cleanup in {int(wait//3600)}h {int((wait%3600)//60)}m")
        await asyncio.sleep(wait)
        try:
            from app.database import SessionLocal
            from app import models
            from datetime import datetime as dt
            db = SessionLocal()
            try:
                cutoff  = dt.utcnow() - timedelta(days=DELETION_GRACE_DAYS)
                pending = db.query(models.Business).filter(
                    models.Business.subscription_status == "deletion_pending",
                    models.Business.deletion_requested_at.isnot(None),
                    models.Business.deletion_requested_at <= cutoff).all()
                deleted = failed = 0
                for biz in pending:
                    try: _delete_business(db, biz); deleted += 1
                    except Exception as e: failed += 1; db.rollback(); print(f"[Scheduler] Delete failed {biz.business_id}: {e}")
                if deleted: print(f"[Scheduler] Deletion: {deleted} deleted, {failed} failed")
                else: print("[Scheduler] Deletion: no accounts due")
            finally: db.close()
        except Exception as e:
            print(f"[Scheduler] Deletion cleanup error: {e}")
        await asyncio.sleep(60)


def _delete_business(db, biz):
    from app import models
    biz_id = biz.business_id
    try: _send_deletion_whatsapp(biz)
    except: pass
    branch_ids   = [b.branch_id   for b in db.query(models.Branch).filter(models.Branch.business_id==biz_id).all()]
    user_ids     = [u.user_id     for u in db.query(models.User).filter(models.User.business_id==biz_id).all()]
    sale_ids     = [s.sale_id     for s in db.query(models.Sale).filter(models.Sale.branch_id.in_(branch_ids)).all()] if branch_ids else []
    customer_ids = [c.customer_id for c in db.query(models.Customer).filter(models.Customer.business_id==biz_id).all()]
    product_ids  = [p.product_id  for p in db.query(models.Product).filter(models.Product.business_id==biz_id).all()]
    if customer_ids:
        lids = [l.loyalty_id for l in db.query(models.CustomerLoyalty).filter(models.CustomerLoyalty.customer_id.in_(customer_ids)).all()]
        if lids: db.query(models.LoyaltyTransaction).filter(models.LoyaltyTransaction.loyalty_id.in_(lids)).delete(synchronize_session=False)
        db.query(models.CustomerLoyalty).filter(models.CustomerLoyalty.customer_id.in_(customer_ids)).delete(synchronize_session=False)
        db.query(models.CustomerLedgerEntry).filter(models.CustomerLedgerEntry.customer_id.in_(customer_ids)).delete(synchronize_session=False)
    if sale_ids: db.query(models.SaleItem).filter(models.SaleItem.sale_id.in_(sale_ids)).delete(synchronize_session=False)
    if branch_ids: db.query(models.Sale).filter(models.Sale.branch_id.in_(branch_ids)).delete(synchronize_session=False)
    if product_ids and branch_ids:
        db.query(models.InventoryBatch).filter(models.InventoryBatch.product_id.in_(product_ids), models.InventoryBatch.branch_id.in_(branch_ids)).delete(synchronize_session=False)
        db.query(models.BranchInventory).filter(models.BranchInventory.branch_id.in_(branch_ids)).delete(synchronize_session=False)
    db.query(models.Product).filter(models.Product.business_id==biz_id).delete(synchronize_session=False)
    for m in ["Supplier","Expense","ExpenseCategory","FeatureFlag"]:
        if hasattr(models,m): getattr(db.query(getattr(models,m)).filter(getattr(getattr(models,m),"business_id")==biz_id,"delete")(synchronize_session=False),"__class__",None)
    db.query(models.Customer).filter(models.Customer.business_id==biz_id).delete(synchronize_session=False)
    if user_ids: db.query(models.AuditLog).filter(models.AuditLog.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(models.User).filter(models.User.business_id==biz_id).delete(synchronize_session=False)
    db.query(models.Branch).filter(models.Branch.business_id==biz_id).delete(synchronize_session=False)
    db.query(models.Business).filter(models.Business.business_id==biz_id).delete(synchronize_session=False)
    db.commit()


def _send_deletion_whatsapp(biz):
    import os
    from twilio.rest import Client
    if not biz.phone: return
    phone = biz.phone.strip()
    if not phone.startswith("+"): phone = "+234" + phone.lstrip("0")
    Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN")).messages.create(
        from_=os.getenv("TWILIO_WHATSAPP_FROM","whatsapp:+14155238886"),
        to=f"whatsapp:{phone}",
        body=f"ProfitTrack — Your account for *{biz.name}* has been permanently deleted as requested 90 days ago. All data has been removed. Thank you for using ProfitTrack.")


def start_scheduler():
    loop = asyncio.get_event_loop()
    loop.create_task(daily_report_loop())
    loop.create_task(due_date_alerts_loop())
    loop.create_task(monthly_credit_summary_loop())
    loop.create_task(monthly_points_expiry_loop())
    loop.create_task(account_deletion_cleanup_loop())
    print("[Scheduler] Started — WhatsApp reports: hourly check, per-business report_hour")
    print("[Scheduler] Started — due date alerts at 8:00 AM Lagos")
    print("[Scheduler] Started — monthly credit summary on 1st")
    print("[Scheduler] Started — loyalty expiry on 1st")
    print("[Scheduler] Started — deletion cleanup at 2:00 AM Lagos")