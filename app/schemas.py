from pydantic import BaseModel

# Product schema (already exists)
class ProductCreate(BaseModel):
    product_name: str
    barcode: str
    category_id: int
    cost_price: float
    selling_price: float

# New Category schema
class CategoryCreate(BaseModel):
    name: str
    description: str | None = None  # optional field