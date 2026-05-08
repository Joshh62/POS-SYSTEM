from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.dependencies import get_current_user, require_role, SUPERADMIN_ROLE
from datetime import date, datetime
import openpyxl
import csv
import io
import pytz

router = APIRouter(prefix="/products", tags=["Products"])

LAGOS = pytz.timezone("Africa/Lagos")

def now_lagos():
    return datetime.now(LAGOS).replace(tzinfo=None)


# ── Audit log helper ──────────────────────────────────────────────────────────
def write_audit(db, user_id: int, action: str, table: str, record_id: int, description: str):
    try:
        db.add(models.AuditLog(
            user_id=user_id,
            action=action,
            table_name=table,
            record_id=record_id,
            description=description,
        ))
    except Exception as e:
        print(f"[Audit] Failed to write log: {e}")


# ── Business-scoped branch helper ─────────────────────────────────────────────
def _get_business_branches(db, user) -> list:
    """Get only branches belonging to the current user's business."""
    if user.role == SUPERADMIN_ROLE:
        # Superadmin — get all branches (shouldn't normally add products as superadmin)
        return db.query(models.Branch).all()
    return db.query(models.Branch).filter(
        models.Branch.business_id == user.business_id
    ).all()


# ── CREATE ────────────────────────────────────────────────────────────────────
@router.post("/", response_model=schemas.ProductResponse)
def create_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin", "manager"]))
):
    # Check barcode uniqueness within this business only
    existing = db.query(models.Product).filter(
        models.Product.barcode      == product.barcode,
        models.Product.business_id  == current_user.business_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Barcode already exists in your product catalog")

    new_product = models.Product(
        business_id=current_user.business_id,
        product_name=product.product_name,
        barcode=product.barcode,
        category_id=product.category_id,
        cost_price=product.cost_price,
        selling_price=product.selling_price,
    )
    db.add(new_product)
    db.flush()

    # ✅ Only create inventory for THIS business's branches — not all branches
    branches = _get_business_branches(db, current_user)
    for branch in branches:
        existing_inv = db.query(models.BranchInventory).filter(
            models.BranchInventory.product_id == new_product.product_id,
            models.BranchInventory.branch_id  == branch.branch_id
        ).first()
        if not existing_inv:
            db.add(models.BranchInventory(
                product_id=new_product.product_id,
                branch_id=branch.branch_id,
                stock_quantity=product.stock_quantity or 0,
                reorder_level=5,
            ))

    write_audit(
        db,
        user_id=current_user.user_id,
        action="CREATE",
        table="products",
        record_id=new_product.product_id,
        description=f"Added product '{new_product.product_name}' — barcode: {new_product.barcode} — price: ₦{float(new_product.selling_price):,.2f}",
    )

    db.commit()
    db.refresh(new_product)
    return new_product


# ── LIST ──────────────────────────────────────────────────────────────────────
@router.get("/")
def get_products(
    search: str = None,
    page:   int = 1,
    limit:  int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Product)

    # ✅ Scope to business — superadmin sees all
    if current_user.role != SUPERADMIN_ROLE:
        query = query.filter(models.Product.business_id == current_user.business_id)

    if search:
        query = query.filter(models.Product.product_name.ilike(f"%{search}%"))

    total    = query.count()
    products = query.offset((max(1, page) - 1) * limit).limit(limit).all()
    return {"total": total, "page": page, "limit": limit, "data": products}


# ── BARCODE LOOKUP ────────────────────────────────────────────────────────────
@router.get("/barcode/{barcode}")
def get_product_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Product).filter(models.Product.barcode == barcode)

    # Scope to business
    if current_user.role != SUPERADMIN_ROLE:
        query = query.filter(models.Product.business_id == current_user.business_id)

    product = query.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# ── GET ONE ───────────────────────────────────────────────────────────────────
