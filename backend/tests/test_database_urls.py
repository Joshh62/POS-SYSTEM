import pytest

from app.database import database_engine_options
from app.database_urls import migration_database_url, psycopg2_url


def test_migration_url_prefers_dedicated_direct_connection():
    environment = {
        "DATABASE_URL": "postgresql://runtime-pooler.example/app",
        "MIGRATION_DATABASE_URL": "postgresql://migration-direct.example/app",
    }

    assert migration_database_url(environment) == environment[
        "MIGRATION_DATABASE_URL"
    ]


def test_migration_url_falls_back_to_runtime_url():
    environment = {"DATABASE_URL": "postgresql://localhost/app"}

    assert migration_database_url(environment) == environment["DATABASE_URL"]


def test_migration_url_requires_explicit_configuration():
    with pytest.raises(RuntimeError, match="MIGRATION_DATABASE_URL or DATABASE_URL"):
        migration_database_url({})


def test_psycopg2_url_preserves_explicit_driver():
    assert psycopg2_url("postgresql://localhost/app") == (
        "postgresql+psycopg2://localhost/app"
    )
    assert psycopg2_url("postgresql+psycopg2://localhost/app") == (
        "postgresql+psycopg2://localhost/app"
    )


def test_runtime_engine_uses_bounded_stale_connection_controls():
    options = database_engine_options({})

    assert options["pool_pre_ping"] is True
    assert options["pool_recycle"] == 300
    assert options["pool_timeout"] == 30
    assert options["pool_use_lifo"] is True
    assert options["connect_args"] == {
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }


def test_runtime_engine_settings_are_environment_configurable():
    options = database_engine_options({
        "DATABASE_POOL_SIZE": "5",
        "DATABASE_MAX_OVERFLOW": "7",
        "DATABASE_POOL_TIMEOUT_SECONDS": "15",
        "DATABASE_POOL_RECYCLE_SECONDS": "120",
        "DATABASE_KEEPALIVES_IDLE_SECONDS": "20",
        "DATABASE_KEEPALIVES_INTERVAL_SECONDS": "6",
        "DATABASE_KEEPALIVES_COUNT": "4",
    })

    assert options["pool_size"] == 5
    assert options["max_overflow"] == 7
    assert options["pool_timeout"] == 15
    assert options["pool_recycle"] == 120
    assert options["connect_args"]["keepalives_idle"] == 20
    assert options["connect_args"]["keepalives_interval"] == 6
    assert options["connect_args"]["keepalives_count"] == 4


@pytest.mark.parametrize(
    "value",
    ["0", "-1", "not-an-integer"],
)
def test_runtime_engine_rejects_invalid_recycle_setting(value):
    with pytest.raises(
        RuntimeError,
        match="DATABASE_POOL_RECYCLE_SECONDS must be a positive integer",
    ):
        database_engine_options({"DATABASE_POOL_RECYCLE_SECONDS": value})
