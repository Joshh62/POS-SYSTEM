from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role

# Optional prefix keeps routes organized
router = APIRouter(
    prefix="/inventory",
    tags=["Inventory"]
)

@router.post("/product")
def create_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin"]))
):

    # Prevent invalid restock
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    # 1. Fetch product
    product = db.query(models.Product).filter(
        models.Product.product_id == data.product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 2. Increase stock
    product.stock_quantity += data.quantity

    # 3. Log inventory movement
    movement = models.InventoryMovement(
        product_id=data.product_id,
        movement_type="restock",
        quantity=data.quantity,
        reference_id=None,
        movement_date=datetime.utcnow()
    )

    db.add(movement)

    db.commit()
    db.refresh(product)

    return {
        "product_id": product.product_id,
        "new_stock": product.stock_quantity
    }