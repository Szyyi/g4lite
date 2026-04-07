# app/utils/security.py
"""
Security utilities: JWT, bcrypt, FastAPI auth dependencies,
input sanitisation, and password strength validation.
"""

from __future__ import annotations

import re
import logging
from datetime import datetime, timedelta, timezone
from typing import Callable, Sequence

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration & context singletons
# ---------------------------------------------------------------------------

settings = get_settings()

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Pre-compiled regexes for sanitisation / validation
_MULTI_SPACE_RE = re.compile(r"\s{2,}")
_NULL_BYTE_RE = re.compile(r"\x00")
_UPPER_RE = re.compile(r"[A-Z]")
_LOWER_RE = re.compile(r"[a-z]")
_DIGIT_RE = re.compile(r"\d")
_SPECIAL_RE = re.compile(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]")


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt (12 rounds)."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        # Malformed hash, unknown scheme, etc. — never crash, just reject
        logger.warning("Password verification failed due to malformed hash")
        return False


# ---------------------------------------------------------------------------
# Password strength validation (shared by schemas + auth router)
# ---------------------------------------------------------------------------

def validate_password_strength(password: str) -> tuple[bool, str]:
    """
    Validate password against complexity rules.

    Returns:
        (True, "") on success, (False, reason) on failure.
    """
    min_len = settings.PASSWORD_MIN_LENGTH

    if len(password) < min_len:
        return False, f"Password must be at least {min_len} characters"

    if len(password) > 128:
        return False, "Password must not exceed 128 characters"

    if not _UPPER_RE.search(password):
        return False, "Password must contain at least one uppercase letter"

    if not _LOWER_RE.search(password):
        return False, "Password must contain at least one lowercase letter"

    if not _DIGIT_RE.search(password):
        return False, "Password must contain at least one digit"

    if not _SPECIAL_RE.search(password):
        return False, "Password must contain at least one special character"

    # Reject common patterns
    lower = password.lower()
    weak_patterns = [
        "password", "12345678", "qwerty", "letmein",
        "welcome", "admin123", "changeme", "G4Lite",
    ]
    for pattern in weak_patterns:
        if pattern in lower:
            return False, "Password contains a commonly-used pattern"

    return True, ""


# ---------------------------------------------------------------------------
# JWT creation & decoding
# ---------------------------------------------------------------------------

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a signed JWT.

    The ``sub`` claim must be a stringified user ID.
    An ``iat`` claim is always set for token-age auditing.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT.

    Raises ``HTTPException 401`` on any failure (expired, tampered, malformed).
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError as exc:
        logger.debug("JWT decode failure: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ---------------------------------------------------------------------------
# FastAPI auth dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Core auth dependency.

    Validates the JWT, loads the user, checks active + lock status,
    and performs a throttled ``last_active_at`` update so we don't
    write to the DB on every single request.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)  # raises 401 on failure

    sub = payload.get("sub")
    if sub is None:
        raise credentials_exception

    try:
        user_id = int(sub)
    except (ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    # --- Active check ---
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated",
        )

    # --- Lock check ---
    if user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is temporarily locked",
        )

    # --- Throttled last_active_at update ---
    await _maybe_update_last_active(db, user)

    return user


async def _maybe_update_last_active(
    db: AsyncSession,
    user: User,
) -> None:
    """
    Update ``last_active_at`` at most once per throttle window.

    Uses a lightweight UPDATE instead of modifying the ORM instance to
    avoid accidentally flushing unrelated dirty state.
    """
    now = datetime.now(timezone.utc)
    throttle = settings.LAST_ACTIVE_THROTTLE_SECONDS

    if (
        user.last_active_at is not None
        and (now - user.last_active_at).total_seconds() < throttle
    ):
        return

    try:
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(last_active_at=now)
        )
        await db.commit()
    except Exception:
        # Non-critical — never let activity tracking break a request
        await db.rollback()
        logger.debug(
            "Failed to update last_active_at for user %s", user.id
        )


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency that restricts a route to admin users only."""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def require_role(*roles: UserRole) -> Callable:
    """
    Generic role dependency factory.

    Usage::

        @router.get("/reports", dependencies=[Depends(require_role(UserRole.admin, UserRole.viewer))])
        async def get_reports(...): ...
    """
    allowed = set(roles)

    async def _check(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed:
            role_names = ", ".join(r.value for r in allowed)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {role_names}",
            )
        return current_user

    return _check


async def require_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Explicit active + unlocked check dependency.

    ``get_current_user`` already enforces this, but this dependency is
    available for routes that want to declare the requirement
    declaratively in their signature for clarity.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated",
        )
    if current_user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is temporarily locked",
        )
    return current_user


# ---------------------------------------------------------------------------
# Input sanitisation
# ---------------------------------------------------------------------------

def sanitise_string(value: str) -> str:
    """
    Sanitise a user-supplied string.

    - Strips leading/trailing whitespace
    - Removes null bytes
    - Collapses consecutive whitespace into a single space
    """
    value = _NULL_BYTE_RE.sub("", value)
    value = value.strip()
    value = _MULTI_SPACE_RE.sub(" ", value)
    return value


def sanitise_strings(data: dict, fields: Sequence[str]) -> dict:
    """
    Sanitise multiple string fields on a dict in-place.

    Non-string or missing fields are silently skipped.
    """
    for field in fields:
        val = data.get(field)
        if isinstance(val, str):
            data[field] = sanitise_string(val)
    return data