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
    customer_id: int | None = None
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

from pydantic import BaseModel


class RestockRequest(BaseModel):
    product_id: int
    quantity: int


class RestockResponse(BaseModel):
    product_id: int
    new_stock: int

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    full_name: str
    username: str
    password: str
    role: str


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    user_id: int
    full_name: str
    username: str
    role: str

    class Config:
        from_attributes = True


class SupplierCreate(BaseModel):
    supplier_name: str
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None


class SupplierResponse(BaseModel):
    supplier_id: int
    supplier_name: str
    contact_person: str | None
    phone: str | None
    email: str | None
    address: str | None

    class Config:
        from_attributes = True


class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    quantity: int
    unit_cost: float


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    items: List[PurchaseOrderItemCreate]


class PurchaseOrderResponse(BaseModel):
    po_id: int
    supplier_id: int
    order_date: datetime
    status: str

    class Config:
        from_attributes = True


class CustomerCreate(BaseModel):
    full_name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None


class CustomerResponse(BaseModel):
    customer_id: int
    full_name: str
    phone: str | None
    email: str | None
    address: str | None

    class Config:
        from_attributes = True