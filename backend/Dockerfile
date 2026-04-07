# ══════════════════════════════════════════════════════════════════════════
# G4Lite Backend — Production Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder)  — install system deps, compile Python wheels
#   Stage 2 (runtime)  — copy wheels, non-root user, minimal attack surface
#
# Build:
#   docker build -t G4Lite-backend:latest .
#
# Run:
#   docker run -p 8000:8000 --env-file .env G4Lite-backend:latest
# ══════════════════════════════════════════════════════════════════════════


# ──────────────────────────────────────────────────────────────────────────
# Stage 1: Builder — compile dependencies into wheels
# ──────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS builder

WORKDIR /build

# System packages required to compile C extensions (psycopg2, bcrypt, etc.)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libpq-dev \
        libffi-dev \
        make && \
    rm -rf /var/lib/apt/lists/*

# Copy only requirements first — Docker layer caching means this layer
# is rebuilt ONLY when requirements.txt changes, not on every code change.
COPY requirements.txt .

# Build wheels into /build/wheels so we can copy just the binaries
# to the runtime stage without carrying the compiler toolchain.
RUN pip install --upgrade pip setuptools wheel && \
    pip wheel --no-cache-dir --wheel-dir=/build/wheels -r requirements.txt


# ──────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime — minimal image with no build tools
# ──────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS runtime

# ── OCI image labels ─────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="G4Lite Backend" \
      org.opencontainers.image.description="C2-grade equipment logistics API" \
      org.opencontainers.image.version="2.0.0" \
      org.opencontainers.image.vendor="G4Lite" \
      org.opencontainers.image.source="https://github.com/G4Lite/G4Lite" \
      org.opencontainers.image.licenses="MIT"

# ── Environment ──────────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Default port — overridable at runtime
    PORT=8000

WORKDIR /app

# ── Runtime system dependencies only (no compiler) ───────────────────────
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        # PostgreSQL client library (required by psycopg2/asyncpg at runtime)
        libpq5 \
        # curl for HEALTHCHECK
        curl \
        # CA certificates for HTTPS (Ollama, external APIs)
        ca-certificates \
        # Timezone data
        tzdata && \
    # Clean up
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    # Remove package manager caches
    apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false

# ── Install Python wheels from builder ───────────────────────────────────
COPY --from=builder /build/wheels /tmp/wheels
RUN pip install --no-cache-dir --no-deps /tmp/wheels/*.whl && \
    rm -rf /tmp/wheels

# ── Create non-root user ─────────────────────────────────────────────────
# UID/GID 1000 avoids conflicts with host-mapped volumes on Linux.
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid 1000 --shell /bin/false --create-home appuser

# ── Copy application code ────────────────────────────────────────────────
# Copy alembic config and migrations first (changes less often)
COPY alembic.ini .
COPY alembic/ ./alembic/

# Copy application source
COPY app/ ./app/

# ── Set ownership and switch to non-root ─────────────────────────────────
RUN chown -R appuser:appuser /app

USER appuser

# ── Expose port ──────────────────────────────────────────────────────────
EXPOSE ${PORT}

# ── Health check ─────────────────────────────────────────────────────────
# Docker / Docker Compose use this to determine container health.
# Interval: check every 30s
# Timeout:  fail if no response in 10s
# Retries:  mark unhealthy after 3 consecutive failures
# Start:    wait 15s after container start before first check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl --fail --silent --max-time 5 http://localhost:${PORT}/api/health || exit 1

# ── Entry point ──────────────────────────────────────────────────────────
# Uvicorn with:
#   --workers 1        : single worker (scale via Docker replicas, not forks)
#   --limit-concurrency: prevent overload under spike
#   --timeout-keep-alive: match Nginx upstream keepalive
#   --access-log       : disabled (our RequestTimingMiddleware handles logging)
#   --server-header    : disabled (don't expose "uvicorn" in Server header)
#   --date-header      : disabled (Nginx adds Date header)
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--limit-concurrency", "100", \
     "--timeout-keep-alive", "65", \
     "--access-log", \
     "--no-server-header", \
     "--no-date-header"]