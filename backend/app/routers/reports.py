from app import models
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional

from app.database import get_db
from app.models import Product, SaleItem, Sale, User, AuditLog
from app.dependencies import require_role, get_active_branch_id, SUPERADMIN_ROLE

router = APIRouter(prefix="/reports", tags=["Reports"])


def _branch_filter(query, model_with_branch, user, branch_id: Optional[int]):
    if user.role == SUPERADMIN_ROLE:
        if branch_id:
            query = query.filter(model_with_branch.branch_id == branch_id)
    elif user.role == "admin":
        branch_ids = _business_branch_ids(user)
        if branch_id and branch_id in branch_ids:
            query = query.filter(model_with_branch.branch_id == branch_id)
        else:
            query = query.filter(model_with_branch.branch_id.in_(branch_ids))
    else:
        query = query.filter(model_with_branch.branch_id == user.branch_id)
    return query


def _business_branch_ids(user) -> list[int]:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        branches = db.query(models.Branch).filter(
            models.Branch.business_id == user.business_id
        ).all()
        return [b.branch_id for b in branches]
    finally:
        db.close()


def _resolve_branch(user, branch_id_param: Optional[int]) -> Optional[int]:
    return get_active_branch_id(user, branch_id_param)


# ── Daily sales ───────────────────────────────────────────────────────────────
@router.get("/daily-sales")
def daily_sales(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    today = date.today()
    q = (
        db.query(func.sum(Sale.total_amount))
        .filter(func.date(Sale.sale_date) == today)
        .filter(Sale.status == "completed")
    )
    q = _branch_filter(q, Sale, user, _resolve_branch(user, branch_id))
    return {"date": today, "total_sales": q.scalar() or 0}


# ── Top products ──────────────────────────────────────────────────────────────
@router.get("/top-products")
def top_products(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    today = date.today()
    q = (
        db.query(Product.product_name, func.sum(SaleItem.quantity).label("total_sold"))
        .join(SaleItem, Product.product_id == SaleItem.product_id)
        .join(Sale,     Sale.sale_id       == SaleItem.sale_id)
        .filter(func.date(Sale.sale_date) == today)
        .filter(Sale.status == "completed")
    )
    q = _branch_filter(q, Sale, user, _resolve_branch(user, branch_id))
    results = (
        q.group_by(Product.product_name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(10)
        .all()
    )
    return [{"product_name": r.product_name, "total_sold": r.total_sold} for r in results]


# ── Sales summary ─────────────────────────────────────────────────────────────
@router.get("/sales-summary")
def sales_summary(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    resolved = _resolve_branch(user, branch_id)
    q_sales = (
        db.query(func.sum(Sale.total_amount))
        .filter(Sale.status == "completed")
    )
    q_txns = (
        db.query(func.count(Sale.sale_id))
        .filter(Sale.status == "completed")
    )
    q_sales = _branch_filter(q_sales, Sale, user, resolved)
    q_txns  = _branch_filter(q_txns,  Sale, user, resolved)
    return {
        "total_sales":  q_sales.scalar() or 0,
        "transactions": q_txns.scalar()  or 0,
    }


# ── Sales by cashier ──────────────────────────────────────────────────────────
@router.get("/sales-by-cashier")
def sales_by_cashier(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    today = date.today()
    q = (
        db.query(
            User.full_name,
            func.count(Sale.sale_id).label("transactions"),
            func.sum(Sale.total_amount).label("total_sales")
        )
        .join(Sale, Sale.user_id == User.user_id)
        .filter(func.date(Sale.sale_date) == today)
        .filter(Sale.status == "completed")
    )
    q = _branch_filter(q, Sale, user, _resolve_branch(user, branch_id))
    results = (
        q.group_by(User.full_name)
        .order_by(func.sum(Sale.total_amount).desc())
        .all()
    )
    return [
        {"cashier": r.full_name, "transactions": r.transactions, "total_sales": r.total_sales or 0}
        for r in results
    ]


# ── Profit ────────────────────────────────────────────────────────────────────
@router.get("/profit")
def profit_report(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    q = (
        db.query(
            Product.product_name,
            func.sum((SaleItem.unit_price - Product.cost_price) * SaleItem.quantity).label("profit")
        )
        .join(SaleItem, Product.product_id == SaleItem.product_id)
        .join(Sale,     Sale.sale_id       == SaleItem.sale_id)
        .filter(Sale.status == "completed")
    )
    q = _branch_filter(q, Sale, user, _resolve_branch(user, branch_id))
    results = (
        q.group_by(Product.product_name)
        .order_by(func.sum((SaleItem.unit_price - Product.cost_price) * SaleItem.quantity).desc())
        .all()
    )
    return [{"product_name": r.product_name, "profit": r.profit} for r in results]


# ── Stock valuation ───────────────────────────────────────────────────────────
@router.get("/stock-valuation")
def stock_valuation(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    resolved = _resolve_branch(user, branch_id)

    q = db.query(
        Product.product_name,
        Product.cost_price,
        models.BranchInventory.stock_quantity,
    ).join(models.BranchInventory, Product.product_id == models.BranchInventory.product_id)

    if user.role == SUPERADMIN_ROLE:
        if resolved:
            q = q.filter(models.BranchInventory.branch_id == resolved)
    elif user.role == "admin":
        ids = _business_branch_ids(user)
        q = q.filter(models.BranchInventory.branch_id.in_([resolved] if resolved else ids))
    else:
        q = q.filter(models.BranchInventory.branch_id == user.branch_id)

    results     = q.all()
    products    = []
    total_value = 0

    for r in results:
        sv = float(r.stock_quantity or 0) * float(r.cost_price or 0)
        total_value += sv
        products.append({
            "product_name":   r.product_name,
            "stock_quantity": r.stock_quantity,
            "cost_price":     float(r.cost_price or 0),
            "stock_value":    sv,
        })

    products.sort(key=lambda x: x["stock_value"], reverse=True)

    return {
        "summary":  {"total_inventory_value": total_value},
        "products": products,
        "chart": {
            "labels":   [p["product_name"] for p in products],
            "datasets": [{"label": "Stock Value (₦)", "data": [p["stock_value"] for p in products]}],
        },
    }


# ── Audit logs ────────────────────────────────────────────────────────────────
@router.get("/audit-logs")
def audit_logs(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    """
    Returns audit logs with the full name of the user who performed the action.
    Business scoping is applied in the JOIN condition (not WHERE) to preserve
    the outer join and avoid turning it into an inner join.
    """
    if user.role == SUPERADMIN_ROLE:
        # Superadmin sees all — simple outer join with no business filter
        join_condition = User.user_id == AuditLog.user_id
    else:
        # Admin sees only their own business users' actions
        # Scoping in JOIN condition preserves the outer join correctly
        join_condition = and_(
            User.user_id == AuditLog.user_id,
            User.business_id == user.business_id,
        )

    q = (
        db.query(
            AuditLog.log_id,
            AuditLog.action,
            AuditLog.table_name,
            AuditLog.record_id,
            AuditLog.description,
            AuditLog.created_at,
            User.full_name.label("performed_by"),
            User.username.label("username"),
        )
        .outerjoin(User, join_condition)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
    )

    # For non-superadmin: only return rows where a matching user was found
    # (i.e. logs that belong to this business)
    if user.role != SUPERADMIN_ROLE:
        q = q.filter(User.user_id.isnot(None))

    results = q.all()

    return [
        {
            "log_id":       r.log_id,
            "action":       r.action,
            "table_name":   r.table_name,
            "record_id":    r.record_id,
            "description":  r.description,
            "created_at":   r.created_at,
            "performed_by": r.performed_by or "System",
            "username":     r.username     or "—",
        }
        for r in results
    ]


# ── Dashboard ─────────────────────────────────────────────────────────────────
@router.get("/dashboard")
def dashboard(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    today    = date.today()
    resolved = _resolve_branch(user, branch_id)

    q_sales = (
        db.query(func.sum(Sale.total_amount))
        .filter(func.date(Sale.sale_date) == today)
        .filter(Sale.status == "completed")
    )
    q_txns = (
        db.query(func.count(Sale.sale_id))
        .filter(func.date(Sale.sale_date) == today)
        .filter(Sale.status == "completed")
    )
    q_sales = _branch_filter(q_sales, Sale, user, resolved)
    q_txns  = _branch_filter(q_txns,  Sale, user, resolved)

    total_products = db.query(func.count(Product.product_id)).scalar()

    return {
        "today_sales":              q_sales.scalar() or 0,
        "total_transactions_today": q_txns.scalar()  or 0,
        "total_products":           total_products,
    }


# ── Daily dashboard (7-day chart) ─────────────────────────────────────────────
@router.get("/daily-dashboard")
def daily_dashboard(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    today    = date.today()
    resolved = _resolve_branch(user, branch_id)

    days, sales_data = [], []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        q   = (
            db.query(func.sum(Sale.total_amount))
            .filter(func.date(Sale.sale_date) == day)
            .filter(Sale.status == "completed")
        )
        q = _branch_filter(q, Sale, user, resolved)
        days.append(day.strftime("%Y-%m-%d"))
        sales_data.append(float(q.scalar() or 0))

    total_sales = sales_data[-1]

    q_txns = (
        db.query(func.count(Sale.sale_id))
        .filter(func.date(Sale.sale_date) == today)
        .filter(Sale.status == "completed")
    )
    q_txns = _branch_filter(q_txns, Sale, user, resolved)

    q_profit = (
        db.query(func.sum((SaleItem.unit_price - Product.cost_price) * SaleItem.quantity))
        .join(Product, Product.product_id == SaleItem.product_id)
        .join(Sale,    Sale.sale_id       == SaleItem.sale_id)
        .filter(func.date(Sale.sale_date) == today)
        .filter(Sale.status == "completed")
    )
    q_profit = _branch_filter(q_profit, Sale, user, resolved)

    return {
        "summary": {
            "date":               str(today),
            "total_sales":        float(total_sales),
            "total_transactions": q_txns.scalar()  or 0,
            "total_profit":       float(q_profit.scalar() or 0),
        },
        "chart": {
            "labels":   days,
            "datasets": [{"label": "Sales (₦)", "data": sales_data}]
        }
    }


# ── Low stock ─────────────────────────────────────────────────────────────────
@router.get("/low-stock")
def get_low_stock(
    threshold: int = Query(10),
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    resolved = _resolve_branch(user, branch_id)

    q = (
        db.query(
            Product.product_name,
            models.BranchInventory.stock_quantity,
            models.BranchInventory.reorder_level,
        )
        .join(models.BranchInventory, Product.product_id == models.BranchInventory.product_id)
        .filter(models.BranchInventory.stock_quantity <= threshold)
    )

    if user.role == SUPERADMIN_ROLE:
        if resolved:
            q = q.filter(models.BranchInventory.branch_id == resolved)
    elif user.role == "admin":
        ids = _business_branch_ids(user)
        q = q.filter(models.BranchInventory.branch_id.in_([resolved] if resolved else ids))
    else:
        q = q.filter(models.BranchInventory.branch_id == user.branch_id)

    results = q.order_by(models.BranchInventory.stock_quantity.asc()).all()
    return {
        "low_stock_items": [
            {
                "product_name":   r.product_name,
                "stock_quantity": r.stock_quantity,
                "reorder_level":  r.reorder_level,
            }
            for r in results
        ]
    }


# ── Sales volume ──────────────────────────────────────────────────────────────
@router.get("/sales-volume")
def sales_volume(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    return {
        "items_sold": (
            db.query(func.sum(SaleItem.quantity))
            .join(Sale, Sale.sale_id == SaleItem.sale_id)
            .filter(Sale.status == "completed")
            .scalar() or 0
        )
    }


# ── Inventory value ───────────────────────────────────────────────────────────
@router.get("/inventory-value")
def inventory_value(db: Session = Depends(get_db)):
    value = (
        db.query(func.sum(Product.cost_price * models.BranchInventory.stock_quantity))
        .join(models.BranchInventory, Product.product_id == models.BranchInventory.product_id)
        .scalar()
    )
    return {"total_inventory_value": value or 0}


# ── Inventory history ─────────────────────────────────────────────────────────
@router.get("/inventory-history")
def inventory_history(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    movements = (
        db.query(
            Product.product_name,
            models.InventoryMovement.movement_type,
            models.InventoryMovement.quantity,
            models.InventoryMovement.reference_id,
            models.InventoryMovement.movement_date,
        )
        .join(models.InventoryMovement, Product.product_id == models.InventoryMovement.product_id)
        .order_by(models.InventoryMovement.movement_date.desc())
        .all()
    )
    return [
        {
            "product":       m.product_name,
            "movement_type": m.movement_type,
            "quantity":      m.quantity,
            "reference_id":  m.reference_id,
            "date":          m.movement_date,
        }
        for m in movements
    ]