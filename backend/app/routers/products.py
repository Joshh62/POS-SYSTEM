from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
import openpyxl

router = APIRouter(
    prefix="/products",
    tags=["Products"]
)


@router.post("/", response_model=schemas.ProductResponse)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):

    new_product = models.Product(
        product_name=product.product_name,
        barcode=product.barcode,
        category_id=product.category_id,
        cost_price=product.cost_price,
        selling_price=product.selling_price,
        stock_quantity=product.stock_quantity
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product


@router.get("/")
def get_products(
    search: str = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db)
):

    query = db.query(models.Product)

    if search:
        query = query.filter(
            models.Product.product_name.ilike(f"%{search}%")
        )

    total = query.count()

    page = max(1, page)

    products = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total_products": total,
        "page": page,
        "limit": limit,
        "data": products
    }


@router.get("/barcode/{barcode}")
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


@router.get("/{product_id}", response_model=schemas.ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.product_id == product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


@router.put("/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int,
    product: schemas.ProductCreate,
    db: Session = Depends(get_db)
):

    existing = db.query(models.Product).filter(
        models.Product.product_id == product_id
    ).first()

    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    existing.product_name = product.product_name
    existing.barcode = product.barcode
    existing.category_id = product.category_id
    existing.cost_price = product.cost_price
    existing.selling_price = product.selling_price
    existing.stock_quantity = product.stock_quantity

    db.commit()
    db.refresh(existing)

    return existing


@router.post("/import")
def import_products(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):

    workbook = openpyxl.load_workbook(file.file)
    sheet = workbook.active

    imported = 0

    for row in sheet.iter_rows(min_row=2, values_only=True):

        product_name, barcode, category_id, cost_price, selling_price, stock = row

        product = models.Product(
            product_name=product_name,
            barcode=str(barcode),
            category_id=category_id,
            cost_price=cost_price,
            selling_price=selling_price,
            stock_quantity=stock
        )

        db.add(product)
        imported += 1

    db.commit()

    return {
        "message": f"{imported} products imported successfully"
    }