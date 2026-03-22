print("MAIN FILE LOADED")

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import engine, Base, SessionLocal
from app import models, schemas

app = FastAPI()

# Create database tables
Base.metadata.create_all(bind=engine)

# Database session dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Root endpoint
@app.get("/")
def root():
    return {"message": "POS backend running"}


# Create Category
@app.post("/categories/")
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):

    new_category = models.Category(category_name=category.category_name)

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return new_category


# Create Product
@app.post("/products/")
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):

    new_product = models.Product(
        product_name=product.product_name,
        barcode=product.barcode,
        category_id=product.category_id,
        cost_price=product.cost_price,
        selling_price=product.selling_price
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product


# Create Sale
@app.post("/sales/", response_model=schemas.SaleResponse)
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


# Scan product by barcode
@app.get("/product/barcode/{barcode}", response_model=schemas.ProductResponse)
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


# Get all sales
@app.get("/sales/")
def get_sales(db: Session = Depends(get_db)):
    return db.query(models.Sale).all()


# Get all sale items
@app.get("/sale-items/")
def get_sale_items(db: Session = Depends(get_db)):
    return db.query(models.SaleItem).all()


# Low stock products
@app.get("/low-stock/")
def low_stock_products(db: Session = Depends(get_db)):

    return db.query(models.Product).filter(
        models.Product.stock_quantity <= models.Product.reorder_level
    ).all()