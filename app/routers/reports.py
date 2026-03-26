from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Product, SaleItem, Sale, User, AuditLog
from app.dependencies import require_role

router = APIRouter(
    prefix="/reports",
    tags=["Reports"]
)

@router.get("/daily-sales")
def daily_sales(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    today = date.today()

    result = db.query(
        func.sum(Sale.total_amount)
    ).filter(
        func.date(Sale.sale_date) == today
    ).scalar()

    return {
        "date": today,
        "total_sales": result or 0
    }

@router.get("/top-products")
def top_products(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "manager"]))
):

    results = (
        db.query(
            Product.product_name,
            func.sum(SaleItem.quantity).label("total_sold")
        )
        .join(SaleItem, Product.product_id == SaleItem.product_id)
        .group_by(Product.product_name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(10)
        .all()
    )

    return [
        {
            "product_name": r.product_name,
            "total_sold": r.total_sold
        }
        for r in results
    ]

@router.get("/inventory-value")
def inventory_value(db: Session = Depends(get_db)):

    value = db.query(
        func.sum(Product.cost_price * Product.stock_quantity)
    ).scalar()

    return {
        "total_inventory_value": value or 0
    }

@router.get("/low-stock")
def low_stock(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    products = db.query(Product).filter(
        Product.stock_quantity <= Product.reorder_level
    ).all()

    return products

@router.get("/sales-volume")
def sales_volume(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    total_items = db.query(
        func.sum(SaleItem.quantity)
    ).scalar()

    return {
        "items_sold": total_items or 0
    }

@router.get("/sales-summary")
def sales_summary(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    total_sales = db.query(func.sum(Sale.total_amount)).scalar() or 0
    total_transactions = db.query(func.count(Sale.sale_id)).scalar() or 0

    return {
        "total_sales": total_sales,
        "transactions": total_transactions
    }

@router.get("/sales-by-cashier")
def sales_by_cashier(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    results = (
        db.query(
            User.full_name,
            func.count(Sale.sale_id).label("transactions"),
            func.sum(Sale.total_amount).label("total_sales")
        )
        .join(Sale, Sale.user_id == User.user_id)
        .group_by(User.full_name)
        .order_by(func.sum(Sale.total_amount).desc())
        .all()
    )

    return [
        {
            "cashier": r.full_name,
            "transactions": r.transactions,
            "total_sales": r.total_sales
        }
        for r in results
    ]

@router.get("/profit")
def profit_report(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    results = (
        db.query(
            Product.product_name,
            func.sum(
                (SaleItem.unit_price - Product.cost_price) * SaleItem.quantity
            ).label("profit")
        )
        .join(SaleItem, Product.product_id == SaleItem.product_id)
        .group_by(Product.product_name)
        .order_by(func.sum(
            (SaleItem.price - Product.cost_price) * SaleItem.quantity
        ).desc())
        .all()
    )

    return [
        {
            "product_name": r.product_name,
            "profit": r.profit
        }
        for r in results
    ]

@router.get("/audit-logs")
def audit_logs(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin"]))
):

    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()

    return logs