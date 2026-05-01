from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel
import pytz
import csv
import io

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role, get_active_branch_id, SUPERADMIN_ROLE

router = APIRouter(prefix="/inventory", tags=["Inventory"])

LAGOS = pytz.timezone("Africa/Lagos")

def now_lagos():
    return datetime.now(LAGOS).replace(tzinfo=None)

def today_lagos():
    return datetime.now(LAGOS).date()


# ── Request schemas ───────────────────────────────────────────────────────────
class RestockWithExpiry(BaseModel):
    product_id:        int
    branch_id:         int
    quantity:          int
    expiry_date:       Optional[str] = None   # "YYYY-MM-DD" or null
    notes:             Optional[str] = None

class ReorderLevelUpdate(BaseModel):
    product_id:        int
    branch_id:         int
    reorder_level:     int
    expiry_alert_days: Optional[int] = None


# ── Branch resolver ───────────────────────────────────────────────────────────
def _resolve_branch_ids(user, branch_id_param: Optional[int], db: Session) -> list[int]:
    if user.role == SUPERADMIN_ROLE:
        return [branch_id_param] if branch_id_param else []
    if user.role == "admin":
        all_ids = [
            b.branch_id for b in
            db.query(models.Branch).filter(
                models.Branch.business_id == user.business_id
            ).all()
        ]
        if branch_id_param and branch_id_param in all_ids:
            return [branch_id_param]
        return all_ids
    return [user.branch_id]


