from datetime import datetime
import sqlalchemy as sa
from sqlalchemy import Column, DateTime, Integer, String, Numeric, ForeignKey, Boolean, UniqueConstraint, Date
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.database import Base


# -------------------- BUSINESS --------------------
class Business(Base):
    __tablename__ = "businesses"

    business_id = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False)
    address     = Column(String, nullable=True)
    phone       = Column(String, nullable=True)
    owner_name  = Column(String, nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    plan        = Column(String, default="starter", nullable=False)  # solo | starter | business | enterprise
    features = Column(JSONB, nullable=False, server_default="{}")
    
    branches = relationship("Branch", back_populates="business")
    users    = relationship("User",   back_populates="business")


# -------------------- CATEGORY --------------------
class Category(Base):
    __tablename__ = "categories"

    category_id   = Column(Integer, primary_key=True, index=True)
    category_name = Column(String, unique=True, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)

    products = relationship("Product", back_populates="category")


# -------------------- PRODUCT --------------------
class Product(Base):
    __tablename__ = "products"

    product_id    = Column(Integer, primary_key=True, index=True)
    product_name  = Column(String, nullable=False)
    barcode       = Column(String, unique=True, index=True)
    category_id   = Column(Integer, ForeignKey("categories.category_id"))
    cost_price    = Column(Numeric(12, 2))
    selling_price = Column(Numeric(12, 2))
    created_at    = Column(DateTime, default=datetime.utcnow)

    category   = relationship("Category", back_populates="products")
    movements  = relationship("InventoryMovement", back_populates="product")
    sale_items = relationship("SaleItem", back_populates="product")
    inventory  = relationship("BranchInventory", back_populates="product")


# -------------------- BRANCH --------------------
class Branch(Base):
    __tablename__ = "branches"

    branch_id   = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False)
    location    = Column(String)
    business_id = Column(Integer, ForeignKey("businesses.business_id"), nullable=True)

    business  = relationship("Business", back_populates="branches")
    users     = relationship("User", back_populates="branch")
    inventory = relationship("BranchInventory", back_populates="branch")
    sales     = relationship("Sale", back_populates="branch")


# -------------------- BRANCH INVENTORY --------------------
class BranchInventory(Base):
    __tablename__ = "branch_inventory"

    inventory_id      = Column(Integer, primary_key=True)
    branch_id         = Column(Integer, ForeignKey("branches.branch_id"))
    product_id        = Column(Integer, ForeignKey("products.product_id"))
    stock_quantity    = Column(Integer, default=0)
    reorder_level     = Column(Integer, default=5)
    expiry_alert_days = Column(Integer, default=90)

    branch   = relationship("Branch",   back_populates="inventory")
    product  = relationship("Product",  back_populates="inventory")
    batches  = relationship("InventoryBatch", back_populates="inventory",
                            primaryjoin="and_(BranchInventory.product_id==foreign(InventoryBatch.product_id), "
                                        "BranchInventory.branch_id==foreign(InventoryBatch.branch_id))",
                            viewonly=True)

    __table_args__ = (
        UniqueConstraint("branch_id", "product_id", name="uix_branch_product"),
    )


# -------------------- CUSTOMER --------------------
class Customer(Base):
    __tablename__ = "customers"

    customer_id = Column(Integer, primary_key=True, index=True)
    full_name   = Column(String, nullable=False)
    phone       = Column(String, unique=True)
    email       = Column(String)
    address     = Column(String)
    created_at  = Column(DateTime, default=datetime.utcnow)

    sales = relationship("Sale", back_populates="customer")


# -------------------- USER --------------------
class User(Base):
    __tablename__ = "users"

    user_id       = Column(Integer, primary_key=True, index=True)
    full_name     = Column(String, nullable=False)
    username      = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role          = Column(String)   # superadmin | admin | manager | cashier
    created_at    = Column(DateTime, default=datetime.utcnow)
    is_active     = Column(Boolean, default=True)
    branch_id     = Column(Integer, ForeignKey("branches.branch_id"),    nullable=True)
    business_id   = Column(Integer, ForeignKey("businesses.business_id"), nullable=True)

    branch   = relationship("Branch",   back_populates="users")
    business = relationship("Business", back_populates="users")
    sales    = relationship("Sale",     back_populates="user")


# -------------------- SALE --------------------
class Sale(Base):
    __tablename__ = "sales"

    sale_id        = Column(Integer, primary_key=True, index=True)
    sale_date      = Column(DateTime, default=datetime.utcnow, index=True)
    user_id        = Column(Integer, ForeignKey("users.user_id"))
    customer_id    = Column(Integer, ForeignKey("customers.customer_id"), nullable=True)
    branch_id      = Column(Integer, ForeignKey("branches.branch_id"))
    payment_method = Column(String, nullable=False)
    total_amount   = Column(Numeric(12, 2))
    status         = Column(String, default="completed")

    items    = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    branch   = relationship("Branch",   back_populates="sales")
    customer = relationship("Customer", back_populates="sales")
    user     = relationship("User",     back_populates="sales")
    payments = relationship("Payment",  back_populates="sale")
    refunds  = relationship("Refund",   back_populates="sale")


