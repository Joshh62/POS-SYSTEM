from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, extract, case
from typing import Optional
from datetime import datetime, date, timedelta
import pytz

from app.database import get_db
from app import models
from app.dependencies import require_role, SUPERADMIN_ROLE

router = APIRouter(prefix="/analytics", tags=["Analytics"])

LAGOS = pytz.timezone("Africa/Lagos")

def today_lagos():
    return datetime.now(LAGOS).date()

def now_lagos():
    return datetime.now(LAGOS).replace(tzinfo=None)


# ── Branch resolver ───────────────────────────────────────────────────────────
def _branch_ids(user, branch_id_param, db):
    if user.role == SUPERADMIN_ROLE:
        return [branch_id_param] if branch_id_param else []
    if user.role == "admin":
        ids = [b.branch_id for b in db.query(models.Branch).filter(
            models.Branch.business_id == user.business_id
        ).all()]
        if branch_id_param and branch_id_param in ids:
            return [branch_id_param]
        return ids
    return [user.branch_id]


def _sales_query(db, user, branch_id_param, date_from=None, date_to=None):
    """Base query for completed sales scoped to user's business/branches."""
    q = db.query(models.Sale).filter(models.Sale.status == "completed")
    ids = _branch_ids(user, branch_id_param, db)
    if ids:
        q = q.filter(models.Sale.branch_id.in_(ids))
    if user.role != SUPERADMIN_ROLE:
        # Scope to business via branch
        biz_branch_ids = [b.branch_id for b in db.query(models.Branch).filter(
            models.Branch.business_id == user.business_id
        ).all()]
        q = q.filter(models.Sale.branch_id.in_(biz_branch_ids))
    if date_from:
        q = q.filter(models.Sale.sale_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.Sale.sale_date <= datetime.combine(date_to, datetime.max.time()))
    return q


