# alembic/env.py
"""
Alembic async migration environment.

Supports both offline (SQL script generation) and online (direct DB
execution) modes using the async SQLAlchemy engine.

All models are imported via ``app.models`` which re-exports every model
class and ``Base``, ensuring ``Base.metadata`` contains the complete
table registry for autogenerate.
"""

from __future__ import annotations

import asyncio
import logging
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.database import Base

# Import all models so that Base.metadata is fully populated.
# The models __init__.py re-exports every model class in
# foreign-key dependency order.
import app.models  # noqa: F401 — side-effect: registers all tables

logger = logging.getLogger("alembic.env")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

settings = get_settings()
config = context.config

# Override sqlalchemy.url from our Settings (not from alembic.ini)
# This ensures the .env file is the single source of truth.
config.set_main_option("sqlalchemy.url", settings.database_url)

# Set up Python logging from alembic.ini [loggers] section
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Tables / schemas to exclude from autogenerate
# ---------------------------------------------------------------------------

EXCLUDE_TABLES: set[str] = set()


def _include_object(
    object,       # noqa: A002 — Alembic's callback signature
    name: str | None,
    type_: str,
    reflected: bool,
    compare_to,
) -> bool:
    """
    Filter callback for autogenerate.

    Excludes tables listed in ``EXCLUDE_TABLES`` and any objects that
    exist in the database but not in our models (``reflected=True``
    with no model counterpart).
    """
    if type_ == "table" and name in EXCLUDE_TABLES:
        return False
    return True


# ---------------------------------------------------------------------------
# Offline mode — generate SQL script without a live connection
# ---------------------------------------------------------------------------


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    Generates the SQL statements that *would* be executed, written to
    the script output (stdout or file).  Useful for review, auditing,
    or environments where direct DB access isn't available.

    Usage:
        alembic upgrade head --sql
    """
    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_object=_include_object,
        render_as_batch=False,
    )

    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online mode — execute against a live async database
# ---------------------------------------------------------------------------


def _do_run_migrations(connection) -> None:
    """
    Configure the migration context and run within a sync callback.

    Called inside ``connection.run_sync()`` so that Alembic's
    synchronous migration runner can operate on the async connection.
    """
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_object=_include_object,
        render_as_batch=False,
        # Transactional DDL — PostgreSQL supports this natively
        transaction_per_migration=False,
    )

    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    """
    Create a throwaway async engine and run migrations.

    Uses ``NullPool`` because Alembic is a short-lived CLI process —
    connection pooling adds overhead with no benefit.

    The engine is always disposed after migrations complete, even
    on error, to avoid leaked connections.
    """
    connectable = create_async_engine(
        settings.database_url,
        poolclass=pool.NullPool,
        # Echo SQL during migrations if DB_ECHO is enabled
        echo=settings.DB_ECHO,
    )

    try:
        async with connectable.connect() as connection:
            # Verify connectivity before running migrations
            await connection.execute(text("SELECT 1"))
            logger.info(
                "Connected to %s:%s/%s",
                settings.POSTGRES_HOST,
                settings.POSTGRES_PORT,
                settings.POSTGRES_DB,
            )

            await connection.run_sync(_do_run_migrations)
            await connection.commit()
    except Exception as exc:
        logger.error("Migration failed: %s", exc)
        raise
    finally:
        await connectable.dispose()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode against a live database.

    Handles the async event loop correctly — if we're already inside
    a running loop (e.g. called from an async test fixture), we use
    the existing loop.  Otherwise we create a new one.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We're inside an existing async context (e.g. pytest-asyncio).
        # Schedule the coroutine on the running loop.
        import nest_asyncio

        nest_asyncio.apply()
        loop.run_until_complete(_run_async_migrations())
    else:
        asyncio.run(_run_async_migrations())


# ---------------------------------------------------------------------------
# Entry point — Alembic calls this when the env is loaded
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()