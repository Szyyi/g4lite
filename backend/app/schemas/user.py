"""
G4Lite — User & Auth Schemas
================================

Pydantic request/response models for authentication, user account
management, profile updates, password lifecycle, notification
preferences, and user statistics.

These schemas serve two routers:
- /api/auth   (login, refresh, password, profile, preferences)
- /api/users  (admin CRUD, role management, activity)

Organisation:
- Enums (sort fields, re-exported role from model)
- Auth schemas (login, token, password change/reset)
- Profile schemas (self-service update, notification prefs)
- Admin schemas (create, update, role change, deactivation)
- Response schemas (standard, detail with activity, paginated)
- Dashboard schemas (stats, activity)
- Helper function (ORM → response mapping)
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Re-export model enum for router convenience
from app.models.user import UserRole

__all__ = [
    # Enums
    "UserRole",
    "UserSortField",
    # Auth
    "LoginRequest",
    "TokenResponse",
    "AuthStatusResponse",
    "PasswordChangeRequest",
    "AdminPasswordResetRequest",
    # Profile
    "ProfileUpdateRequest",
    "NotificationPreferencesRequest",
    "NotificationPreferencesResponse",
    # Admin
    "UserCreate",
    "UserUpdate",
    "RoleChange",
    "DeactivationRequest",
    # Response
    "UserResponse",
    "UserDetailResponse",
    "PaginatedUsers",
    # Dashboard
    "UserStats",
    "UserActivity",
    # Helper
    "user_to_response",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ENUMS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class UserSortField(str, Enum):
    """Allowed sort fields for the user list endpoint."""

    full_name = "full_name"
    username = "username"
    role = "role"
    created_at = "created_at"
    last_login_at = "last_login_at"
    last_active_at = "last_active_at"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  AUTH SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class LoginRequest(BaseModel):
    """Username/password authentication request."""

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Login username",
    )
    password: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Account password",
    )


class TokenResponse(BaseModel):
    """JWT token response — returned on login and refresh.

    Maintained for backward compatibility with Phase 1 frontend.
    New frontend should prefer AuthStatusResponse.
    """

    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class AuthStatusResponse(BaseModel):
    """Extended auth response with session metadata.

    Returned by login and refresh endpoints. Gives the frontend
    everything it needs to set up the session: token, user profile,
    password change requirement, and session history.
    """

    user: UserResponse
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool = False
    login_count: int = 0
    last_login_at: Optional[datetime] = None
    password_age_days: Optional[int] = None


class PasswordChangeRequest(BaseModel):
    """User-initiated password change.

    Requires the current password for verification. Enforces
    complexity: uppercase + lowercase + digit, minimum 8 characters.
    Prevents reuse of current and immediately previous password.
    """

    current_password: str = Field(
        ...,
        min_length=1,
        description="Current password for verification",
    )
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="New password (min 8 chars, mixed case + digit)",
    )

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
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
    """Admin-initiated password reset for another user.

    Sets must_change_password=True so the user is forced to choose
    their own password on next login. Also unlocks the account if
    it was locked from failed attempts.
    """

    user_id: int
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Temporary password (user forced to change on login)",
    )

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_upper and has_lower and has_digit):
            raise ValueError(
                "Password must contain uppercase, lowercase, and digit"
            )
        return v


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PROFILE SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ProfileUpdateRequest(BaseModel):
    """User self-service profile update via /api/auth/profile.

    Only provided (non-null) fields are updated. Username and role
    cannot be changed via this endpoint.
    """

    full_name: Optional[str] = Field(None, min_length=2, max_length=120)
    email: Optional[str] = Field(None, max_length=255)
    rank: Optional[str] = Field(None, max_length=50)
    unit: Optional[str] = Field(None, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=30)
    timezone: Optional[str] = Field(None, max_length=50)
    bio: Optional[str] = Field(None, max_length=500)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.lower().strip()
            if "@" not in v or "." not in v.split("@")[-1]:
                raise ValueError("Invalid email format")
        return v


class NotificationPreferencesRequest(BaseModel):
    """Update notification preference toggles.

    Only provided (non-null) fields are updated. Aligns with the
    6 boolean preference columns on the User model.
    """

    notify_in_app: Optional[bool] = Field(
        None, description="Master toggle for in-app notifications"
    )
    notify_overdue: Optional[bool] = Field(
        None, description="Receive overdue sign-out alerts"
    )
    notify_low_stock: Optional[bool] = Field(
        None, description="Receive low-stock warnings"
    )
    notify_resupply: Optional[bool] = Field(
        None, description="Receive resupply request notifications"
    )
    notify_signouts: Optional[bool] = Field(
        None, description="Receive sign-out/return notifications"
    )
    notify_access: Optional[bool] = Field(
        None, description="Receive access control notifications"
    )


class NotificationPreferencesResponse(BaseModel):
    """Current notification preference state."""

    in_app: bool
    overdue: bool
    low_stock: bool
    resupply: bool
    signouts: bool
    access: bool


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class UserCreate(BaseModel):
    """Admin creates a new user account.

    Enforces username format (lowercase alphanumeric + underscores),
    email format, password complexity, and role validation.
    All new accounts have must_change_password=True.
    """

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        pattern=r"^[a-z0-9_]+$",
        description="Lowercase alphanumeric + underscores only",
    )
    email: str = Field(
        ...,
        max_length=255,
        description="Email address (auto-lowercased)",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Initial password (user forced to change on first login)",
    )
    full_name: str = Field(
        ...,
        min_length=2,
        max_length=120,
    )
    rank: Optional[str] = Field(None, max_length=50)
    role: str = Field(
        "user",
        description="admin, user, or viewer",
    )
    service_number: Optional[str] = Field(
        None,
        max_length=30,
        description="Military or organisational service/staff number",
    )
    unit: Optional[str] = Field(
        None,
        max_length=100,
        description="Unit, team, or department",
    )
    contact_number: Optional[str] = Field(
        None,
        max_length=30,
    )
    timezone: str = Field(
        "Europe/London",
        max_length=50,
        description="IANA timezone identifier",
    )

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"admin", "user", "viewer"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.lower().strip()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_upper and has_lower and has_digit):
            raise ValueError(
                "Password must contain uppercase, lowercase, and digit"
            )
        return v


class UserUpdate(BaseModel):
    """Admin updates user metadata. Partial update.

    Does NOT change role (use /role endpoint) or password
    (use /auth/admin/reset-password).
    """

    full_name: Optional[str] = Field(None, min_length=2, max_length=120)
    email: Optional[str] = Field(None, max_length=255)
    rank: Optional[str] = Field(None, max_length=50)
    service_number: Optional[str] = Field(None, max_length=30)
    unit: Optional[str] = Field(None, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=30)
    timezone: Optional[str] = Field(None, max_length=50)
    bio: Optional[str] = Field(None, max_length=500)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.lower().strip()
            if "@" not in v or "." not in v.split("@")[-1]:
                raise ValueError("Invalid email format")
        return v


class RoleChange(BaseModel):
    """Change a user's role. Dedicated endpoint because role changes
    have admin-count and last-admin protection logic."""

    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"admin", "user", "viewer"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(sorted(allowed))}")
        return v


class DeactivationRequest(BaseModel):
    """Deactivate a user account with mandatory reason."""

    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Justification for deactivating the account",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RESPONSE SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class UserResponse(BaseModel):
    """Standard user data returned from the API.

    Used in auth responses, user lists, and anywhere a user
    reference is needed. Includes computed properties from the
    User model (display_name, initials, is_locked, etc.).
    Never includes password hashes.
    """

    # Identity
    id: int
    username: str
    email: str
    full_name: str
    rank: Optional[str] = None
    role: str

    # Computed display
    display_name: str = ""
    display_role: str = ""
    initials: str = ""

    # Profile
    service_number: Optional[str] = None
    unit: Optional[str] = None
    contact_number: Optional[str] = None
    timezone: str = "Europe/London"
    bio: Optional[str] = None
    avatar_url: Optional[str] = None

    # Account state
    is_active: bool
    is_locked: bool = False
    must_change_password: bool = False

    # Session tracking
    last_login_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    login_count: int = 0

    # Notification preferences
    notification_preferences: dict = {}

    # Lifecycle
    created_at: datetime
    updated_at: Optional[datetime] = None
    deactivated_at: Optional[datetime] = None
    deactivation_reason: Optional[str] = None

    model_config = {"from_attributes": True}


class UserDetailResponse(UserResponse):
    """Extended user response with activity counts.

    Used by the admin user detail endpoint to provide a complete
    picture of the user's platform activity without separate calls.
    """

    active_signouts: int = 0
    total_signouts: int = 0
    overdue_signouts: int = 0
    pending_resupply: int = 0
    total_resupply: int = 0
    unread_notifications: int = 0


class UserBrief(BaseModel):
    """Lightweight user reference for embedding in other responses.

    Used when a response needs to reference a user (e.g. "approved by")
    without returning the full user object.
    """

    id: int
    username: str
    full_name: str
    rank: Optional[str] = None
    role: str
    display_name: str = ""
    initials: str = ""
    is_active: bool

    model_config = {"from_attributes": True}


class PaginatedUsers(BaseModel):
    """Paginated user list."""

    users: list[UserResponse]
    total: int
    page: int
    page_size: int
    pages: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DASHBOARD SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class UserStats(BaseModel):
    """Account statistics for the admin dashboard."""

    total_accounts: int
    active_accounts: int
    inactive_accounts: int
    admin_count: int
    user_count: int
    viewer_count: int
    locked_count: int
    must_change_password: int
    logged_in_today: int
    never_logged_in: int
    capacity_remaining: int = Field(
        0,
        description="How many more accounts can be created within the limit",
    )


class UserActivity(BaseModel):
    """Recent activity summary for a specific user.

    Returns the last N sign-outs, returns, and resupply requests
    as lightweight dicts (not full response objects) for the admin
    user detail activity tab.
    """

    recent_signouts: list[dict] = Field(
        default_factory=list,
        description="Recent sign-outs: [{id, ref, item_name, quantity, status, signed_out_at}]",
    )
    recent_returns: list[dict] = Field(
        default_factory=list,
        description="Recent returns: [{id, ref, item_name, quantity_returned, condition, returned_at}]",
    )
    recent_resupply: list[dict] = Field(
        default_factory=list,
        description="Recent requests: [{id, ref, item_name, quantity, status, priority, created_at}]",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HELPER: ORM → Response mapping
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def user_to_response(user) -> UserResponse:
    """Map a User ORM model to the API response schema.

    Centralised here so auth router, users router, and any services
    that need to return user data use consistent mapping logic.
    Never exposes password hashes or security internals.
    """
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        rank=user.rank,
        role=user.role.value,
        display_name=user.display_name,
        display_role=user.display_role,
        initials=user.initials,
        service_number=user.service_number,
        unit=user.unit,
        contact_number=user.contact_number,
        timezone=user.timezone,
        bio=user.bio,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        is_locked=user.is_locked,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
        last_active_at=user.last_active_at,
        login_count=user.login_count,
        notification_preferences=user.notification_preferences,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deactivated_at=user.deactivated_at,
        deactivation_reason=user.deactivation_reason,
    )


def user_to_brief(user) -> UserBrief:
    """Map a User ORM model to the lightweight brief schema."""
    return UserBrief(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        rank=user.rank,
        role=user.role.value,
        display_name=user.display_name,
        initials=user.initials,
        is_active=user.is_active,
    )