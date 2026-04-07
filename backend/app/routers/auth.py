"""
g4lite — Auth Router
=======================

Authentication, session management, password lifecycle, profile
management, and notification preferences.

Security features:
- Account lockout with escalating duration after failed attempts
- Login tracking: IP, timestamp, cumulative count
- Password change with reuse prevention
- Admin-initiated password reset (forces change on next login)
- Forced password change on first login
- Active session refresh with sliding expiry

Lockout escalation:
  Attempt 1–4  → warning only
  Attempt 5    → locked 5 minutes
  Attempt 6    → locked 15 minutes
  Attempt 7    → locked 60 minutes
  Attempt 8+   → account disabled (admin must reactivate)

All auth error messages are intentionally vague ("incorrect username
or password") to prevent user enumeration. Lockout state is the one
exception — the user is told their account is locked so they know to
wait or contact an admin.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserResponse
from app.utils.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────
# Auth-specific request/response models. Generic user schemas remain
# in schemas/user.py.


class PasswordChangeRequest(BaseModel):
    """User-initiated password change."""

    current_password: str = Field(
        ...,
        min_length=1,
        description="Current password for verification",
    )
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password (min 8 characters)",
    )

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Enforce minimum password complexity."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_upper and has_lower and has_digit):
            raise ValueError(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, and one digit"
            )
        return v


class AdminPasswordResetRequest(BaseModel):
    """Admin-initiated password reset for another user."""

    user_id: int
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
    )


class ProfileUpdateRequest(BaseModel):
    """User self-service profile update."""

    full_name: Optional[str] = Field(None, min_length=2, max_length=120)
    email: Optional[str] = Field(None, max_length=255)
    rank: Optional[str] = Field(None, max_length=50)
    unit: Optional[str] = Field(None, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=30)
    timezone: Optional[str] = Field(None, max_length=50)
    bio: Optional[str] = Field(None, max_length=500)


class NotificationPreferencesRequest(BaseModel):
    """Update notification preferences."""

    notify_in_app: Optional[bool] = None
    notify_overdue: Optional[bool] = None
    notify_low_stock: Optional[bool] = None
    notify_resupply: Optional[bool] = None
    notify_signouts: Optional[bool] = None
    notify_access: Optional[bool] = None


class NotificationPreferencesResponse(BaseModel):
    """Current notification preferences."""

    in_app: bool
    overdue: bool
    low_stock: bool
    resupply: bool
    signouts: bool
    access: bool


class AuthStatusResponse(BaseModel):
    """Extended auth status with session metadata."""

    user: UserResponse
    access_token: str
    must_change_password: bool
    login_count: int
    last_login_at: Optional[datetime] = None
    password_age_days: Optional[int] = None


# ── Lockout configuration ─────────────────────────────────────────

MAX_FAILED_ATTEMPTS = 8
LOCKOUT_DURATIONS: dict[int, timedelta] = {
    5: timedelta(minutes=5),
    6: timedelta(minutes=15),
    7: timedelta(minutes=60),
}
# Attempt 8+ → account disabled (no timed lockout, admin must intervene)


def _get_lockout_duration(attempt_count: int) -> timedelta | None:
    """Return lockout duration for the given failed attempt count.
    Returns None if no lockout (attempts 1–4) or if account should
    be disabled (8+)."""
    return LOCKOUT_DURATIONS.get(attempt_count)


def _extract_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind nginx."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Routes ────────────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=AuthStatusResponse,
    summary="Authenticate and receive access token",
)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthStatusResponse:
    """Authenticate with username and password.

    On success: returns JWT access token, user profile, and session
    metadata. Resets failed login counter.

    On failure: increments failed login counter. After 5 consecutive
    failures, the account is locked with escalating duration.
    After 8 failures, the account is disabled entirely.
    """
    now = datetime.now(timezone.utc)
    client_ip = _extract_client_ip(request)

    # ── Find user ─────────────────────────────────────────────────
    result = await db.execute(
        select(User).where(User.username == body.username)
    )
    user = result.scalar_one_or_none()

    if not user:
        # Don't reveal whether username exists
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    # ── Check account active ──────────────────────────────────────
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact an administrator.",
        )

    # ── Check lockout ─────────────────────────────────────────────
    if user.locked_until and now < user.locked_until:
        remaining = user.locked_until - now
        minutes_left = max(1, int(remaining.total_seconds() / 60))
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=(
                f"Account is temporarily locked. "
                f"Try again in {minutes_left} minute{'s' if minutes_left != 1 else ''}."
            ),
        )

    # ── Verify password ───────────────────────────────────────────
    if not verify_password(body.password, user.hashed_password):
        # Increment failed attempts
        user.failed_login_count += 1
        attempt = user.failed_login_count

        if attempt >= MAX_FAILED_ATTEMPTS:
            # Disable account — admin must reactivate
            user.is_active = False
            user.deactivated_at = now
            user.deactivation_reason = (
                f"Auto-disabled after {attempt} consecutive failed login attempts "
                f"from IP {client_ip}"
            )
            user.locked_until = None
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Account has been disabled due to too many failed login attempts. "
                    "Contact an administrator."
                ),
            )

        lockout_duration = _get_lockout_duration(attempt)
        if lockout_duration:
            user.locked_until = now + lockout_duration
            await db.commit()
            minutes = int(lockout_duration.total_seconds() / 60)
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=(
                    f"Account locked for {minutes} minutes after "
                    f"{attempt} failed attempts."
                ),
            )

        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    # ── Success — reset counters, track session ───────────────────
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    user.last_login_ip = client_ip
    user.last_active_at = now
    user.login_count += 1

    await db.commit()
    await db.refresh(user)

    # ── Generate token ────────────────────────────────────────────
    token = create_access_token(data={"sub": str(user.id)})

    # ── Calculate password age ────────────────────────────────────
    password_age_days = None
    if user.password_changed_at:
        password_age_days = (now - user.password_changed_at).days

    return AuthStatusResponse(
        user=UserResponse.model_validate(user),
        access_token=token,
        must_change_password=user.must_change_password,
        login_count=user.login_count,
        last_login_at=user.last_login_at,
        password_age_days=password_age_days,
    )


@router.post(
    "/refresh",
    response_model=AuthStatusResponse,
    summary="Refresh access token",
)
async def refresh_token(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuthStatusResponse:
    """Refresh an existing valid token. Updates last_active_at.
    Returns a new token with fresh expiry."""
    now = datetime.now(timezone.utc)
    current_user.last_active_at = now
    await db.commit()

    token = create_access_token(data={"sub": str(current_user.id)})

    password_age_days = None
    if current_user.password_changed_at:
        password_age_days = (now - current_user.password_changed_at).days

    return AuthStatusResponse(
        user=UserResponse.model_validate(current_user),
        access_token=token,
        must_change_password=current_user.must_change_password,
        login_count=current_user.login_count,
        last_login_at=current_user.last_login_at,
        password_age_days=password_age_days,
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the authenticated user's full profile."""
    return UserResponse.model_validate(current_user)


