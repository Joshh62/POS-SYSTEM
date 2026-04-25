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

    branch_id = user.branch_id   # ✅ enforce branch

    product = db.query(models.Product).filter(
        models.Product.product_id == data.product_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    inventory = db.query(models.BranchInventory).filter(
        models.BranchInventory.product_id == data.product_id,
        models.BranchInventory.branch_id == branch_id
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

    movement = models.InventoryMovement(
        product_id=data.product_id,
        branch_id=branch_id,
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
        "branch_id": branch_id,
        "new_stock": inventory.stock_quantity
    }


@router.get("/")
def get_inventory(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    return db.query(models.BranchInventory).filter(
        models.BranchInventory.branch_id == user.branch_id
    ).all()


@router.get("/low-stock")
def get_low_stock_products(
    threshold: int = 5,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):

    results = db.query(models.BranchInventory).filter(
        models.BranchInventory.branch_id == user.branch_id,
        models.BranchInventory.stock_quantity <= threshold
    ).all()

    return {
        "threshold": threshold,
        "low_stock_items": results
    }


@router.post("/adjust")
def adjust_stock(
    product_id: int,
    quantity: int,
    reason: str,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):

    branch_id = user.branch_id

    inventory = db.query(models.BranchInventory).filter(
        models.BranchInventory.product_id == product_id,
        models.BranchInventory.branch_id == branch_id
    ).first()

    if not inventory:
        raise HTTPException(status_code=404, detail="Inventory record not found")

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