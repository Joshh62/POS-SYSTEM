from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta

from app.database import get_db
from app import models
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE

router = APIRouter(prefix="/ledger", tags=["Customer Ledger"])

PAYMENT_METHODS = ["cash", "card", "transfer"]


# ── Schemas ───────────────────────────────────────────────────────────────────
class DebitEntry(BaseModel):
    customer_id:  int
    amount:       float
    description:  Optional[str] = None
    reference_id: Optional[int] = None   # sale_id
    due_date:     Optional[date] = None  # override auto-calculated due date
    branch_id:    Optional[int] = None

class CreditEntry(BaseModel):
    customer_id:    int
    amount:         float
    payment_method: str = "cash"
    description:    Optional[str] = None
    branch_id:      Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_customer(db, customer_id, user):
    c = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    if user.role != SUPERADMIN_ROLE and c.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return c

def _get_balance(db, customer_id: int) -> float:
    debits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
        models.CustomerLedgerEntry.customer_id == customer_id,
        models.CustomerLedgerEntry.entry_type  == "debit",
    ).scalar() or 0
    credits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
        models.CustomerLedgerEntry.customer_id == customer_id,
        models.CustomerLedgerEntry.entry_type  == "credit",
    ).scalar() or 0
    return float(debits) - float(credits)

def _check_credit_limit(db, customer, additional_debit: float):
    if not customer.credit_limit:
        return   # no limit
    current_balance = _get_balance(db, customer.customer_id)
    new_balance = current_balance + additional_debit
    if new_balance > float(customer.credit_limit):
        raise HTTPException(
            status_code=400,
            detail=f"Credit limit of ₦{float(customer.credit_limit):,.2f} would be exceeded. "
                   f"Current balance: ₦{current_balance:,.2f}, requested: ₦{additional_debit:,.2f}"
        )


# ── Get ledger for a customer ─────────────────────────────────────────────────
@router.get("/customer/{customer_id}")
def get_customer_ledger(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    customer = _get_customer(db, customer_id, user)
    if not customer.credit_enabled:
        raise HTTPException(status_code=400, detail="Customer is not credit-enabled")

    entries = db.query(models.CustomerLedgerEntry).filter(
        models.CustomerLedgerEntry.customer_id == customer_id
    ).order_by(models.CustomerLedgerEntry.created_at.desc()).all()

    balance = _get_balance(db, customer_id)
    today   = date.today()

    overdue_entries = [
        e for e in entries
        if e.entry_type == "debit" and e.due_date and e.due_date < today
    ]

    return {
        "customer_id":   customer_id,
        "customer_name": customer.full_name,
        "balance":       balance,
        "status":        "credit" if balance < 0 else ("clear" if balance == 0 else "owing"),
        "has_overdue":   len(overdue_entries) > 0,
        "overdue_count": len(overdue_entries),
        "entries": [
            {
                "entry_id":    e.entry_id,
                "entry_type":  e.entry_type,
                "amount":      float(e.amount),
                "description": e.description,
                "reference_id":e.reference_id,
                "due_date":    str(e.due_date) if e.due_date else None,
                "is_overdue":  bool(e.due_date and e.due_date < today and e.entry_type == "debit"),
                "created_at":  e.created_at,
                "recorded_by": db.query(models.User).filter(
                    models.User.user_id == e.user_id
                ).first().full_name,
            }
            for e in entries
        ],
    }


# ── Add debit entry (charge to account) ──────────────────────────────────────
@router.post("/debit")
def add_debit(
    data: DebitEntry,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    customer = _get_customer(db, data.customer_id, user)

    if not customer.credit_enabled:
        raise HTTPException(status_code=400, detail="Customer is not credit-enabled")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    _check_credit_limit(db, customer, data.amount)

    branch_id = user.branch_id if user.role == "manager" else (data.branch_id or user.branch_id)

    # Auto-calculate due date if not provided
    due_date = data.due_date or (date.today() + timedelta(days=customer.credit_due_days))

    entry = models.CustomerLedgerEntry(
        business_id  = user.business_id,
        branch_id    = branch_id,
        customer_id  = data.customer_id,
        user_id      = user.user_id,
        entry_type   = "debit",
        amount       = data.amount,
        description  = data.description or "Goods purchased on credit",
        reference_id = data.reference_id,
        due_date     = due_date,
    )
    db.add(entry)

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="CREATE",
        table_name="customer_ledger_entries",
        record_id=0,
        description=f"Debit ₦{data.amount:,.2f} for {customer.full_name} — due {due_date}",
    ))

    db.commit()
    db.refresh(entry)

    return {
        "entry_id":   entry.entry_id,
        "entry_type": "debit",
        "amount":     float(entry.amount),
        "due_date":   str(entry.due_date),
        "balance":    _get_balance(db, data.customer_id),
        "message":    f"Debit of ₦{data.amount:,.2f} recorded. Due: {due_date}",
    }


