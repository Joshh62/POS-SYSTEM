from app import models
from datetime import date, datetime, timedelta
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
def daily_sales(db: Session = Depends(get_db), user = Depends(require_role(["admin","manager"]))):

    today = date.today()
    branch_id = user.branch_id

    result = db.query(
        func.sum(Sale.total_amount)
    ).filter(
        Sale.branch_id == branch_id,
        func.date(Sale.sale_date) == today
    ).scalar()

    return {
        "date": today,
        "total_sales": result or 0
    }


@router.get("/top-products")
def top_products(db: Session = Depends(get_db), user = Depends(require_role(["admin", "manager"]))):

    today = date.today()
    branch_id = user.branch_id

    results = (
        db.query(
            Product.product_name,
            func.sum(SaleItem.quantity).label("total_sold")
        )
        .join(SaleItem, Product.product_id == SaleItem.product_id)
        .join(Sale, Sale.sale_id == SaleItem.sale_id)
        .filter(
            Sale.branch_id == branch_id,
            func.date(Sale.sale_date) == today
        )
        .group_by(Product.product_name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(10)
        .all()
    )

    return [{"product_name": r.product_name, "total_sold": r.total_sold} for r in results]


@router.get("/inventory-value")
def inventory_value(db: Session = Depends(get_db)):

    value = db.query(
        func.sum(Product.cost_price * Product.stock_quantity)
    ).scalar()

    return {
        "total_inventory_value": value or 0
    }


@router.get("/low-stock")
def get_low_stock(db: Session = Depends(get_db), user = Depends(require_role(["admin", "manager"]))):

    branch_id = user.branch_id

    results = (
        db.query(Product.product_name, models.BranchInventory.stock_quantity)
        .join(models.BranchInventory, Product.product_id == models.BranchInventory.product_id)
        .filter(
            models.BranchInventory.branch_id == branch_id,
            models.BranchInventory.stock_quantity <= Product.reorder_level
        )
        .order_by(models.BranchInventory.stock_quantity.asc())
        .all()
    )

    return [
        {"product_name": r.product_name, "stock": r.stock_quantity}
        for r in results
    ]


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
def sales_summary(db: Session = Depends(get_db), user = Depends(require_role(["admin","manager"]))):

    branch_id = user.branch_id

    total_sales = db.query(func.sum(Sale.total_amount)).filter(
        Sale.branch_id == branch_id
    ).scalar() or 0

    total_transactions = db.query(func.count(Sale.sale_id)).filter(
        Sale.branch_id == branch_id
    ).scalar() or 0

    return {
        "total_sales": total_sales,
        "transactions": total_transactions
    }


@router.get("/sales-by-cashier")
def sales_by_cashier(db: Session = Depends(get_db), user = Depends(require_role(["admin","manager"]))):

    today = date.today()
    branch_id = user.branch_id

    results = (
        db.query(
            User.full_name,
            func.count(Sale.sale_id).label("transactions"),
            func.sum(Sale.total_amount).label("total_sales")
        )
        .join(Sale, Sale.user_id == User.user_id)
        .filter(
            Sale.branch_id == branch_id,
            func.date(Sale.sale_date) == today
        )
        .group_by(User.full_name)
        .order_by(func.sum(Sale.total_amount).desc())
        .all()
    )

    return [
        {
            "cashier": r.full_name,
            "transactions": r.transactions,
            "total_sales": r.total_sales or 0
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
            (SaleItem.unit_price - Product.cost_price) * SaleItem.quantity
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


@router.get("/inventory-history")
def inventory_history(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    movements = (
        db.query(
            Product.product_name,
            models.InventoryMovement.movement_type,
            models.InventoryMovement.quantity,
            models.InventoryMovement.reference_id,
            models.InventoryMovement.movement_date
        )
        .join(
            models.InventoryMovement,
            Product.product_id == models.InventoryMovement.product_id
        )
        .order_by(models.InventoryMovement.movement_date.desc())
        .all()
    )

    return [
        {
            "product": m.product_name,
            "movement_type": m.movement_type,
            "quantity": m.quantity,
            "reference_id": m.reference_id,
            "date": m.movement_date
        }
        for m in movements
    ]


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user = Depends(require_role(["admin","manager"]))):

    today = date.today()
    branch_id = user.branch_id

    today_sales = db.query(func.sum(Sale.total_amount)).filter(
        Sale.branch_id == branch_id,
        func.date(Sale.sale_date) == today
    ).scalar() or 0

    transactions = db.query(func.count(Sale.sale_id)).filter(
        Sale.branch_id == branch_id,
        func.date(Sale.sale_date) == today
    ).scalar() or 0

    total_products = db.query(func.count(Product.product_id)).scalar()

    low_stock = db.query(func.count(models.BranchInventory.product_id)).filter(
        models.BranchInventory.branch_id == branch_id,
        models.BranchInventory.stock_quantity <= Product.reorder_level
    ).scalar()

    return {
        "today_sales": today_sales,
        "total_transactions_today": transactions,
        "total_products": total_products,
        "low_stock_products": low_stock
    }


@router.get("/daily-dashboard")
def daily_dashboard(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):
    today = date.today()

    # Last 7 days sales trend
    days = []
    sales_data = []

    for i in range(6, -1, -1):
        day = today - timedelta(days=i)

        total = db.query(
            func.sum(models.Sale.total_amount)
        ).filter(
            func.date(models.Sale.sale_date) == day
        ).scalar() or 0

        days.append(day.strftime("%Y-%m-%d"))
        sales_data.append(float(total))

    # Today's summary
    total_sales = sales_data[-1]

    total_transactions = db.query(
        func.count(models.Sale.sale_id)
    ).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar() or 0

    profit = db.query(
        func.sum(
            (models.SaleItem.unit_price - models.Product.cost_price)
            * models.SaleItem.quantity
        )
    ).join(
        models.Product,
        models.Product.product_id == models.SaleItem.product_id
    ).join(
        models.Sale,
        models.Sale.sale_id == models.SaleItem.sale_id
    ).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar() or 0

    return {
        "summary": {
            "date": str(today),
            "total_sales": float(total_sales),
            "total_transactions": total_transactions,
            "total_profit": float(profit)
        },
        "chart": {
            "labels": days,
            "datasets": [
                {
                    "label": "Sales (₦)",
                    "data": sales_data
                }
            ]
        }
    }


@router.get("/stock-valuation")
def stock_valuation(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):
    results = (
        db.query(
            models.Product.product_name,
            models.Product.cost_price,
            models.BranchInventory.stock_quantity,
        )
        .join(
            models.BranchInventory,
            models.Product.product_id == models.BranchInventory.product_id
        )
        .all()
    )

    labels = []
    values = []
    total_value = 0

    for r in results:
        stock_value = float(r.stock_quantity or 0) * float(r.cost_price or 0)
        total_value += stock_value

        labels.append(r.product_name)
        values.append(stock_value)

    return {
        "summary": {
            "total_inventory_value": total_value
        },
        "chart": {
            "labels": labels,
            "datasets": [
                {
                    "label": "Stock Value (₦)",
                    "data": values
                }
            ]
        }
    }