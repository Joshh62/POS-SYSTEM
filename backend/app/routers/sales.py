from fastapi.responses import StreamingResponse
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, date
import pytz
import io
import os
import urllib.request

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from io import BytesIO as BytesIO_logo

from app import models, schemas
from app.database import get_db
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE

router = APIRouter(prefix="/sales", tags=["Sales"])

LAGOS = pytz.timezone("Africa/Lagos")

def now_lagos():
    return datetime.now(LAGOS).replace(tzinfo=None)


# ── Audit log helper ──────────────────────────────────────────────────────────
def write_audit(db, user_id: int, action: str, table: str, record_id: int, description: str):
    try:
        db.add(models.AuditLog(
            user_id=user_id,
            action=action,
            table_name=table,
            record_id=record_id,
            description=description,
        ))
    except Exception as e:
        print(f"[Audit] Failed to write log: {e}")


# ── Branch resolver helper ────────────────────────────────────────────────────
def _resolve_sale_branch(current_user, requested_branch_id, db: Session) -> int:
    if not requested_branch_id:
        if not current_user.branch_id:
            raise HTTPException(status_code=400, detail="User has no branch assigned")
        return current_user.branch_id

    if current_user.role == SUPERADMIN_ROLE:
        return requested_branch_id

    if current_user.role == "admin":
        valid_ids = [
            b.branch_id for b in db.query(models.Branch).filter(
                models.Branch.business_id == current_user.business_id
            ).all()
        ]
        if requested_branch_id not in valid_ids:
            raise HTTPException(status_code=403, detail="Not authorized for this branch")
        return requested_branch_id

    if requested_branch_id != current_user.branch_id:
        raise HTTPException(status_code=403, detail="Not authorized for this branch")
    return requested_branch_id


def _list_branch_ids(current_user, requested_branch_id, db: Session) -> list[int]:
    if requested_branch_id:
        return [_resolve_sale_branch(current_user, requested_branch_id, db)]

    if current_user.role == SUPERADMIN_ROLE:
        return []

    if current_user.role == "admin":
        return [
            b.branch_id for b in db.query(models.Branch).filter(
                models.Branch.business_id == current_user.business_id
            ).all()
        ]

    return [current_user.branch_id]


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

    branch_id    = _resolve_sale_branch(current_user, sale.branch_id, db)
    customer_id  = sale.customer_id if sale.customer_id else None
    total_amount = 0.0

    # Loyalty discount — validated as non-negative float
    discount = max(0.0, float(sale.discount or 0))

    try:
        new_sale = models.Sale(
            sale_date=now_lagos(),
            user_id=current_user.user_id,
            customer_id=customer_id,
            branch_id=branch_id,
            payment_method=sale.payment_method,
            total_amount=0,
            status="completed"
        )
        db.add(new_sale)
        db.flush()

        item_names = []
        for item in sale.items:
            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == item.product_id,
                models.BranchInventory.branch_id  == branch_id
            ).first()

            if not inventory:
                raise HTTPException(
                    status_code=404,
                    detail=f"'{product.product_name}' has no inventory record for this branch. Add stock first."
                )
            if inventory.stock_quantity < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for '{product.product_name}'. Available: {inventory.stock_quantity}, requested: {item.quantity}"
                )

            unit_price    = float(product.selling_price)
            subtotal      = unit_price * item.quantity
            total_amount += subtotal
            item_names.append(f"{product.product_name} x{item.quantity}")

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
                movement_date=now_lagos()
            ))

        # ── Apply loyalty discount ────────────────────────────────────────────
        discount         = min(discount, total_amount)   # cap at total
        discounted_total = round(max(0.0, total_amount - discount), 2)

        new_sale.total_amount = discounted_total
        new_sale.discount     = round(discount, 2)       # store on sale record

        discount_note = f" — loyalty discount ₦{discount:,.2f}" if discount > 0 else ""
        write_audit(
            db,
            user_id=current_user.user_id,
            action="SALE",
            table="sales",
            record_id=new_sale.sale_id,
            description=f"Sale #{new_sale.sale_id} — ₦{discounted_total:,.2f}{discount_note} — {', '.join(item_names)} — via {sale.payment_method}",
        )

        db.commit()
        db.refresh(new_sale)

        return {
            "sale_id":                  new_sale.sale_id,
            "sale_date":                new_sale.sale_date,
            "total_amount":             float(new_sale.total_amount),
            "payment_method":           new_sale.payment_method,
            "status":                   new_sale.status,
            "discount":                 float(new_sale.discount),
            "subtotal_before_discount": round(total_amount, 2),
        }

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
    product = db.query(models.Product).filter(models.Product.barcode == barcode).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "product_id":    product.product_id,
        "product_name":  product.product_name,
        "selling_price": float(product.selling_price),
    }


