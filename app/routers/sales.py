from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import SessionLocal
from app import models, schemas

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create Sale
@router.post("/sales/", response_model=schemas.SaleResponse)
def create_sale(sale: schemas.SaleCreate, db: Session = Depends(get_db)):

    total_amount = 0

    new_sale = models.Sale(
        sale_date=datetime.utcnow(),
        user_id=sale.user_id,
        total_amount=0,
        status="completed"
    )

    db.add(new_sale)
    db.commit()
    db.refresh(new_sale)

    for item in sale.items:

        product = db.query(models.Product).filter(
            models.Product.product_id == item.product_id
        ).first()

        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        # Check stock
        if product.stock_quantity < item.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock")

        # Deduct stock
        product.stock_quantity -= item.quantity

        movement = models.InventoryMovement(
            product_id=item.product_id,
            movement_type="sale",
            quantity=item.quantity,
            reference_id=new_sale.sale_id,
            movement_date=datetime.utcnow()
        )

        db.add(movement)

        unit_price = product.selling_price
        subtotal = unit_price * item.quantity

        total_amount += subtotal

        sale_item = models.SaleItem(
            sale_id=new_sale.sale_id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=unit_price,
            subtotal=subtotal
        )

        db.add(sale_item)

    new_sale.total_amount = total_amount

    db.commit()
    db.refresh(new_sale)

    return new_sale

# Get all sales
@router.get("/sales/")
def get_sales(db: Session = Depends(get_db)):
    return db.query(models.Sale).all()


# Get all sale items
@router.get("/sale-items/")
def get_sale_items(db: Session = Depends(get_db)):
    return db.query(models.SaleItem).all()