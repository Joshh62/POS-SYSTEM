from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import pytz

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role, get_active_branch_id, SUPERADMIN_ROLE

router = APIRouter(prefix="/inventory", tags=["Inventory"])

LAGOS = pytz.timezone("Africa/Lagos")
def now_lagos():
    return datetime.now(LAGOS).replace(tzinfo=None)


def _resolve_branch_ids(user, branch_id_param: Optional[int], db: Session) -> list[int]:
    """
    Return the list of branch_ids to filter inventory queries by.
    - superadmin + branch_id  → [branch_id]
    - superadmin + no param   → [] (all branches)
    - admin + branch_id       → [branch_id] if in their business
    - admin + no param        → all branches in their business
    - manager/cashier         → [user.branch_id]
    """
    if user.role == SUPERADMIN_ROLE:
        if branch_id_param:
            return [branch_id_param]
        return []   # empty = no filter = all branches

    if user.role == "admin":
        all_ids = [
            b.branch_id for b in
            db.query(models.Branch).filter(models.Branch.business_id == user.business_id).all()
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


# ── RESTOCK ───────────────────────────────────────────────────────────────────
@router.post("/restock", response_model=schemas.RestockResponse)
def restock_product(
    data: schemas.RestockRequest,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    # admin/superadmin can restock any branch they have access to
    ids = _resolve_branch_ids(user, data.branch_id, db)
    if ids and data.branch_id not in ids:
        raise HTTPException(status_code=403, detail="Not authorized for this branch")

    branch_id = data.branch_id or (ids[0] if ids else user.branch_id)

    product = db.query(models.Product).filter(
        models.Product.product_id == data.product_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

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
            stock_quantity=data.quantity
        )
        db.add(inventory)

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
    return {"product_id": data.product_id, "branch_id": branch_id, "new_stock": inventory.stock_quantity}


# ── ADJUST stock ──────────────────────────────────────────────────────────────
@router.post("/adjust")
def adjust_stock(
    product_id: int,
    quantity: int,
    reason: str,
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    ids = _resolve_branch_ids(user, branch_id, db)
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