from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.dependencies import require_role

router = APIRouter(
    prefix="/customers",
    tags=["Customers"]
)


@router.post("/", response_model=schemas.CustomerResponse)
def create_customer(
    customer: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    new_customer = models.Customer(**customer.dict())

    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)

    return new_customer


@router.get("/")
def list_customers(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    customers = db.query(models.Customer).all()

    return customers


@router.get("/{customer_id}/sales")
def customer_sales_history(
    customer_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin","manager","cashier"]))
):

    customer = db.query(models.Customer).filter(
        models.Customer.customer_id == customer_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    sales = db.query(models.Sale).filter(
        models.Sale.customer_id == customer_id
    ).all()

    history = []

    for sale in sales:

        items = db.query(models.SaleItem).filter(
            models.SaleItem.sale_id == sale.sale_id
        ).all()

        sale_items = []

        for item in items:

            product = db.query(models.Product).filter(
                models.Product.product_id == item.product_id
            ).first()

            sale_items.append({
                "product": product.product_name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "subtotal": item.subtotal
            })

        history.append({
            "sale_id": sale.sale_id,
            "date": sale.sale_date,
            "total_amount": sale.total_amount,
            "items": sale_items
        })

    return {
        "customer": customer.full_name,
        "sales": history
    }