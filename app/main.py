print("MAIN FILE LOADED")

from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session

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

# Create Category (with JSON body)
@app.post("/categories/")
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):
    new_category = models.Category(category_name=category.category_name)

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return new_category

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

from fastapi import HTTPException

@app.get("/product/barcode/{barcode}", response_model=schemas.ProductResponse)
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(models.Product.barcode == barcode).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product