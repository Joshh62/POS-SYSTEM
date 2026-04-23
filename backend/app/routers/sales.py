from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, date

import io

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role, get_current_user


router = APIRouter(prefix="/sales", tags=["Sales"])


# ------------------------------------
# CREATE SALE
# ------------------------------------
@router.post("/")
def create_sale(
    sale: schemas.SaleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    print("CURRENT USER:", current_user.username)
    print("BRANCH ID:", current_user.branch_id)

    if not sale.items:
        raise HTTPException(status_code=400, detail="Sale must contain items")

    customer_id = sale.customer_id if sale.customer_id else None

    total_amount = 0

    try:

        # Ensure user has a valid branch
        if not current_user.branch_id:
            raise HTTPException(status_code=400, detail="User has no branch assigned")

        branch_id = current_user.branch_id

        new_sale = models.Sale(
            sale_date=datetime.utcnow(),
            user_id=current_user.user_id,
            customer_id=customer_id,
            branch_id=branch_id,
            payment_method=sale.payment_method,
            total_amount=0,
            status="completed"
        )
        

        db.add(new_sale)
        db.flush()  # get sale_id before commit

        for item in sale.items:

            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()

            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product {item.product_id} not found"
                )

            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == item.product_id,
                models.BranchInventory.branch_id == branch_id
            ).first()

            if not inventory:
                raise HTTPException(
                    status_code=404,
                    detail=f"Inventory not found for product {item.product_id}"
                )

            if inventory.stock_quantity < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.product_name}"
                )

            unit_price = product.selling_price
            subtotal = unit_price * item.quantity

            total_amount += subtotal

            sale_item = models.SaleItem(
                sale_id=new_sale.sale_id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=unit_price,
                subtotal=subtotal
            )

            db.add(sale_item)

            inventory.stock_quantity -= item.quantity

            movement = models.InventoryMovement(
                product_id=item.product_id,
                branch_id=branch_id,
                movement_type="SALE",
                reference_id=new_sale.sale_id,
                quantity=item.quantity,
                movement_date=datetime.utcnow()
            )

            db.add(movement)

        new_sale.total_amount = total_amount

        db.commit()
        db.refresh(new_sale)

        return new_sale

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------
# SCAN PRODUCT
# ------------------------------------
@router.get("/scan/{barcode}")
def scan_product(
    barcode: str,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "selling_price": product.selling_price
    }


# ------------------------------------
# GET RECEIPT
# ------------------------------------
@router.get("/{sale_id}/receipt")
def get_receipt(
    sale_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    sale = db.query(models.Sale).filter(
        models.Sale.sale_id == sale_id
    ).first()

    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    items = db.query(models.SaleItem).filter(
        models.SaleItem.sale_id == sale_id
    ).all()

    receipt_items = []

    for item in items:

        product = db.query(models.Product).filter(
            models.Product.product_id == item.product_id
        ).first()

        receipt_items.append({
            "product": product.product_name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "subtotal": item.subtotal
        })

    return {
        "sale_id": sale.sale_id,
        "date": sale.sale_date,
        "items": receipt_items,
        "total_amount": sale.total_amount
    }


# ------------------------------------
# GENERATE PDF INVOICE
# ------------------------------------
@router.get("/{sale_id}/invoice")
def generate_invoice(
    sale_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    sale = db.query(models.Sale).filter(
        models.Sale.sale_id == sale_id
    ).first()

    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    items = db.query(models.SaleItem).filter(
        models.SaleItem.sale_id == sale_id
    ).all()

    buffer = io.BytesIO()

    pdf = canvas.Canvas(buffer, pagesize=letter)

    y = 750

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(200, y, "POS RECEIPT")

    y -= 40

    pdf.setFont("Helvetica", 10)
    pdf.drawString(50, y, f"Sale ID: {sale.sale_id}")

    y -= 20
    pdf.drawString(50, y, f"Date: {sale.sale_date}")

    y -= 40

    for item in items:

        product = db.query(models.Product).filter(
            models.Product.product_id == item.product_id
        ).first()

        pdf.drawString(50, y, product.product_name)
        pdf.drawString(250, y, str(item.quantity))
        pdf.drawString(300, y, str(item.unit_price))
        pdf.drawString(380, y, str(item.subtotal))

        y -= 20

    y -= 20

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(300, y, f"Total: {sale.total_amount}")

    pdf.save()

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=invoice_{sale_id}.pdf"}
    )


# ------------------------------------
# REFUND SALE
# ------------------------------------
@router.post("/{sale_id}/refund")
def refund_sale(
    sale_id: int,
    reason: str,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    sale = db.query(models.Sale).filter(
        models.Sale.sale_id == sale_id
    ).first()

    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    if sale.status == "refunded":
        raise HTTPException(status_code=400, detail="Sale already refunded")

    items = db.query(models.SaleItem).filter(
        models.SaleItem.sale_id == sale_id
    ).all()

    try:

        for item in items:

            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == item.product_id,
                models.BranchInventory.branch_id == branch_id
            ).first()

            if inventory:
                inventory.stock_quantity += item.quantity

            movement = models.InventoryMovement(
                product_id=item.product_id,
                branch_id=branch_id,
                movement_type="REFUND",
                reference_id=sale_id,
                quantity=item.quantity,
                movement_date=datetime.utcnow()
            )

            db.add(movement)

        refund = models.Refund(
            sale_id=sale_id,
            reason=reason,
            amount=sale.total_amount
        )

        db.add(refund)

        sale.status = "refunded"

        db.commit()

        return {"message": "Sale refunded successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    


@router.get("/")
def list_sales(
    page: int = 1,
    limit: int = 20,
    cashier_id: int = None,
    date_from: date = None,
    date_to: date = None,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "manager", "cashier"]))
):
    query = db.query(models.Sale).order_by(models.Sale.sale_date.desc())

    if cashier_id:
        query = query.filter(models.Sale.user_id == cashier_id)
    if date_from:
        query = query.filter(models.Sale.sale_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(models.Sale.sale_date <= datetime.combine(date_to, datetime.max.time()))

    total = query.count()
    sales = query.offset((page - 1) * limit).limit(limit).all()

    result = []
    for sale in sales:
        cashier = db.query(models.User).filter(models.User.user_id == sale.user_id).first()
        items = db.query(models.SaleItem).filter(models.SaleItem.sale_id == sale.sale_id).all()
        result.append({
            "sale_id": sale.sale_id,
            "sale_date": sale.sale_date,
            "total_amount": float(sale.total_amount),
            "payment_method": sale.payment_method,
            "status": sale.status,
            "cashier": cashier.full_name if cashier else "Unknown",
            "item_count": len(items)
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "data": result
    }