from fastapi import FastAPI

from app.routers import sales
from app.routers import products
from app.routers import inventory
from app.routers import reports
from app.routers import auth
from app.routers import customers
from app.routers import suppliers
from app.routers import purchases
from app.routers import category

app = FastAPI()

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(category.router)
app.include_router(customers.router)
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)