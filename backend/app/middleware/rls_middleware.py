# app/middleware/rls_middleware.py
#
# Sets the PostgreSQL session variable app.current_business_id before every
# request so RLS policies can enforce tenant isolation at the database level.
#
# How it works:
#   - Reads the JWT token from the Authorization header
#   - Extracts business_id from the token claims
#   - Sets SET app.current_business_id = '<id>' on the connection
#   - Superadmin gets business_id = 0, which bypasses all RLS filters
#   - Unauthenticated requests get business_id = -1 (no rows visible)
#
# This runs on EVERY request automatically via FastAPI middleware.

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError
from app.database import SessionLocal
import os

SECRET_KEY = os.getenv("SECRET_KEY", "changeme")
ALGORITHM  = "HS256"


class RLSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Extract business_id from JWT — fall back to -1 (no access)
        business_id = -1

        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):]
            try:
                payload     = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                role        = payload.get("role", "")
                business_id = payload.get("business_id") or 0

                # Superadmin bypasses all RLS — use 0 as the bypass sentinel
                if role == "superadmin":
                    business_id = 0

            except JWTError:
                business_id = -1

        # Store on request state so endpoints can read it if needed
        request.state.business_id = business_id

        # Set the PostgreSQL session variable for RLS
        # We hook into the connection pool event instead of opening a new
        # session here — see database.py for the event listener approach.
        # The actual SET command runs via the before_cursor_execute event
        # registered in database.py using the business_id from request state.

        # Pass business_id via a context variable that database.py reads
        from app.database import set_rls_business_id
        token_ctx = set_rls_business_id(business_id)

        try:
            response = await call_next(request)
        finally:
            # Context var is request-scoped — nothing to clean up
            pass

        return response