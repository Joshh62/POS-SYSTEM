from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role

from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import io

router = APIRouter(
    prefix="/sales",
    tags=["Sales"]
)

@router.post("/")
def create_sale(
    data: schemas.SaleCreate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    if not data.items:
        raise HTTPException(status_code=400, detail="Sale must contain items")

    total_amount = 0

    try:

        # Create sale
        new_sale = models.Sale(
            sale_date=datetime.utcnow(),
            user_id=user.user_id,
            customer_id=data.customer_id,
            payment_method=data.payment_method,
            total_amount=0,
            status="completed"
        )

        db.add(new_sale)
        db.flush()  # generates sale_id without committing

        # Load all products in ONE query
        product_ids = [item.product_id for item in data.items]

        products = db.query(models.Product).filter(
            models.Product.product_id.in_(product_ids)
        ).all()

        product_map = {p.product_id: p for p in products}

        # Process sale items
        for item in data.items:

            product = product_map.get(item.product_id)

            if not product:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product {item.product_id} not found"
                )

            if product.stock_quantity < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {product.product_name}"
                )

            unit_price = product.selling_price
            subtotal = unit_price * item.quantity

            total_amount += subtotal

            # Create sale item
            sale_item = models.SaleItem(
                sale_id=new_sale.sale_id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=unit_price,
                subtotal=subtotal
            )

            db.add(sale_item)

            # Deduct stock
            product.stock_quantity -= item.quantity

            # Record inventory movement
            movement = models.InventoryMovement(
                product_id=item.product_id,
                movement_type="SALE",
                quantity=item.quantity,
                reference_id=new_sale.sale_id,
                movement_date=datetime.utcnow()
            )

            db.add(movement)

        # Update sale total
        new_sale.total_amount = total_amount

        db.commit()
        db.refresh(new_sale)

        return new_sale

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scan")
def scan_product_with_quantity(barcode: str, quantity: int, db: Session = Depends(get_db)):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.stock_quantity < quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    subtotal = product.selling_price * quantity

    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "barcode": product.barcode,
        "unit_price": product.selling_price,
        "quantity": quantity,
        "subtotal": subtotal
    }


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

    cashier = db.query(models.User).filter(
        models.User.user_id == sale.user_id
    ).first()

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
        "cashier": cashier.full_name if cashier else None,
        "items": receipt_items,
        "total_amount": sale.total_amount
    }



@router.get("/scan/{barcode}")
def scan_product_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found"
        )

    if product.stock_quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Product out of stock"
        )

    return {
        "product_id": product.product_id,
        "product_name": product.product_name,
        "selling_price": product.selling_price,
        "stock_quantity": product.stock_quantity
    }


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
    p = canvas.Canvas(buffer, pagesize=letter)

    y = 750

    p.setFont("Helvetica-Bold", 16)
    p.drawString(200, y, "POS RECEIPT")

    y -= 40
    p.setFont("Helvetica", 10)
    p.drawString(50, y, f"Sale ID: {sale.sale_id}")
    y -= 20
    p.drawString(50, y, f"Date: {sale.sale_date}")

    y -= 40
    p.drawString(50, y, "Product")
    p.drawString(250, y, "Qty")
    p.drawString(300, y, "Price")
    p.drawString(380, y, "Subtotal")

    y -= 20

    for item in items:

        product = db.query(models.Product).filter(
            models.Product.product_id == item.product_id
        ).first()

        p.drawString(50, y, product.product_name)
        p.drawString(250, y, str(item.quantity))
        p.drawString(300, y, str(item.unit_price))
        p.drawString(380, y, str(item.subtotal))

        y -= 20

    y -= 30

    p.setFont("Helvetica-Bold", 12)
    p.drawString(300, y, f"Total: {sale.total_amount}")

    p.showPage()
    p.save()

    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=invoice_{sale_id}.pdf"
        }
    )


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

            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()

            if not product:
                continue

            # Restore stock
            product.stock_quantity += item.quantity

            # Record movement
            movement = models.InventoryMovement(
                product_id=item.product_id,
                movement_type="REFUND",
                quantity=item.quantity,
                reference_id=sale_id,
                movement_date=datetime.utcnow()
            )

            db.add(movement)

        # Record refund
        refund = models.Refund(
            sale_id=sale_id,
            reason=reason
        )

        db.add(refund)

        sale.status = "refunded"

        db.commit()

        return {"message": "Sale refunded successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))