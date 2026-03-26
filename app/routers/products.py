# Create Product
@app.post("/products/")
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):

    new_product = models.Product(
        product_name=product.product_name,
        barcode=product.barcode,
        category_id=product.category_id,
        cost_price=product.cost_price,
        selling_price=product.selling_price,
        stock_quantity=0
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    return new_product