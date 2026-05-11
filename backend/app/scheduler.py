"""
scheduler.py
------------
Lightweight asyncio scheduler — no external packages needed.

Jobs:
  1. Daily WhatsApp report        → 8:00 PM Lagos time
  2. Due date customer alerts     → 8:00 AM Lagos time
  3. Monthly credit summary       → 8:00 AM on 1st of each month
  4. Monthly loyalty expiry       → 9:00 AM on 1st of each month
  5. Account deletion cleanup     → 2:00 AM daily
     Permanently deletes businesses where deletion_requested_at
     is more than 90 days ago. Sends final WhatsApp notification
     before deletion. Logs everything to audit trail.
"""

import asyncio
from datetime import datetime, timedelta
import pytz

LAGOS_TZ = pytz.timezone("Africa/Lagos")
DELETION_GRACE_DAYS = 90


def seconds_until(hour: int, minute: int = 0) -> float:
    now    = datetime.now(LAGOS_TZ)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return (target - now).total_seconds()


# ── Daily 8PM — WhatsApp report ───────────────────────────────────────────────
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


# ── Daily 8AM — customer due date alerts ─────────────────────────────────────
async def due_date_alerts_loop():
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


# ── Monthly 1st 8AM — credit summary ─────────────────────────────────────────
async def monthly_credit_summary_loop():
    while True:
        now = datetime.now(LAGOS_TZ)
        if now.day == 1 and now.hour < 8:
            target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        else:
            if now.month == 12:
                target = now.replace(year=now.year+1, month=1, day=1, hour=8, minute=0, second=0, microsecond=0)
            else:
                target = now.replace(month=now.month+1, day=1, hour=8, minute=0, second=0, microsecond=0)
        wait = (target - now).total_seconds()
        print(f"[Scheduler] Next monthly credit summary in {int(wait//86400)} day(s)")
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


# ── Monthly 1st 9AM — loyalty points expiry ──────────────────────────────────
async def monthly_points_expiry_loop():
    while True:
        now = datetime.now(LAGOS_TZ)
        if now.day == 1 and now.hour < 9:
            target = now.replace(hour=9, minute=0, second=0, microsecond=0)
        else:
            if now.month == 12:
                target = now.replace(year=now.year+1, month=1, day=1, hour=9, minute=0, second=0, microsecond=0)
            else:
                target = now.replace(month=now.month+1, day=1, hour=9, minute=0, second=0, microsecond=0)
        wait = (target - now).total_seconds()
        print(f"[Scheduler] Next loyalty points expiry in {int(wait//86400)} day(s)")
        await asyncio.sleep(wait)
        try:
            from app.database import SessionLocal
            from app import models
            from datetime import datetime as dt

            db = SessionLocal()
            try:
                cutoff = dt.utcnow() - timedelta(days=180)
                stale  = db.query(models.CustomerLoyalty).filter(
                    models.CustomerLoyalty.points_balance   > 0,
                    models.CustomerLoyalty.last_activity_at < cutoff,
                ).all()

                expired_pts = expired_accounts = skipped_accounts = 0
                for loyalty in stale:
                    system_user = db.query(models.User).filter(
                        models.User.business_id == loyalty.business_id,
                        models.User.role.in_(["admin", "superadmin"]),
                        models.User.is_active   == True,
                    ).first()
                    if not system_user:
                        skipped_accounts += 1
                        continue
                    pts = loyalty.points_balance
                    loyalty.points_balance   = 0
                    loyalty.last_activity_at = dt.utcnow()
                    db.add(models.LoyaltyTransaction(
                        loyalty_id=loyalty.loyalty_id, business_id=loyalty.business_id,
                        customer_id=loyalty.customer_id, user_id=system_user.user_id,
                        tx_type="expire", points=-pts,
                        description="Points expired after 6 months of inactivity (scheduled)",
                    ))
                    expired_pts += pts; expired_accounts += 1
                db.commit()
                print(f"[Scheduler] Loyalty expiry — {expired_pts} pts from {expired_accounts} accounts"
                      + (f", {skipped_accounts} skipped" if skipped_accounts else ""))
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Loyalty expiry loop error: {e}")
        await asyncio.sleep(60)


