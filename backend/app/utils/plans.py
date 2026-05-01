# app/utils/plans.py
# Central plan limits for ProfitTrack POS subscription tiers.
# Update this file whenever pricing changes — no other files need touching.

# max_users  = maximum number of STAFF accounts (excludes the owner/admin)
# max_branches = maximum number of branches allowed
# -1 means unlimited

PLAN_LIMITS = {
    "solo": {
        "max_users":    0,    # owner only — no staff accounts
        "max_branches": 1,
    },
    "starter": {
        "max_users":    3,    # up to 3 staff accounts
        "max_branches": 1,
    },
    "business": {
        "max_users":    -1,   # unlimited
        "max_branches": 3,
    },
    "enterprise": {
        "max_users":    -1,   # unlimited
        "max_branches": -1,   # unlimited
    },
}

# Default plan assigned to new businesses
DEFAULT_PLAN = "starter"


def get_plan_limits(plan: str) -> dict:
    """Return limits for a given plan. Falls back to starter if plan is unknown."""
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[DEFAULT_PLAN])


def is_user_limit_reached(plan: str, current_staff_count: int) -> bool:
    """Return True if the business has hit its staff user limit."""
    limits = get_plan_limits(plan)
    if limits["max_users"] == -1:
        return False  # unlimited
    return current_staff_count >= limits["max_users"]


def is_branch_limit_reached(plan: str, current_branch_count: int) -> bool:
    """Return True if the business has hit its branch limit."""
    limits = get_plan_limits(plan)
    if limits["max_branches"] == -1:
        return False  # unlimited
    return current_branch_count >= limits["max_branches"]