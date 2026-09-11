import pytest

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
