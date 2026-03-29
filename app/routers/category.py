from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas

router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    return db.query(models.Category).all()

@router.post("/categories")
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):

    new_category = models.Category(
        category_name=category.category_name
    )

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return new_category