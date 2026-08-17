from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta
from decimal import Decimal

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


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _resolve_branch(db, user, requested_branch_id):
    branch_id = user.branch_id if user.role not in (SUPERADMIN_ROLE, "admin") else (requested_branch_id or user.branch_id)
    if not branch_id:
        raise HTTPException(status_code=400, detail="A branch is required")
    branch = db.query(models.Branch).filter(models.Branch.branch_id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    if user.role != SUPERADMIN_ROLE and branch.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized for this branch")
    if user.role not in (SUPERADMIN_ROLE, "admin") and branch_id != user.branch_id:
        raise HTTPException(status_code=403, detail="Not authorized for this branch")
    return branch


def _commit_or_rollback(db):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ledger transaction conflicts with existing evidence") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ledger transaction failed") from exc


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
    amount = _money(data.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    try:
        customer = db.query(models.Customer).filter(
            models.Customer.customer_id == data.customer_id
        ).with_for_update().first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        if user.role != SUPERADMIN_ROLE and customer.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        if not customer.credit_enabled:
            raise HTTPException(status_code=400, detail="Customer is not credit-enabled")
        branch = _resolve_branch(db, user, data.branch_id)
        if customer.business_id != branch.business_id:
            raise HTTPException(status_code=403, detail="Customer is outside the authorised business")

        if data.reference_id:
            sale = db.query(models.Sale).filter(models.Sale.sale_id == data.reference_id).first()
            if not sale:
                raise HTTPException(status_code=404, detail="Referenced sale not found")
            if sale.branch_id != branch.branch_id:
                raise HTTPException(status_code=403, detail="Referenced sale is outside the authorised branch")
            if sale.customer_id and sale.customer_id != customer.customer_id:
                raise HTTPException(status_code=409, detail="Referenced sale belongs to another customer")

        _check_credit_limit(db, customer, float(amount))
        due_date = data.due_date or (date.today() + timedelta(days=customer.credit_due_days))
        entry = models.CustomerLedgerEntry(
            business_id=branch.business_id,
            branch_id=branch.branch_id,
            customer_id=data.customer_id,
            user_id=user.user_id,
            entry_type="debit",
            amount=amount,
            description=data.description or "Manual account charge",
            reference_id=data.reference_id,
            source_type="manual_debit",
            due_date=due_date,
        )
        db.add(entry)
        db.flush()
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="CREATE",
            table_name="customer_ledger_entries",
            record_id=entry.entry_id,
            description=f"Manual debit {amount} for customer #{customer.customer_id}",
        ))
        _commit_or_rollback(db)
        db.refresh(entry)
        return {"message": "Debit entry added", "entry_id": entry.entry_id, "new_balance": _get_balance(db, customer.customer_id)}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ledger debit failed") from exc


# ── Add credit entry (payment received) ──────────────────────────────────────
@router.post("/credit")
def add_credit(
    data: CreditEntry,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    amount = _money(data.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Invalid payment method. Use: {', '.join(PAYMENT_METHODS)}")
    try:
        customer = db.query(models.Customer).filter(
            models.Customer.customer_id == data.customer_id
        ).with_for_update().first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        if user.role != SUPERADMIN_ROLE and customer.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        if not customer.credit_enabled:
            raise HTTPException(status_code=400, detail="Customer is not credit-enabled")
        branch = _resolve_branch(db, user, data.branch_id)
        if customer.business_id != branch.business_id:
            raise HTTPException(status_code=403, detail="Customer is outside the authorised business")
        current_balance = _money(_get_balance(db, customer.customer_id))
        if amount > current_balance:
            raise HTTPException(status_code=409, detail="Payment exceeds the outstanding ledger balance")

        entry = models.CustomerLedgerEntry(
            business_id=branch.business_id,
            branch_id=branch.branch_id,
            customer_id=data.customer_id,
            user_id=user.user_id,
            entry_type="credit",
            amount=amount,
            description=data.description or f"Manual payment via {data.payment_method}",
            source_type="manual_payment",
            payment_method=data.payment_method,
        )
        db.add(entry)
        db.flush()
        new_balance = current_balance - amount
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="CREATE",
            table_name="customer_ledger_entries",
            record_id=entry.entry_id,
            description=f"Manual payment {amount} for customer #{customer.customer_id}; balance {new_balance}",
        ))
        _commit_or_rollback(db)
        db.refresh(entry)
        return {"message": "Payment recorded", "entry_id": entry.entry_id, "new_balance": float(new_balance)}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ledger payment failed") from exc


