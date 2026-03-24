from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/sales",
    tags=["Sales"]
)


@router.post("/", response_model=schemas.SaleResponse)
def create_sale(data: schemas.SaleCreate, db: Session = Depends(get_db)):

    total_amount = 0
    sale_items = []

    # Create empty sale first
    new_sale = models.Sale(
        sale_date=datetime.utcnow(),
        user_id=data.user_id,
        total_amount=0,
        status="completed"
    )

    db.add(new_sale)
    db.commit()
    db.refresh(new_sale)

    for item in data.items:

        product = db.query(models.Product).filter(
            models.Product.product_id == item.product_id
        ).first()

        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

        if product.stock_quantity < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.product_name}"
            )

        unit_price = product.selling_price
        subtotal = unit_price * item.quantity

        total_amount += subtotal

        # create sale item
        sale_item = models.SaleItem(
            sale_id=new_sale.sale_id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=unit_price,
            subtotal=subtotal
        )

        db.add(sale_item)

        # deduct stock
        product.stock_quantity -= item.quantity

        # record inventory movement
        movement = models.InventoryMovement(
            product_id=item.product_id,
            movement_type="sale",
            quantity=item.quantity,
            reference_id=new_sale.sale_id,
            movement_date=datetime.utcnow()
        )

        db.add(movement)

        sale_items.append(sale_item)

    # update sale total
    new_sale.total_amount = total_amount

    db.commit()

    return new_sale

@router.post("/scan")
def scan_product(barcode: str, quantity: int, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.stock_quantity < quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    subtotal = product.selling_price * quantity

    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "barcode": product.barcode,
        "unit_price": product.selling_price,
        "quantity": quantity,
        "subtotal": subtotal
    }