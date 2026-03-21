from pydantic import BaseModel


class CategoryCreate(BaseModel):
    category_name: str


class CategoryResponse(BaseModel):
    category_id: int
    category_name: str

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    product_name: str
    barcode: str
    category_id: int
    cost_price: float
    selling_price: float


class ProductResponse(BaseModel):
    product_id: int
    product_name: str
    barcode: str
    category_id: int
    cost_price: float
    selling_price: float

    class Config:
        from_attributes = True


class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int