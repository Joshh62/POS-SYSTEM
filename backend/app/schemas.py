from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import date, datetime
from typing import List, Optional


# ---------------------------
# CATEGORY
# ---------------------------
class CategoryCreate(BaseModel):
    category_name: str

class CategoryResponse(BaseModel):
    category_id:   int
    category_name: str
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# PRODUCT
# ---------------------------
class ProductCreate(BaseModel):
    product_name:   str
    barcode:        str
    category_id:    Optional[int] = None
    cost_price:     float
    selling_price:  float
    stock_quantity: int = 0
    supplier_id:    Optional[int] = None

class ProductResponse(BaseModel):
    product_id:    int
    product_name:  str
    barcode:       str
    category_id:   Optional[int]
    cost_price:    float
    selling_price: float
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# SALE ITEM
# ---------------------------
class SaleItemCreate(BaseModel):
    product_id: int
    quantity:   int

class SaleItemResponse(BaseModel):
    sale_item_id: int
    product_id:   int
    quantity:     int
    unit_price:   float
    subtotal:     float
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# SALE
# ---------------------------
class SaleCreate(BaseModel):
    customer_id:    Optional[int]   = None
    branch_id:      Optional[int]   = None
    payment_method: str
    items:          List[SaleItemCreate]
    discount:       Optional[float] = 0   # loyalty points discount in naira

class SaleResponse(BaseModel):
    sale_id:      int
    sale_date:    datetime
    user_id:      int
    total_amount: float
    status:       str
    items:        List[SaleItemResponse]
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# INVENTORY
# ---------------------------
class RestockRequest(BaseModel):
    product_id: int
    branch_id:  int
    quantity:   int

class RestockResponse(BaseModel):
    product_id: int
    branch_id:  int
    new_stock:  int
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# USER
# ---------------------------
class UserCreate(BaseModel):
    full_name:   str
    username:    str
    password:    str
    role:        str
    branch_id:   Optional[int] = None
    business_id: Optional[int] = None

class UserResponse(BaseModel):
    user_id:     int
    full_name:   str
    username:    str
    role:        str
    is_active:   bool
    branch_id:   Optional[int] = None
    business_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

class UserLogin(BaseModel):
    username: str
    password: str


# ---------------------------
# SUPPLIER
# ---------------------------
class SupplierCreate(BaseModel):
    supplier_name:  str
    contact_person: Optional[str] = None
    phone:          Optional[str] = None
    email:          Optional[str] = None
    address:        Optional[str] = None

class SupplierResponse(BaseModel):
    supplier_id:    int
    supplier_name:  str
    contact_person: Optional[str]
    phone:          Optional[str]
    email:          Optional[str]
    address:        Optional[str]
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# PURCHASE ORDER
# ---------------------------
class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_cost: float = Field(gt=0)
    expiry_date: Optional[date] = None


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    branch_id: int
    items: List[PurchaseOrderItemCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def reject_duplicate_products(self):
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Duplicate products are not allowed in one purchase order")
        return self


class PurchaseReceiptItemCreate(BaseModel):
    po_item_id: int
    quantity: int = Field(gt=0)
    expiry_date: Optional[date] = None


class PurchaseReceiptCreate(BaseModel):
    items: List[PurchaseReceiptItemCreate] = Field(min_length=1)
    notes: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_receipt(self):
        item_ids = [item.po_item_id for item in self.items]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("Duplicate purchase-order items are not allowed in one receipt")
        if self.notes is not None:
            self.notes = self.notes.strip() or None
        return self


class PurchaseOrderResponse(BaseModel):
    po_id: int
    supplier_id: int
    branch_id: int
    order_date: datetime
    status: str
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# CUSTOMER
# ---------------------------
class CustomerCreate(BaseModel):
    full_name: str
    phone:     Optional[str] = None
    email:     Optional[str] = None
    address:   Optional[str] = None

class CustomerResponse(BaseModel):
    customer_id: int
    full_name:   str
    phone:       Optional[str]
    email:       Optional[str]
    address:     Optional[str]
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# BUSINESS
# ---------------------------
class BusinessCreate(BaseModel):
    name:       str
    address:    Optional[str] = None
    phone:      Optional[str] = None
    owner_name: Optional[str] = None
    plan:       Optional[str] = "starter"

class BusinessResponse(BaseModel):
    business_id: int
    name:        str
    address:     Optional[str]
    phone:       Optional[str]
    owner_name:  Optional[str]
    is_active:   bool
    plan:        str
    model_config = ConfigDict(from_attributes=True)


# ---------------------------
# REFUND
# ---------------------------
class RefundItemCreate(BaseModel):
    sale_item_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class RefundCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    items: List[RefundItemCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def reject_duplicate_sale_items(self):
        sale_item_ids = [item.sale_item_id for item in self.items]
        if len(sale_item_ids) != len(set(sale_item_ids)):
            raise ValueError("Each sale item may appear only once per refund")
        self.reason = self.reason.strip()
        if not self.reason:
            raise ValueError("Refund reason must not be blank")
        return self
