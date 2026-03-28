print("MAIN FILE LOADED")

from fastapi import FastAPI
from sqlalchemy.orm import Session

from app.database import engine, Base
from app.routers import (
    sales,
    suppliers,
    purchases,
    inventory,
    reports,
    auth,
    customers,
    products,
    category
)

app = FastAPI(title="POS System API")

# Create tables
Base.metadata.create_all(bind=engine)

# Routers
app.include_router(auth.router)
app.include_router(products.router, prefix="/products", tags=["Products"])
app.include_router(category.router, prefix="/categories", tags=["Categories"])
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)
app.include_router(customers.router)

# Root
@app.get("/")
def root():
    return {"message": "POS backend running"}