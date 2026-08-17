from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from sqlalchemy.exc import IntegrityError
from typing import Optional
from datetime import datetime, date, timedelta
from pydantic import ValidationError
import pytz
import csv
import io
from collections import Counter

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role, get_active_branch_id, SUPERADMIN_ROLE

router = APIRouter(prefix="/inventory", tags=["Inventory"])

LAGOS = pytz.timezone("Africa/Lagos")

def now_lagos():
    return datetime.now(LAGOS).replace(tzinfo=None)

def today_lagos():
    return datetime.now(LAGOS).date()


# ── Mutation authorization / transaction helpers ─────────────────────────────
def _authorize_branch(user, branch_id: int, db: Session):
    branch = db.query(models.Branch).filter(
        models.Branch.branch_id == branch_id
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    if user.role != SUPERADMIN_ROLE:
        if branch.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Not authorized for this business")
        if user.role == "manager" and branch.branch_id != user.branch_id:
            raise HTTPException(status_code=403, detail="Not authorized for this branch")
    return branch


def _authorize_product(product_id: int, branch, db: Session):
    product = db.query(models.Product).filter(
        models.Product.product_id == product_id
    ).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.business_id != branch.business_id:
        raise HTTPException(status_code=403, detail="Product is outside the branch business")
    return product


def _rollback_http(db: Session, exc: HTTPException):
    db.rollback()
    raise exc


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
    data: schemas.InventoryRestockCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    try:
        branch = _authorize_branch(user, data.branch_id, db)
        _authorize_product(data.product_id, branch, db)

        inventory = db.query(models.BranchInventory).filter(
            models.BranchInventory.product_id == data.product_id,
            models.BranchInventory.branch_id == branch.branch_id,
        ).with_for_update().first()

        if inventory:
            inventory.stock_quantity += data.quantity
        else:
            inventory = models.BranchInventory(
                product_id=data.product_id,
                branch_id=branch.branch_id,
                stock_quantity=data.quantity,
                reorder_level=5,
                expiry_alert_days=90,
            )
            db.add(inventory)
            db.flush()

        batch = models.InventoryBatch(
            product_id=data.product_id,
            branch_id=branch.branch_id,
            quantity=data.quantity,
            expiry_date=data.expiry_date,
            received_date=today_lagos(),
            notes=data.notes,
        )
        db.add(batch)
        db.flush()

        movement = models.InventoryMovement(
            product_id=data.product_id,
            branch_id=branch.branch_id,
            movement_type="RESTOCK",
            quantity=data.quantity,
            reference_id=batch.batch_id,
            movement_date=now_lagos(),
        )
        db.add(movement)
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="INVENTORY_RESTOCK",
            table_name="inventory_batches",
            record_id=batch.batch_id,
            description=(
                f"Restocked product {data.product_id} by {data.quantity} "
                f"at branch {branch.branch_id}"
            ),
        ))
        db.commit()
        db.refresh(inventory)
        return {
            "product_id": data.product_id,
            "branch_id": branch.branch_id,
            "new_stock": inventory.stock_quantity,
            "expiry_date": str(data.expiry_date) if data.expiry_date else None,
            "batch_id": batch.batch_id,
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Restock conflicts with inventory data") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Restock failed") from exc


