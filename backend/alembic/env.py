import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# 1. Ensure project root is in path so 'app' can be found
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.models import Base  # Make sure this import works

# 2. Setup config and logging
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 3. SET METADATA CORRECTLY
target_metadata = Base.metadata 

def run_migrations_offline() -> None:
    url = os.getenv("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    # Get URL from Env or Fallback
    cmd_line_url = os.getenv("DATABASE_URL")
    
    if cmd_line_url:
        final_url = cmd_line_url.replace("postgresql://", "postgresql+psycopg2://")
    else:
        raise Exception("[Alembic] DATABASE_URL not set. Never run alembic locally without setting DATABASE_URL in .env")

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=final_url, # Fixed the NameError here
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()