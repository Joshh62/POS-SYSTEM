from pydantic import BaseModel
from datetime import datetime
from typing import List


# ---------------------------
# CATEGORY SCHEMAS
# ---------------------------

class CategoryCreate(BaseModel):
    category_name: str


class CategoryResponse(BaseModel):
    category_id: int
    category_name: str

    class Config:
        from_attributes = True


# ---------------------------
# PRODUCT SCHEMAS
# ---------------------------

class ProductCreate(BaseModel):
    product_name: str
    barcode: str
    category_id: int
    cost_price: float
    selling_price: float
    stock_quantity: int


class ProductResponse(BaseModel):
    product_id: int
    product_name: str
    barcode: str
    category_id: int
    cost_price: float
    selling_price: float

    class Config:
        from_attributes = True


# ---------------------------
# SALE ITEM SCHEMAS
# ---------------------------

class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int


class SaleItemResponse(BaseModel):
    sale_item_id: int
    product_id: int
    quantity: int
    unit_price: float
    subtotal: float

    class Config:
        from_attributes = True


# ---------------------------
# SALE SCHEMAS
# ---------------------------

class SaleCreate(BaseModel):
    user_id: int
    items: List[SaleItemCreate]


class SaleResponse(BaseModel):
    sale_id: int
    sale_date: datetime
    user_id: int
    total_amount: float
    status: str
    items: List[SaleItemResponse]

    class Config:
        from_attributes = True
