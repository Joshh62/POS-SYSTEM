print("MAIN FILE LOADED")

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.routers import suppliers, purchases
from app.database import engine, Base, get_db
from app import models, schemas
from app.routers import sales, inventory, reports, auth, customers

app = FastAPI(title="POS System API")

# Create tables
Base.metadata.create_all(bind=engine)

# Routers
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(auth.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)
app.include_router(customers.router)

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


# Scan Product by Barcode
@app.get("/product/barcode/{barcode}", response_model=schemas.ProductResponse)
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


@app.get("/products/search")
def search_products(q: str, db: Session = Depends(get_db)):

    products = db.query(models.Product).filter(
        models.Product.product_name.ilike(f"%{q}%")
    ).all()

    return products


# Low Stock Products
@app.get("/low-stock/")
def low_stock_products(db: Session = Depends(get_db)):

    products = db.query(models.Product).filter(
        models.Product.reorder_level != None,
        models.Product.stock_quantity <= models.Product.reorder_level
    ).all()

    return products