# ── BULK RESTOCK (CSV upload) ─────────────────────────────────────────────────
@router.post("/bulk-restock")
def bulk_restock(
    file: UploadFile = File(...),
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are supported for bulk restock.")

    resolved = branch_id or user.branch_id
    if not resolved:
        raise HTTPException(status_code=400, detail="Could not determine branch for restock.")

    try:
        branch = _authorize_branch(user, resolved, db)
        try:
            content = file.file.read().decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(content))
            rows = list(reader)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Could not read CSV file") from exc

        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        headers = [str(h).strip().lower() for h in (reader.fieldnames or [])]
        if "barcode" not in headers:
            raise HTTPException(status_code=400, detail="Missing required column: barcode")
        if "quantity" not in headers:
            raise HTTPException(status_code=400, detail="Missing required column: quantity")

        normalized = [
            {str(k).strip().lower(): str(v).strip() if v is not None else ""
             for k, v in row.items()}
            for row in rows
        ]
        barcode_counts = Counter(
            row.get("barcode", "") for row in normalized if row.get("barcode", "")
        )
        accepted = []
        errors = []

        for row_number, row in enumerate(normalized, start=2):
            barcode = row.get("barcode", "")
            quantity_text = row.get("quantity", "")
            expiry_text = row.get("expiry_date", "")
            notes = row.get("notes", "").strip() or "Bulk restock via CSV"

            if not barcode:
                errors.append(f"Row {row_number}: missing barcode")
                continue
            if barcode_counts[barcode] > 1:
                errors.append(f"Row {row_number}: duplicate barcode '{barcode}'")
                continue
            if not quantity_text:
                errors.append(f"Row {row_number} (barcode {barcode}): missing quantity")
                continue
            try:
                quantity = int(quantity_text)
            except ValueError:
                errors.append(
                    f"Row {row_number} (barcode {barcode}): quantity must be a whole number"
                )
                continue
            if quantity <= 0:
                errors.append(
                    f"Row {row_number} (barcode {barcode}): quantity must be greater than 0"
                )
                continue

            expiry = None
            if expiry_text:
                try:
                    expiry = date.fromisoformat(expiry_text)
                except ValueError:
                    errors.append(
                        f"Row {row_number} (barcode {barcode}): invalid expiry_date"
                    )
                    continue

            product = db.query(models.Product).filter(
                models.Product.barcode == barcode,
                models.Product.business_id == branch.business_id,
            ).with_for_update().first()
            if not product:
                errors.append(
                    f"Row {row_number}: barcode '{barcode}' not found in this business"
                )
                continue
            accepted.append((product, quantity, expiry, notes))

        if not accepted:
            raise HTTPException(
                status_code=400,
                detail={"message": "No valid restock rows", "errors": errors},
            )

        for product, quantity, expiry, notes in accepted:
            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == product.product_id,
                models.BranchInventory.branch_id == branch.branch_id,
            ).with_for_update().first()
            if inventory:
                inventory.stock_quantity += quantity
            else:
                inventory = models.BranchInventory(
                    product_id=product.product_id,
                    branch_id=branch.branch_id,
                    stock_quantity=quantity,
                    reorder_level=5,
                    expiry_alert_days=90,
                )
                db.add(inventory)
                db.flush()

            batch = models.InventoryBatch(
                product_id=product.product_id,
                branch_id=branch.branch_id,
                quantity=quantity,
                expiry_date=expiry,
                received_date=today_lagos(),
                notes=notes,
            )
            db.add(batch)
            db.flush()
            db.add(models.InventoryMovement(
                product_id=product.product_id,
                branch_id=branch.branch_id,
                movement_type="RESTOCK",
                quantity=quantity,
                reference_id=batch.batch_id,
                movement_date=now_lagos(),
            ))

        db.add(models.AuditLog(
            user_id=user.user_id,
            action="INVENTORY_BULK_RESTOCK",
            table_name="branch_inventory",
            record_id=branch.branch_id,
            description=(
                f"Bulk-restocked {len(accepted)} product(s) at branch {branch.branch_id}; "
                f"{len(errors)} row(s) rejected"
            ),
        ))
        db.commit()
        return {
            "restocked": len(accepted),
            "skipped": len(errors),
            "errors": errors,
            "message": (
                f"{len(accepted)} products restocked, {len(errors)} rows rejected"
            ),
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bulk restock conflicts with inventory data") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Bulk restock failed") from exc


