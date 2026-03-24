from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from app import models
from app.database import get_db

router = APIRouter(
    prefix="/reports",
    tags=["Reports"]
)

@router.get("/daily-sales")
def daily_sales_report(db: Session = Depends(get_db)):

    today = date.today()

    total_sales = db.query(func.sum(models.Sale.total_amount)).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar()

    total_transactions = db.query(func.count(models.Sale.sale_id)).filter(
        func.date(models.Sale.sale_date) == today
    ).scalar()

    return {
        "date": today,
        "total_revenue": total_sales or 0,
        "total_transactions": total_transactions
    }

@router.get("/top-products")
def top_products(db: Session = Depends(get_db)):

    results = db.query(
        models.Product.product_name,
        func.sum(models.SaleItem.quantity).label("total_sold")
    ).join(
        models.SaleItem,
        models.Product.product_id == models.SaleItem.product_id
    ).group_by(
        models.Product.product_name
    ).order_by(
        func.sum(models.SaleItem.quantity).desc()
    ).limit(10).all()

    return results

@router.get("/inventory-value")
def inventory_value(db: Session = Depends(get_db)):

    value = db.query(
        func.sum(models.Product.cost_price * models.Product.stock_quantity)
    ).scalar()

    return {
        "total_inventory_value": value or 0
    }