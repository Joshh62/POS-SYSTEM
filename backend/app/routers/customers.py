from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta

from app.database import get_db
from app import models
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE

router = APIRouter(prefix="/customers", tags=["Customers"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class CustomerCreate(BaseModel):
    full_name: str
    phone:     Optional[str] = None
    email:     Optional[str] = None
    address:   Optional[str] = None

class CustomerUpdate(BaseModel):
    full_name: Optional[str] = None
    phone:     Optional[str] = None
    email:     Optional[str] = None
    address:   Optional[str] = None

class CreditSettingsUpdate(BaseModel):
    credit_enabled:  Optional[bool]  = None
    credit_limit:    Optional[float] = None   # null = no limit
    credit_due_days: Optional[int]   = None   # default 30
    credit_notes:    Optional[str]   = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_balance(db, customer_id: int) -> float:
    """Compute current ledger balance. Positive = owes money. Negative = has credit."""
    debits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
        models.CustomerLedgerEntry.customer_id == customer_id,
        models.CustomerLedgerEntry.entry_type  == "debit",
    ).scalar() or 0

    credits = db.query(func.sum(models.CustomerLedgerEntry.amount)).filter(
        models.CustomerLedgerEntry.customer_id == customer_id,
        models.CustomerLedgerEntry.entry_type  == "credit",
    ).scalar() or 0

    return float(debits) - float(credits)


def _is_overdue(db, customer_id: int) -> bool:
    today = date.today()
    overdue = db.query(models.CustomerLedgerEntry).filter(
        models.CustomerLedgerEntry.customer_id == customer_id,
        models.CustomerLedgerEntry.entry_type  == "debit",
        models.CustomerLedgerEntry.due_date    < today,
    ).first()
    return overdue is not None


def _customer_dict(c, db, include_balance=True):
    d = {
        "customer_id":    c.customer_id,
        "full_name":      c.full_name,
        "phone":          c.phone,
        "email":          c.email,
        "address":        c.address,
        "credit_enabled": c.credit_enabled,
        "credit_limit":   float(c.credit_limit) if c.credit_limit else None,
        "credit_due_days":c.credit_due_days,
        "credit_notes":   c.credit_notes,
        "business_id":    c.business_id,
        "created_at":     c.created_at,
    }
    if include_balance and c.credit_enabled:
        balance = _get_balance(db, c.customer_id)
        d["balance"]   = balance
        d["is_overdue"] = _is_overdue(db, c.customer_id) if balance > 0 else False
    else:
        d["balance"]    = None
        d["is_overdue"] = False
    return d


def _scope(q, user):
    if user.role == SUPERADMIN_ROLE:
        return q
    return q.filter(models.Customer.business_id == user.business_id)


# ── List customers ────────────────────────────────────────────────────────────
@router.get("/")
def list_customers(
    search:         Optional[str]  = Query(None),
    credit_only:    bool           = Query(False),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(models.Customer)
    q = _scope(q, user)

    if credit_only:
        q = q.filter(models.Customer.credit_enabled == True)

    customers = q.order_by(models.Customer.full_name).all()

    if search:
        s = search.lower()
        customers = [c for c in customers if s in c.full_name.lower() or (c.phone and s in c.phone)]

    return [_customer_dict(c, db) for c in customers]


# ── Create customer ───────────────────────────────────────────────────────────
@router.post("/")
def create_customer(
    data: CustomerCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    if data.phone:
        existing = db.query(models.Customer).filter(
            models.Customer.phone == data.phone
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A customer with this phone number already exists")

    customer = models.Customer(
        business_id=user.business_id,
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        address=data.address,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _customer_dict(customer, db)


# ── Update customer ───────────────────────────────────────────────────────────
@router.patch("/{customer_id}")
def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if user.role != SUPERADMIN_ROLE and customer.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    for k, v in data.dict(exclude_none=True).items():
        setattr(customer, k, v)
    db.commit()
    db.refresh(customer)
    return _customer_dict(customer, db)


# ── Update credit settings — admin only ───────────────────────────────────────
@router.patch("/{customer_id}/credit")
def update_credit_settings(
    customer_id: int,
    data: CreditSettingsUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if user.role != SUPERADMIN_ROLE and customer.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if data.credit_enabled is not None:
        customer.credit_enabled = data.credit_enabled
    if data.credit_limit is not None:
        customer.credit_limit = data.credit_limit
    if data.credit_due_days is not None:
        if data.credit_due_days < 1:
            raise HTTPException(status_code=400, detail="credit_due_days must be at least 1")
        customer.credit_due_days = data.credit_due_days
    if data.credit_notes is not None:
        customer.credit_notes = data.credit_notes

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="customers",
        record_id=customer_id,
        description=f"Credit settings updated for {customer.full_name}: enabled={customer.credit_enabled}, limit={customer.credit_limit}, due_days={customer.credit_due_days}",
    ))

    db.commit()
    db.refresh(customer)
    return _customer_dict(customer, db)


# ── Get single customer ───────────────────────────────────────────────────────
@router.get("/{customer_id}")
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    if user.role != SUPERADMIN_ROLE and customer.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return _customer_dict(customer, db)


# ── Customer sales history ────────────────────────────────────────────────────
@router.get("/{customer_id}/sales")
def customer_sales_history(
    customer_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    sales = db.query(models.Sale).filter(
        models.Sale.customer_id == customer_id
    ).order_by(models.Sale.sale_date.desc()).all()

    history = []
    for sale in sales:
        items = db.query(models.SaleItem).filter(
            models.SaleItem.sale_id == sale.sale_id
        ).all()
        sale_items = []
        for item in items:
            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()
            sale_items.append({
                "product":    product.product_name if product else f"Product #{item.product_id}",
                "quantity":   item.quantity,
                "unit_price": float(item.unit_price),
                "subtotal":   float(item.subtotal),
            })
        history.append({
            "sale_id":        sale.sale_id,
            "date":           sale.sale_date,
            "total_amount":   float(sale.total_amount),
            "payment_method": sale.payment_method,
            "status":         sale.status,
            "items":          sale_items,
        })

    return {
        "customer": _customer_dict(customer, db),
        "sales":    history,
    }


# ── Search customers (lightweight — for checkout dropdown) ────────────────────
@router.get("/search/quick")
def search_customers(
    q: str = Query(..., min_length=1),
    credit_only: bool = Query(False),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    query = db.query(models.Customer).filter(
        (models.Customer.full_name.ilike(f"%{q}%")) |
        (models.Customer.phone.ilike(f"%{q}%"))
    )
    query = _scope(query, user)
    if credit_only:
        query = query.filter(models.Customer.credit_enabled == True)

    results = query.limit(10).all()
    return [
        {
            "customer_id":    c.customer_id,
            "full_name":      c.full_name,
            "phone":          c.phone,
            "credit_enabled": c.credit_enabled,
            "balance":        _get_balance(db, c.customer_id) if c.credit_enabled else None,
        }
        for c in results
    ]