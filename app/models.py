from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Numeric, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

class Category(Base):
    __tablename__ = "categories"

    category_id = Column(Integer, primary_key=True, index=True)
    category_name = Column(String, unique=True, nullable=False)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    product_id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, nullable=False)
    barcode = Column(String, unique=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.category_id"))
    cost_price = Column(Numeric(12,2))
    selling_price = Column(Numeric(12,2))
    reorder_level = Column(Integer, default=5)
    stock_quantity = Column(Integer, default=0)
    movements = relationship("InventoryMovement", backref="product")

    category = relationship("Category", back_populates="products")
    sale_items = relationship("SaleItem", back_populates="product")

class SaleItem(Base):
    __tablename__ = "sale_items"

    sale_item_id = Column(Integer, primary_key=True, index=True)

    sale_id = Column(Integer, ForeignKey("sales.sale_id"))

    product_id = Column(Integer, ForeignKey("products.product_id"))

    quantity = Column(Integer)

    unit_price = Column(Numeric(12,2))

    subtotal = Column(Numeric(12,2))

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product")

class Sale(Base):
    __tablename__ = "sales"

    sale_id = Column(Integer, primary_key=True, index=True)
    sale_date = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer)
    total_amount = Column(Numeric(12,2))
    status = Column(String)

    items = relationship("SaleItem", back_populates="sale")

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    movement_id = Column(Integer, primary_key=True, index=True)

    product_id = Column(Integer, ForeignKey("products.product_id"))

    movement_type = Column(String)

    quantity = Column(Integer)

    reference_id = Column(Integer)

    movement_date = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    action = Column(String)
    table_name = Column(String)
    record_id = Column(Integer)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id = Column(Integer, primary_key=True, index=True)
    supplier_name = Column(String, nullable=False)
    contact_person = Column(String)
    phone = Column(String)
    email = Column(String)
    address = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"))
    order_date = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="pending")

    items = relationship("PurchaseOrderItem", back_populates="purchase_order")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    po_item_id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.po_id"))
    product_id = Column(Integer, ForeignKey("products.product_id"))
    quantity = Column(Integer)
    unit_cost = Column(Numeric(12,2))

    purchase_order = relationship("PurchaseOrder", back_populates="items")


