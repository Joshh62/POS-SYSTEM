from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
import openpyxl

router = APIRouter(prefix="/products", tags=["Products"])


@router.post("/", response_model=schemas.ProductResponse)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):

    # Check duplicate barcode
    if db.query(models.Product).filter(models.Product.barcode == product.barcode).first():
        raise HTTPException(status_code=400, detail="Barcode already exists")

    new_product = models.Product(
        product_name=product.product_name,
        barcode=product.barcode,
        category_id=product.category_id,
        cost_price=product.cost_price,
        selling_price=product.selling_price,
    )
    db.add(new_product)
    db.flush()  # get product_id

    # Create branch_inventory for ALL existing branches
    branches = db.query(models.Branch).all()
    for branch in branches:
        existing = db.query(models.BranchInventory).filter(
            models.BranchInventory.product_id == new_product.product_id,
            models.BranchInventory.branch_id == branch.branch_id
        ).first()
        if not existing:
            inv = models.BranchInventory(
                product_id=new_product.product_id,
                branch_id=branch.branch_id,
                stock_quantity=product.stock_quantity if product.stock_quantity else 0,
                reorder_level=5,
            )
            db.add(inv)

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
        query = query.filter(models.Product.product_name.ilike(f"%{search}%"))

    total    = query.count()
    page     = max(1, page)
    products = query.offset((page - 1) * limit).limit(limit).all()

    return {"total_products": total, "page": page, "limit": limit, "data": products}


@router.get("/barcode/{barcode}")
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.barcode == barcode).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}", response_model=schemas.ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=schemas.ProductResponse)
def update_product(product_id: int, product: schemas.ProductCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Product).filter(models.Product.product_id == product_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    existing.product_name  = product.product_name
    existing.barcode       = product.barcode
    existing.category_id   = product.category_id
    existing.cost_price    = product.cost_price
    existing.selling_price = product.selling_price
    db.commit()
    db.refresh(existing)
    return existing


@router.post("/import")
def import_products(file: UploadFile = File(...), db: Session = Depends(get_db)):
    workbook  = openpyxl.load_workbook(file.file)
    sheet     = workbook.active
    imported  = 0
    branches  = db.query(models.Branch).all()

    for row in sheet.iter_rows(min_row=2, values_only=True):
        product_name, barcode, category_id, cost_price, selling_price, stock = row

        product = models.Product(
            product_name=product_name,
            barcode=str(barcode),
            category_id=category_id,
            cost_price=cost_price,
            selling_price=selling_price,
        )
        db.add(product)
        db.flush()

        for branch in branches:
            db.add(models.BranchInventory(
                product_id=product.product_id,
                branch_id=branch.branch_id,
                stock_quantity=int(stock) if stock else 0,
                reorder_level=5,
            ))
        imported += 1

    db.commit()
    return {"message": f"{imported} products imported successfully"}