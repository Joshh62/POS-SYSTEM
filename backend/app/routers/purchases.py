from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.dependencies import SUPERADMIN_ROLE, require_role


router = APIRouter(prefix="/purchases", tags=["Purchases"])


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


def _authorize_purchase_order(user, po, db: Session):
    branch = _authorize_branch(user, po.branch_id, db)
    if po.business_id is None:
        po.business_id = branch.business_id
    if po.business_id != branch.business_id:
        raise HTTPException(status_code=409, detail="Purchase order business/branch mismatch")
    if user.role != SUPERADMIN_ROLE and po.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized for this business")
    return branch


def _rollback_http(db: Session, exc: HTTPException):
    db.rollback()
    raise exc


@router.post("/", response_model=schemas.PurchaseOrderResponse)
def create_purchase_order(
    data: schemas.PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    try:
        branch = _authorize_branch(user, data.branch_id, db)

        supplier = db.query(models.Supplier).filter(
            models.Supplier.supplier_id == data.supplier_id
        ).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        if supplier.business_id != branch.business_id:
            raise HTTPException(status_code=403, detail="Supplier is outside the branch business")

        product_ids = [item.product_id for item in data.items]
        products = db.query(models.Product).filter(
            models.Product.product_id.in_(product_ids)
        ).all()
        products_by_id = {product.product_id: product for product in products}
        if len(products_by_id) != len(product_ids):
            raise HTTPException(status_code=409, detail="One or more purchase-order products are missing")
        if any(product.business_id != branch.business_id for product in products):
            raise HTTPException(status_code=403, detail="Product is outside the branch business")

        po = models.PurchaseOrder(
            business_id=branch.business_id,
            supplier_id=data.supplier_id,
            branch_id=data.branch_id,
            order_date=datetime.utcnow(),
            status="pending",
        )
        db.add(po)
        db.flush()

        for item in data.items:
            db.add(models.PurchaseOrderItem(
                po_id=po.po_id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                expiry_date=item.expiry_date,
            ))

        db.add(models.AuditLog(
            user_id=user.user_id,
            action="PURCHASE_ORDER_CREATE",
            table_name="purchase_orders",
            record_id=po.po_id,
            description=f"Created purchase order {po.po_id} with {len(data.items)} item(s)",
        ))
        db.commit()
        db.refresh(po)
        return po
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Purchase order conflicts with existing data") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Purchase order creation failed") from exc


