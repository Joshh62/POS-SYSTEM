from types import SimpleNamespace

from app.routers import products


def make_product(supplier=None, business_id=7):
    return SimpleNamespace(
        product_id=1,
        business_id=business_id,
        product_name="Scoped product",
        barcode="SCOPED-1",
        category_id=3,
        cost_price=10,
        selling_price=20,
        supplier_id=getattr(supplier, "supplier_id", None),
        supplier=supplier,
        created_at=None,
    )


def test_product_serialization_uses_preloaded_supplier():
    supplier = SimpleNamespace(
        supplier_id=4,
        supplier_name="Scoped supplier",
        business_id=7,
    )

    result = products._product_dict(make_product(supplier))

    assert result["supplier"] == {
        "supplier_id": 4,
        "supplier_name": "Scoped supplier",
    }


def test_product_serialization_suppresses_foreign_supplier():
    supplier = SimpleNamespace(
        supplier_id=4,
        supplier_name="Foreign supplier",
        business_id=99,
    )

    result = products._product_dict(make_product(supplier, business_id=7))

    assert result["supplier"] is None


def test_product_serialization_handles_missing_supplier():
    result = products._product_dict(make_product())

    assert result["supplier"] is None


def test_product_list_eager_loads_supplier_relationship():
    class ProductQuery:
        def __init__(self):
            self.options_called = False

        def filter(self, *args):
            return self

        def count(self):
            return 1

        def options(self, *args):
            self.options_called = True
            return self

        def offset(self, value):
            return self

        def limit(self, value):
            return self

        def all(self):
            return [make_product()]

    query = ProductQuery()
    db = SimpleNamespace(query=lambda *args: query)
    user = SimpleNamespace(role="admin", business_id=7)

    result = products.get_products(
        search=None,
        page=1,
        limit=20,
        supplier_id=None,
        business_id=None,
        db=db,
        current_user=user,
    )

    assert query.options_called is True
    assert result["total"] == 1
    assert len(result["data"]) == 1