# ── 1. Overview KPIs ──────────────────────────────────────────────────────────
@router.get("/overview")
def get_overview(
    branch_id:  Optional[int] = Query(None),
    date_from:  Optional[date] = Query(None),
    date_to:    Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    """
    6 top-level KPIs:
    - Total revenue, total transactions, avg transaction value
    - Total customers, gross margin %, total discounts given
    """
    today    = today_lagos()
    df       = date_from or (today - timedelta(days=29))
    dt       = date_to   or today

    sales_q  = _sales_query(db, user, branch_id, df, dt)
    all_sales = sales_q.all()

    total_revenue      = sum(float(s.total_amount or 0) for s in all_sales)
    total_transactions = len(all_sales)
    total_discounts    = sum(float(s.discount or 0) for s in all_sales)
    avg_txn_value      = round(total_revenue / total_transactions, 2) if total_transactions else 0

    # Gross margin — revenue minus cost of items sold
    sale_ids = [s.sale_id for s in all_sales]
    gross_profit = 0.0
    if sale_ids:
        items = db.query(models.SaleItem).filter(
            models.SaleItem.sale_id.in_(sale_ids)
        ).all()
        product_ids = list({i.product_id for i in items})
        products    = {
            p.product_id: float(p.cost_price or 0)
            for p in db.query(models.Product).filter(
                models.Product.product_id.in_(product_ids)
            ).all()
        }
        for item in items:
            cost     = products.get(item.product_id, 0)
            price    = float(item.unit_price or 0)
            gross_profit += (price - cost) * item.quantity

    gross_margin_pct = round((gross_profit / total_revenue) * 100, 1) if total_revenue else 0

    # Active customers in period
    customer_ids = {s.customer_id for s in all_sales if s.customer_id}

    # Compare to previous period
    period_days  = (dt - df).days + 1
    prev_df      = df - timedelta(days=period_days)
    prev_dt      = df - timedelta(days=1)
    prev_sales   = _sales_query(db, user, branch_id, prev_df, prev_dt).all()
    prev_revenue = sum(float(s.total_amount or 0) for s in prev_sales)
    prev_txns    = len(prev_sales)

    revenue_change = round(((total_revenue - prev_revenue) / prev_revenue) * 100, 1) if prev_revenue else None
    txn_change     = round(((total_transactions - prev_txns) / prev_txns) * 100, 1) if prev_txns else None

    return {
        "period":               {"from": str(df), "to": str(dt), "days": period_days},
        "total_revenue":        round(total_revenue, 2),
        "total_transactions":   total_transactions,
        "avg_transaction_value": avg_txn_value,
        "active_customers":     len(customer_ids),
        "gross_margin_pct":     gross_margin_pct,
        "total_discounts":      round(total_discounts, 2),
        "revenue_change_pct":   revenue_change,
        "txn_change_pct":       txn_change,
    }


# ── 2. Revenue trend ──────────────────────────────────────────────────────────
@router.get("/revenue-trend")
def get_revenue_trend(
    period:    str = Query("30d", description="7d | 30d | 90d | 12m"),
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    """
    Daily or monthly revenue trend for charting.
    period=7d/30d/90d → daily buckets
    period=12m        → monthly buckets
    """
    today  = today_lagos()
    by_month = period == "12m"

    if period == "7d":
        df = today - timedelta(days=6)
    elif period == "30d":
        df = today - timedelta(days=29)
    elif period == "90d":
        df = today - timedelta(days=89)
    else:  # 12m
        df = today.replace(day=1) - timedelta(days=335)
    dt = today

    sales = _sales_query(db, user, branch_id, df, dt).all()

    if by_month:
        buckets = {}
        for s in sales:
            key = s.sale_date.strftime("%Y-%m")
            if key not in buckets:
                buckets[key] = {"label": s.sale_date.strftime("%b %Y"), "revenue": 0, "transactions": 0, "discounts": 0}
            buckets[key]["revenue"]      += float(s.total_amount or 0)
            buckets[key]["transactions"] += 1
            buckets[key]["discounts"]    += float(s.discount or 0)
        data = [{"period": k, **v, "revenue": round(v["revenue"], 2), "discounts": round(v["discounts"], 2)}
                for k, v in sorted(buckets.items())]
    else:
        # Daily
        buckets = {}
        cur = df
        while cur <= dt:
            buckets[str(cur)] = {"label": cur.strftime("%d %b"), "revenue": 0, "transactions": 0, "discounts": 0}
            cur += timedelta(days=1)
        for s in sales:
            key = str(s.sale_date.date())
            if key in buckets:
                buckets[key]["revenue"]      += float(s.total_amount or 0)
                buckets[key]["transactions"] += 1
                buckets[key]["discounts"]    += float(s.discount or 0)
        data = [{"period": k, **v, "revenue": round(v["revenue"], 2), "discounts": round(v["discounts"], 2)}
                for k, v in sorted(buckets.items())]

    return {"period": period, "data": data}


# ── 3. Sales by hour and day ──────────────────────────────────────────────────
@router.get("/peak-times")
def get_peak_times(
    branch_id: Optional[int] = Query(None),
    days:      int = Query(30, description="Look back N days"),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    """
    Peak hours (0–23) and peak days of week (Mon–Sun).
    Used to identify busiest times for staffing decisions.
    """
    today = today_lagos()
    df    = today - timedelta(days=days - 1)
    sales = _sales_query(db, user, branch_id, df, today).all()

    hours    = {h: {"hour": h, "label": f"{h:02d}:00", "transactions": 0, "revenue": 0.0} for h in range(24)}
    days_map = {d: {"day": d, "label": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d], "transactions": 0, "revenue": 0.0} for d in range(7)}

    for s in sales:
        h = s.sale_date.hour
        d = s.sale_date.weekday()
        hours[h]["transactions"]    += 1
        hours[h]["revenue"]         += float(s.total_amount or 0)
        days_map[d]["transactions"] += 1
        days_map[d]["revenue"]      += float(s.total_amount or 0)

    for h in hours.values(): h["revenue"] = round(h["revenue"], 2)
    for d in days_map.values(): d["revenue"] = round(d["revenue"], 2)

    return {
        "by_hour": list(hours.values()),
        "by_day":  list(days_map.values()),
    }


# ── 4. Product analytics ──────────────────────────────────────────────────────
@router.get("/products")
def get_product_analytics(
    branch_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    limit:     int = Query(10),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    """
    Best sellers, worst sellers, dead stock, and margin by product.
    """
    today = today_lagos()
    df    = date_from or (today - timedelta(days=29))
    dt    = date_to   or today

    sales   = _sales_query(db, user, branch_id, df, dt).all()
    sale_ids = [s.sale_id for s in sales]

    # Aggregate by product
    product_stats = {}
    if sale_ids:
        items = db.query(models.SaleItem).filter(
            models.SaleItem.sale_id.in_(sale_ids)
        ).all()
        for item in items:
            pid = item.product_id
            if pid not in product_stats:
                product_stats[pid] = {"units_sold": 0, "revenue": 0.0, "cost": 0.0}
            product_stats[pid]["units_sold"] += item.quantity
            product_stats[pid]["revenue"]    += float(item.subtotal or 0)

    # Attach product names and cost prices
    all_products = db.query(models.Product)
    if user.role != SUPERADMIN_ROLE:
        all_products = all_products.filter(models.Product.business_id == user.business_id)
    all_products = {p.product_id: p for p in all_products.all()}

    for pid, stats in product_stats.items():
        p = all_products.get(pid)
        if p:
            cost_per_unit = float(p.cost_price or 0)
            stats["product_name"]  = p.product_name
            stats["cost"]          = cost_per_unit * stats["units_sold"]
            stats["gross_profit"]  = round(stats["revenue"] - stats["cost"], 2)
            stats["margin_pct"]    = round(((stats["revenue"] - stats["cost"]) / stats["revenue"]) * 100, 1) if stats["revenue"] else 0
            stats["revenue"]       = round(stats["revenue"], 2)
        else:
            stats["product_name"] = f"Product #{pid}"
            stats["gross_profit"] = 0
            stats["margin_pct"]   = 0

    ranked = sorted(product_stats.values(), key=lambda x: x["revenue"], reverse=True)

    # Dead stock — in catalog but zero sales in period
    sold_ids = set(product_stats.keys())
    dead_stock = []
    for pid, p in all_products.items():
        if pid not in sold_ids:
            # Get current stock
            inv = db.query(models.BranchInventory).filter(
                models.BranchInventory.product_id == pid
            ).first()
            stock = inv.stock_quantity if inv else 0
            if stock > 0:
                dead_stock.append({
                    "product_id":   pid,
                    "product_name": p.product_name,
                    "stock":        stock,
                    "stock_value":  round(stock * float(p.cost_price or 0), 2),
                })

    dead_stock.sort(key=lambda x: x["stock_value"], reverse=True)

    return {
        "best_sellers":  ranked[:limit],
        "worst_sellers": ranked[-limit:][::-1] if len(ranked) >= limit else ranked[::-1],
        "dead_stock":    dead_stock[:limit],
        "total_products_sold": len(product_stats),
    }


# ── 5. Payment method breakdown ───────────────────────────────────────────────
@router.get("/payment-methods")
def get_payment_breakdown(
    branch_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    today = today_lagos()
    df    = date_from or (today - timedelta(days=29))
    dt    = date_to   or today

    sales = _sales_query(db, user, branch_id, df, dt).all()
    total_revenue = sum(float(s.total_amount or 0) for s in sales)

    breakdown = {}
    for s in sales:
        method = s.payment_method or "cash"
        if method not in breakdown:
            breakdown[method] = {"method": method, "transactions": 0, "revenue": 0.0}
        breakdown[method]["transactions"] += 1
        breakdown[method]["revenue"]      += float(s.total_amount or 0)

    result = []
    for m, d in breakdown.items():
        d["revenue"]     = round(d["revenue"], 2)
        d["revenue_pct"] = round((d["revenue"] / total_revenue) * 100, 1) if total_revenue else 0
        d["txn_pct"]     = round((d["transactions"] / len(sales)) * 100, 1) if sales else 0
        result.append(d)

    result.sort(key=lambda x: x["revenue"], reverse=True)
    return {"data": result, "total_revenue": round(total_revenue, 2)}


# ── 6. Customer analytics ─────────────────────────────────────────────────────
@router.get("/customers")
def get_customer_analytics(
    branch_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    limit:     int = Query(10),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    today = today_lagos()
    df    = date_from or (today - timedelta(days=29))
    dt    = date_to   or today

    sales = _sales_query(db, user, branch_id, df, dt).all()
    sales_with_customer = [s for s in sales if s.customer_id]

    # Top spenders
    spend_by_customer = {}
    for s in sales_with_customer:
        cid = s.customer_id
        if cid not in spend_by_customer:
            spend_by_customer[cid] = {"customer_id": cid, "total_spend": 0.0, "transactions": 0}
        spend_by_customer[cid]["total_spend"]  += float(s.total_amount or 0)
        spend_by_customer[cid]["transactions"] += 1

    # Attach customer names
    if spend_by_customer:
        customers = {
            c.customer_id: c for c in db.query(models.Customer).filter(
                models.Customer.customer_id.in_(list(spend_by_customer.keys()))
            ).all()
        }
        for cid, stats in spend_by_customer.items():
            c = customers.get(cid)
            stats["customer_name"] = c.full_name if c else f"Customer #{cid}"
            stats["phone"]         = c.phone if c else None
            stats["total_spend"]   = round(stats["total_spend"], 2)

    top_spenders = sorted(spend_by_customer.values(), key=lambda x: x["total_spend"], reverse=True)[:limit]

    # Retention — customers with > 1 transaction in period
    repeat_customers = sum(1 for s in spend_by_customer.values() if s["transactions"] > 1)
    total_customers  = len(spend_by_customer)
    retention_rate   = round((repeat_customers / total_customers) * 100, 1) if total_customers else 0

    # Loyalty summary
    loyalty_records = db.query(models.CustomerLoyalty).filter(
        models.CustomerLoyalty.business_id == user.business_id,
        models.CustomerLoyalty.points_balance > 0,
    ).all() if user.role != SUPERADMIN_ROLE else []

    total_pts_outstanding = sum(r.points_balance for r in loyalty_records)
    biz = db.query(models.Business).filter(
        models.Business.business_id == user.business_id
    ).first() if user.role != SUPERADMIN_ROLE else None
    redeem_rate = float(biz.loyalty_redeem_rate or 5) if biz else 5
    pts_liability = round(total_pts_outstanding * redeem_rate, 2)

    return {
        "top_spenders":       top_spenders,
        "total_customers":    total_customers,
        "repeat_customers":   repeat_customers,
        "retention_rate":     retention_rate,
        "loyalty": {
            "customers_with_points":  len(loyalty_records),
            "total_points_outstanding": total_pts_outstanding,
            "points_liability":       pts_liability,
            "redeem_rate":            redeem_rate,
        },
    }


# ── 7. Inventory health ───────────────────────────────────────────────────────
@router.get("/inventory-health")
def get_inventory_health(
    branch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    """
    Stock status breakdown, reorder urgency ranked by sales velocity,
    expiry risk summary.
    """
    ids = _branch_ids(user, branch_id, db)

    inv_q = db.query(models.BranchInventory)
    if ids:
        inv_q = inv_q.filter(models.BranchInventory.branch_id.in_(ids))

    # Scope to business products
    biz_product_ids = set()
    if user.role != SUPERADMIN_ROLE:
        biz_product_ids = {
            p.product_id for p in db.query(models.Product).filter(
                models.Product.business_id == user.business_id
            ).all()
        }
        inv_q = inv_q.filter(models.BranchInventory.product_id.in_(biz_product_ids))

    inventory = inv_q.all()

    ok_count       = sum(1 for i in inventory if i.stock_quantity > (i.reorder_level or 5))
    low_count      = sum(1 for i in inventory if 0 < i.stock_quantity <= (i.reorder_level or 5))
    out_count      = sum(1 for i in inventory if i.stock_quantity <= 0)
    total_items    = len(inventory)

    # Stock value
    product_map = {}
    if user.role != SUPERADMIN_ROLE:
        for p in db.query(models.Product).filter(
            models.Product.business_id == user.business_id
        ).all():
            product_map[p.product_id] = p
    else:
        for p in db.query(models.Product).all():
            product_map[p.product_id] = p

    total_stock_value = sum(
        (product_map.get(i.product_id) and float(product_map[i.product_id].cost_price or 0) or 0) * i.stock_quantity
        for i in inventory
    )

    # Reorder urgency — products at or below reorder level, ranked by recent sales velocity
    today    = today_lagos()
    df_30    = today - timedelta(days=30)
    reorder_needed = [i for i in inventory if i.stock_quantity <= (i.reorder_level or 5) and i.stock_quantity >= 0]

    urgency_list = []
    for inv_item in reorder_needed:
        p = product_map.get(inv_item.product_id)
        if not p: continue

        # Sales velocity last 30 days
        units_sold = db.query(func.sum(models.SaleItem.quantity)).join(
            models.Sale, models.Sale.sale_id == models.SaleItem.sale_id
        ).filter(
            models.SaleItem.product_id == inv_item.product_id,
            models.Sale.sale_date >= datetime.combine(df_30, datetime.min.time()),
            models.Sale.status == "completed",
        ).scalar() or 0

        daily_velocity = round(units_sold / 30, 2)
        days_left      = round(inv_item.stock_quantity / daily_velocity, 1) if daily_velocity > 0 else None

        urgency_list.append({
            "product_id":      inv_item.product_id,
            "product_name":    p.product_name,
            "current_stock":   inv_item.stock_quantity,
            "reorder_level":   inv_item.reorder_level or 5,
            "units_sold_30d":  units_sold,
            "daily_velocity":  daily_velocity,
            "days_left":       days_left,
            "supplier":        p.supplier.supplier_name if p.supplier_id and hasattr(p, "supplier") and p.supplier else None,
            "status":          "out" if inv_item.stock_quantity <= 0 else "low",
        })

    urgency_list.sort(key=lambda x: (x["days_left"] is None, x["days_left"] or 0))

    # Expiry risk
    today_d  = today
    soon_cut = today_d + timedelta(days=90)
    expiry_q = db.query(models.InventoryBatch).filter(
        models.InventoryBatch.expiry_date.isnot(None),
        models.InventoryBatch.expiry_date <= soon_cut,
        models.InventoryBatch.quantity > 0,
    )
    if ids:
        expiry_q = expiry_q.filter(models.InventoryBatch.branch_id.in_(ids))

    expiry_risk_value = 0.0
    expired_value     = 0.0
    for batch in expiry_q.all():
        p    = product_map.get(batch.product_id)
        cost = float(p.cost_price or 0) if p else 0
        val  = cost * batch.quantity
        if batch.expiry_date < today_d:
            expired_value     += val
        else:
            expiry_risk_value += val

    return {
        "summary": {
            "total_sku":          total_items,
            "ok":                 ok_count,
            "low":                low_count,
            "out_of_stock":       out_count,
            "total_stock_value":  round(total_stock_value, 2),
            "expiry_risk_value":  round(expiry_risk_value, 2),
            "expired_value":      round(expired_value, 2),
        },
        "reorder_urgency": urgency_list[:20],
    }


# ── 8. Cashier performance ────────────────────────────────────────────────────
@router.get("/cashiers")
def get_cashier_performance(
    branch_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to:   Optional[date] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin", "superadmin"]))
):
    today = today_lagos()
    df    = date_from or (today - timedelta(days=29))
    dt    = date_to   or today

    sales = _sales_query(db, user, branch_id, df, dt).all()

    by_cashier = {}
    for s in sales:
        uid = s.user_id
        if uid not in by_cashier:
            by_cashier[uid] = {"user_id": uid, "transactions": 0, "revenue": 0.0, "discounts": 0.0}
        by_cashier[uid]["transactions"] += 1
        by_cashier[uid]["revenue"]      += float(s.total_amount or 0)
        by_cashier[uid]["discounts"]    += float(s.discount or 0)

    if by_cashier:
        users = {
            u.user_id: u for u in db.query(models.User).filter(
                models.User.user_id.in_(list(by_cashier.keys()))
            ).all()
        }
        for uid, stats in by_cashier.items():
            u = users.get(uid)
            stats["cashier_name"] = u.full_name if u else f"User #{uid}"
            stats["role"]         = u.role if u else "—"
            stats["revenue"]      = round(stats["revenue"], 2)
            stats["discounts"]    = round(stats["discounts"], 2)
            stats["avg_txn"]      = round(stats["revenue"] / stats["transactions"], 2) if stats["transactions"] else 0

    ranked = sorted(by_cashier.values(), key=lambda x: x["revenue"], reverse=True)
    return {"data": ranked}