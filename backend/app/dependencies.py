from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.auth import SECRET_KEY, ALGORITHM
from typing import List

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        username: str = payload.get("sub")
        branch_id: int = payload.get("branch_id")

        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(models.User).filter(
        models.User.username == username
    ).first()

    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # 🚨 THIS IS THE FIX
    if not branch_id:
        raise HTTPException(status_code=400, detail="Branch not assigned. Please log in again.")

    # Optional but STRONG safety check
    if user.branch_id != branch_id:
        raise HTTPException(status_code=401, detail="Branch mismatch. Please log in again.")

    return user


def require_role(allowed_roles: List[str]):

    def role_checker(user = Depends(get_current_user)):

        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="Not authorized"
            )

        return user

    return role_checker