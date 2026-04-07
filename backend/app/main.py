# app/main.py
"""
G4Lite — API entry point.

This module assembles the FastAPI application: lifespan management,
middleware, router registration, health endpoint, and global exception
handling.  It is the only file that ``uvicorn`` points at.

    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.database import check_db_health, close_db, init_db

# ---------------------------------------------------------------------------
# Settings & logging bootstrap
# ---------------------------------------------------------------------------

settings = get_settings()

# ---------------------------------------------------------------------------
# Structured logging configuration
# ---------------------------------------------------------------------------


class _JSONFormatter(logging.Formatter):
    """
    Single-line JSON log formatter for production/container environments.

    Produces one JSON object per line with consistent field ordering so
    that log aggregators (Loki, CloudWatch, Datadog) can parse without
    custom grok patterns.
    """

    def format(self, record: logging.LogRecord) -> str:
        import json as _json

        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            payload["request_id"] = record.request_id
        if hasattr(record, "duration_ms"):
            payload["duration_ms"] = record.duration_ms
        return _json.dumps(payload, default=str, ensure_ascii=False)


class _TextFormatter(logging.Formatter):
    """
    Human-readable coloured formatter for local development.

    Format:  ``HH:MM:SS.mmm  LEVEL     logger  ▸ message``
    """

    _COLOURS = {
        "DEBUG": "\033[36m",     # cyan
        "INFO": "\033[32m",      # green
        "WARNING": "\033[33m",   # yellow
        "ERROR": "\033[31m",     # red
        "CRITICAL": "\033[35m",  # magenta
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime(
            "%H:%M:%S.%f"
        )[:-3]
        colour = self._COLOURS.get(record.levelname, "")
        reset = self._RESET if colour else ""
        level = f"{colour}{record.levelname:<8}{reset}"
        name = record.name.split(".")[-1][:16].ljust(16)
        msg = record.getMessage()
        line = f"{ts}  {level}  {name}  ▸ {msg}"
        if record.exc_info and record.exc_info[0] is not None:
            line += "\n" + self.formatException(record.exc_info)
        return line


def _configure_logging() -> None:
    """
    Set up root logger with the appropriate formatter and level.

    Called once during module load (before the app object is created)
    so that all startup log messages are captured.
    """
    root = logging.getLogger()

    # Remove any handlers added by uvicorn / third-party imports
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        _JSONFormatter()
        if settings.LOG_FORMAT == "json"
        else _TextFormatter()
    )
    root.addHandler(handler)
    root.setLevel(settings.LOG_LEVEL)

    # Quiet noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.DB_ECHO else logging.WARNING
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("hpack").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)


_configure_logging()

logger = logging.getLogger("G4Lite")

# ---------------------------------------------------------------------------
# Application boot timestamp (for uptime calculation)
# ---------------------------------------------------------------------------

_BOOT_TIME: float | None = None


# ---------------------------------------------------------------------------
# Lifespan: startup + shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan context manager.

    Startup:
        1. Log configuration summary (redacted — no secrets).
        2. Initialise database engine + connection pool.
        3. Verify database connectivity.
        4. Optionally run seed script.
        5. Log readiness.

    Shutdown:
        1. Close Ollama HTTP client (if active).
        2. Dispose database engine and release all pooled connections.
        3. Log clean shutdown.
    """
    global _BOOT_TIME
    _BOOT_TIME = time.monotonic()

    startup_start = time.monotonic()

    # --- Log banner ---
    logger.info(
        "═══════════════════════════════════════════════════════════════"
    )
    logger.info(
        "  %s v%s  —  %s",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.ENVIRONMENT.upper(),
    )
    logger.info(
        "═══════════════════════════════════════════════════════════════"
    )

    # --- Log configuration summary ---
    for key, value in settings.summary().items():
        logger.info("  config  %-32s = %s", key, value)

    # --- Initialise database ---
    logger.info("Initialising database layer...")
    await init_db(settings)

    db_health = await check_db_health()
    if db_health["connected"]:
        logger.info(
            "Database connected — latency %.1fms, pool_size=%s",
            db_health.get("latency_ms", 0),
            db_health.get("pool_size", "?"),
        )
    else:
        logger.error(
            "Database health check FAILED: %s — "
            "application will start but may not function correctly",
            db_health.get("error", "unknown"),
        )

    # --- Seed data (development / first-run) ---
    if settings.SEED_ON_STARTUP:
        logger.info("SEED_ON_STARTUP is enabled — running seed script...")
        try:
            from app.seed import run_seed

            await run_seed()
            logger.info("Seed script completed")
        except Exception as exc:
            logger.error("Seed script failed: %s", exc, exc_info=True)

    # --- Check Ollama availability (non-blocking) ---
    try:
        from app.services.ollama_service import check_ollama_health

        ollama_health = await check_ollama_health()
        if ollama_health.get("available"):
            logger.info(
                "Ollama connected — model=%s, gpu=%s",
                ollama_health.get("model", "?"),
                ollama_health.get("gpu_available", "?"),
            )
        else:
            logger.warning(
                "Ollama not available — AI assistant will be disabled.  "
                "Start Ollama with: docker compose --profile ai up -d"
            )
    except Exception:
        logger.warning(
            "Ollama health check skipped (service not configured or import failed)"
        )

    # --- Ready ---
    startup_ms = round((time.monotonic() - startup_start) * 1000)
    logger.info(
        "✓ %s ready in %dms — listening on 0.0.0.0:8000",
        settings.APP_NAME,
        startup_ms,
    )

    yield

    # ===== SHUTDOWN =====
    logger.info("Shutting down %s...", settings.APP_NAME)

    # Close Ollama client
    try:
        from app.services.ollama_service import close_ollama_client

        await close_ollama_client()
        logger.info("Ollama client closed")
    except Exception:
        pass  # Not critical — may not be initialised

    # Dispose database
    await close_db()

    shutdown_ms = round((time.monotonic() - startup_start) * 1000)
    logger.info(
        "✓ %s shutdown complete (%dms uptime)",
        settings.APP_NAME,
        shutdown_ms,
    )


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "C2-grade self-hosted equipment logistics platform.  "
        "Manage inventory, sign-outs, resupply, and notifications "
        "with full audit trails and role-based access control."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs" if settings.is_development else None,
    redoc_url="/api/redoc" if settings.is_development else None,
    openapi_url="/api/openapi.json" if settings.is_development else None,
)