# ------------------------------------
# LIST SALES
# ------------------------------------
@router.get("/")
def list_sales(
    page: int = 1,
    limit: int = 20,
    branch_id: int = Query(None),
    cashier_id: int = Query(None),
    date_from: date = Query(None),
    date_to: date = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager", "cashier"]))
):
    query = db.query(models.Sale).order_by(models.Sale.sale_date.desc())

    branch_ids = _list_branch_ids(user, branch_id, db)
    if branch_ids:
        query = query.filter(models.Sale.branch_id.in_(branch_ids))

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
            "discount":       float(sale.discount) if sale.discount else 0.0,
            "payment_method": sale.payment_method,
            "status":         sale.status,
            "cashier":        cashier.full_name if cashier else "Unknown",
            "item_count":     len(items),
            "branch_id":      sale.branch_id,
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

    discount    = float(sale.discount) if sale.discount else 0.0
    sale_total  = float(sale.total_amount)
    items_total = round(sale_total + discount, 2)

    return {
        "sale_id":      sale.sale_id,
        "sale_date":    sale.sale_date,
        "items": [
            {
                "product":    db.query(models.Product).filter(models.Product.product_id == i.product_id).first().product_name,
                "quantity":   i.quantity,
                "unit_price": float(i.unit_price),
                "subtotal":   float(i.subtotal),
            }
            for i in items
        ],
        "subtotal":     items_total,
        "discount":     discount,
        "total_amount": sale_total,
    }


