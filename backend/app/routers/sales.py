from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, date
import pytz
import io
import os

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role, get_current_user

router = APIRouter(prefix="/sales", tags=["Sales"])

# ✅ Lagos timezone — used everywhere instead of utcnow()
LAGOS = pytz.timezone("Africa/Lagos")

def now_lagos():
    return datetime.now(LAGOS).replace(tzinfo=None)  # store as naive datetime, Lagos time


# ------------------------------------
# CREATE SALE
# ------------------------------------
@router.post("/")
def create_sale(
    sale: schemas.SaleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not sale.items:
        raise HTTPException(status_code=400, detail="Sale must contain items")

    if not current_user.branch_id:
        raise HTTPException(status_code=400, detail="User has no branch assigned")

    branch_id = current_user.branch_id
    customer_id = sale.customer_id if sale.customer_id else None
    total_amount = 0

    try:
        new_sale = models.Sale(
            sale_date=now_lagos(),   # ✅ Fixed: was datetime.utcnow()
            user_id=current_user.user_id,
            customer_id=customer_id,
            branch_id=branch_id,
            payment_method=sale.payment_method,
            total_amount=0,
            status="completed"
        )

        db.add(new_sale)
        db.flush()

        for item in sale.items:
            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()

            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == item.product_id,
                models.BranchInventory.branch_id == branch_id
            ).first()

            if not inventory:
                raise HTTPException(status_code=404, detail=f"Inventory not found for product {item.product_id}")

            if inventory.stock_quantity < item.quantity:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {product.product_name}")

            unit_price = product.selling_price
            subtotal   = unit_price * item.quantity
            total_amount += subtotal

            db.add(models.SaleItem(
                sale_id=new_sale.sale_id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=unit_price,
                subtotal=subtotal
            ))

            inventory.stock_quantity -= item.quantity

            db.add(models.InventoryMovement(
                product_id=item.product_id,
                branch_id=branch_id,
                movement_type="SALE",
                reference_id=new_sale.sale_id,
                quantity=item.quantity,
                movement_date=now_lagos()   # ✅ Fixed: was datetime.utcnow()
            ))

        new_sale.total_amount = total_amount
        db.commit()
        db.refresh(new_sale)
        return new_sale

    except HTTPException:
        db.rollback()
        raise
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
    user=Depends(require_role(["admin", "manager", "cashier"]))
):
    product = db.query(models.Product).filter(
        models.Product.barcode == barcode
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return {
        "product_id":    product.product_id,
        "product_name":  product.product_name,
        "selling_price": product.selling_price
    }


# ------------------------------------
# LIST SALES
# ------------------------------------
@router.get("/")
def list_sales(
    page: int = 1,
    limit: int = 20,
    cashier_id: int = None,
    date_from: date = None,
    date_to: date = None,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager", "cashier"]))
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
        items   = db.query(models.SaleItem).filter(models.SaleItem.sale_id == sale.sale_id).all()
        result.append({
            "sale_id":        sale.sale_id,
            "sale_date":      sale.sale_date,
            "total_amount":   float(sale.total_amount),
            "payment_method": sale.payment_method,
            "status":         sale.status,
            "cashier":        cashier.full_name if cashier else "Unknown",
            "item_count":     len(items)
        })

    return {"total": total, "page": page, "limit": limit, "data": result}


# ------------------------------------
# GET RECEIPT
# ------------------------------------
@router.get("/{sale_id}/receipt")
def get_receipt(
    sale_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager", "cashier"]))
):
    sale = db.query(models.Sale).filter(models.Sale.sale_id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    items = db.query(models.SaleItem).filter(models.SaleItem.sale_id == sale_id).all()

    return {
        "sale_id":      sale.sale_id,
        "sale_date":    sale.sale_date,
        "items": [
            {
                "product":    db.query(models.Product).filter(models.Product.product_id == i.product_id).first().product_name,
                "quantity":   i.quantity,
                "unit_price": i.unit_price,
                "subtotal":   i.subtotal,
            }
            for i in items
        ],
        "total_amount": sale.total_amount,
    }


# ------------------------------------
# GENERATE PDF INVOICE  (no auth — receipt is not sensitive)
# ------------------------------------
@router.get("/{sale_id}/invoice")
def generate_invoice(
    sale_id: int,
    db: Session = Depends(get_db),
):
    sale = db.query(models.Sale).filter(models.Sale.sale_id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    items = db.query(models.SaleItem).filter(models.SaleItem.sale_id == sale_id).all()

    # ── shop info ────────────────────────────────────────────────────────────
    SHOP_NAME    = os.getenv("SHOP_NAME", "WEAR HAUS")
    SHOP_ADDRESS = os.getenv("SHOP_ADDRESS", "9 Kashim Ibrahim Road, Narayi Highcost, Kaduna")
    SHOP_PHONE   = os.getenv("SHOP_PHONE",   "08154586355")

    # ── cashier & customer ───────────────────────────────────────────────────
    cashier  = db.query(models.User).filter(models.User.user_id == sale.user_id).first()
    customer = db.query(models.Customer).filter(models.Customer.customer_id == sale.customer_id).first() if sale.customer_id else None

    # ── page setup ───────────────────────────────────────────────────────────
    PAGE_W, PAGE_H = letter          # 612 x 792 pt
    MARGIN         = 50
    COL            = {               # column x positions
        "item":  MARGIN,
        "qty":   340,
        "price": 410,
        "total": 500,
    }

    buffer = io.BytesIO()
    pdf    = canvas.Canvas(buffer, pagesize=letter)
    pdf.setTitle(f"Invoice #{sale_id} — {SHOP_NAME}")

    # ── header background bar ────────────────────────────────────────────────
    pdf.setFillColorRGB(0.094, 0.373, 0.647)   # #185FA5
    pdf.rect(0, PAGE_H - 110, PAGE_W, 110, fill=1, stroke=0)

    # shop name
    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(MARGIN, PAGE_H - 48, SHOP_NAME.upper())

    # address & phone
    pdf.setFont("Helvetica", 9)
    pdf.drawString(MARGIN, PAGE_H - 64, SHOP_ADDRESS)
    pdf.drawString(MARGIN, PAGE_H - 78, f"Tel: {SHOP_PHONE}")

    # RECEIPT label (right side)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(PAGE_W - MARGIN, PAGE_H - 50, "RECEIPT")
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(PAGE_W - MARGIN, PAGE_H - 66, f"#{sale_id:05d}")

    # ── meta row ─────────────────────────────────────────────────────────────
    y = PAGE_H - 130
    pdf.setFillColorRGB(0.15, 0.15, 0.15)
    pdf.setFont("Helvetica", 9)

    date_str     = sale.sale_date.strftime("%d %b %Y  %H:%M") if sale.sale_date else "—"
    cashier_name = cashier.full_name if cashier else "—"
    payment      = (sale.payment_method or "cash").capitalize()

    pdf.drawString(MARGIN,           y, f"Date:      {date_str}")
    pdf.drawString(MARGIN,      y - 14, f"Cashier:   {cashier_name}")
    pdf.drawString(MARGIN + 220, y,     f"Payment:   {payment}")
    if customer:
        pdf.drawString(MARGIN + 220, y - 14, f"Customer:  {customer.full_name}")

    # ── table header ─────────────────────────────────────────────────────────
    y -= 40
    pdf.setFillColorRGB(0.94, 0.96, 0.98)
    pdf.rect(MARGIN, y - 4, PAGE_W - 2 * MARGIN, 18, fill=1, stroke=0)

    pdf.setFillColorRGB(0.094, 0.373, 0.647)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(COL["item"],  y + 2, "ITEM")
    pdf.drawString(COL["qty"],   y + 2, "QTY")
    pdf.drawString(COL["price"], y + 2, "UNIT PRICE")
    pdf.drawString(COL["total"], y + 2, "SUBTOTAL")

    # ── table rows ───────────────────────────────────────────────────────────
    y -= 20
    pdf.setFont("Helvetica", 9)
    row_colors = [(1, 1, 1), (0.97, 0.97, 0.97)]

    for idx, item in enumerate(items):
        product = db.query(models.Product).filter(
            models.Product.product_id == item.product_id
        ).first()

        # alternating row bg
        r, g, b = row_colors[idx % 2]
        pdf.setFillColorRGB(r, g, b)
        pdf.rect(MARGIN, y - 4, PAGE_W - 2 * MARGIN, 16, fill=1, stroke=0)

        pdf.setFillColorRGB(0.15, 0.15, 0.15)
        name = product.product_name if product else f"Product #{item.product_id}"
        pdf.drawString(COL["item"],  y + 2, name[:38])   # truncate long names
        pdf.drawString(COL["qty"],   y + 2, str(item.quantity))
        pdf.drawRightString(COL["price"] + 55, y + 2,
                            f"N{float(item.unit_price):,.2f}")
        pdf.drawRightString(COL["total"] + 55, y + 2,
                            f"N{float(item.subtotal):,.2f}")
        y -= 18

    # ── divider ──────────────────────────────────────────────────────────────
    y -= 6
    pdf.setStrokeColorRGB(0.094, 0.373, 0.647)
    pdf.setLineWidth(0.8)
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y)

    # ── totals block ─────────────────────────────────────────────────────────
    y -= 20
    pdf.setFont("Helvetica-Bold", 11)
    pdf.setFillColorRGB(0.094, 0.373, 0.647)
    pdf.drawRightString(COL["price"] + 55, y, "TOTAL PAID")
    pdf.drawRightString(COL["total"] + 55, y,
                        f"N{float(sale.total_amount):,.2f}")

    # ── footer ───────────────────────────────────────────────────────────────
    y -= 50
    pdf.setFont("Helvetica", 8)
    pdf.setFillColorRGB(0.5, 0.5, 0.5)
    pdf.drawCentredString(PAGE_W / 2, y,
                          "Thank you for shopping at WEAR HAUS!")
    pdf.drawCentredString(PAGE_W / 2, y - 12,
                          f"{SHOP_ADDRESS}  |  {SHOP_PHONE}")

    # ── thin footer bar ──────────────────────────────────────────────────────
    pdf.setFillColorRGB(0.094, 0.373, 0.647)
    pdf.rect(0, 0, PAGE_W, 8, fill=1, stroke=0)

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
    user=Depends(require_role(["admin", "manager"]))
):
    sale = db.query(models.Sale).filter(models.Sale.sale_id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.status == "refunded":
        raise HTTPException(status_code=400, detail="Sale already refunded")

    branch_id = sale.branch_id  # ✅ Fixed: was undefined variable (crashed refunds)
    items     = db.query(models.SaleItem).filter(models.SaleItem.sale_id == sale_id).all()

    try:
        for item in items:
            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == item.product_id,
                models.BranchInventory.branch_id  == branch_id
            ).first()

            if inventory:
                inventory.stock_quantity += item.quantity

            db.add(models.InventoryMovement(
                product_id=item.product_id,
                branch_id=branch_id,
                movement_type="REFUND",
                reference_id=sale_id,
                quantity=item.quantity,
                movement_date=now_lagos()   # ✅ Fixed: was datetime.utcnow()
            ))

        db.add(models.Refund(sale_id=sale_id, reason=reason, amount=sale.total_amount))
        sale.status = "refunded"
        db.commit()
        return {"message": "Sale refunded successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))