# ── Add credit entry (payment received) ──────────────────────────────────────
@router.post("/credit")
def add_credit(
    data: CreditEntry,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)   # all roles
):
    customer = _get_customer(db, data.customer_id, user)

    if not customer.credit_enabled:
        raise HTTPException(status_code=400, detail="Customer is not credit-enabled")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Invalid payment method. Use: {', '.join(PAYMENT_METHODS)}")

    branch_id = user.branch_id if hasattr(user, "branch_id") else (data.branch_id or 1)

    entry = models.CustomerLedgerEntry(
        business_id  = user.business_id,
        branch_id    = branch_id,
        customer_id  = data.customer_id,
        user_id      = user.user_id,
        entry_type   = "credit",
        amount       = data.amount,
        description  = data.description or f"Payment received via {data.payment_method}",
        due_date     = None,
    )
    db.add(entry)

    new_balance = _get_balance(db, data.customer_id) - data.amount

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="customer_ledger_entries",
        record_id=0,
        description=f"Payment ₦{data.amount:,.2f} from {customer.full_name} via {data.payment_method} — new balance ₦{new_balance:,.2f}",
    ))

    db.commit()
    db.refresh(entry)

    final_balance = _get_balance(db, data.customer_id)

    return {
        "entry_id":    entry.entry_id,
        "entry_type":  "credit",
        "amount":      float(entry.amount),
        "balance":     final_balance,
        "status":      "credit" if final_balance < 0 else ("clear" if final_balance == 0 else "owing"),
        "message":     f"Payment of ₦{data.amount:,.2f} recorded. {'Account cleared!' if final_balance <= 0 else f'Remaining balance: ₦{final_balance:,.2f}'}",
    }


# ── Write off a debit entry — admin only ──────────────────────────────────────
@router.patch("/entries/{entry_id}/write-off")
def write_off_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    entry = db.query(models.CustomerLedgerEntry).filter(
        models.CustomerLedgerEntry.entry_id == entry_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.entry_type != "debit":
        raise HTTPException(status_code=400, detail="Can only write off debit entries")
    if user.role != SUPERADMIN_ROLE and entry.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Write off = add a credit entry equal to the debit amount
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == entry.customer_id
    ).first()

    write_off = models.CustomerLedgerEntry(
        business_id  = entry.business_id,
        branch_id    = entry.branch_id,
        customer_id  = entry.customer_id,
        user_id      = user.user_id,
        entry_type   = "credit",
        amount       = entry.amount,
        description  = f"Write-off of debit entry #{entry_id}",
        reference_id = entry_id,
    )
    db.add(write_off)

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="DELETE",
        table_name="customer_ledger_entries",
        record_id=entry_id,
        description=f"Debit entry #{entry_id} written off for {customer.full_name if customer else 'customer'} — ₦{float(entry.amount):,.2f}",
    ))

    db.commit()
    return {"message": f"Entry #{entry_id} written off", "amount": float(entry.amount)}


# ── Delete a debit entry — admin only ────────────────────────────────────────
@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    entry = db.query(models.CustomerLedgerEntry).filter(
        models.CustomerLedgerEntry.entry_id == entry_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if user.role != SUPERADMIN_ROLE and entry.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == entry.customer_id
    ).first()

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="DELETE",
        table_name="customer_ledger_entries",
        record_id=entry_id,
        description=f"Entry #{entry_id} deleted for {customer.full_name if customer else 'customer'} — {entry.entry_type} ₦{float(entry.amount):,.2f}",
    ))

    db.delete(entry)
    db.commit()
    return {"message": f"Entry #{entry_id} deleted"}


# ── Credit accounts summary (for Reports page) ────────────────────────────────
@router.get("/summary")
def credit_accounts_summary(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    q = db.query(models.Customer).filter(models.Customer.credit_enabled == True)
    if user.role != SUPERADMIN_ROLE:
        q = q.filter(models.Customer.business_id == user.business_id)

    credit_customers = q.all()
    today = date.today()

    results = []
    total_outstanding = 0

    for c in credit_customers:
        balance = _get_balance(db, c.customer_id)
        if balance == 0:
            continue   # skip cleared accounts from summary

        last_entry = db.query(models.CustomerLedgerEntry).filter(
            models.CustomerLedgerEntry.customer_id == c.customer_id,
            models.CustomerLedgerEntry.entry_type  == "credit",
        ).order_by(models.CustomerLedgerEntry.created_at.desc()).first()

        overdue_entries = db.query(models.CustomerLedgerEntry).filter(
            models.CustomerLedgerEntry.customer_id == c.customer_id,
            models.CustomerLedgerEntry.entry_type  == "debit",
            models.CustomerLedgerEntry.due_date    < today,
        ).all()

        if balance > 0:
            total_outstanding += balance

        results.append({
            "customer_id":   c.customer_id,
            "full_name":     c.full_name,
            "phone":         c.phone,
            "balance":       balance,
            "is_overdue":    len(overdue_entries) > 0 and balance > 0,
            "overdue_count": len(overdue_entries),
            "last_payment":  last_entry.created_at if last_entry else None,
            "credit_limit":  float(c.credit_limit) if c.credit_limit else None,
            "credit_due_days": c.credit_due_days,
        })

    results.sort(key=lambda x: x["balance"], reverse=True)

    return {
        "total_outstanding": total_outstanding,
        "total_accounts":    len(results),
        "overdue_accounts":  sum(1 for r in results if r["is_overdue"]),
        "accounts":          results,
    }