# -------------------- SALE ITEM --------------------
class SaleItem(Base):
    __tablename__ = "sale_items"

    sale_item_id = Column(Integer, primary_key=True, index=True)
    sale_id      = Column(Integer, ForeignKey("sales.sale_id"))
    product_id   = Column(Integer, ForeignKey("products.product_id"))
    quantity     = Column(Integer)
    unit_price   = Column(Numeric(12, 2))
    subtotal     = Column(Numeric(12, 2))

    sale    = relationship("Sale",    back_populates="items")
    product = relationship("Product", back_populates="sale_items")


# -------------------- PAYMENT --------------------
class Payment(Base):
    __tablename__ = "payments"

    payment_id     = Column(Integer, primary_key=True)
    sale_id        = Column(Integer, ForeignKey("sales.sale_id"))
    payment_method = Column(String)
    amount         = Column(Numeric(12, 2))

    sale = relationship("Sale", back_populates="payments")


# -------------------- REFUND --------------------
class Refund(Base):
    __tablename__ = "refunds"

    refund_id   = Column(Integer, primary_key=True)
    sale_id     = Column(Integer, ForeignKey("sales.sale_id"))
    refund_date = Column(DateTime, default=datetime.utcnow)
    reason      = Column(String)
    amount      = Column(Numeric(12, 2))

    sale = relationship("Sale", back_populates="refunds")


# -------------------- SUPPLIER --------------------
class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id    = Column(Integer, primary_key=True, index=True)
    supplier_name  = Column(String, nullable=False)
    contact_person = Column(String)
    phone          = Column(String)
    email          = Column(String)
    address        = Column(String)
    created_at     = Column(DateTime, default=datetime.utcnow)

    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")


# -------------------- PURCHASE ORDER --------------------
class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_id       = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"))
    branch_id   = Column(Integer, ForeignKey("branches.branch_id"))
    order_date  = Column(DateTime, default=datetime.utcnow, index=True)
    status      = Column(String, default="pending")

    supplier = relationship("Supplier", back_populates="purchase_orders")
    items    = relationship("PurchaseOrderItem", back_populates="purchase_order",
                            cascade="all, delete-orphan")


# -------------------- PURCHASE ORDER ITEM --------------------
class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    po_item_id     = Column(Integer, primary_key=True, index=True)
    po_id          = Column(Integer, ForeignKey("purchase_orders.po_id"))
    product_id     = Column(Integer, ForeignKey("products.product_id"))
    quantity       = Column(Integer)
    unit_cost      = Column(Numeric(12, 2))
    expiry_date    = Column(sa.Date(), nullable=True)

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product        = relationship("Product")


# -------------------- INVENTORY BATCH --------------------
class InventoryBatch(Base):
    __tablename__ = "inventory_batches"

    batch_id      = Column(Integer, primary_key=True, index=True)
    product_id    = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    branch_id     = Column(Integer, ForeignKey("branches.branch_id"),  nullable=False)
    po_id         = Column(Integer, ForeignKey("purchase_orders.po_id"), nullable=True)
    quantity      = Column(Integer, nullable=False)
    expiry_date   = Column(sa.Date(), nullable=True)
    received_date = Column(sa.Date(), server_default=sa.func.current_date())
    notes         = Column(String, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

    product   = relationship("Product")
    branch    = relationship("Branch")
    inventory = relationship(
        "BranchInventory",
        primaryjoin="and_(InventoryBatch.product_id==BranchInventory.product_id, "
                    "InventoryBatch.branch_id==BranchInventory.branch_id)",
        foreign_keys="[InventoryBatch.product_id, InventoryBatch.branch_id]",
        viewonly=True,
    )


# -------------------- INVENTORY MOVEMENT --------------------
class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    movement_id   = Column(Integer, primary_key=True, index=True)
    product_id    = Column(Integer, ForeignKey("products.product_id"))
    branch_id     = Column(Integer, ForeignKey("branches.branch_id"))
    movement_type = Column(String)
    reference_id  = Column(Integer)
    quantity      = Column(Integer)
    movement_date = Column(DateTime, default=datetime.utcnow, index=True)

    product = relationship("Product", back_populates="movements")
    branch  = relationship("Branch")


# -------------------- STOCK ADJUSTMENT --------------------
class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"

    adjustment_id   = Column(Integer, primary_key=True)
    product_id      = Column(Integer, ForeignKey("products.product_id"))
    quantity        = Column(Integer)
    reason          = Column(String)
    adjustment_date = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product")


# -------------------- STOCK TRANSFER --------------------
class StockTransfer(Base):
    __tablename__ = "stock_transfers"

    transfer_id   = Column(Integer, primary_key=True)
    from_branch   = Column(Integer, ForeignKey("branches.branch_id"))
    to_branch     = Column(Integer, ForeignKey("branches.branch_id"))
    transfer_date = Column(DateTime, default=datetime.utcnow)

    from_branch_rel = relationship("Branch", foreign_keys=[from_branch])
    to_branch_rel   = relationship("Branch", foreign_keys=[to_branch])


# -------------------- AUDIT LOG --------------------
class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id      = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.user_id"))
    action      = Column(String)
    table_name  = Column(String)
    record_id   = Column(Integer)
    description = Column(String)
    created_at  = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")