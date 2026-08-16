from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_current_user
from app.routers.customers import router


class FakeQuery:
    def __init__(self, result):
        self.result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.result


class FakeDB:
    def __init__(self, result):
        self.result = result

    def query(self, *args, **kwargs):
        return FakeQuery(self.result)


def make_customer(business_id: int):
    return SimpleNamespace(
        customer_id=77,
        full_name="Endpoint Isolation Customer",
        phone=None,
        email=None,
        address=None,
        credit_enabled=False,
        credit_limit=None,
        credit_due_days=30,
        credit_notes=None,
        business_id=business_id,
        created_at=datetime.now(timezone.utc),
    )


def make_client(customer_business_id: int, user_role: str, user_business_id: int):
    app = FastAPI()
    app.include_router(router)

    customer = make_customer(customer_business_id)
    user = SimpleNamespace(
        user_id=5,
        role=user_role,
        business_id=user_business_id,
        branch_id=10,
    )

    app.dependency_overrides[get_db] = lambda: FakeDB(customer)
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def test_customer_endpoint_denies_cross_business_read():
    client = make_client(
        customer_business_id=200,
        user_role="admin",
        user_business_id=100,
    )

    response = client.get("/customers/77")

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized"


def test_customer_endpoint_allows_same_business_read():
    client = make_client(
        customer_business_id=100,
        user_role="admin",
        user_business_id=100,
    )

    response = client.get("/customers/77")

    assert response.status_code == 200
    assert response.json()["customer_id"] == 77
    assert response.json()["business_id"] == 100


def test_customer_endpoint_allows_superadmin_cross_business_read():
    client = make_client(
        customer_business_id=200,
        user_role="superadmin",
        user_business_id=100,
    )

    response = client.get("/customers/77")

    assert response.status_code == 200
    assert response.json()["business_id"] == 200
