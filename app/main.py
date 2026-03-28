print("MAIN FILE LOADED")

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.routers import sales, suppliers, purchases, inventory, reports, auth, customers, products
from app.database import engine, Base, get_db
from app import models, schemas

app = FastAPI(title="POS System API")

# Create tables
Base.metadata.create_all(bind=engine)

# Routers
# Routers
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(auth.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)
app.include_router(customers.router)
app.include_router(products.router, prefix="/products", tags=["Products"])

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
    ).order_by(models.Product.stock_quantity.asc()).all()

    return products


