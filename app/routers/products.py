from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
import openpyxl

router = APIRouter(tags=["Products"])

@router.post("/")
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