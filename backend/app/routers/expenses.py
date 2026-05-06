from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

from app.database import get_db
from app import models
from app.dependencies import require_role, SUPERADMIN_ROLE

router = APIRouter(prefix="/expenses", tags=["Expenses"])

VALID_CATEGORIES = [
    "Rent",
    "Utilities",
    "Fuel / Generator",
    "Transport",
    "Staff welfare",
    "Maintenance",
    "Supplies",
    "Marketing",
    "Miscellaneous",
]


# ── Schemas ───────────────────────────────────────────────────────────────────
class ExpenseCreate(BaseModel):
    category:     str
    amount:       float
    description:  Optional[str] = None
    expense_date: Optional[date] = None
    branch_id:    Optional[int]  = None   # admin can specify branch


class ExpenseUpdate(BaseModel):
    category:     Optional[str]   = None
    amount:       Optional[float] = None
    description:  Optional[str]   = None
    expense_date: Optional[date]  = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_branch_ids(db, user) -> list[int]:
    branches = db.query(models.Branch).filter(
        models.Branch.business_id == user.business_id
    ).all()
    return [b.branch_id for b in branches]


def _scope_query(q, user, branch_id: Optional[int] = None):
    """Scope expense query to the correct business/branch."""
    if user.role == SUPERADMIN_ROLE:
        if branch_id:
            q = q.filter(models.Expense.branch_id == branch_id)
    else:
        q = q.filter(models.Expense.business_id == user.business_id)
        if branch_id:
            q = q.filter(models.Expense.branch_id == branch_id)
    return q


# ── List expenses ─────────────────────────────────────────────────────────────
@router.get("/")
def list_expenses(
    branch_id:    Optional[int]  = Query(None),
    category:     Optional[str]  = Query(None),
    date_from:    Optional[date] = Query(None),
    date_to:      Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    q = db.query(
        models.Expense,
        models.User.full_name.label("recorded_by"),
    ).join(models.User, models.User.user_id == models.Expense.user_id)

    q = _scope_query(q, user, branch_id)

    if category:
        q = q.filter(models.Expense.category == category)
    if date_from:
        q = q.filter(models.Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(models.Expense.expense_date <= date_to)

    results = q.order_by(models.Expense.expense_date.desc(), models.Expense.created_at.desc()).all()

    return [
        {
            "expense_id":   r.Expense.expense_id,
            "category":     r.Expense.category,
            "amount":       float(r.Expense.amount),
            "description":  r.Expense.description,
            "expense_date": str(r.Expense.expense_date),
            "branch_id":    r.Expense.branch_id,
            "recorded_by":  r.recorded_by,
            "created_at":   r.Expense.created_at,
        }
        for r in results
    ]


# ── Expense summary (total by category) ──────────────────────────────────────
@router.get("/summary")
def expense_summary(
    branch_id: Optional[int]  = Query(None),
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    q = db.query(
        models.Expense.category,
        func.sum(models.Expense.amount).label("total"),
        func.count(models.Expense.expense_id).label("count"),
    )

    q = _scope_query(q, user, branch_id)

    if date_from:
        q = q.filter(models.Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(models.Expense.expense_date <= date_to)

    results = q.group_by(models.Expense.category).order_by(func.sum(models.Expense.amount).desc()).all()

    total_all = sum(float(r.total) for r in results)

    return {
        "total":      total_all,
        "categories": [
            {
                "category": r.category,
                "total":    float(r.total),
                "count":    r.count,
            }
            for r in results
        ],
    }


# ── Create expense ────────────────────────────────────────────────────────────
@router.post("/")
def create_expense(
    data: ExpenseCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    if data.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}"
        )

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    # Determine branch
    if user.role == "manager":
        branch_id = user.branch_id  # manager always logs to their branch
    else:
        branch_id = data.branch_id or user.branch_id

    expense = models.Expense(
        business_id=user.business_id,
        branch_id=branch_id,
        user_id=user.user_id,
        category=data.category,
        amount=data.amount,
        description=data.description,
        expense_date=data.expense_date or date.today(),
    )
    db.add(expense)

    # Audit log
    db.add(models.AuditLog(
        user_id=user.user_id,
        action="CREATE",
        table_name="expenses",
        record_id=0,
        description=f"Logged expense: {data.category} — ₦{data.amount:,.2f}"
                    + (f" — {data.description}" if data.description else ""),
    ))

    db.commit()
    db.refresh(expense)
    return {
        "expense_id":   expense.expense_id,
        "category":     expense.category,
        "amount":       float(expense.amount),
        "description":  expense.description,
        "expense_date": str(expense.expense_date),
        "branch_id":    expense.branch_id,
    }


# ── Delete expense ────────────────────────────────────────────────────────────
@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))  # admin only — manager cannot delete
):
    expense = db.query(models.Expense).filter(
        models.Expense.expense_id == expense_id
    ).first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if user.role != SUPERADMIN_ROLE and expense.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Audit before delete
    db.add(models.AuditLog(
        user_id=user.user_id,
        action="DELETE",
        table_name="expenses",
        record_id=expense_id,
        description=f"Deleted expense: {expense.category} — ₦{float(expense.amount):,.2f}",
    ))

    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted"}


# ── Categories list ───────────────────────────────────────────────────────────
@router.get("/categories")
def get_categories():
    return VALID_CATEGORIES