# ── UPDATE reorder level + alert threshold ────────────────────────────────────
@router.patch("/reorder-level")
def update_reorder_level(
    data: schemas.InventoryReorderLevelUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    try:
        branch = _authorize_branch(user, data.branch_id, db)
        _authorize_product(data.product_id, branch, db)
        inventory = db.query(models.BranchInventory).filter(
            models.BranchInventory.product_id == data.product_id,
            models.BranchInventory.branch_id == branch.branch_id,
        ).with_for_update().first()
        if not inventory:
            raise HTTPException(status_code=404, detail="Inventory record not found")

        inventory.reorder_level = data.reorder_level
        if data.expiry_alert_days is not None:
            inventory.expiry_alert_days = data.expiry_alert_days

        db.add(models.AuditLog(
            user_id=user.user_id,
            action="INVENTORY_THRESHOLD_UPDATE",
            table_name="branch_inventory",
            record_id=inventory.inventory_id,
            description=(
                f"Updated inventory thresholds for product {data.product_id} "
                f"at branch {branch.branch_id}"
            ),
        ))
        db.commit()
        return {
            "product_id": data.product_id,
            "branch_id": branch.branch_id,
            "reorder_level": inventory.reorder_level,
            "expiry_alert_days": inventory.expiry_alert_days,
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Inventory threshold update conflicts with existing data") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Inventory threshold update failed") from exc


# ── ADJUST stock ──────────────────────────────────────────────────────────────
@router.post("/adjust")
def adjust_stock(
    product_id: int,
    quantity: int,
    reason: str,
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    try:
        try:
            data = schemas.InventoryAdjustmentRequest(
                product_id=product_id,
                quantity=quantity,
                reason=reason,
                branch_id=branch_id,
            )
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail="Invalid stock adjustment") from exc

        resolved = data.branch_id or user.branch_id
        if not resolved:
            raise HTTPException(status_code=400, detail="Could not determine adjustment branch")
        branch = _authorize_branch(user, resolved, db)
        _authorize_product(data.product_id, branch, db)

        inventory = db.query(models.BranchInventory).filter(
            models.BranchInventory.product_id == data.product_id,
            models.BranchInventory.branch_id == branch.branch_id,
        ).with_for_update().first()
        if not inventory:
            raise HTTPException(status_code=404, detail="Inventory record not found")

        before_quantity = inventory.stock_quantity
        after_quantity = before_quantity + data.quantity
        if after_quantity < 0:
            raise HTTPException(
                status_code=409,
                detail="Adjustment would make inventory negative",
            )

        inventory.stock_quantity = after_quantity
        adjustment = models.StockAdjustment(
            product_id=data.product_id,
            branch_id=branch.branch_id,
            user_id=user.user_id,
            quantity=data.quantity,
            before_quantity=before_quantity,
            after_quantity=after_quantity,
            reason=data.reason,
        )
        db.add(adjustment)
        db.flush()

        db.add(models.InventoryMovement(
            product_id=data.product_id,
            branch_id=branch.branch_id,
            movement_type="ADJUSTMENT",
            reference_id=adjustment.adjustment_id,
            quantity=data.quantity,
            movement_date=now_lagos(),
        ))
        db.add(models.AuditLog(
            user_id=user.user_id,
            action="INVENTORY_ADJUSTMENT",
            table_name="stock_adjustments",
            record_id=adjustment.adjustment_id,
            description=(
                f"Adjusted product {data.product_id} at branch {branch.branch_id} "
                f"from {before_quantity} to {after_quantity}: {data.reason}"
            ),
        ))
        db.commit()
        return {
            "message": "Stock adjusted",
            "adjustment_id": adjustment.adjustment_id,
            "new_stock": after_quantity,
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Stock adjustment conflicts with inventory data") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Stock adjustment failed") from exc



# ── INTER-BRANCH TRANSFER ────────────────────────────────────────────────────
@router.post("/transfer")
def transfer_stock(
    data: schemas.StockTransferCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    try:
        source_branch = _authorize_branch(user, data.from_branch, db)
        existing = db.query(models.StockTransfer).filter(
            models.StockTransfer.business_id == source_branch.business_id,
            models.StockTransfer.idempotency_key == data.idempotency_key,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Transfer request already processed")

        destination_branch = db.query(models.Branch).filter(
            models.Branch.branch_id == data.to_branch
        ).first()
        if not destination_branch:
            raise HTTPException(status_code=404, detail="Destination branch not found")
        if source_branch.branch_id == destination_branch.branch_id:
            raise HTTPException(status_code=400, detail="Source and destination branches must differ")
        if source_branch.business_id != destination_branch.business_id:
            raise HTTPException(status_code=403, detail="Destination branch is outside the source business")
        if user.role != SUPERADMIN_ROLE and destination_branch.business_id != user.business_id:
            raise HTTPException(status_code=403, detail="Destination branch is outside your business")

        plan = []
        for item in sorted(data.items, key=lambda row: row.product_id):
            product = _authorize_product(item.product_id, source_branch, db)
            if product.business_id != destination_branch.business_id:
                raise HTTPException(status_code=403, detail="Product is outside the destination business")

            locked_rows = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == item.product_id,
                models.BranchInventory.branch_id.in_(
                    [source_branch.branch_id, destination_branch.branch_id]
                ),
            ).order_by(models.BranchInventory.branch_id).with_for_update().all()
            by_branch = {row.branch_id: row for row in locked_rows}
            source = by_branch.get(source_branch.branch_id)
            if not source:
                raise HTTPException(status_code=409, detail="Source inventory record is missing")
            if source.stock_quantity < item.quantity:
                raise HTTPException(status_code=409, detail="Insufficient source inventory")
            destination = by_branch.get(destination_branch.branch_id)
            plan.append((item, source, destination))

        transfer = models.StockTransfer(
            business_id=source_branch.business_id,
            from_branch=source_branch.branch_id,
            to_branch=destination_branch.branch_id,
            user_id=user.user_id,
            idempotency_key=data.idempotency_key,
            status="completed",
            notes=data.notes,
            transfer_date=now_lagos(),
        )
        db.add(transfer)
        db.flush()

        response_items = []
        for item, source, destination in plan:
            if destination is None:
                destination = models.BranchInventory(
                    branch_id=destination_branch.branch_id,
                    product_id=item.product_id,
                    stock_quantity=0,
                )
                db.add(destination)
                db.flush()

            source_before = source.stock_quantity
            destination_before = destination.stock_quantity
            source_after = source_before - item.quantity
            destination_after = destination_before + item.quantity
            source.stock_quantity = source_after
            destination.stock_quantity = destination_after

            transfer_item = models.StockTransferItem(
                transfer_id=transfer.transfer_id,
                product_id=item.product_id,
                quantity=item.quantity,
                source_before=source_before,
                source_after=source_after,
                destination_before=destination_before,
                destination_after=destination_after,
            )
            db.add(transfer_item)
            db.flush()

            movement_time = now_lagos()
            db.add_all([
                models.InventoryMovement(
                    product_id=item.product_id,
                    branch_id=source_branch.branch_id,
                    movement_type="TRANSFER_OUT",
                    reference_id=transfer.transfer_id,
                    stock_transfer_id=transfer.transfer_id,
                    stock_transfer_item_id=transfer_item.transfer_item_id,
                    quantity=-item.quantity,
                    movement_date=movement_time,
                ),
                models.InventoryMovement(
                    product_id=item.product_id,
                    branch_id=destination_branch.branch_id,
                    movement_type="TRANSFER_IN",
                    reference_id=transfer.transfer_id,
                    stock_transfer_id=transfer.transfer_id,
                    stock_transfer_item_id=transfer_item.transfer_item_id,
                    quantity=item.quantity,
                    movement_date=movement_time,
                ),
            ])
            response_items.append({
                "transfer_item_id": transfer_item.transfer_item_id,
                "product_id": item.product_id,
                "quantity": item.quantity,
                "source_before": source_before,
                "source_after": source_after,
                "destination_before": destination_before,
                "destination_after": destination_after,
            })

        db.add(models.AuditLog(
            user_id=user.user_id,
            action="INVENTORY_TRANSFER",
            table_name="stock_transfers",
            record_id=transfer.transfer_id,
            description=(
                f"Transferred {len(response_items)} product line(s) from branch "
                f"{source_branch.branch_id} to branch {destination_branch.branch_id}"
            ),
        ))
        db.commit()
        return {
            "transfer_id": transfer.transfer_id,
            "status": transfer.status,
            "from_branch": source_branch.branch_id,
            "to_branch": destination_branch.branch_id,
            "items": response_items,
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Transfer conflicts with current inventory data") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Stock transfer failed") from exc
