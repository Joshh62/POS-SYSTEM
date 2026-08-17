from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal

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
        return q
    q = q.filter(models.Debt.business_id == user.business_id)
    if user.role == "manager":
        if branch_id and branch_id != user.branch_id:
            raise HTTPException(status_code=403, detail="Not authorized for this branch")
        return q.filter(models.Debt.branch_id == user.branch_id)
    if branch_id:
        q = q.filter(models.Debt.branch_id == branch_id)
    return q


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _resolve_branch(db, user, requested_branch_id: Optional[int]):
    branch_id = user.branch_id if user.role == "manager" else (requested_branch_id or user.branch_id)
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


def _resolve_customer(db, user, business_id: int, customer_id: Optional[int], new_customer):
    if bool(customer_id) == bool(new_customer):
        raise HTTPException(status_code=400, detail="Provide exactly one of customer_id or new_customer")
    if customer_id:
        customer = db.query(models.Customer).filter(
            models.Customer.customer_id == customer_id
        ).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        if customer.business_id != business_id:
            raise HTTPException(status_code=403, detail="Customer is outside the authorised business")
        return customer

    name = (new_customer.full_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Customer name is required")
    phone = (new_customer.phone or "").strip() or None
    if phone:
        existing = db.query(models.Customer).filter(models.Customer.phone == phone).first()
        if existing:
            if existing.business_id != business_id:
                raise HTTPException(status_code=409, detail="Customer phone is unavailable")
            return existing
    customer = models.Customer(
        business_id=business_id,
        full_name=name,
        phone=phone,
        credit_enabled=True,
    )
    db.add(customer)
    db.flush()
    return customer


def _ledger_balance(db, customer_id: int) -> Decimal:
    debits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
        models.CustomerLedgerEntry.customer_id == customer_id,
        models.CustomerLedgerEntry.entry_type == "debit",
    ).scalar() or 0
    credits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
        models.CustomerLedgerEntry.customer_id == customer_id,
        models.CustomerLedgerEntry.entry_type == "credit",
    ).scalar() or 0
    return _money(debits) - _money(credits)


def _commit_or_rollback(db):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Receivables transaction conflicts with existing evidence") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Receivables transaction failed") from exc


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
    total = _money(data.total_amount)
    initial_paid = _money(data.amount_paid)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Total amount must be greater than zero")
    if initial_paid < 0 or initial_paid > total:
        raise HTTPException(status_code=400, detail="Initial payment must be between zero and total amount")

    try:
        branch = _resolve_branch(db, user, data.branch_id)
        customer = _resolve_customer(
            db, user, branch.business_id, data.customer_id, data.new_customer
        )
        customer.credit_enabled = True

        if data.sale_id:
            sale = db.query(models.Sale).filter(models.Sale.sale_id == data.sale_id).first()
            if not sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            if sale.branch_id != branch.branch_id:
                raise HTTPException(status_code=403, detail="Sale is outside the authorised branch")
            if sale.customer_id and sale.customer_id != customer.customer_id:
                raise HTTPException(status_code=409, detail="Sale and debt customer do not match")
            duplicate = db.query(models.Debt).filter(models.Debt.sale_id == data.sale_id).first()
            if duplicate:
                raise HTTPException(status_code=409, detail="A debt already exists for this sale")

        if customer.credit_limit:
            projected = _ledger_balance(db, customer.customer_id) + total
            if projected > _money(customer.credit_limit):
                raise HTTPException(status_code=409, detail="Customer credit limit would be exceeded")

        debt = models.Debt(
            business_id=branch.business_id,
            branch_id=branch.branch_id,
            customer_id=customer.customer_id,
            user_id=user.user_id,
            sale_id=data.sale_id,
            total_amount=total,
            amount_paid=Decimal("0.00"),
            balance=total,
            description=data.description,
            due_date=data.due_date,
            status="open",
        )
        db.add(debt)
        db.flush()

        db.add(models.CustomerLedgerEntry(
            business_id=branch.business_id,
            branch_id=branch.branch_id,
            customer_id=customer.customer_id,
            user_id=user.user_id,
            entry_type="debit",
            amount=total,
            description=data.description or f"Debt #{debt.debt_id}",
            reference_id=data.sale_id,
            source_type="debt",
            debt_id=debt.debt_id,
            due_date=data.due_date,
        ))

        if initial_paid > 0:
            payment = models.DebtPayment(
                debt_id=debt.debt_id,
                user_id=user.user_id,
                amount=initial_paid,
                payment_method="cash",
                notes="Initial payment at debt creation",
            )
            db.add(payment)
            db.flush()
            db.add(models.CustomerLedgerEntry(
                business_id=branch.business_id,
                branch_id=branch.branch_id,
                customer_id=customer.customer_id,
                user_id=user.user_id,
                entry_type="credit",
                amount=initial_paid,
                description=f"Initial payment for debt #{debt.debt_id}",
                source_type="debt_payment",
                debt_id=debt.debt_id,
                debt_payment_id=payment.payment_id,
                payment_method="cash",
            ))
            debt.amount_paid = initial_paid
            debt.balance = total - initial_paid
            debt.status = "paid" if debt.balance == 0 else "partial"

        db.add(models.AuditLog(
            user_id=user.user_id,
            action="CREATE",
            table_name="debts",
            record_id=debt.debt_id,
            description=f"Debt created for customer #{customer.customer_id}; total {total}; paid {initial_paid}; balance {debt.balance}",
        ))
        _commit_or_rollback(db)
        db.refresh(debt)
        return _debt_dict(debt, db)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Debt creation failed") from exc


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
    if user.role == "manager" and debt.branch_id != user.branch_id:
        raise HTTPException(status_code=403, detail="Not authorized for this branch")
    return _debt_dict(debt, db)


