from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.routers import sales, products, inventory, reports
from app.routers import auth, customers, suppliers, purchases, category
from app.database import get_db


# ------------------------------------
# LIFESPAN — startup/shutdown
# ------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        from app.scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        print(f"[Scheduler] Could not start: {e}")

    yield  # App runs here

    # Shutdown (nothing needed for now)


# ------------------------------------
# APP
# ------------------------------------
app = FastAPI(
    title="POS System API",
    description="Retail Point of Sale backend",
    version="1.0.0",
    lifespan=lifespan,
)

# ------------------------------------
# CORS
# ------------------------------------
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Add production URLs after deployment:
    # "https://yourapp.vercel.app",
    # "https://pos.yourdomain.ng",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------
# ROUTERS
# ------------------------------------
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(category.router)
app.include_router(customers.router)
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)


# ------------------------------------
# HEALTH CHECK
# ------------------------------------
@app.get("/health", tags=["System"])
def health():
    return {"status": "ok", "version": "1.0.0"}


# ------------------------------------
# MANUAL WHATSAPP REPORT TRIGGER
# POST /reports/send-whatsapp to test immediately
# ------------------------------------
@app.post("/reports/send-whatsapp", tags=["Reports"])
def trigger_whatsapp_report(db: Session = Depends(get_db)):
    from app.whatsapp_report import send_whatsapp_report
    sid = send_whatsapp_report(db)
    return {"message": "Report sent", "sid": sid}

@app.get("/")
def read_root():
    return {"message": "POS System API is live and connected to Neon!"}