# ── GET inventory ─────────────────────────────────────────────────────────────
@router.get("/")
def get_inventory(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    ids = _resolve_branch_ids(user, branch_id, db)
    q   = db.query(models.BranchInventory)
    if ids:
        q = q.filter(models.BranchInventory.branch_id.in_(ids))
    return q.all()


# ── GET low stock ─────────────────────────────────────────────────────────────
@router.get("/low-stock")
def get_low_stock_products(
    threshold: int = 5,
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    ids = _resolve_branch_ids(user, branch_id, db)
    q   = db.query(models.BranchInventory).filter(
        models.BranchInventory.stock_quantity <= threshold
    )
    if ids:
        q = q.filter(models.BranchInventory.branch_id.in_(ids))
    return {"threshold": threshold, "low_stock_items": q.all()}


# ── GET expiring batches ──────────────────────────────────────────────────────
@router.get("/expiring")
def get_expiring_batches(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    ids   = _resolve_branch_ids(user, branch_id, db)
    today = today_lagos()

    q = db.query(
        models.InventoryBatch,
        models.Product.product_name,
        models.BranchInventory.expiry_alert_days,
    ).join(
        models.Product,
        models.Product.product_id == models.InventoryBatch.product_id
    ).join(
        models.BranchInventory,
        and_(
            models.BranchInventory.product_id == models.InventoryBatch.product_id,
            models.BranchInventory.branch_id  == models.InventoryBatch.branch_id,
        )
    ).filter(
        models.InventoryBatch.expiry_date.isnot(None),
        models.InventoryBatch.quantity > 0,
    )

    if ids:
        q = q.filter(models.InventoryBatch.branch_id.in_(ids))

    expired       = []
    expiring_soon = []

    for batch, product_name, alert_days in q.all():
        alert_days = alert_days or 90
        days_left  = (batch.expiry_date - today).days

        row = {
            "batch_id":     batch.batch_id,
            "product_name": product_name,
            "product_id":   batch.product_id,
            "branch_id":    batch.branch_id,
            "quantity":     batch.quantity,
            "expiry_date":  str(batch.expiry_date),
            "days_left":    days_left,
            "alert_days":   alert_days,
        }

        if days_left < 0:
            row["status"] = "expired"
            expired.append(row)
        elif days_left <= alert_days:
            row["status"] = "expiring_soon"
            expiring_soon.append(row)

    expired.sort(key=lambda x: x["days_left"])
    expiring_soon.sort(key=lambda x: x["days_left"])

    return {
        "expired":       expired,
        "expiring_soon": expiring_soon,
        "total_alerts":  len(expired) + len(expiring_soon),
    }


# ── GET batches for a product ─────────────────────────────────────────────────
@router.get("/batches/{product_id}")
def get_product_batches(
    product_id: int,
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    ids   = _resolve_branch_ids(user, branch_id, db)
    today = today_lagos()

    q = db.query(models.InventoryBatch).filter(
        models.InventoryBatch.product_id == product_id,
        models.InventoryBatch.quantity   > 0,
    )
    if ids:
        q = q.filter(models.InventoryBatch.branch_id.in_(ids))

    batches = q.order_by(models.InventoryBatch.expiry_date.asc().nullslast()).all()

    result = []
    for b in batches:
        days_left = (b.expiry_date - today).days if b.expiry_date else None
        status    = "ok"
        if days_left is not None:
            if days_left < 0:
                status = "expired"
            elif days_left <= 90:
                status = "expiring_soon"
        result.append({
            "batch_id":      b.batch_id,
            "quantity":      b.quantity,
            "expiry_date":   str(b.expiry_date) if b.expiry_date else None,
            "received_date": str(b.received_date),
            "days_left":     days_left,
            "status":        status,
            "notes":         b.notes,
        })
    return result


# ── RESTOCK (single product with expiry) ──────────────────────────────────────
@router.post("/restock")
def restock_product(
    data: RestockWithExpiry,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    ids = _resolve_branch_ids(user, data.branch_id, db)
    if ids and data.branch_id not in ids:
        raise HTTPException(status_code=403, detail="Not authorized for this branch")

    branch_id = data.branch_id or (ids[0] if ids else user.branch_id)

    product = db.query(models.Product).filter(
        models.Product.product_id == data.product_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    expiry = None
    if data.expiry_date:
        try:
            expiry = date.fromisoformat(data.expiry_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expiry_date format. Use YYYY-MM-DD")

    inventory = db.query(models.BranchInventory).filter(
        models.BranchInventory.product_id == data.product_id,
        models.BranchInventory.branch_id  == branch_id
    ).first()

    if inventory:
        inventory.stock_quantity += data.quantity
    else:
        inventory = models.BranchInventory(
            product_id=data.product_id,
            branch_id=branch_id,
            stock_quantity=data.quantity,
            reorder_level=5,
            expiry_alert_days=90,
        )
        db.add(inventory)
        db.flush()

    batch = models.InventoryBatch(
        product_id=data.product_id,
        branch_id=branch_id,
        quantity=data.quantity,
        expiry_date=expiry,
        received_date=today_lagos(),
        notes=data.notes,
    )
    db.add(batch)

    db.add(models.InventoryMovement(
        product_id=data.product_id,
        branch_id=branch_id,
        movement_type="RESTOCK",
        quantity=data.quantity,
        reference_id=None,
        movement_date=now_lagos()
    ))

    db.commit()
    db.refresh(inventory)

    return {
        "product_id":  data.product_id,
        "branch_id":   branch_id,
        "new_stock":   inventory.stock_quantity,
        "expiry_date": str(expiry) if expiry else None,
        "batch_id":    batch.batch_id,
    }


# ── BULK RESTOCK (CSV upload) ─────────────────────────────────────────────────
@router.post("/bulk-restock")
def bulk_restock(
    file: UploadFile = File(...),
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    """
    Bulk restock existing products from a CSV file.

    Required columns:
      barcode | quantity

    Optional columns:
      expiry_date (YYYY-MM-DD) | notes

    - Only restocks products that already exist in the system
    - Creates a batch record for each row
    - Logs an inventory movement for each restock
    - Rows with unknown barcodes are reported as errors
    - Does NOT create new products — use Import products for that
    """
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported for bulk restock.")

    # Resolve which branches this user can restock
    ids       = _resolve_branch_ids(user, branch_id, db)
    branch_id = branch_id or (ids[0] if ids else user.branch_id)

    if not branch_id:
        raise HTTPException(status_code=400, detail="Could not determine branch for restock.")

    # Verify branch access
    if ids and branch_id not in ids:
        raise HTTPException(status_code=403, detail="Not authorized for this branch.")

    # Parse CSV
    try:
        content = file.file.read().decode("utf-8-sig")  # handles BOM
        reader  = csv.DictReader(io.StringIO(content))
        rows    = list(reader)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty.")

    # Validate headers
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    if "barcode" not in headers:
        raise HTTPException(status_code=400, detail="Missing required column: barcode")
    if "quantity" not in headers:
        raise HTTPException(status_code=400, detail="Missing required column: quantity")

    restocked, skipped, errors = 0, 0, []

    for i, row in enumerate(rows, start=2):
        # Normalise keys
        row = {str(k).strip().lower(): str(v).strip() if v else "" for k, v in row.items()}

        barcode     = row.get("barcode", "").strip()
        qty_raw     = row.get("quantity", "").strip()
        expiry_raw  = row.get("expiry_date", "").strip()
        notes       = row.get("notes", "").strip() or "Bulk restock via CSV"

        # ── Validate row ──────────────────────────────────────────────────────
        if not barcode:
            errors.append(f"Row {i}: missing barcode"); continue

        if not qty_raw:
            errors.append(f"Row {i} (barcode {barcode}): missing quantity"); continue

        try:
            qty = int(float(qty_raw))
        except ValueError:
            errors.append(f"Row {i} (barcode {barcode}): quantity must be a number"); continue

        if qty <= 0:
            errors.append(f"Row {i} (barcode {barcode}): quantity must be greater than 0"); continue

        # ── Parse expiry date ─────────────────────────────────────────────────
        expiry = None
        if expiry_raw:
            try:
                expiry = date.fromisoformat(expiry_raw)
            except ValueError:
                errors.append(f"Row {i} (barcode {barcode}): invalid expiry_date — use YYYY-MM-DD"); continue

        # ── Look up product ───────────────────────────────────────────────────
        product = db.query(models.Product).filter(
            models.Product.barcode == barcode
        ).first()

        if not product:
            errors.append(f"Row {i}: barcode '{barcode}' not found — add this product first"); skipped += 1; continue

        # ── Update BranchInventory ────────────────────────────────────────────
        inventory = db.query(models.BranchInventory).filter(
            models.BranchInventory.product_id == product.product_id,
            models.BranchInventory.branch_id  == branch_id,
        ).first()

        if inventory:
            inventory.stock_quantity += qty
        else:
            inventory = models.BranchInventory(
                product_id=product.product_id,
                branch_id=branch_id,
                stock_quantity=qty,
                reorder_level=5,
                expiry_alert_days=90,
            )
            db.add(inventory)
            db.flush()

        # ── Create batch record ───────────────────────────────────────────────
        db.add(models.InventoryBatch(
            product_id=product.product_id,
            branch_id=branch_id,
            quantity=qty,
            expiry_date=expiry,
            received_date=today_lagos(),
            notes=notes,
        ))

        # ── Log movement ──────────────────────────────────────────────────────
        db.add(models.InventoryMovement(
            product_id=product.product_id,
            branch_id=branch_id,
            movement_type="RESTOCK",
            quantity=qty,
            movement_date=now_lagos(),
        ))

        restocked += 1

    db.commit()

    return {
        "restocked": restocked,
        "skipped":   skipped,
        "errors":    errors,
        "message":   f"{restocked} products restocked, {skipped} skipped, {len(errors)} errors",
    }


# ── UPDATE reorder level + alert threshold ────────────────────────────────────
@router.patch("/reorder-level")
def update_reorder_level(
    data: ReorderLevelUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    inventory = db.query(models.BranchInventory).filter(
        models.BranchInventory.product_id == data.product_id,
        models.BranchInventory.branch_id  == data.branch_id
    ).first()

    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory record not found")

    inventory.reorder_level = data.reorder_level
    if data.expiry_alert_days is not None:
        inventory.expiry_alert_days = data.expiry_alert_days

    db.commit()
    return {
        "product_id":        data.product_id,
        "branch_id":         data.branch_id,
        "reorder_level":     inventory.reorder_level,
        "expiry_alert_days": inventory.expiry_alert_days,
    }


# ── ADJUST stock ──────────────────────────────────────────────────────────────
@router.post("/adjust")
def adjust_stock(
    product_id: int,
    quantity:   int,
    reason:     str,
    branch_id:  Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    ids      = _resolve_branch_ids(user, branch_id, db)
    resolved = branch_id or (ids[0] if ids else user.branch_id)

    inventory = db.query(models.BranchInventory).filter(
        models.BranchInventory.product_id == product_id,
        models.BranchInventory.branch_id  == resolved
    ).first()
    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory record not found")

    inventory.stock_quantity += quantity

    db.add(models.StockAdjustment(product_id=product_id, quantity=quantity, reason=reason))
    db.add(models.InventoryMovement(
        product_id=product_id,
        branch_id=resolved,
        movement_type="ADJUSTMENT",
        quantity=quantity,
        movement_date=now_lagos()
    ))

    db.commit()
    return {"message": "Stock adjusted", "new_stock": inventory.stock_quantity}