# ── Record payment ────────────────────────────────────────────────────────────
@router.post("/{debt_id}/payments")
def record_payment(
    debt_id: int,
    data: DebtPaymentCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    amount = _money(data.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Invalid payment method. Use: {', '.join(PAYMENT_METHODS)}")

    try:
        debt = db.query(models.Debt).filter(
            models.Debt.debt_id == debt_id
        ).with_for_update().first()
        if not debt:
            raise HTTPException(status_code=404, detail="Debt not found")
        if user.role != SUPERADMIN_ROLE and debt.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        if user.role not in (SUPERADMIN_ROLE, "admin") and debt.branch_id != user.branch_id:
            raise HTTPException(status_code=403, detail="Not authorized for this branch")
        if debt.status in ("paid", "written_off"):
            raise HTTPException(status_code=409, detail=f"Cannot pay a {debt.status} debt")
        if amount > _money(debt.balance):
            raise HTTPException(status_code=409, detail="Payment exceeds the outstanding balance")

        payment = models.DebtPayment(
            debt_id=debt_id,
            user_id=user.user_id,
            amount=amount,
            payment_method=data.payment_method,
            notes=data.notes,
        )
        db.add(payment)
        db.flush()

        debt.amount_paid = _money(debt.amount_paid) + amount
        debt.balance = _money(debt.total_amount) - _money(debt.amount_paid)
        debt.status = "paid" if debt.balance == 0 else "partial"
        debt.updated_at = datetime.utcnow()

        db.add(models.CustomerLedgerEntry(
            business_id=debt.business_id,
            branch_id=debt.branch_id,
            customer_id=debt.customer_id,
            user_id=user.user_id,
            entry_type="credit",
            amount=amount,
            description=f"Payment for debt #{debt_id}",
            source_type="debt_payment",
            debt_id=debt_id,
            debt_payment_id=payment.payment_id,
            payment_method=data.payment_method,
        ))
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="UPDATE",
            table_name="debts",
            record_id=debt_id,
            description=f"Payment #{payment.payment_id} of {amount} recorded; balance {debt.balance}",
        ))
        _commit_or_rollback(db)
        db.refresh(debt)
        return {
            "message": "Payment recorded successfully",
            "debt": _debt_dict(debt, db),
            "payment_id": payment.payment_id,
            "amount_paid": float(amount),
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Debt payment failed") from exc


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
    if user.role == "manager" and debt.branch_id != user.branch_id:
        raise HTTPException(status_code=403, detail="Not authorized for this branch")

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
    try:
        debt = db.query(models.Debt).filter(
            models.Debt.debt_id == debt_id
        ).with_for_update().first()
        if not debt:
            raise HTTPException(status_code=404, detail="Debt not found")
        if user.role != SUPERADMIN_ROLE and debt.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        if debt.status in ("paid", "written_off"):
            raise HTTPException(status_code=409, detail=f"Cannot write off a {debt.status} debt")

        residual = _money(debt.balance)
        if residual <= 0:
            raise HTTPException(status_code=409, detail="Debt has no outstanding balance")

        db.add(models.CustomerLedgerEntry(
            business_id=debt.business_id,
            branch_id=debt.branch_id,
            customer_id=debt.customer_id,
            user_id=user.user_id,
            entry_type="credit",
            amount=residual,
            description=f"Write-off of debt #{debt_id}",
            source_type="debt_writeoff",
            debt_id=debt_id,
        ))
        debt.status = "written_off"
        debt.written_off_amount = residual
        debt.written_off_at = datetime.utcnow()
        debt.written_off_by = user.user_id
        debt.updated_at = debt.written_off_at

        db.add(models.AuditLog(
            user_id=user.user_id,
            action="UPDATE",
            table_name="debts",
            record_id=debt_id,
            description=f"Outstanding balance {residual} written off with immutable ledger credit",
        ))
        _commit_or_rollback(db)
        return {"message": "Debt written off", "debt_id": debt_id, "amount": float(residual)}
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Debt write-off failed") from exc


# ── Search customers (for debt creation form) ─────────────────────────────────
@router.get("/customers/search")
def search_customers(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    query = db.query(models.Customer)
    if user.role != SUPERADMIN_ROLE:
        query = query.filter(models.Customer.business_id == user.business_id)
    results = query.filter(
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