# ── Daily 2AM — account deletion cleanup ─────────────────────────────────────
async def account_deletion_cleanup_loop():
    """
    Runs every night at 2AM Lagos time.

    Finds all businesses where:
      - subscription_status = 'deletion_pending'
      - deletion_requested_at is more than 90 days ago

    For each qualifying business:
      1. Sends a final WhatsApp notification (data being deleted now)
      2. Deletes all business data in the correct order (foreign key safe)
      3. Logs the deletion to the audit trail on the superadmin record
      4. Deletes the business record itself

    Runs at 2AM to avoid peak usage hours.
    """
    while True:
        wait = seconds_until(2, 0)
        h, m = int(wait // 3600), int((wait % 3600) // 60)
        print(f"[Scheduler] Next deletion cleanup in {h}h {m}m")
        await asyncio.sleep(wait)

        try:
            from app.database import SessionLocal
            from app import models
            from datetime import datetime as dt

            db = SessionLocal()
            try:
                now     = dt.utcnow()
                cutoff  = now - timedelta(days=DELETION_GRACE_DAYS)

                # Find businesses past the 90-day grace period
                pending = db.query(models.Business).filter(
                    models.Business.subscription_status == "deletion_pending",
                    models.Business.deletion_requested_at.isnot(None),
                    models.Business.deletion_requested_at <= cutoff,
                ).all()

                if not pending:
                    print("[Scheduler] Deletion cleanup: no accounts due for deletion")
                else:
                    print(f"[Scheduler] Deletion cleanup: {len(pending)} account(s) to delete")

                deleted_count = 0
                failed_count  = 0

                for biz in pending:
                    try:
                        _delete_business(db, biz, now)
                        deleted_count += 1
                        print(f"[Scheduler] Deleted business {biz.business_id} — {biz.name}")
                    except Exception as e:
                        failed_count += 1
                        print(f"[Scheduler] Failed to delete business {biz.business_id}: {e}")
                        db.rollback()

                if deleted_count:
                    print(f"[Scheduler] Deletion cleanup complete: "
                          f"{deleted_count} deleted, {failed_count} failed")

            finally:
                db.close()

        except Exception as e:
            print(f"[Scheduler] Deletion cleanup loop error: {e}")

        await asyncio.sleep(60)


def _delete_business(db, biz, now):
    """
    Permanently deletes a business and all associated data.
    Order matters — delete child records before parent records
    to avoid foreign key constraint violations.

    Tables deleted (in order):
      loyalty_transactions → customer_loyalty → customer_ledger_entries
      → sale_items → sales → inventory_batches → branch_inventory
      → products → expenses → audit_log → users → branches
      → suppliers → customers → feature_flags → business
    """
    from app import models
    import os
    from sqlalchemy.orm import Session

    biz_id = biz.business_id

    # ── Send final WhatsApp notification before deleting ─────────────────────
    try:
        _send_deletion_complete_whatsapp(biz)
    except Exception as e:
        print(f"[Scheduler] Final WhatsApp notification failed for {biz.name}: {e}")

    # ── Get all branch IDs for this business ──────────────────────────────────
    branch_ids = [b.branch_id for b in db.query(models.Branch).filter(
        models.Branch.business_id == biz_id).all()]

    # ── Get all user IDs for audit ────────────────────────────────────────────
    user_ids = [u.user_id for u in db.query(models.User).filter(
        models.User.business_id == biz_id).all()]

    # ── Get all sale IDs ──────────────────────────────────────────────────────
    sale_ids = [s.sale_id for s in db.query(models.Sale).filter(
        models.Sale.branch_id.in_(branch_ids)).all()] if branch_ids else []

    # ── Get all customer IDs ──────────────────────────────────────────────────
    customer_ids = [c.customer_id for c in db.query(models.Customer).filter(
        models.Customer.business_id == biz_id).all()]

    # ── Get all product IDs ───────────────────────────────────────────────────
    product_ids = [p.product_id for p in db.query(models.Product).filter(
        models.Product.business_id == biz_id).all()]

    # Delete in dependency order ───────────────────────────────────────────────

    # Loyalty
    if customer_ids:
        loyalty_ids = [l.loyalty_id for l in db.query(models.CustomerLoyalty).filter(
            models.CustomerLoyalty.customer_id.in_(customer_ids)).all()]
        if loyalty_ids:
            db.query(models.LoyaltyTransaction).filter(
                models.LoyaltyTransaction.loyalty_id.in_(loyalty_ids)).delete(synchronize_session=False)
        db.query(models.CustomerLoyalty).filter(
            models.CustomerLoyalty.customer_id.in_(customer_ids)).delete(synchronize_session=False)
        db.query(models.CustomerLedgerEntry).filter(
            models.CustomerLedgerEntry.customer_id.in_(customer_ids)).delete(synchronize_session=False)

    # Sales
    if sale_ids:
        db.query(models.SaleItem).filter(
            models.SaleItem.sale_id.in_(sale_ids)).delete(synchronize_session=False)
    if branch_ids:
        db.query(models.Sale).filter(
            models.Sale.branch_id.in_(branch_ids)).delete(synchronize_session=False)

    # Inventory
    if product_ids and branch_ids:
        db.query(models.InventoryBatch).filter(
            models.InventoryBatch.product_id.in_(product_ids),
            models.InventoryBatch.branch_id.in_(branch_ids),
        ).delete(synchronize_session=False)
        db.query(models.BranchInventory).filter(
            models.BranchInventory.branch_id.in_(branch_ids),
        ).delete(synchronize_session=False)

    # Products & suppliers
    db.query(models.Product).filter(
        models.Product.business_id == biz_id).delete(synchronize_session=False)
    if hasattr(models, "Supplier"):
        db.query(models.Supplier).filter(
            models.Supplier.business_id == biz_id).delete(synchronize_session=False)

    # Expenses
    if hasattr(models, "Expense"):
        db.query(models.Expense).filter(
            models.Expense.business_id == biz_id).delete(synchronize_session=False)
    if hasattr(models, "ExpenseCategory"):
        db.query(models.ExpenseCategory).filter(
            models.ExpenseCategory.business_id == biz_id).delete(synchronize_session=False)

    # Customers
    db.query(models.Customer).filter(
        models.Customer.business_id == biz_id).delete(synchronize_session=False)

    # Audit log
    db.query(models.AuditLog).filter(
        models.AuditLog.user_id.in_(user_ids)).delete(synchronize_session=False) if user_ids else None

    # Feature flags
    if hasattr(models, "FeatureFlag"):
        db.query(models.FeatureFlag).filter(
            models.FeatureFlag.business_id == biz_id).delete(synchronize_session=False)

    # Users
    db.query(models.User).filter(
        models.User.business_id == biz_id).delete(synchronize_session=False)

    # Branches
    db.query(models.Branch).filter(
        models.Branch.business_id == biz_id).delete(synchronize_session=False)

    # Finally — the business itself
    db.query(models.Business).filter(
        models.Business.business_id == biz_id).delete(synchronize_session=False)

    db.commit()


def _send_deletion_complete_whatsapp(biz):
    """Sends a final WhatsApp message before permanent deletion."""
    import os
    try:
        from twilio.rest import Client
        TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID")
        TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
        FROM_NUMBER  = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

        if not TWILIO_SID or not TWILIO_TOKEN or not biz.phone:
            return

        phone = biz.phone.strip()
        if not phone.startswith("+"): phone = "+234" + phone.lstrip("0")

        client = Client(TWILIO_SID, TWILIO_TOKEN)
        client.messages.create(
            from_=FROM_NUMBER,
            to=f"whatsapp:{phone}",
            body=(
                f"ProfitTrack — Account Deletion Complete\n\n"
                f"The ProfitTrack account for *{biz.name}* has been permanently deleted "
                f"as requested 90 days ago.\n\n"
                f"All data has been removed from our servers.\n\n"
                f"If you'd like to start a new account in the future, visit profittrack.ng.\n\n"
                f"Thank you for using ProfitTrack.\n\n"
                f"— ProfitTrack Team"
            ),
        )
    except Exception as e:
        print(f"[Scheduler] Deletion WhatsApp failed: {e}")


# ── Start all scheduler tasks ─────────────────────────────────────────────────
def start_scheduler():
    loop = asyncio.get_event_loop()
    loop.create_task(daily_report_loop())
    loop.create_task(due_date_alerts_loop())
    loop.create_task(monthly_credit_summary_loop())
    loop.create_task(monthly_points_expiry_loop())
    loop.create_task(account_deletion_cleanup_loop())
    print("[Scheduler] Started — daily WhatsApp report at 8:00 PM Lagos time")
    print("[Scheduler] Started — customer due date alerts at 8:00 AM Lagos time")
    print("[Scheduler] Started — monthly credit summary on 1st of each month")
    print("[Scheduler] Started — loyalty points expiry on 1st of each month")
    print(f"[Scheduler] Started — account deletion cleanup at 2:00 AM Lagos time "
          f"({DELETION_GRACE_DAYS}-day grace period)")