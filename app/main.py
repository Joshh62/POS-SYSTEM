print("MAIN FILE LOADED")

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import engine, Base, get_db
from app import models, schemas
from app.routers import sales, inventory, reports, auth

app = FastAPI(title="POS System API")

# Create tables
Base.metadata.create_all(bind=engine)

# Routers
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(auth.router)


# Root
@app.get("/")
def root():
    return {"message": "POS backend running"}


# Create Category
@app.post("/categories/")
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):

    new_category = models.Category(
        category_name=category.category_name
    )

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
        selling_price=product.selling_price,
        stock_quantity=0
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product


# Scan Product by Barcode
@app.get("/product/barcode/{barcode}", response_model=schemas.ProductResponse)
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


# Low Stock Products
@app.get("/low-stock/")
def low_stock_products(db: Session = Depends(get_db)):

    products = db.query(models.Product).filter(
        models.Product.reorder_level != None,
        models.Product.stock_quantity <= models.Product.reorder_level
    ).all()

    return products