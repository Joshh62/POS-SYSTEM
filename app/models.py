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
    sale_date = Column(DateTime)
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

    movement_date = Column(DateTime)

class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String)
    created_at = Column(DateTime)
    is_active = Column(Boolean, default=True)