# ---------------------------------------------------------------------------
# Middleware stack (order matters — outermost listed first)
# ---------------------------------------------------------------------------


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """
    Attach timing and request-ID headers to every response.

    Also logs each completed request at INFO level with method, path,
    status code, and duration.
    """

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        request_id = request.headers.get(
            "X-Request-ID", f"{time.time_ns():x}"
        )

        # Inject request_id into log records for this request
        response = await call_next(request)

        duration_ms = round((time.monotonic() - start) * 1000, 1)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"
        response.headers["X-Powered-By"] = settings.APP_NAME

        # Log the request (skip /api/health to avoid noise)
        path = request.url.path
        if path != "/api/health":
            log_level = (
                logging.WARNING if response.status_code >= 400 else logging.INFO
            )
            logger.log(
                log_level,
                "%s %s %d — %.1fms",
                request.method,
                path,
                response.status_code,
                duration_ms,
            )

        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Inject security headers into every response.

    These supplement the headers set by Nginx (defence in depth —
    if Nginx is bypassed in dev, the app still sets them).
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
        return response


# Register middleware (last added = outermost = runs first)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(RequestTimingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Request-ID",
        "X-Requested-With",
    ],
    expose_headers=[
        "X-Request-ID",
        "X-Response-Time",
    ],
    max_age=settings.CORS_MAX_AGE,
)


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Return 422 with structured error details.

    Pydantic's raw validation errors are verbose — we flatten them into
    a consistent ``{detail, errors}`` shape.
    """
    errors = []
    for err in exc.errors():
        field = " → ".join(str(loc) for loc in err.get("loc", []))
        errors.append({
            "field": field,
            "message": err.get("msg", "Validation error"),
            "type": err.get("type", "value_error"),
        })

    logger.warning(
        "Validation error on %s %s: %d field(s)",
        request.method,
        request.url.path,
        len(errors),
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": jsonable_encoder(errors),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """
    Catch-all for unhandled exceptions.

    Logs the full traceback and returns a generic 500 so that
    internal details are never leaked to the client.
    """
    logger.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
        },
    )


# Register the Ollama error handler only if the service is importable
try:
    from app.services.ollama_service import OllamaError

    @app.exception_handler(OllamaError)
    async def ollama_error_handler(
        request: Request, exc: OllamaError
    ) -> JSONResponse:
        """Map all Ollama errors to 502 Bad Gateway."""
        logger.warning("Ollama error: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "detail": f"AI service unavailable: {exc}",
            },
        )

except ImportError:
    pass


# ---------------------------------------------------------------------------
# Router registration
# ---------------------------------------------------------------------------

from app.routers import (  # noqa: E402 — must be after app creation
    assistant,
    auth,
    items,
    notifications,
    resupply,
    signouts,
    users,
)

app.include_router(auth.router, tags=["Authentication"])
app.include_router(items.router, tags=["Items & Categories"])
app.include_router(signouts.router, tags=["Sign-Outs"])
app.include_router(resupply.router, tags=["Resupply"])
app.include_router(notifications.router, tags=["Notifications"])
app.include_router(users.router, tags=["Users"])
app.include_router(assistant.router, tags=["AI Assistant"])

# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


@app.get(
    "/api/health",
    tags=["System"],
    summary="System health check",
    response_model=None,
)
async def health_check() -> JSONResponse:
    """
    Comprehensive health check for load balancers and monitoring.

    Returns database connectivity, Ollama availability, pool statistics,
    and uptime.  Always returns 200 with a ``status`` field of
    ``"healthy"`` or ``"degraded"`` — never 500, so that the endpoint
    itself is always reachable.
    """
    # --- Database ---
    db_health = await check_db_health()

    # --- Ollama ---
    ollama_health: dict = {"available": False}
    try:
        from app.services.ollama_service import check_ollama_health

        ollama_health = await check_ollama_health()
    except Exception:
        pass

    # --- Uptime ---
    uptime_seconds = (
        round(time.monotonic() - _BOOT_TIME, 1) if _BOOT_TIME else 0
    )

    # --- Overall status ---
    is_healthy = db_health.get("connected", False)
    overall_status = "healthy" if is_healthy else "degraded"

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": overall_status,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "uptime_seconds": uptime_seconds,
            "database": {
                "connected": db_health.get("connected", False),
                "latency_ms": db_health.get("latency_ms"),
                "pool_size": db_health.get("pool_size"),
                "pool_checked_out": db_health.get("pool_checked_out"),
            },
            "ollama": {
                "available": ollama_health.get("available", False),
                "model": ollama_health.get("model"),
            },
            "timestamp": datetime.now(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
        },
    )