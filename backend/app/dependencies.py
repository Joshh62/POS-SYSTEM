from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app import models
from app.auth import SECRET_KEY, ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

SUPERADMIN_ROLE = "superadmin"


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # Superadmin bypasses branch requirement — they span all businesses
    if user.role == SUPERADMIN_ROLE:
        return user

    if not user.branch_id:
        raise HTTPException(status_code=400, detail="Branch not assigned. Please log in again.")

    return user


def require_role(allowed_roles: List[str]):
    """
    Pass allowed_roles WITHOUT superadmin — superadmin always passes.
    e.g. require_role(["admin", "manager"]) also allows superadmin automatically.
    """
    def role_checker(user: models.User = Depends(get_current_user)):
        if user.role == SUPERADMIN_ROLE:
            return user   # superadmin passes every role check
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Not authorized")
        return user
    return role_checker


def get_active_branch_id(
    user: models.User,
    branch_id_param: int = None
) -> int:
    """
    Resolve which branch_id to use for a query.

    - superadmin/admin: can pass ?branch_id= to view any branch.
      If no param, returns None (meaning: query ALL branches for their business).
    - manager/cashier: always returns their own branch_id, ignores param.
    """
    if user.role in (SUPERADMIN_ROLE, "admin"):
        return branch_id_param  # None = all branches
    return user.branch_id


def get_active_business_id(
    user: models.User,
    business_id_param: int = None
) -> int | None:
    """
    Resolve which business_id to scope queries to.

    - superadmin: can pass ?business_id= to scope to one business,
      or None to see ALL businesses.
    - admin/manager/cashier: always their own business_id.
    """
    if user.role == SUPERADMIN_ROLE:
        return business_id_param  # None = all businesses
    return user.business_id