from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional


# ---------------------------
# CATEGORY SCHEMAS
# ---------------------------

class CategoryCreate(BaseModel):
    category_name: str


class CategoryResponse(BaseModel):
    category_id: int
    category_name: str

    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# PRODUCT SCHEMAS
# ---------------------------

class ProductCreate(BaseModel):
    product_name: str
    barcode: str
    category_id: int
    cost_price: float
    selling_price: float
    stock_quantity: int = 0


class ProductResponse(BaseModel):
    product_id: int
    product_name: str
    barcode: str
    category_id: int
    cost_price: float
    selling_price: float

    model_config = ConfigDict(from_attributes=True)


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
    unit_price: float   # FIXED: was 'price' — must match model column name
    subtotal: float

    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# SALE SCHEMAS
# ---------------------------

class SaleCreate(BaseModel):
    customer_id: Optional[int] = None
    branch_id: Optional[int] = None
    payment_method: str
    items: List[SaleItemCreate]


class SaleResponse(BaseModel):
    sale_id: int
    sale_date: datetime
    user_id: int
    total_amount: float
    status: str
    items: List[SaleItemResponse]

    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# INVENTORY SCHEMAS
# ---------------------------

class RestockRequest(BaseModel):
    product_id: int
    branch_id: int
    quantity: int


class RestockResponse(BaseModel):
    product_id: int
    branch_id: int
    new_stock: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# USER SCHEMAS
# ---------------------------

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

    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# SUPPLIER SCHEMAS
# ---------------------------

class SupplierCreate(BaseModel):
    supplier_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class SupplierResponse(BaseModel):
    supplier_id: int
    supplier_name: str
    contact_person: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]

    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# PURCHASE ORDER SCHEMAS
# ---------------------------

class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    quantity: int
    unit_cost: float


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    branch_id: int
    items: List[PurchaseOrderItemCreate]


class PurchaseOrderResponse(BaseModel):
    po_id: int
    supplier_id: int
    order_date: datetime
    status: str

    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# CUSTOMER SCHEMAS
# ---------------------------

class CustomerCreate(BaseModel):
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class CustomerResponse(BaseModel):
    customer_id: int
    full_name: str
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]

    model_config = ConfigDict(from_attributes=True)