# ── Write off a debit entry — admin only ──────────────────────────────────────
@router.patch("/entries/{entry_id}/write-off")
def write_off_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    try:
        entry = db.query(models.CustomerLedgerEntry).filter(
            models.CustomerLedgerEntry.entry_id == entry_id
        ).with_for_update().first()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        if entry.entry_type != "debit":
            raise HTTPException(status_code=400, detail="Can only write off debit entries")
        if entry.source_type in ("debt", "debt_payment", "debt_writeoff"):
            raise HTTPException(status_code=409, detail="Debt-linked entries must be changed through debt operations")
        if user.role != SUPERADMIN_ROLE and entry.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        duplicate = db.query(models.CustomerLedgerEntry).filter(
            models.CustomerLedgerEntry.reversal_of_entry_id == entry_id
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="Entry has already been reversed or written off")
        current_balance = _money(_get_balance(db, entry.customer_id))
        if _money(entry.amount) > current_balance:
            raise HTTPException(status_code=409, detail="Write-off exceeds the outstanding ledger balance")

        write_off = models.CustomerLedgerEntry(
            business_id=entry.business_id,
            branch_id=entry.branch_id,
            customer_id=entry.customer_id,
            user_id=user.user_id,
            entry_type="credit",
            amount=entry.amount,
            description=f"Write-off of ledger entry #{entry_id}",
            source_type="writeoff",
            reversal_of_entry_id=entry_id,
        )
        db.add(write_off)
        db.flush()
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="UPDATE",
            table_name="customer_ledger_entries",
            record_id=write_off.entry_id,
            description=f"Ledger debit #{entry_id} written off by entry #{write_off.entry_id}",
        ))
        _commit_or_rollback(db)
        return {"message": f"Entry #{entry_id} written off", "amount": float(entry.amount), "write_off_entry_id": write_off.entry_id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ledger write-off failed") from exc


# ── Delete a debit entry — admin only ────────────────────────────────────────
@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    """Preserve financial history by posting an opposite reversal entry."""
    try:
        entry = db.query(models.CustomerLedgerEntry).filter(
            models.CustomerLedgerEntry.entry_id == entry_id
        ).with_for_update().first()
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        if user.role != SUPERADMIN_ROLE and entry.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        if entry.source_type in ("debt", "debt_payment", "debt_writeoff"):
            raise HTTPException(status_code=409, detail="Debt-linked entries must be changed through debt operations")
        duplicate = db.query(models.CustomerLedgerEntry).filter(
            models.CustomerLedgerEntry.reversal_of_entry_id == entry_id
        ).first()
        if duplicate:
            raise HTTPException(status_code=409, detail="Entry has already been reversed")

        reversal = models.CustomerLedgerEntry(
            business_id=entry.business_id,
            branch_id=entry.branch_id,
            customer_id=entry.customer_id,
            user_id=user.user_id,
            entry_type="credit" if entry.entry_type == "debit" else "debit",
            amount=entry.amount,
            description=f"Reversal of ledger entry #{entry_id}",
            source_type="reversal",
            reversal_of_entry_id=entry_id,
        )
        db.add(reversal)
        db.flush()
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="UPDATE",
            table_name="customer_ledger_entries",
            record_id=reversal.entry_id,
            description=f"Ledger entry #{entry_id} reversed by immutable entry #{reversal.entry_id}",
        ))
        _commit_or_rollback(db)
        return {"message": f"Entry #{entry_id} reversed", "reversal_entry_id": reversal.entry_id}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ledger reversal failed") from exc


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