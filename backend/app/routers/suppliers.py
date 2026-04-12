from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.dependencies import require_role

router = APIRouter(
    prefix="/suppliers",
    tags=["Suppliers"]
)


@router.post("/", response_model=schemas.SupplierResponse)
def create_supplier(
    supplier: schemas.SupplierCreate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    new_supplier = models.Supplier(**supplier.dict())

    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)

    return new_supplier


@router.get("/")
def list_suppliers(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager"]))
):

    suppliers = db.query(models.Supplier).all()

    return suppliers