@router.get("/{product_id}", response_model=schemas.ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    product = db.query(models.Product).filter(
        models.Product.product_id == product_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Scope check
    if current_user.role != SUPERADMIN_ROLE and product.business_id != current_user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    return product


# ── UPDATE ────────────────────────────────────────────────────────────────────
@router.put("/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int,
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin", "manager"]))
):
    existing = db.query(models.Product).filter(
        models.Product.product_id == product_id
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    # Scope check
    if current_user.role != SUPERADMIN_ROLE and existing.business_id != current_user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    changes = []
    if existing.product_name != product.product_name:
        changes.append(f"name: '{existing.product_name}' → '{product.product_name}'")
    if float(existing.selling_price or 0) != float(product.selling_price or 0):
        changes.append(f"price: ₦{float(existing.selling_price or 0):,.2f} → ₦{float(product.selling_price or 0):,.2f}")
    if float(existing.cost_price or 0) != float(product.cost_price or 0):
        changes.append(f"cost: ₦{float(existing.cost_price or 0):,.2f} → ₦{float(product.cost_price or 0):,.2f}")

    existing.product_name  = product.product_name
    existing.barcode       = product.barcode
    existing.category_id   = product.category_id
    existing.cost_price    = product.cost_price
    existing.selling_price = product.selling_price

    change_str = ", ".join(changes) if changes else "no price/name changes"
    write_audit(
        db,
        user_id=current_user.user_id,
        action="UPDATE",
        table="products",
        record_id=product_id,
        description=f"Updated product '{existing.product_name}' (#{product_id}) — {change_str}",
    )

    db.commit()
    db.refresh(existing)
    return existing


# ── IMPORT (xlsx or csv) ──────────────────────────────────────────────────────
@router.post("/import")
def import_products(
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin", "manager"]))
):
    """
    Import products from .xlsx or .csv file.

    Expected columns (header row required):
      product_name | barcode | selling_price | category (name) | cost_price | stock_quantity

    - Products are scoped to the current user's business
    - Inventory created only for this business's branches
    - Duplicate barcodes within this business are skipped
    - Per-row errors collected and returned without stopping the import
    """
    filename = file.filename.lower()
    imported, skipped, errors = 0, 0, []

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

    # ✅ Only this business's branches
    branches = _get_business_branches(db, current_user)

    try:
        if filename.endswith(".csv"):
            content = file.file.read().decode("utf-8-sig")
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

    imported_names = []

    for i, row in enumerate(rows, start=2):
        row = {str(k).strip().lower(): v for k, v in row.items()}

        product_name  = str(row.get("product_name") or "").strip()
        barcode       = str(row.get("barcode")       or "").strip()
        selling_price = row.get("selling_price")
        cost_price    = row.get("cost_price")
        stock_qty     = row.get("stock_quantity") or row.get("stock") or 0
        category_name = str(row.get("category")   or "").strip()
        expiry_raw    = row.get("expiry_date")

        if not product_name:
            errors.append(f"Row {i}: missing product_name"); continue
        if not barcode:
            errors.append(f"Row {i}: missing barcode"); continue
        if not selling_price:
            errors.append(f"Row {i}: missing selling_price"); continue

        # ✅ Check barcode uniqueness within this business only
        if db.query(models.Product).filter(
            models.Product.barcode     == barcode,
            models.Product.business_id == current_user.business_id,
        ).first():
            skipped += 1; continue

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
                business_id=current_user.business_id,
                product_name=product_name,
                barcode=barcode,
                category_id=category_id,
                cost_price=float(cost_price) if cost_price else 0.0,
                selling_price=float(selling_price),
            )
            db.add(product)
            db.flush()

            qty = int(float(stock_qty)) if stock_qty else 0

            # ✅ Only this business's branches
            for branch in branches:
                db.add(models.BranchInventory(
                    product_id=product.product_id,
                    branch_id=branch.branch_id,
                    stock_quantity=qty,
                    reorder_level=5,
                    expiry_alert_days=90,
                ))

                if qty > 0 or expiry_date:
                    db.add(models.InventoryBatch(
                        product_id=product.product_id,
                        branch_id=branch.branch_id,
                        quantity=qty,
                        expiry_date=expiry_date,
                        received_date=date.today(),
                        notes="Imported via bulk upload",
                    ))

            imported_names.append(product_name)
            imported += 1

        except Exception as e:
            errors.append(f"Row {i} ({product_name}): {str(e)}")
            db.rollback()
            continue

    if imported > 0:
        preview = ", ".join(imported_names[:5])
        if len(imported_names) > 5:
            preview += f" ... and {len(imported_names) - 5} more"
        write_audit(
            db,
            user_id=current_user.user_id,
            action="CREATE",
            table="products",
            record_id=0,
            description=f"Bulk imported {imported} product(s) via CSV — {preview}",
        )

    db.commit()

    return {
        "imported": imported,
        "skipped":  skipped,
        "errors":   errors,
        "message":  f"{imported} products imported, {skipped} skipped, {len(errors)} errors"
    }