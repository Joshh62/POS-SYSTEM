from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.dependencies import get_current_user
from datetime import date
import openpyxl
import csv
import io

router = APIRouter(prefix="/products", tags=["Products"])


# ── CREATE ────────────────────────────────────────────────────────────────────
@router.post("/", response_model=schemas.ProductResponse)
def create_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
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
    db.flush()

    branches = db.query(models.Branch).all()
    for branch in branches:
        existing = db.query(models.BranchInventory).filter(
            models.BranchInventory.product_id == new_product.product_id,
            models.BranchInventory.branch_id  == branch.branch_id
        ).first()
        if not existing:
            db.add(models.BranchInventory(
                product_id=new_product.product_id,
                branch_id=branch.branch_id,
                stock_quantity=product.stock_quantity or 0,
                reorder_level=5,
            ))

    db.commit()
    db.refresh(new_product)
    return new_product


# ── LIST ──────────────────────────────────────────────────────────────────────
@router.get("/")
def get_products(
    search: str = None,
    page:   int = 1,
    limit:  int = 20,
    db: Session = Depends(get_db)
):
    query = db.query(models.Product)
    if search:
        query = query.filter(models.Product.product_name.ilike(f"%{search}%"))

    total    = query.count()
    products = query.offset((max(1, page) - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "data": products}


# ── BARCODE LOOKUP ────────────────────────────────────────────────────────────
@router.get("/barcode/{barcode}")
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.barcode == barcode).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# ── GET ONE ───────────────────────────────────────────────────────────────────
@router.get("/{product_id}", response_model=schemas.ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# ── UPDATE ────────────────────────────────────────────────────────────────────
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


# ── IMPORT (xlsx or csv) ──────────────────────────────────────────────────────
@router.post("/import")
def import_products(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Import products from .xlsx or .csv file.

    Expected columns (header row required):
      product_name | barcode | selling_price | category (name) | cost_price | stock_quantity

    - category column: matched by name, created if not found
    - Duplicate barcodes are skipped (not errored)
    - Per-row errors are collected and returned — they don't stop the import
    - Stock is added to ALL branches for this business
    """
    filename = file.filename.lower()
    imported, skipped, errors = 0, 0, []

    # Build category name → id map (create missing ones)
    def get_or_create_category(name: str) -> int | None:
        if not name:
            return None
        name = str(name).strip()
        cat = db.query(models.Category).filter(
            models.Category.category_name.ilike(name)
        ).first()
        if not cat:
            cat = models.Category(category_name=name)
            db.add(cat)
            db.flush()
        return cat.category_id

    # Fetch branches once
    branches = db.query(models.Branch).all()

    # ── Parse rows ────────────────────────────────────────────────────────────
    try:
        if filename.endswith(".csv"):
            content = file.file.read().decode("utf-8-sig")  # handles BOM
            reader  = csv.DictReader(io.StringIO(content))
            rows    = list(reader)
        else:
            wb   = openpyxl.load_workbook(file.file, data_only=True)
            ws   = wb.active
            hdrs = [str(c.value).strip().lower() if c.value else "" for c in next(ws.iter_rows(min_row=1, max_row=1))]
            rows = []
            for r in ws.iter_rows(min_row=2, values_only=True):
                rows.append(dict(zip(hdrs, r)))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    # ── Process each row ──────────────────────────────────────────────────────
    for i, row in enumerate(rows, start=2):
        row = {str(k).strip().lower(): v for k, v in row.items()}

        product_name  = str(row.get("product_name") or "").strip()
        barcode       = str(row.get("barcode")       or "").strip()
        selling_price = row.get("selling_price")
        cost_price    = row.get("cost_price")
        stock_qty     = row.get("stock_quantity") or row.get("stock") or 0
        category_name = str(row.get("category")   or "").strip()
        expiry_raw    = row.get("expiry_date")     # ✅ new column

        if not product_name:
            errors.append(f"Row {i}: missing product_name"); continue
        if not barcode:
            errors.append(f"Row {i}: missing barcode"); continue
        if not selling_price:
            errors.append(f"Row {i}: missing selling_price"); continue

        if db.query(models.Product).filter(models.Product.barcode == barcode).first():
            skipped += 1; continue

        # Parse expiry date
        expiry_date = None
        if expiry_raw:
            try:
                if isinstance(expiry_raw, str):
                    expiry_date = date.fromisoformat(str(expiry_raw).strip())
                elif hasattr(expiry_raw, "date"):
                    expiry_date = expiry_raw.date()
                else:
                    expiry_date = date.fromisoformat(str(expiry_raw).strip())
            except Exception:
                errors.append(f"Row {i} ({product_name}): invalid expiry_date format — use YYYY-MM-DD")
                continue

        try:
            category_id = get_or_create_category(category_name)

            product = models.Product(
                product_name=product_name,
                barcode=barcode,
                category_id=category_id,
                cost_price=float(cost_price) if cost_price else 0.0,
                selling_price=float(selling_price),
            )
            db.add(product)
            db.flush()

            qty = int(float(stock_qty)) if stock_qty else 0

            for branch in branches:
                db.add(models.BranchInventory(
                    product_id=product.product_id,
                    branch_id=branch.branch_id,
                    stock_quantity=qty,
                    reorder_level=5,
                    expiry_alert_days=90,
                ))

                # ✅ Create opening batch if stock > 0 or expiry provided
                if qty > 0 or expiry_date:
                    db.add(models.InventoryBatch(
                        product_id=product.product_id,
                        branch_id=branch.branch_id,
                        quantity=qty,
                        expiry_date=expiry_date,
                        received_date=date.today(),
                        notes="Imported via bulk upload",
                    ))

            imported += 1

        except Exception as e:
            errors.append(f"Row {i} ({product_name}): {str(e)}")
            db.rollback()
            continue

    db.commit()

    return {
        "imported": imported,
        "skipped":  skipped,
        "errors":   errors,
        "message":  f"{imported} products imported, {skipped} skipped, {len(errors)} errors"
    }