from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role

router = APIRouter(
    prefix="/inventory",
    tags=["Inventory"]
)

@router.post("/restock", response_model=schemas.RestockResponse)
def restock_product(
    data: schemas.RestockRequest,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    product = db.query(models.Product).filter(
        models.Product.product_id == data.product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.stock_quantity += data.quantity

    movement = models.InventoryMovement(
    product_id=item.product_id,
    movement_type="SALE",
    quantity=-item.quantity,
    reference_id=new_sale.sale_id,
    movement_date=datetime.utcnow()
)

    db.add(movement)

    db.commit()
    db.refresh(product)

    return {
        "product_id": product.product_id,
        "new_stock": product.stock_quantity
    }


@router.get("/low-stock")
def get_low_stock_products(
    threshold: int = 5,
    db: Session = Depends(get_db)
):

    products = db.query(models.Product).filter(
        models.Product.stock_quantity <= threshold
    ).all()

    return {
        "threshold": threshold,
        "low_stock_products": products
    }


@router.post("/adjust")
def adjust_stock(
    product_id: int,
    quantity: int,
    reason: str,
    db: Session = Depends(get_db)
):

    product = db.query(models.Product).filter(
        models.Product.product_id == product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.stock_quantity += quantity

    adjustment = models.StockAdjustment(
        product_id=product_id,
        quantity=quantity,
        reason=reason
    )

    db.add(adjustment)

    db.commit()

    return {"message": "Stock adjusted"}