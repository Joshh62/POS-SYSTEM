from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

# ------------------------------------
# CORS — allow the React frontend to talk to the backend
# ------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(category.router)
app.include_router(customers.router)
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)