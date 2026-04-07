# app/config.py
"""
Centralised application configuration.

All settings are loaded from environment variables (or ``.env`` file) via
Pydantic Settings.  The ``get_settings()`` function is cached so that the
same validated instance is reused across the entire process lifetime.

Groups:
    Database        – connection string, pool tuning, health-check
    Security / JWT  – token lifetime, password policy, lockout escalation
    Ollama          – timeouts, retry, circuit-breaker knobs
    Access Control  – physical lock integration (ESP32 / Nuki)
    Notifications   – scan intervals, escalation windows
    Application     – identity, account caps, seeding, debug flags
"""

from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Insecure defaults — only used when ENVIRONMENT == "development"
# ---------------------------------------------------------------------------

_DEV_SECRET = (
    "k8Xp2sV9qW4mN7jR1tY6uB3eA0fH5gD8cL2oI9wE4rT7yU1pS6aF3hJ0kM5nQ"
)


class Settings(BaseSettings):
    """
    Application settings with validation and sensible defaults.

    Every setting can be overridden by an environment variable of the same
    name (case-insensitive).  Values in ``.env`` at the project root are
    loaded automatically when no env var is set.
    """

    # ------------------------------------------------------------------
    # Model-level configuration (Pydantic v2 style)
    # ------------------------------------------------------------------
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # ignore unknown env vars — don't pollute
        case_sensitive=False,
    )

    # ==================================================================
    # DATABASE
    # ==================================================================
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: Annotated[int, Field(ge=1, le=65535)] = 5432
    POSTGRES_DB: str = "G4Lite"
    POSTGRES_USER: str = "g4admin"
    POSTGRES_PASSWORD: str = "changeme"

    # Connection pool tuning (asyncpg via SQLAlchemy)
    DB_POOL_SIZE: Annotated[int, Field(ge=1, le=100)] = 5
    DB_MAX_OVERFLOW: Annotated[int, Field(ge=0, le=100)] = 10
    DB_POOL_TIMEOUT: Annotated[int, Field(ge=5, le=120)] = 30
    DB_POOL_RECYCLE: Annotated[int, Field(ge=60)] = 1800  # seconds
    DB_ECHO: bool = False

    # ==================================================================
    # SECURITY / JWT
    # ==================================================================
    SECRET_KEY: str = _DEV_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: Annotated[int, Field(ge=5, le=1440)] = 480
    REFRESH_TOKEN_EXPIRE_DAYS: Annotated[int, Field(ge=1, le=30)] = 7

    # Password policy
    PASSWORD_MIN_LENGTH: Annotated[int, Field(ge=8, le=64)] = 8
    PASSWORD_MAX_AGE_DAYS: Annotated[int, Field(ge=0)] = 90  # 0 = no expiry

    # Account lockout — escalating durations in minutes (CSV string)
    MAX_FAILED_LOGIN_ATTEMPTS: Annotated[int, Field(ge=3, le=20)] = 8
    LOCKOUT_ESCALATION_MINUTES: str = "5,15,60"

    # Activity tracking throttle
    LAST_ACTIVE_THROTTLE_SECONDS: Annotated[int, Field(ge=0)] = 60

    # ==================================================================
    # OLLAMA (LLM INTEGRATION)
    # ==================================================================
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    OLLAMA_MODEL: str = "mistral"
    OLLAMA_CONNECT_TIMEOUT: Annotated[float, Field(ge=1.0)] = 5.0
    OLLAMA_READ_TIMEOUT: Annotated[float, Field(ge=5.0)] = 120.0
    OLLAMA_MAX_RETRIES: Annotated[int, Field(ge=0, le=5)] = 2
    OLLAMA_CIRCUIT_BREAKER_THRESHOLD: Annotated[int, Field(ge=1)] = 5
    OLLAMA_CIRCUIT_BREAKER_COOLDOWN: Annotated[int, Field(ge=10)] = 60

    # ==================================================================
    # PHYSICAL ACCESS CONTROL (ESP32 / Nuki smart lock)
    # ==================================================================
    LOCK_ENABLED: bool = False
    LOCK_TYPE: str = "mock"       # mock | nuki | esp32
    LOCK_API_URL: str = ""
    LOCK_API_KEY: str = ""
    LOCK_TIMEOUT_SECONDS: Annotated[int, Field(ge=5, le=120)] = 30
    ACCESS_PIN_VALIDITY_MINUTES: Annotated[int, Field(ge=1, le=60)] = 15
    ACCESS_PIN_LENGTH: Annotated[int, Field(ge=4, le=8)] = 6

    # ==================================================================
    # NOTIFICATIONS — background scan intervals
    # ==================================================================
    OVERDUE_CHECK_INTERVAL_MINUTES: Annotated[int, Field(ge=5)] = 60
    OVERDUE_ESCALATION_HOURS: Annotated[int, Field(ge=1)] = 48
    LOW_STOCK_CHECK_INTERVAL_MINUTES: Annotated[int, Field(ge=30)] = 360
    NOTIFICATION_EXPIRY_DAYS: Annotated[int, Field(ge=1)] = 90

    # ==================================================================
    # APPLICATION
    # ==================================================================
    ENVIRONMENT: str = "development"
    APP_NAME: str = "G4Lite"
    APP_VERSION: str = "2.0.0"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"       # text | json

    MAX_ADMIN_ACCOUNTS: Annotated[int, Field(ge=1, le=10)] = 2
    MAX_TOTAL_ACCOUNTS: Annotated[int, Field(ge=2, le=100)] = 12

    SEED_ON_STARTUP: bool = False

    # CORS
    CORS_ORIGINS: str = "http://localhost,http://localhost:3000,http://localhost:5173"
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_MAX_AGE: Annotated[int, Field(ge=0)] = 600

    # ==================================================================
    # DERIVED PROPERTIES
    # ==================================================================

    @property
    def database_url(self) -> str:
        """Fully-qualified async PostgreSQL connection string."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def database_url_sync(self) -> str:
        """Synchronous connection string for Alembic migrations."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        """Split the CSV ``CORS_ORIGINS`` string into a cleaned list."""
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    @property
    def lockout_escalation_sequence(self) -> list[int]:
        """
        Parse ``LOCKOUT_ESCALATION_MINUTES`` into an integer list.

        If a user exceeds the length of this list, the last value is
        reused indefinitely (i.e. the ceiling lockout duration).
        """
        try:
            return [
                int(m.strip())
                for m in self.LOCKOUT_ESCALATION_MINUTES.split(",")
                if m.strip()
            ]
        except ValueError:
            logger.warning(
                "Invalid LOCKOUT_ESCALATION_MINUTES '%s', falling back to [5, 15, 60]",
                self.LOCKOUT_ESCALATION_MINUTES,
            )
            return [5, 15, 60]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.lower() == "development"

    @property
    def is_testing(self) -> bool:
        return self.ENVIRONMENT.lower() == "testing"

    # ==================================================================
    # VALIDATORS
    # ==================================================================

    @field_validator("ENVIRONMENT")
    @classmethod
    def _validate_environment(cls, v: str) -> str:
        allowed = {"development", "staging", "production", "testing"}
        normalised = v.lower().strip()
        if normalised not in allowed:
            raise ValueError(
                f"ENVIRONMENT must be one of {allowed}, got '{v}'"
            )
        return normalised

    @field_validator("ALGORITHM")
    @classmethod
    def _validate_algorithm(cls, v: str) -> str:
        allowed = {"HS256", "HS384", "HS512"}
        if v not in allowed:
            raise ValueError(
                f"ALGORITHM must be one of {allowed}, got '{v}'"
            )
        return v

    @field_validator("LOG_LEVEL")
    @classmethod
    def _validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper().strip()
        if upper not in allowed:
            raise ValueError(
                f"LOG_LEVEL must be one of {allowed}, got '{v}'"
            )
        return upper

    @field_validator("LOG_FORMAT")
    @classmethod
    def _validate_log_format(cls, v: str) -> str:
        allowed = {"text", "json"}
        lower = v.lower().strip()
        if lower not in allowed:
            raise ValueError(
                f"LOG_FORMAT must be one of {allowed}, got '{v}'"
            )
        return lower

    @field_validator("LOCK_TYPE")
    @classmethod
    def _validate_lock_type(cls, v: str) -> str:
        allowed = {"mock", "nuki", "esp32"}
        lower = v.lower().strip()
        if lower not in allowed:
            raise ValueError(
                f"LOCK_TYPE must be one of {allowed}, got '{v}'"
            )
        return lower

    @field_validator("LOCKOUT_ESCALATION_MINUTES")
    @classmethod
    def _validate_lockout_sequence(cls, v: str) -> str:
        """Ensure the CSV string is parseable to positive integers."""
        parts = [p.strip() for p in v.split(",") if p.strip()]
        if not parts:
            raise ValueError("LOCKOUT_ESCALATION_MINUTES must not be empty")
        for part in parts:
            val = int(part)  # raises ValueError naturally
            if val < 1:
                raise ValueError(
                    f"Lockout minutes must be positive, got {val}"
                )
        return v

    @model_validator(mode="after")
    def _validate_cross_field_rules(self) -> Settings:
        """Cross-field validation run after all individual fields."""

        # --- Secret key safety in production ---
        if self.is_production:
            if self.SECRET_KEY == _DEV_SECRET:
                raise ValueError(
                    "SECRET_KEY must be changed from the default in production"
                )
            if len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be at least 32 characters in production"
                )
            if self.DB_ECHO:
                logger.warning(
                    "DB_ECHO is enabled in production — SQL statements "
                    "will be logged.  This is a performance and security risk."
                )

        # --- Database password safety ---
        if self.is_production and self.POSTGRES_PASSWORD == "changeme":
            raise ValueError(
                "POSTGRES_PASSWORD must be changed from the default in production"
            )

        # --- Lock integration requires a URL ---
        if self.LOCK_ENABLED and self.LOCK_TYPE != "mock" and not self.LOCK_API_URL:
            raise ValueError(
                f"LOCK_API_URL is required when LOCK_TYPE is '{self.LOCK_TYPE}'"
            )

        # --- Pool size sanity ---
        if self.DB_MAX_OVERFLOW < self.DB_POOL_SIZE:
            logger.info(
                "DB_MAX_OVERFLOW (%d) < DB_POOL_SIZE (%d) — pool will not "
                "grow beyond %d connections.",
                self.DB_MAX_OVERFLOW,
                self.DB_POOL_SIZE,
                self.DB_POOL_SIZE + self.DB_MAX_OVERFLOW,
            )

        return self

    # ==================================================================
    # UTILITY METHODS
    # ==================================================================

    def get_lockout_duration_minutes(self, failure_count: int) -> int:
        """
        Return the lockout duration (minutes) for a given failure count.

        Escalation sequence is used positionally.  If ``failure_count``
        exceeds the sequence length, the last (ceiling) value is returned.
        """
        seq = self.lockout_escalation_sequence
        if failure_count <= 0:
            return 0
        idx = min(failure_count - 1, len(seq) - 1)
        return seq[idx]

    def summary(self) -> dict[str, str | int | bool]:
        """
        Return a safe subset of settings for startup logging.

        Never includes secrets, passwords, or API keys.
        """
        return {
            "app_name": self.APP_NAME,
            "version": self.APP_VERSION,
            "environment": self.ENVIRONMENT,
            "log_level": self.LOG_LEVEL,
            "log_format": self.LOG_FORMAT,
            "database_host": self.POSTGRES_HOST,
            "database_port": self.POSTGRES_PORT,
            "database_name": self.POSTGRES_DB,
            "db_pool_size": self.DB_POOL_SIZE,
            "db_max_overflow": self.DB_MAX_OVERFLOW,
            "db_pool_recycle": self.DB_POOL_RECYCLE,
            "cors_origins": len(self.cors_origin_list),
            "jwt_algorithm": self.ALGORITHM,
            "token_expire_minutes": self.ACCESS_TOKEN_EXPIRE_MINUTES,
            "password_min_length": self.PASSWORD_MIN_LENGTH,
            "password_max_age_days": self.PASSWORD_MAX_AGE_DAYS,
            "max_failed_logins": self.MAX_FAILED_LOGIN_ATTEMPTS,
            "lockout_escalation": self.LOCKOUT_ESCALATION_MINUTES,
            "ollama_url": self.OLLAMA_BASE_URL,
            "ollama_model": self.OLLAMA_MODEL,
            "ollama_connect_timeout": self.OLLAMA_CONNECT_TIMEOUT,
            "ollama_circuit_breaker": self.OLLAMA_CIRCUIT_BREAKER_THRESHOLD,
            "lock_enabled": self.LOCK_ENABLED,
            "lock_type": self.LOCK_TYPE,
            "max_admin_accounts": self.MAX_ADMIN_ACCOUNTS,
            "max_total_accounts": self.MAX_TOTAL_ACCOUNTS,
            "seed_on_startup": self.SEED_ON_STARTUP,
            "overdue_check_interval_min": self.OVERDUE_CHECK_INTERVAL_MINUTES,
            "low_stock_check_interval_min": self.LOW_STOCK_CHECK_INTERVAL_MINUTES,
        }

    @staticmethod
    def generate_secret_key(length: int = 64) -> str:
        """Generate a cryptographically secure secret key for ``.env``."""
        return secrets.token_urlsafe(length)


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the cached Settings singleton.

    The ``@lru_cache`` ensures the ``.env`` file is read and validated
    exactly once per process.  In tests, call ``get_settings.cache_clear()``
    before overriding environment variables.
    """
    s = Settings()

    if s.is_development and s.SECRET_KEY == _DEV_SECRET:
        logger.warning(
            "Using default SECRET_KEY — acceptable in development only.  "
            "Run `python -c \"from app.config import Settings; "
            "print(Settings.generate_secret_key())\"` to generate a "
            "production key."
        )

    return s