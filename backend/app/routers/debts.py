from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

from app.database import get_db
from app import models
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE

router = APIRouter(prefix="/debts", tags=["Debts"])

PAYMENT_METHODS = ["cash", "card", "transfer"]


# ── Schemas ───────────────────────────────────────────────────────────────────
class CustomerCreate(BaseModel):
    full_name: str
    phone:     Optional[str] = None

class DebtCreate(BaseModel):
    customer_id:  Optional[int]   = None   # existing customer
    new_customer: Optional[CustomerCreate] = None  # or create inline
    total_amount: float
    amount_paid:  float = 0
    description:  Optional[str]  = None
    due_date:     Optional[date] = None
    sale_id:      Optional[int]  = None
    branch_id:    Optional[int]  = None

class DebtPaymentCreate(BaseModel):
    amount:         float
    payment_method: str = "cash"
    notes:          Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _scope(q, user, branch_id: Optional[int] = None):
    if user.role == SUPERADMIN_ROLE:
        if branch_id:
            q = q.filter(models.Debt.branch_id == branch_id)
    else:
        q = q.filter(models.Debt.business_id == user.business_id)
        if branch_id:
            q = q.filter(models.Debt.branch_id == branch_id)
    return q


def _debt_dict(debt, db):
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == debt.customer_id
    ).first()
    recorder = db.query(models.User).filter(
        models.User.user_id == debt.user_id
    ).first()
    return {
        "debt_id":      debt.debt_id,
        "customer_id":  debt.customer_id,
        "customer_name": customer.full_name if customer else "Unknown",
        "customer_phone": customer.phone if customer else None,
        "sale_id":      debt.sale_id,
        "total_amount": float(debt.total_amount),
        "amount_paid":  float(debt.amount_paid),
        "balance":      float(debt.balance),
        "description":  debt.description,
        "due_date":     str(debt.due_date) if debt.due_date else None,
        "status":       debt.status,
        "recorded_by":  recorder.full_name if recorder else "Unknown",
        "branch_id":    debt.branch_id,
        "created_at":   debt.created_at,
        "updated_at":   debt.updated_at,
    }