# ------------------------------------
# GENERATE PDF INVOICE
# ------------------------------------
@router.get("/{sale_id}/invoice")
def generate_invoice(sale_id: int, db: Session = Depends(get_db)):
    import urllib.request
    from reportlab.lib.utils import ImageReader
 
    sale = db.query(models.Sale).filter(models.Sale.sale_id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
 
    items    = db.query(models.SaleItem).filter(models.SaleItem.sale_id == sale_id).all()
    cashier  = db.query(models.User).filter(models.User.user_id == sale.user_id).first()
    customer = db.query(models.Customer).filter(models.Customer.customer_id == sale.customer_id).first() if sale.customer_id else None
 
    # ── Load business branding ────────────────────────────────────────────────
    biz = None
    if cashier and cashier.business_id:
        biz = db.query(models.Business).filter(
            models.Business.business_id == cashier.business_id
        ).first()
 
    # Use business record if available, fall back to env vars
    SHOP_NAME    = (biz.name    if biz and biz.name    else None) or os.getenv("SHOP_NAME",    "ProfitTrack POS")
    SHOP_ADDRESS = (biz.address if biz and biz.address else None) or os.getenv("SHOP_ADDRESS", "")
    SHOP_PHONE   = (biz.phone   if biz and biz.phone   else None) or os.getenv("SHOP_PHONE",   "")
    LOGO_URL     = biz.logo_url    if biz and biz.logo_url    else None
    BRAND_COLOR  = biz.brand_color if biz and biz.brand_color else "#185FA5"
 
    # Parse brand color hex → RGB (0–1 range for ReportLab)
    def hex_to_rgb(hex_color):
        h = hex_color.lstrip("#")
        if len(h) == 3:
            h = "".join(c*2 for c in h)
        try:
            return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
        except Exception:
            return (0.094, 0.373, 0.647)  # default blue
 
    br, bg, bb = hex_to_rgb(BRAND_COLOR)
 
    # Derive discount from sale record
    discount    = float(sale.discount) if sale.discount else 0.0
    sale_total  = float(sale.total_amount)
    items_total = round(sale_total + discount, 2)
 
    PAGE_W, PAGE_H = letter
    MARGIN = 50
    COL    = {"item": MARGIN, "qty": 340, "price": 410, "total": 500}
 
    buffer = io.BytesIO()
    pdf    = canvas.Canvas(buffer, pagesize=letter)
    pdf.setTitle(f"Invoice #{sale_id} — {SHOP_NAME}")
 
    # ── Header background ─────────────────────────────────────────────────────
    pdf.setFillColorRGB(br, bg, bb)
    pdf.rect(0, PAGE_H - 110, PAGE_W, 110, fill=1, stroke=0)
    pdf.setFillColorRGB(1, 1, 1)
 
    # ── Logo or shop name ─────────────────────────────────────────────────────
    logo_loaded = False
    if LOGO_URL:
        try:
            with urllib.request.urlopen(LOGO_URL, timeout=5) as response:
                logo_data = response.read()
            logo_img = ImageReader(io.BytesIO(logo_data))
            # Draw logo — max 60px tall, left-aligned in header
            pdf.drawImage(logo_img, MARGIN, PAGE_H - 90, width=60, height=60,
                          preserveAspectRatio=True, mask="auto")
            # Shop name next to logo
            pdf.setFont("Helvetica-Bold", 16)
            pdf.drawString(MARGIN + 70, PAGE_H - 48, SHOP_NAME.upper())
            pdf.setFont("Helvetica", 9)
            if SHOP_ADDRESS:
                pdf.drawString(MARGIN + 70, PAGE_H - 64, SHOP_ADDRESS)
            if SHOP_PHONE:
                pdf.drawString(MARGIN + 70, PAGE_H - 78, f"Tel: {SHOP_PHONE}")
            logo_loaded = True
        except Exception:
            pass  # Fall through to text-only header
 
    if not logo_loaded:
        pdf.setFont("Helvetica-Bold", 22)
        pdf.drawString(MARGIN, PAGE_H - 48, SHOP_NAME.upper())
        pdf.setFont("Helvetica", 9)
        if SHOP_ADDRESS:
            pdf.drawString(MARGIN, PAGE_H - 64, SHOP_ADDRESS)
        if SHOP_PHONE:
            pdf.drawString(MARGIN, PAGE_H - 78, f"Tel: {SHOP_PHONE}")
 
    # Receipt label top-right
    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawRightString(PAGE_W - MARGIN, PAGE_H - 50, "RECEIPT")
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(PAGE_W - MARGIN, PAGE_H - 66, f"#{sale_id:05d}")
 
    # ── Sale metadata ─────────────────────────────────────────────────────────
    y = PAGE_H - 130
    pdf.setFillColorRGB(0.15, 0.15, 0.15)
    pdf.setFont("Helvetica", 9)
    date_str     = sale.sale_date.strftime("%d %b %Y  %H:%M") if sale.sale_date else "—"
    cashier_name = cashier.full_name if cashier else "—"
    payment      = (sale.payment_method or "cash").capitalize()
    pdf.drawString(MARGIN,       y,      f"Date:      {date_str}")
    pdf.drawString(MARGIN,       y - 14, f"Cashier:   {cashier_name}")
    pdf.drawString(MARGIN + 220, y,      f"Payment:   {payment}")
    if customer:
        pdf.drawString(MARGIN + 220, y - 14, f"Customer:  {customer.full_name}")
 
    # ── Column headers ────────────────────────────────────────────────────────
    y -= 40
    pdf.setFillColorRGB(0.94, 0.96, 0.98)
    pdf.rect(MARGIN, y - 4, PAGE_W - 2 * MARGIN, 18, fill=1, stroke=0)
    pdf.setFillColorRGB(br, bg, bb)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(COL["item"],  y + 2, "ITEM")
    pdf.drawString(COL["qty"],   y + 2, "QTY")
    pdf.drawString(COL["price"], y + 2, "UNIT PRICE")
    pdf.drawString(COL["total"], y + 2, "SUBTOTAL")
 
    # ── Line items ────────────────────────────────────────────────────────────
    y -= 20
    pdf.setFont("Helvetica", 9)
    for idx, item in enumerate(items):
        product = db.query(models.Product).filter(models.Product.product_id == item.product_id).first()
        r, g, b = (1, 1, 1) if idx % 2 == 0 else (0.97, 0.97, 0.97)
        pdf.setFillColorRGB(r, g, b)
        pdf.rect(MARGIN, y - 4, PAGE_W - 2 * MARGIN, 16, fill=1, stroke=0)
        pdf.setFillColorRGB(0.15, 0.15, 0.15)
        name = product.product_name if product else f"Product #{item.product_id}"
        pdf.drawString(COL["item"],  y + 2, name[:38])
        pdf.drawString(COL["qty"],   y + 2, str(item.quantity))
        pdf.drawRightString(COL["price"] + 55, y + 2, f"N{float(item.unit_price):,.2f}")
        pdf.drawRightString(COL["total"] + 55, y + 2, f"N{float(item.subtotal):,.2f}")
        y -= 18
 
    # ── Divider ───────────────────────────────────────────────────────────────
    y -= 6
    pdf.setStrokeColorRGB(br, bg, bb)
    pdf.setLineWidth(0.8)
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y)
    y -= 18
 
    # ── Discount rows ─────────────────────────────────────────────────────────
    if discount > 0:
        pdf.setFont("Helvetica", 9)
        pdf.setFillColorRGB(0.15, 0.15, 0.15)
        pdf.drawRightString(COL["price"] + 55, y, "SUBTOTAL")
        pdf.drawRightString(COL["total"] + 55, y, f"N{items_total:,.2f}")
        y -= 16
        pdf.setFillColorRGB(0.059, 0.435, 0.196)
        pdf.drawString(COL["item"], y, "Loyalty points discount")
        pdf.drawRightString(COL["price"] + 55, y, "DISCOUNT")
        pdf.drawRightString(COL["total"] + 55, y, f"-N{discount:,.2f}")
        y -= 16
        pdf.setStrokeColorRGB(br, bg, bb)
        pdf.setLineWidth(0.5)
        pdf.line(MARGIN, y, PAGE_W - MARGIN, y)
        y -= 16
 
    # ── Total paid ────────────────────────────────────────────────────────────
    pdf.setFont("Helvetica-Bold", 11)
    pdf.setFillColorRGB(br, bg, bb)
    pdf.drawRightString(COL["price"] + 55, y, "TOTAL PAID")
    pdf.drawRightString(COL["total"] + 55, y, f"N{sale_total:,.2f}")
 
    # ── Footer ────────────────────────────────────────────────────────────────
    y -= 50
    pdf.setFont("Helvetica", 8)
    pdf.setFillColorRGB(0.5, 0.5, 0.5)
    pdf.drawCentredString(PAGE_W / 2, y, f"Thank you for shopping at {SHOP_NAME}!")
    if SHOP_ADDRESS or SHOP_PHONE:
        footer_line = "  |  ".join(filter(None, [SHOP_ADDRESS, SHOP_PHONE]))
        pdf.drawCentredString(PAGE_W / 2, y - 12, footer_line)
    pdf.setFillColorRGB(br, bg, bb)
    pdf.rect(0, 0, PAGE_W, 8, fill=1, stroke=0)
    pdf.save()
    buffer.seek(0)
 
    return StreamingResponse(buffer, media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=invoice_{sale_id}.pdf"})


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

    branch_id = sale.branch_id
    items     = db.query(models.SaleItem).filter(models.SaleItem.sale_id == sale_id).all()

    try:
        item_names = []
        for item in items:
            inventory = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == item.product_id,
                models.BranchInventory.branch_id  == branch_id
            ).first()
            if inventory:
                inventory.stock_quantity += item.quantity

            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()
            if product:
                item_names.append(f"{product.product_name} x{item.quantity}")

            db.add(models.InventoryMovement(
                product_id=item.product_id,
                branch_id=branch_id,
                movement_type="REFUND",
                reference_id=sale_id,
                quantity=item.quantity,
                movement_date=now_lagos()
            ))

        db.add(models.Refund(sale_id=sale_id, reason=reason, amount=sale.total_amount))
        sale.status = "refunded"

        write_audit(
            db,
            user_id=user.user_id,
            action="REFUND",
            table="sales",
            record_id=sale_id,
            description=f"Refund on Sale #{sale_id} — ₦{float(sale.total_amount):,.2f} — Reason: {reason} — Items: {', '.join(item_names)}",
        )

        db.commit()
        return {"message": "Sale refunded successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------
# DISCOUNT SUMMARY (admin/manager)
# ------------------------------------
@router.get("/discount-summary")
def discount_summary(
    branch_id: int = Query(None),
    date_from: date = Query(None),
    date_to:   date = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    """Total discounts given via loyalty redemptions."""
    from sqlalchemy import func

    q = db.query(
        func.sum(models.Sale.discount).label("total_discounts"),
        func.count(models.Sale.sale_id).label("discounted_sales"),
        func.sum(models.Sale.total_amount).label("total_revenue"),
    ).filter(
        models.Sale.status == "completed",
        models.Sale.discount > 0,
    )

    branch_ids = _list_branch_ids(user, branch_id, db)
    if branch_ids:
        q = q.filter(models.Sale.branch_id.in_(branch_ids))
    if date_from:
        q = q.filter(models.Sale.sale_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.Sale.sale_date <= datetime.combine(date_to, datetime.max.time()))

    result = q.first()

    return {
        "total_discounts":   float(result.total_discounts or 0),
        "discounted_sales":  result.discounted_sales or 0,
        "revenue_after_discounts": float(result.total_revenue or 0),
    }