@router.get("/")
def list_purchase_orders(
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    query = db.query(models.PurchaseOrder)
    if user.role != SUPERADMIN_ROLE:
        query = query.filter(models.PurchaseOrder.business_id == user.business_id)
        if user.role == "manager":
            query = query.filter(models.PurchaseOrder.branch_id == user.branch_id)
    return query.order_by(models.PurchaseOrder.order_date.desc()).all()


@router.get("/{po_id}")
def get_purchase_order(
    po_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    po = db.query(models.PurchaseOrder).filter(
        models.PurchaseOrder.po_id == po_id
    ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    _authorize_purchase_order(user, po, db)
    return po


@router.post("/{po_id}/receive")
def receive_purchase_order(
    po_id: int,
    data: schemas.PurchaseReceiptCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    try:
        po = db.query(models.PurchaseOrder).filter(
            models.PurchaseOrder.po_id == po_id
        ).with_for_update().first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found")

        branch = _authorize_purchase_order(user, po, db)
        if po.status == "completed":
            raise HTTPException(status_code=409, detail="Purchase order already fully received")
        if po.status not in {"pending", "partially_received"}:
            raise HTTPException(status_code=409, detail="Purchase order cannot be received in its current state")

        requested_ids = [item.po_item_id for item in data.items]
        po_items = db.query(models.PurchaseOrderItem).filter(
            models.PurchaseOrderItem.po_id == po.po_id,
            models.PurchaseOrderItem.po_item_id.in_(requested_ids),
        ).all()
        po_items_by_id = {item.po_item_id: item for item in po_items}
        if len(po_items_by_id) != len(requested_ids):
            raise HTTPException(status_code=409, detail="One or more receipt items do not belong to this purchase order")

        prior_rows = db.query(
            models.PurchaseReceiptItem.po_item_id,
            func.coalesce(func.sum(models.PurchaseReceiptItem.quantity), 0),
        ).join(
            models.PurchaseReceipt,
            models.PurchaseReceipt.receipt_id == models.PurchaseReceiptItem.receipt_id,
        ).filter(
            models.PurchaseReceipt.po_id == po.po_id,
            models.PurchaseReceiptItem.po_item_id.in_(requested_ids),
        ).group_by(models.PurchaseReceiptItem.po_item_id).all()
        prior_by_id = {item_id: int(quantity) for item_id, quantity in prior_rows}

        products = db.query(models.Product).filter(
            models.Product.product_id.in_([item.product_id for item in po_items])
        ).all()
        products_by_id = {product.product_id: product for product in products}
        if len(products_by_id) != len(po_items):
            raise HTTPException(status_code=409, detail="One or more ordered products are missing")
        if any(product.business_id != branch.business_id for product in products):
            raise HTTPException(status_code=403, detail="Ordered product is outside the purchase-order business")

        for request_item in data.items:
            po_item = po_items_by_id[request_item.po_item_id]
            prior = prior_by_id.get(po_item.po_item_id, 0)
            if prior + request_item.quantity > po_item.quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Receipt quantity exceeds ordered quantity for item {po_item.po_item_id}",
                )

        receipt = models.PurchaseReceipt(
            po_id=po.po_id,
            business_id=po.business_id,
            branch_id=po.branch_id,
            user_id=user.user_id,
            received_at=datetime.utcnow(),
            notes=data.notes,
        )
        db.add(receipt)
        db.flush()

        received_now = {}
        for request_item in data.items:
            po_item = po_items_by_id[request_item.po_item_id]
            expiry_date = request_item.expiry_date or po_item.expiry_date

            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == po_item.product_id,
                models.BranchInventory.branch_id == po.branch_id,
            ).with_for_update().first()
            if inventory:
                inventory.stock_quantity += request_item.quantity
            else:
                inventory = models.BranchInventory(
                    product_id=po_item.product_id,
                    branch_id=po.branch_id,
                    stock_quantity=request_item.quantity,
                    reorder_level=5,
                    expiry_alert_days=90,
                )
                db.add(inventory)
                db.flush()

            db.add(models.PurchaseReceiptItem(
                receipt_id=receipt.receipt_id,
                po_item_id=po_item.po_item_id,
                product_id=po_item.product_id,
                quantity=request_item.quantity,
                unit_cost=po_item.unit_cost,
                expiry_date=expiry_date,
            ))
            db.add(models.InventoryBatch(
                product_id=po_item.product_id,
                branch_id=po.branch_id,
                po_id=po.po_id,
                receipt_id=receipt.receipt_id,
                quantity=request_item.quantity,
                expiry_date=expiry_date,
                notes=f"Purchase receipt {receipt.receipt_id}",
            ))
            db.add(models.InventoryMovement(
                product_id=po_item.product_id,
                branch_id=po.branch_id,
                movement_type="PURCHASE_RECEIPT",
                reference_id=receipt.receipt_id,
                purchase_receipt_id=receipt.receipt_id,
                quantity=request_item.quantity,
                movement_date=datetime.utcnow(),
            ))
            received_now[po_item.po_item_id] = request_item.quantity

        all_items = db.query(models.PurchaseOrderItem).filter(
            models.PurchaseOrderItem.po_id == po.po_id
        ).all()
        po.status = "completed" if all(
            prior_by_id.get(item.po_item_id, 0) + received_now.get(item.po_item_id, 0) == item.quantity
            for item in all_items
        ) else "partially_received"

        db.add(models.AuditLog(
            user_id=user.user_id,
            action="PURCHASE_RECEIPT",
            table_name="purchase_receipts",
            record_id=receipt.receipt_id,
            description=(
                f"Received {len(data.items)} item(s) against purchase order {po.po_id}; "
                f"status={po.status}"
            ),
        ))
        db.commit()

        return {
            "message": "Purchase receipt recorded and branch inventory updated",
            "receipt_id": receipt.receipt_id,
            "po_id": po.po_id,
            "branch_id": po.branch_id,
            "items_received": len(data.items),
            "po_status": po.status,
        }
    except HTTPException as exc:
        _rollback_http(db, exc)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Purchase receipt conflicts with ordered quantities or inventory state") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Purchase receipt failed and was rolled back") from exc