# ── Summary ───────────────────────────────────────────────────────────────────
@router.get("/summary")
def debt_summary(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    q = db.query(models.Debt)
    q = _scope(q, user, branch_id)

    all_debts = q.all()

    total_outstanding = sum(float(d.balance) for d in all_debts if d.status not in ("paid", "written_off"))
    total_debtors     = len(set(d.customer_id for d in all_debts if d.status not in ("paid", "written_off")))
    overdue_count     = sum(1 for d in all_debts if d.due_date and d.due_date < date.today() and d.status not in ("paid", "written_off"))
    paid_count        = sum(1 for d in all_debts if d.status == "paid")
    open_count        = sum(1 for d in all_debts if d.status == "open")
    partial_count     = sum(1 for d in all_debts if d.status == "partial")

    return {
        "total_outstanding": total_outstanding,
        "total_debtors":     total_debtors,
        "overdue_count":     overdue_count,
        "open_count":        open_count,
        "partial_count":     partial_count,
        "paid_count":        paid_count,
    }


# ── List debts ────────────────────────────────────────────────────────────────
@router.get("/")
def list_debts(
    branch_id:  Optional[int] = Query(None),
    status:     Optional[str] = Query(None),
    search:     Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    q = db.query(models.Debt)
    q = _scope(q, user, branch_id)

    if status:
        q = q.filter(models.Debt.status == status)

    debts = q.order_by(models.Debt.created_at.desc()).all()
    result = [_debt_dict(d, db) for d in debts]

    # Search filter (client-side on resolved names)
    if search:
        s = search.lower()
        result = [
            d for d in result
            if s in (d["customer_name"] or "").lower()
            or s in (d["customer_phone"] or "").lower()
            or s in (d["description"] or "").lower()
        ]

    return result


# ── Create debt ───────────────────────────────────────────────────────────────
@router.post("/")
def create_debt(
    data: DebtCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    if data.total_amount <= 0:
        raise HTTPException(status_code=400, detail="Total amount must be greater than zero")

    if data.amount_paid < 0:
        raise HTTPException(status_code=400, detail="Amount paid cannot be negative")

    if data.amount_paid > data.total_amount:
        raise HTTPException(status_code=400, detail="Amount paid cannot exceed total amount")

    # ── Resolve or create customer ────────────────────────────────────────────
    customer_id = data.customer_id

    if not customer_id:
        if not data.new_customer:
            raise HTTPException(status_code=400, detail="Provide customer_id or new_customer details")

        # Check if customer with same phone already exists
        if data.new_customer.phone:
            existing = db.query(models.Customer).filter(
                models.Customer.phone == data.new_customer.phone
            ).first()
            if existing:
                customer_id = existing.customer_id
            else:
                new_cust = models.Customer(
                    full_name=data.new_customer.full_name,
                    phone=data.new_customer.phone,
                )
                db.add(new_cust)
                db.flush()
                customer_id = new_cust.customer_id
        else:
            new_cust = models.Customer(full_name=data.new_customer.full_name)
            db.add(new_cust)
            db.flush()
            customer_id = new_cust.customer_id

    # Determine branch
    branch_id = user.branch_id if user.role == "manager" else (data.branch_id or user.branch_id)

    # Calculate balance and status
    balance = data.total_amount - data.amount_paid
    if balance <= 0:
        status = "paid"
    elif data.amount_paid > 0:
        status = "partial"
    else:
        status = "open"

    debt = models.Debt(
        business_id=user.business_id,
        branch_id=branch_id,
        customer_id=customer_id,
        user_id=user.user_id,
        sale_id=data.sale_id,
        total_amount=data.total_amount,
        amount_paid=data.amount_paid,
        balance=balance,
        description=data.description,
        due_date=data.due_date,
        status=status,
    )
    db.add(debt)
    db.flush()

    # If there was an initial payment, record it
    if data.amount_paid > 0:
        db.add(models.DebtPayment(
            debt_id=debt.debt_id,
            user_id=user.user_id,
            amount=data.amount_paid,
            payment_method="cash",
            notes="Initial payment at time of debt creation",
        ))

    # Audit log
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    db.add(models.AuditLog(
        user_id=user.user_id,
        action="CREATE",
        table_name="debts",
        record_id=debt.debt_id,
        description=f"Debt created for {customer.full_name if customer else 'customer'} — ₦{data.total_amount:,.2f} total, ₦{data.amount_paid:,.2f} paid, ₦{balance:,.2f} outstanding",
    ))

    db.commit()
    db.refresh(debt)
    return _debt_dict(debt, db)


# ── Get single debt ───────────────────────────────────────────────────────────
@router.get("/{debt_id}")
def get_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    debt = db.query(models.Debt).filter(models.Debt.debt_id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    if user.role != SUPERADMIN_ROLE and debt.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return _debt_dict(debt, db)


# ── Record payment ────────────────────────────────────────────────────────────
@router.post("/{debt_id}/payments")
def record_payment(
    debt_id: int,
    data: DebtPaymentCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)   # all roles — cashier, manager, admin
):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Invalid payment method. Use: {', '.join(PAYMENT_METHODS)}")

    debt = db.query(models.Debt).filter(models.Debt.debt_id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")

    # Scope check — cashier must be in the same business
    if user.role != SUPERADMIN_ROLE:
        if debt.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized")

    if debt.status in ("paid", "written_off"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot record payment on a {debt.status} debt"
        )

    # Cap payment at remaining balance
    actual_amount = min(data.amount, float(debt.balance))

    payment = models.DebtPayment(
        debt_id=debt_id,
        user_id=user.user_id,
        amount=actual_amount,
        payment_method=data.payment_method,
        notes=data.notes,
    )
    db.add(payment)

    # Update debt totals
    new_paid    = float(debt.amount_paid) + actual_amount
    new_balance = float(debt.total_amount) - new_paid

    debt.amount_paid = new_paid
    debt.balance     = max(new_balance, 0)
    debt.updated_at  = datetime.utcnow()

    if debt.balance <= 0:
        debt.status = "paid"
    elif new_paid > 0:
        debt.status = "partial"

    # Audit log
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == debt.customer_id
    ).first()
    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="debts",
        record_id=debt_id,
        description=f"Payment of ₦{actual_amount:,.2f} recorded for {customer.full_name if customer else 'customer'} — balance now ₦{debt.balance:,.2f}",
    ))

    db.commit()
    db.refresh(debt)
    return {
        "message":     "Payment recorded successfully",
        "debt":        _debt_dict(debt, db),
        "payment_id":  payment.payment_id,
        "amount_paid": actual_amount,
    }


# ── Payment history for a debt ────────────────────────────────────────────────
@router.get("/{debt_id}/payments")
def get_debt_payments(
    debt_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    debt = db.query(models.Debt).filter(models.Debt.debt_id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    if user.role != SUPERADMIN_ROLE and debt.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    payments = db.query(models.DebtPayment).filter(
        models.DebtPayment.debt_id == debt_id
    ).order_by(models.DebtPayment.created_at.desc()).all()

    return [
        {
            "payment_id":     p.payment_id,
            "amount":         float(p.amount),
            "payment_method": p.payment_method,
            "notes":          p.notes,
            "recorded_by":    db.query(models.User).filter(models.User.user_id == p.user_id).first().full_name,
            "created_at":     p.created_at,
        }
        for p in payments
    ]


# ── Write off debt ────────────────────────────────────────────────────────────
@router.patch("/{debt_id}/write-off")
def write_off_debt(
    debt_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    debt = db.query(models.Debt).filter(models.Debt.debt_id == debt_id).first()
    if not debt:
        raise HTTPException(status_code=404, detail="Debt not found")
    if user.role != SUPERADMIN_ROLE and debt.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if debt.status == "paid":
        raise HTTPException(status_code=400, detail="Cannot write off a paid debt")

    debt.status     = "written_off"
    debt.updated_at = datetime.utcnow()

    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == debt.customer_id
    ).first()
    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="debts",
        record_id=debt_id,
        description=f"Debt written off for {customer.full_name if customer else 'customer'} — ₦{float(debt.balance):,.2f} outstanding",
    ))

    db.commit()
    return {"message": "Debt written off", "debt_id": debt_id}


# ── Search customers (for debt creation form) ─────────────────────────────────
@router.get("/customers/search")
def search_customers(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    results = db.query(models.Customer).filter(
        (models.Customer.full_name.ilike(f"%{q}%")) |
        (models.Customer.phone.ilike(f"%{q}%"))
    ).limit(10).all()

    return [
        {
            "customer_id": c.customer_id,
            "full_name":   c.full_name,
            "phone":       c.phone,
        }
        for c in results
    ]