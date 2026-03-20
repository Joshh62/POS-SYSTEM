from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
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

    category = relationship("Category", back_populates="products")