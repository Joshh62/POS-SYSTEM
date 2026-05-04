# app/utils/features.py
#
# Central feature flag definitions for ProfitTrack POS.
# Add new flags here as new features are built.
# All flags default to True so existing businesses are never broken.

from typing import Optional

# ── Master feature flag list with defaults ────────────────────────────────────
# True  = feature is ON by default for all new businesses
# False = feature is OFF by default (opt-in)

DEFAULT_FEATURES: dict[str, bool] = {
    "expiry_tracking":  True,   # Expiry alerts tab, batch tracking
    "loyalty_program":  True,   # Customer loyalty points (future)
    "debt_tracking":    True,   # Customer debt/credit tracking (future)
    "whatsapp_reports": True,   # Daily WhatsApp report via Twilio
    "expense_tracking": True,   # Expense logging (future)
    "bulk_import":      True,   # Import products page
    "multi_branch":     True,   # Branch switcher in topbar
    "reports":          True,   # Reports page and all sub-tabs
    "inventory":        True,   # Inventory page
}

# Human-readable labels for the superadmin UI
FEATURE_LABELS: dict[str, dict] = {
    "expiry_tracking":  {"label": "Expiry tracking",   "description": "Batch-level expiry dates and alerts in Inventory"},
    "loyalty_program":  {"label": "Loyalty program",   "description": "Customer loyalty points and rewards"},
    "debt_tracking":    {"label": "Debt tracking",     "description": "Track customer credit and outstanding balances"},
    "whatsapp_reports": {"label": "WhatsApp reports",  "description": "Daily sales summary sent via WhatsApp"},
    "expense_tracking": {"label": "Expense tracking",  "description": "Log and categorize business expenses"},
    "bulk_import":      {"label": "Bulk import",       "description": "Import products via CSV/Excel file upload"},
    "multi_branch":     {"label": "Multi-branch",      "description": "Branch switcher and branch-level reporting"},
    "reports":          {"label": "Reports",           "description": "Profit, stock valuation, sales summary, audit log"},
    "inventory":        {"label": "Inventory",         "description": "Stock levels, expiry alerts, restock management"},
}


def get_features(business_features: Optional[dict]) -> dict[str, bool]:
    """
    Merge stored business features with defaults.
    Any flag not explicitly set falls back to the default (True).
    This ensures new flags added to DEFAULT_FEATURES are automatically
    enabled for all existing businesses.
    """
    if not business_features:
        return DEFAULT_FEATURES.copy()
    return {**DEFAULT_FEATURES, **business_features}


def is_enabled(business_features: Optional[dict], flag: str) -> bool:
    """Return True if a feature flag is enabled for a business."""
    features = get_features(business_features)
    return features.get(flag, True)