# ── Password management ──────────────────────────────────────────


@router.post(
    "/change-password",
    summary="Change your own password",
)
async def change_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Change the current user's password.

    Requires the current password for verification.
    Prevents reuse of the immediately previous password.
    Resets the must_change_password flag.
    """
    # Verify current password
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Prevent same password
    if verify_password(body.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    # Prevent reuse of previous password
    if (
        current_user.last_password_hash
        and verify_password(body.new_password, current_user.last_password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as your previous password",
        )

    # Update password
    now = datetime.now(timezone.utc)
    current_user.last_password_hash = current_user.hashed_password
    current_user.hashed_password = hash_password(body.new_password)
    current_user.password_changed_at = now
    current_user.must_change_password = False

    await db.commit()

    return {"detail": "Password changed successfully"}


@router.post(
    "/admin/reset-password",
    summary="Admin: reset another user's password",
)
async def admin_reset_password(
    body: AdminPasswordResetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reset another user's password. Admin only.

    Sets must_change_password=True so the user is forced to set their
    own password on next login. Cannot reset your own password via this
    endpoint — use /change-password instead.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    if body.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use /change-password to change your own password",
        )

    result = await db.execute(
        select(User).where(User.id == body.user_id)
    )
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    now = datetime.now(timezone.utc)
    target_user.last_password_hash = target_user.hashed_password
    target_user.hashed_password = hash_password(body.new_password)
    target_user.password_changed_at = now
    target_user.must_change_password = True

    # If account was locked from failed attempts, unlock it
    target_user.failed_login_count = 0
    target_user.locked_until = None

    # If account was auto-disabled, reactivate it
    if not target_user.is_active and target_user.deactivation_reason and \
       "failed login" in target_user.deactivation_reason.lower():
        target_user.is_active = True
        target_user.deactivated_at = None
        target_user.deactivated_by = None
        target_user.deactivation_reason = None

    await db.commit()

    return {
        "detail": f"Password reset for user '{target_user.username}'",
        "must_change_password": True,
    }


@router.post(
    "/admin/unlock-account",
    summary="Admin: unlock a locked account",
)
async def admin_unlock_account(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Unlock a locked user account and reset the failed attempt counter.
    Admin only."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    target_user.failed_login_count = 0
    target_user.locked_until = None

    # Reactivate if auto-disabled from failed logins
    if not target_user.is_active and target_user.deactivation_reason and \
       "failed login" in target_user.deactivation_reason.lower():
        target_user.is_active = True
        target_user.deactivated_at = None
        target_user.deactivated_by = None
        target_user.deactivation_reason = None

    await db.commit()

    return {
        "detail": f"Account unlocked for user '{target_user.username}'",
        "failed_login_count": 0,
        "is_active": target_user.is_active,
    }


# ── Profile management ───────────────────────────────────────────


@router.put(
    "/profile",
    response_model=UserResponse,
    summary="Update your own profile",
)
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update the current user's profile fields.

    Only provided (non-null) fields are updated. Username and role
    cannot be changed via this endpoint.
    """
    update_data = body.model_dump(exclude_unset=True, exclude_none=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Email uniqueness check
    if "email" in update_data:
        existing = await db.execute(
            select(User).where(
                User.email == update_data["email"],
                User.id != current_user.id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address is already in use",
            )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)

    return UserResponse.model_validate(current_user)


# ── Notification preferences ─────────────────────────────────────


@router.get(
    "/notifications/preferences",
    response_model=NotificationPreferencesResponse,
    summary="Get notification preferences",
)
async def get_notification_preferences(
    current_user: User = Depends(get_current_user),
) -> NotificationPreferencesResponse:
    """Return the current user's notification preferences."""
    return NotificationPreferencesResponse(
        in_app=current_user.notify_in_app,
        overdue=current_user.notify_overdue,
        low_stock=current_user.notify_low_stock,
        resupply=current_user.notify_resupply,
        signouts=current_user.notify_signouts,
        access=current_user.notify_access,
    )


@router.put(
    "/notifications/preferences",
    response_model=NotificationPreferencesResponse,
    summary="Update notification preferences",
)
async def update_notification_preferences(
    body: NotificationPreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationPreferencesResponse:
    """Update the current user's notification preferences.

    Only provided (non-null) fields are updated.
    """
    update_data = body.model_dump(exclude_unset=True, exclude_none=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No preferences to update",
        )

    # Map request fields to model fields
    field_map = {
        "notify_in_app": "notify_in_app",
        "notify_overdue": "notify_overdue",
        "notify_low_stock": "notify_low_stock",
        "notify_resupply": "notify_resupply",
        "notify_signouts": "notify_signouts",
        "notify_access": "notify_access",
    }

    for field, value in update_data.items():
        model_field = field_map.get(field, field)
        setattr(current_user, model_field, value)

    await db.commit()
    await db.refresh(current_user)

    return NotificationPreferencesResponse(
        in_app=current_user.notify_in_app,
        overdue=current_user.notify_overdue,
        low_stock=current_user.notify_low_stock,
        resupply=current_user.notify_resupply,
        signouts=current_user.notify_signouts,
        access=current_user.notify_access,
    )