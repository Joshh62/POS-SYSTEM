from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import require_role, SUPERADMIN_ROLE

router = APIRouter(prefix="/expenses", tags=["Expenses"])

VALID_CATEGORIES = [
    "Rent", "Utilities", "Fuel / Generator", "Transport", "Staff welfare",
    "Maintenance", "Supplies", "Marketing", "Miscellaneous",
]


class ExpenseCreate(BaseModel):
    category: str
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    description: Optional[str] = Field(default=None, max_length=500)
    expense_date: Optional[date] = None
    branch_id: Optional[int] = Field(default=None, gt=0)


def _branch_for_write(db, user, requested_branch_id):
    if user.role == "manager":
        if not user.branch_id:
            raise HTTPException(status_code=403, detail="Manager has no assigned branch")
        branch_id = user.branch_id
    else:
        branch_id = requested_branch_id or user.branch_id
    if not branch_id:
        raise HTTPException(status_code=400, detail="A branch is required")
    branch = db.query(models.Branch).filter(
        models.Branch.branch_id == branch_id
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    if user.role != SUPERADMIN_ROLE and branch.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Branch is outside your business")
    return branch


def _scope_query(query, user, branch_id=None):
    if user.role != SUPERADMIN_ROLE:
        query = query.filter(models.Expense.business_id == user.business_id)
    if branch_id:
        query = query.filter(models.Expense.branch_id == branch_id)
    return query


def _expense_response(expense):
    return {
        "expense_id": expense.expense_id,
        "category": expense.category,
        "amount": float(expense.amount),
        "description": expense.description,
        "expense_date": str(expense.expense_date),
        "branch_id": expense.branch_id,
        "status": expense.status,
        "reversed_at": expense.reversed_at,
        "reversal_reason": expense.reversal_reason,
    }


@router.get("/")
def list_expenses(
    branch_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    include_reversed: bool = Query(False),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    query = db.query(
        models.Expense, models.User.full_name.label("recorded_by")
    ).join(models.User, models.User.user_id == models.Expense.user_id)
    query = _scope_query(query, user, branch_id)
    if not include_reversed:
        query = query.filter(models.Expense.status == "active")
    if category:
        query = query.filter(models.Expense.category == category)
    if date_from:
        query = query.filter(models.Expense.expense_date >= date_from)
    if date_to:
        query = query.filter(models.Expense.expense_date <= date_to)
    rows = query.order_by(
        models.Expense.expense_date.desc(), models.Expense.created_at.desc()
    ).all()
    return [dict(_expense_response(row.Expense), recorded_by=row.recorded_by) for row in rows]


@router.get("/summary")
def expense_summary(
    branch_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    query = db.query(
        models.Expense.category,
        func.sum(models.Expense.amount).label("total"),
        func.count(models.Expense.expense_id).label("count"),
    ).filter(models.Expense.status == "active")
    query = _scope_query(query, user, branch_id)
    if date_from:
        query = query.filter(models.Expense.expense_date >= date_from)
    if date_to:
        query = query.filter(models.Expense.expense_date <= date_to)
    rows = query.group_by(models.Expense.category).order_by(
        func.sum(models.Expense.amount).desc()
    ).all()
    return {
        "total": float(sum((row.total for row in rows), Decimal("0.00"))),
        "categories": [
            {"category": row.category, "total": float(row.total), "count": row.count}
            for row in rows
        ],
    }


@router.post("/")
def create_expense(
    data: ExpenseCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    if data.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid expense category")
    try:
        branch = _branch_for_write(db, user, data.branch_id)
        expense = models.Expense(
            business_id=branch.business_id,
            branch_id=branch.branch_id,
            user_id=user.user_id,
            category=data.category,
            amount=data.amount,
            description=data.description,
            expense_date=data.expense_date or date.today(),
            status="active",
        )
        db.add(expense)
        db.flush()
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="EXPENSE_CREATE",
            table_name="expenses",
            record_id=expense.expense_id,
            description=(
                f"Expense #{expense.expense_id}: {expense.category}, "
                f"amount {expense.amount}, branch {expense.branch_id}"
            ),
        ))
        db.commit()
        db.refresh(expense)
        return _expense_response(expense)
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Expense conflicts with ledger rules") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Expense creation failed") from exc


@router.delete("/{expense_id}")
def reverse_expense(
    expense_id: int,
    reason: str = Query(..., min_length=3, max_length=500),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"])),
):
    try:
        expense = db.query(models.Expense).filter(
            models.Expense.expense_id == expense_id
        ).with_for_update().first()
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        if user.role != SUPERADMIN_ROLE and expense.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Expense is outside your business")
        if expense.status == "reversed":
            raise HTTPException(status_code=409, detail="Expense already reversed")
        expense.status = "reversed"
        expense.reversed_at = datetime.utcnow()
        expense.reversed_by = user.user_id
        expense.reversal_reason = reason.strip()
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="EXPENSE_REVERSE",
            table_name="expenses",
            record_id=expense.expense_id,
            description=(
                f"Reversed expense #{expense.expense_id}, amount {expense.amount}: "
                f"{expense.reversal_reason}"
            ),
        ))
        db.commit()
        db.refresh(expense)
        return dict(_expense_response(expense), message="Expense reversed")
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Expense reversal conflict") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Expense reversal failed") from exc


@router.get("/categories")
def get_categories():
    return VALID_CATEGORIES
