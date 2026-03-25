from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import Sale
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
        func.sum(models.Sale.total_amount)
    ).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar()

    return {
        "date": today,
        "total_sales": result or 0
    }

@router.get("/top-products")
def top_products(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    result = db.query(
        models.Product.name,
        func.sum(models.SaleItem.quantity).label("total_sold")
    ).join(
        models.SaleItem,
        models.Product.product_id == models.SaleItem.product_id
    ).group_by(
        models.Product.name
    ).order_by(
        func.sum(models.SaleItem.quantity).desc()
    ).limit(5).all()

    return result

@router.get("/inventory-value")
def inventory_value(db: Session = Depends(get_db)):

    value = db.query(
        func.sum(models.Product.cost_price * models.Product.stock_quantity)
    ).scalar()

    return {
        "total_inventory_value": value or 0
    }

@router.get("/low-stock")
def low_stock(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    products = db.query(models.Product).filter(
        models.Product.stock_quantity < 10
    ).all()

    return products

@router.get("/sales-volume")
def sales_volume(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    total_items = db.query(
        func.sum(models.SaleItem.quantity)
    ).scalar()

    return {
        "items_sold": total_items or 0
    }

@router.get("/sales-summary")
def sales_summary(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "manager"]))
):

    total_sales = db.query(func.sum(Sale.total_amount)).scalar() or 0
    total_transactions = db.query(func.count(Sale.sale_id)).scalar() or 0

    return {
        "total_sales": total_sales,
        "total_transactions": total_transactions
    }