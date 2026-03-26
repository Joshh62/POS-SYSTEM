from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app import models, schemas
from app.dependencies import require_role

router = APIRouter(
    prefix="/purchases",
    tags=["Purchases"]
)


@router.post("/", response_model=schemas.PurchaseOrderResponse)
def create_purchase_order(
    data: schemas.PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    po = models.PurchaseOrder(
        supplier_id=data.supplier_id,
        order_date=datetime.utcnow(),
        status="pending"
    )

    db.add(po)
    db.commit()
    db.refresh(po)

    for item in data.items:

        po_item = models.PurchaseOrderItem(
            po_id=po.po_id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost
        )

        db.add(po_item)

    db.commit()

    return po


@router.post("/{po_id}/receive")
def receive_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    po = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.po_id == po_id
    ).first()

    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    if po.status == "completed":
        raise HTTPException(status_code=400, detail="Purchase order already received")

    items = db.query(models.PurchaseOrderItem).filter(
        models.PurchaseOrderItem.po_id == po_id
    ).all()

    for item in items:

        product = db.query(models.Product).filter(
            models.Product.product_id == item.product_id
        ).first()

        if not product:
            continue

        # increase stock
        product.stock_quantity += item.quantity

        # log inventory movement
        movement = models.InventoryMovement(
            product_id=item.product_id,
            movement_type="PURCHASE",
            quantity=item.quantity,
            reference_id=po_id
        )

        db.add(movement)

    po.status = "completed"

    db.commit()

    return {"message": "Purchase order received and stock updated"}


