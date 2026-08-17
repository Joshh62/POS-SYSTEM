# ── Sentry — must be initialised BEFORE FastAPI app is created ───────────────
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
import os

sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],
        traces_sample_rate=0.1,       # 10% of requests traced — stays within free tier
        environment=os.getenv("ENVIRONMENT", "production"),
        release="profittrack@1.0.0",
        send_default_pii=False,       # GDPR safe — no personal data sent to Sentry
    )
    print("[Sentry] Error tracking active")
else:
    print("[Sentry] SENTRY_DSN not set — error tracking disabled")

# ── Imports ───────────────────────────────────────────────────────────────────
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.routers import sales, products, inventory, reports, expenses
from app.routers import auth, customers, suppliers, purchases, category
from app.database import get_db, SessionLocal
from app.dependencies import require_role
from app.routers import debts
from app.routers import businesses
from app.routers import admin_tools
from app.routers import ledger
from app.routers import loyalty
from app.routers import analytics
from app.routers import payments

from app.middleware.rls_middleware import RLSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        print(f"[Scheduler] Could not start: {e}")
    yield


app = FastAPI(
    title="POS System API",
    description="Retail Point of Sale backend",
    version="1.0.0",
    lifespan=lifespan,
)

# ── RLS middleware — must be added BEFORE CORSMiddleware ─────────────────────
app.add_middleware(RLSMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://profittrack.ng",
        "https://www.profittrack.ng",
        "https://pos-system-pink-five.vercel.app",
        "https://pos-system-git-master-josh-tech1.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(category.router)
app.include_router(customers.router)
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(reports.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)
app.include_router(businesses.router)
app.include_router(admin_tools.router)
app.include_router(expenses.router)
app.include_router(debts.router)
app.include_router(ledger.router)
app.include_router(loyalty.router)
app.include_router(analytics.router)
app.include_router(payments.router)

# ── Health check ──────────────────────────────────────────────────────────────
@app.api_route("/live", methods=["GET", "HEAD"], tags=["System"])
def liveness_check():
    """Process-only check for load balancers and container supervisors."""
    return {"status": "ok", "service": "profittrack-api", "version": "1.0.0"}


@app.api_route("/health", methods=["GET", "HEAD"], tags=["System"])
def health_check(response: Response):
    """Database-aware readiness check that does not disclose failure details."""
    start = time.time()
    db = None
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db_status = "ok"
        db_latency = round((time.time() - start) * 1000, 1)
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        db_status = "unavailable"
        db_latency = None
    finally:
        if db is not None:
            db.close()

    return {
        "status": "ok" if db_status == "ok" else "unavailable",
        "database": db_status,
        "db_latency_ms": db_latency,
        "timestamp": time.time(),
        "service": "profittrack-api",
        "version": "1.0.0",
    }

# ── Root ──────────────────────────────────────────────────────────────────────
@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {"service": "ProfitTrack API", "status": "ok"}

# ── WhatsApp report trigger ───────────────────────────────────────────────────
@app.post("/reports/send-whatsapp", tags=["Reports"])
def trigger_whatsapp_report(
    db: Session = Depends(get_db),
    _user=Depends(require_role([])),
):
    """Manually trigger the platform-wide report run (superadmin only)."""
    from app.whatsapp_report import send_whatsapp_report
    sid = send_whatsapp_report(db)
    return {"message": "Report sent", "sid": sid}
