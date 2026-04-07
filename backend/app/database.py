# app/database.py
"""
Async SQLAlchemy engine, session factory, and database utilities.

This module is the single source of truth for all database connectivity.
Every other module imports ``Base``, ``get_db``, or the engine/session
factory from here — never constructs its own.

Connection pool parameters are driven entirely by ``app.config.Settings``
so that tuning happens in ``.env``, not in code.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import AsyncAdaptedQueuePool

from app.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Declarative base — every model inherits from this
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    """
    SQLAlchemy 2.0 declarative base.

    All models import this class.  Alembic's ``env.py`` imports
    ``Base.metadata`` for autogenerate discovery.
    """

    pass


# ---------------------------------------------------------------------------
# Engine & session factory  (lazily initialised)
# ---------------------------------------------------------------------------

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_engine(settings=None) -> AsyncEngine:
    """
    Construct the async engine with pool tuning from config.

    Called once at module level and again in ``init_db()`` if the
    engine needs to be rebuilt (e.g. in tests with a different URL).
    """
    if settings is None:
        settings = get_settings()

    engine = create_async_engine(
        settings.database_url,
        echo=settings.DB_ECHO,
        poolclass=AsyncAdaptedQueuePool,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_pre_ping=True,  # reconnect-on-checkout after Docker restarts
        connect_args={
            "server_settings": {
                "application_name": f"{settings.APP_NAME}/{settings.APP_VERSION}",
                "jit": "off",  # avoid JIT overhead on short OLTP queries
            },
            "timeout": settings.DB_POOL_TIMEOUT,
        },
    )

    # Log pool checkout exhaustion at WARNING level
    @event.listens_for(engine.sync_engine, "checkout")
    def _on_checkout(dbapi_conn, connection_rec, connection_proxy):
        logger.debug("Pool checkout: %s", connection_rec)

    @event.listens_for(engine.sync_engine, "checkin")
    def _on_checkin(dbapi_conn, connection_rec):
        logger.debug("Pool checkin: %s", connection_rec)

    @event.listens_for(engine.sync_engine, "connect")
    def _on_connect(dbapi_conn, connection_rec):
        logger.info("New database connection established")

    @event.listens_for(engine.sync_engine, "invalidate")
    def _on_invalidate(dbapi_conn, connection_rec, exception):
        logger.warning(
            "Connection invalidated (will reconnect on next checkout): %s",
            exception,
        )

    logger.info(
        "Database engine created — pool_size=%d, max_overflow=%d, "
        "pool_recycle=%ds, pre_ping=True",
        settings.DB_POOL_SIZE,
        settings.DB_MAX_OVERFLOW,
        settings.DB_POOL_RECYCLE,
    )

    return engine


def _build_session_factory(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    """Build the async session factory bound to the given engine."""
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


def get_engine() -> AsyncEngine:
    """Return the module-level engine, creating it on first access."""
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the module-level session factory, creating it on first access."""
    global _session_factory
    if _session_factory is None:
        _session_factory = _build_session_factory(get_engine())
    return _session_factory


# ---------------------------------------------------------------------------
# Lifecycle management (called from main.py lifespan)
# ---------------------------------------------------------------------------


async def init_db(settings=None) -> None:
    """
    Initialise (or reinitialise) the database engine and session factory.

    Called during application startup.  In tests, pass a custom
    ``Settings`` instance to point at a test database.
    """
    global _engine, _session_factory

    if _engine is not None:
        await _engine.dispose()

    _engine = _build_engine(settings)
    _session_factory = _build_session_factory(_engine)

    logger.info("Database layer initialised")


async def close_db() -> None:
    """
    Dispose of the engine and release all pooled connections.

    Called during application shutdown.
    """
    global _engine, _session_factory

    if _engine is not None:
        await _engine.dispose()
        logger.info(
            "Database engine disposed — all connections released"
        )

    _engine = None
    _session_factory = None


# ---------------------------------------------------------------------------
# FastAPI dependency — request-scoped session
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a request-scoped ``AsyncSession``.

    Lifecycle:
        1. Session is created from the factory.
        2. The route handler receives it via ``Depends(get_db)``.
        3. On success the session is committed.
        4. On exception the session is rolled back and the error re-raised.
        5. The session is always closed.

    Routes that need finer-grained transaction control (e.g. partial
    commits) should call ``await db.commit()`` / ``await db.rollback()``
    explicitly within the route body — the outer commit here is a no-op
    if the session has already been committed.
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Standalone session context manager (services, seed, background tasks)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def get_standalone_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for sessions outside of FastAPI request scope.

    Use this in background tasks, seed scripts, and service-layer code
    that isn't triggered by a route.

    Usage::

        async with get_standalone_session() as db:
            result = await db.execute(select(User))
            ...
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


async def check_db_health() -> dict:
    """
    Execute a lightweight query to verify database connectivity.

    Returns a dict suitable for inclusion in the ``/api/health`` response::

        {"connected": True, "latency_ms": 1.2, "pool_size": 5, "pool_checked_out": 1}

    On failure::

        {"connected": False, "error": "connection refused", ...}
    """
    import time

    engine = get_engine()
    pool = engine.pool

    result: dict = {
        "connected": False,
        "latency_ms": None,
        "pool_size": pool.size() if hasattr(pool, "size") else None,
        "pool_checked_out": (
            pool.checkedout() if hasattr(pool, "checkedout") else None
        ),
        "pool_overflow": (
            pool.overflow() if hasattr(pool, "overflow") else None
        ),
    }

    try:
        start = time.monotonic()
        async with engine.connect() as conn:
            row = await conn.execute(text("SELECT 1"))
            row.scalar()
        elapsed_ms = round((time.monotonic() - start) * 1000, 2)

        result["connected"] = True
        result["latency_ms"] = elapsed_ms

    except Exception as exc:
        result["error"] = str(exc)
        logger.warning("Database health check failed: %s", exc)

    return result


# ---------------------------------------------------------------------------
# Pool statistics (for admin dashboard / metrics endpoint)
# ---------------------------------------------------------------------------


def get_pool_stats() -> dict:
    """
    Return current connection pool statistics.

    Safe to call from a sync context (reads pool counters only).
    """
    engine = get_engine()
    pool = engine.pool

    return {
        "pool_size": pool.size() if hasattr(pool, "size") else None,
        "checked_in": (
            pool.checkedin() if hasattr(pool, "checkedin") else None
        ),
        "checked_out": (
            pool.checkedout() if hasattr(pool, "checkedout") else None
        ),
        "overflow": (
            pool.overflow() if hasattr(pool, "overflow") else None
        ),
        "invalid": (
            pool._invalidate_time if hasattr(pool, "_invalidate_time") else None
        ),
    }