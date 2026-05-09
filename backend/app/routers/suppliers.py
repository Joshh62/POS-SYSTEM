from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.database import get_db
from app import models
from app.dependencies import require_role, get_current_user, SUPERADMIN_ROLE

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class SupplierCreate(BaseModel):
    supplier_name:  str
    contact_person: Optional[str] = None
    phone:          Optional[str] = None
    email:          Optional[str] = None
    address:        Optional[str] = None

class SupplierUpdate(BaseModel):
    supplier_name:  Optional[str] = None
    contact_person: Optional[str] = None
    phone:          Optional[str] = None
    email:          Optional[str] = None
    address:        Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────
def _scope(q, user):
    if user.role == SUPERADMIN_ROLE:
        return q
    return q.filter(models.Supplier.business_id == user.business_id)


def _supplier_dict(s, db, include_products=False):
    d = {
        "supplier_id":    s.supplier_id,
        "supplier_name":  s.supplier_name,
        "contact_person": s.contact_person,
        "phone":          s.phone,
        "email":          s.email,
        "address":        s.address,
        "business_id":    s.business_id,
        "created_at":     s.created_at,
    }
    if include_products:
        products = db.query(models.Product).filter(
            models.Product.supplier_id == s.supplier_id
        ).all()
        d["products"] = [
            {
                "product_id":   p.product_id,
                "product_name": p.product_name,
                "barcode":      p.barcode,
                "selling_price": float(p.selling_price or 0),
            }
            for p in products
        ]
        d["product_count"] = len(products)
    else:
        # Just count
        d["product_count"] = db.query(models.Product).filter(
            models.Product.supplier_id == s.supplier_id
        ).count()
    return d


# ── List suppliers ────────────────────────────────────────────────────────────
@router.get("/")
def list_suppliers(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(models.Supplier)
    q = _scope(q, user)

    suppliers = q.order_by(models.Supplier.supplier_name).all()

    if search:
        s = search.lower()
        suppliers = [
            sup for sup in suppliers
            if s in (sup.supplier_name or "").lower()
            or s in (sup.contact_person or "").lower()
            or s in (sup.phone or "").lower()
        ]

    return [_supplier_dict(s, db) for s in suppliers]


# ── Get single supplier with products ─────────────────────────────────────────
@router.get("/{supplier_id}")
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    supplier = db.query(models.Supplier).filter(
        models.Supplier.supplier_id == supplier_id
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if user.role != SUPERADMIN_ROLE and supplier.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return _supplier_dict(supplier, db, include_products=True)


# ── Create supplier ───────────────────────────────────────────────────────────
@router.post("/")
def create_supplier(
    data: SupplierCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    if not data.supplier_name.strip():
        raise HTTPException(status_code=400, detail="Supplier name is required")

    supplier = models.Supplier(
        business_id=user.business_id,
        supplier_name=data.supplier_name.strip(),
        contact_person=data.contact_person,
        phone=data.phone,
        email=data.email,
        address=data.address,
    )
    db.add(supplier)

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="CREATE",
        table_name="suppliers",
        record_id=0,
        description=f"Added supplier '{data.supplier_name}'",
    ))

    db.commit()
    db.refresh(supplier)
    return _supplier_dict(supplier, db)


# ── Update supplier ───────────────────────────────────────────────────────────
@router.patch("/{supplier_id}")
def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"]))
):
    supplier = db.query(models.Supplier).filter(
        models.Supplier.supplier_id == supplier_id
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if user.role != SUPERADMIN_ROLE and supplier.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    for k, v in data.dict(exclude_none=True).items():
        setattr(supplier, k, v)

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="UPDATE",
        table_name="suppliers",
        record_id=supplier_id,
        description=f"Updated supplier '{supplier.supplier_name}'",
    ))

    db.commit()
    db.refresh(supplier)
    return _supplier_dict(supplier, db)


# ── Delete supplier ───────────────────────────────────────────────────────────
@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"]))
):
    supplier = db.query(models.Supplier).filter(
        models.Supplier.supplier_id == supplier_id
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if user.role != SUPERADMIN_ROLE and supplier.business_id != user.business_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Unlink products before deleting
    db.query(models.Product).filter(
        models.Product.supplier_id == supplier_id
    ).update({"supplier_id": None})

    db.add(models.AuditLog(
        user_id=user.user_id,
        action="DELETE",
        table_name="suppliers",
        record_id=supplier_id,
        description=f"Deleted supplier '{supplier.supplier_name}'",
    ))

    db.delete(supplier)
    db.commit()
    return {"message": "Supplier deleted"}