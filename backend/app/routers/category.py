from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.dependencies import get_current_user, require_role, SUPERADMIN_ROLE

router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)


@router.get("/")
def get_categories(
    business_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    query = db.query(models.Category)
    if user.role == SUPERADMIN_ROLE:
        if business_id is None:
            raise HTTPException(status_code=400, detail="business_id is required for superadmin")
        query = query.filter(models.Category.business_id == business_id)
    else:
        query = query.filter(models.Category.business_id == user.business_id)
    return query.order_by(models.Category.category_name).all()


@router.post("/", response_model=schemas.CategoryResponse)
def create_category(
    category: schemas.CategoryCreate,
    business_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "manager"])),
):
    target_business_id = user.business_id
    if user.role == SUPERADMIN_ROLE:
        if business_id is None:
            raise HTTPException(status_code=400, detail="business_id is required for superadmin")
        target_business_id = business_id

    name = category.category_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")

    existing = db.query(models.Category).filter(
        models.Category.business_id == target_business_id,
        models.Category.category_name.ilike(name),
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")

    new_category = models.Category(
        business_id=target_business_id,
        category_name=name,
    )

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return new_category
