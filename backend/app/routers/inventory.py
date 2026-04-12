from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role

router = APIRouter(
    prefix="/inventory",
    tags=["Inventory"]
)


@router.post("/restock", response_model=schemas.RestockResponse)
def restock_product(
    data: schemas.RestockRequest,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):

    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    # Validate product exists
    product = db.query(models.Product).filter(
        models.Product.product_id == data.product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Validate branch exists
    branch = db.query(models.Branch).filter(
        models.Branch.branch_id == data.branch_id
    ).first()

    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    # Update or create BranchInventory record  (FIXED: was missing entirely)
    inventory = db.query(models.BranchInventory).filter(
        models.BranchInventory.product_id == data.product_id,
        models.BranchInventory.branch_id == data.branch_id
    ).first()

    if inventory:
        inventory.stock_quantity += data.quantity
    else:
        inventory = models.BranchInventory(
            product_id=data.product_id,
            branch_id=data.branch_id,
            stock_quantity=data.quantity
        )
        db.add(inventory)

    # Log the inventory movement  (FIXED: was using item.product_id and new_sale.sale_id)
    movement = models.InventoryMovement(
        product_id=data.product_id,
        branch_id=data.branch_id,
        movement_type="RESTOCK",
        quantity=data.quantity,
        reference_id=None,
        movement_date=datetime.utcnow()
    )

    db.add(movement)
    db.commit()
    db.refresh(inventory)

    return {
        "product_id": data.product_id,
        "branch_id": data.branch_id,
        "new_stock": inventory.stock_quantity
    }


@router.get("/")
def get_inventory(
    branch_id: int = None,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    query = db.query(models.BranchInventory)

    if branch_id:
        query = query.filter(models.BranchInventory.branch_id == branch_id)

    return query.all()


@router.get("/low-stock")
def get_low_stock_products(
    threshold: int = 5,
    branch_id: int = None,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):

    query = db.query(models.BranchInventory).filter(
        models.BranchInventory.stock_quantity <= threshold
    )

    if branch_id:
        query = query.filter(models.BranchInventory.branch_id == branch_id)

    return {
        "threshold": threshold,
        "low_stock_items": query.all()
    }


@router.post("/adjust")
def adjust_stock(
    product_id: int,
    branch_id: int,
    quantity: int,
    reason: str,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):

    inventory = db.query(models.BranchInventory).filter(
        models.BranchInventory.product_id == product_id,
        models.BranchInventory.branch_id == branch_id
    ).first()

    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory record not found for this product/branch")

    inventory.stock_quantity += quantity

    adjustment = models.StockAdjustment(
        product_id=product_id,
        quantity=quantity,
        reason=reason
    )

    movement = models.InventoryMovement(
        product_id=product_id,
        branch_id=branch_id,
        movement_type="ADJUSTMENT",
        quantity=quantity,
        movement_date=datetime.utcnow()
    )

    db.add(adjustment)
    db.add(movement)
    db.commit()

    return {
        "message": "Stock adjusted",
        "new_stock": inventory.stock_quantity
    }