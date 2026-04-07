"""
g4lite — User Model
======================

Platform user account with security hardening, session tracking,
account lifecycle management, and notification preferences.

Design decisions:

ROLES
- `admin` — full CRUD on inventory, user management, sign-out oversight,
  resupply approval, access control management. Max 2 active admins.
- `user` — browse inventory, sign out equipment, return equipment,
  submit resupply requests. Max 10 active users.
- `viewer` (new) — read-only access to inventory and dashboards. Useful
  for commanders or logistics supervisors who need visibility without
  operational access. No sign-out or resupply capability.

SECURITY
- `failed_login_count` + `locked_until` — auto-lockout after N failed
  attempts (configurable, default 5). Lockout duration escalates:
  5 min → 15 min → 60 min → account disabled.
- `must_change_password` — forced on first login and after admin reset.
- `password_changed_at` — enables password age policies.
- `last_password_hash` — prevents immediate password reuse (stores
  previous hash only, not full history).

SESSION TRACKING
- `last_login_at` — updated on every successful authentication.
- `last_active_at` — updated by middleware on API activity (throttled
  to once per minute to avoid write storms).
- `login_count` — total successful logins for usage analytics.
- `last_login_ip` — forensic/audit information.

PROFILE
- `service_number` — military/organisational identifier.
- `unit` — team, squadron, or department.
- `contact_number` — for overdue follow-up and emergency contact.
- `avatar_url` — relative path to profile image.
- `timezone` — user's timezone for correct date display.

NOTIFICATION PREFERENCES
- `notify_in_app` — master toggle for in-app notifications (default on).
- `notify_overdue` — receive overdue alerts (default on for admins).
- `notify_low_stock` — receive low-stock warnings (default on for admins).
- `notify_resupply` — receive resupply request notifications.
These are stored as individual booleans rather than a JSON blob because
they need to be queryable (e.g. "find all users where notify_overdue = true").

ACCOUNT LIFECYCLE
- `is_active` — soft-delete / account disable flag.
- `deactivated_at` / `deactivated_by` / `deactivation_reason` — full
  audit trail on account deactivation.
- Admin accounts cannot self-deactivate (enforced by service layer).
- Deactivated users cannot authenticate but their historical sign-out
  and resupply records remain intact.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.signout import SignOut
    from app.models.resupply import ResupplyRequest
    from app.models.notification import Notification


# ── Enums ─────────────────────────────────────────────────────────


class UserRole(str, enum.Enum):
    """Platform access roles."""

    admin = "admin"
    user = "user"
    viewer = "viewer"


# ── Model ─────────────────────────────────────────────────────────


class User(Base):
    """Platform user account with security, profile, and preferences."""

    __tablename__ = "users"

    # ── Primary key ───────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    # ── Credentials ───────────────────────────────────────────────
    username: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
        comment="Login username, lowercase alphanumeric + underscores",
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
        comment="Email address for account recovery and notifications",
    )
    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="bcrypt hash of current password",
    )
    last_password_hash: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        default=None,
        comment="Previous password hash to prevent immediate reuse",
    )
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp of last password change",
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Force password change on next login (first login, admin reset)",
    )

    # ── Profile ───────────────────────────────────────────────────
    full_name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        comment="Display name used in UI, sign-out records, and reports",
    )
    rank: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        default=None,
        comment="Military rank or organisational title",
    )
    service_number: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        unique=True,
        default=None,
        comment="Military or organisational service/staff number",
    )
    unit: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        default=None,
        comment="Unit, team, squadron, or department",
    )
    contact_number: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        default=None,
        comment="Phone number for overdue follow-up",
    )
    avatar_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        default=None,
        comment="Relative path to profile image",
    )
    timezone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="Europe/London",
        comment="IANA timezone for date/time display",
    )
    bio: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        default=None,
        comment="Short bio or role description shown on profile",
    )

    # ── Role & permissions ────────────────────────────────────────
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum"),
        nullable=False,
        default=UserRole.user,
        index=True,
        comment="Platform access role: admin, user, viewer",
    )

    # ── Security — login tracking ─────────────────────────────────
    failed_login_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Consecutive failed login attempts since last success",
    )
    locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Account locked until this timestamp (null = not locked)",
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp of most recent successful login",
    )
    last_login_ip: Mapped[Optional[str]] = mapped_column(
        String(45),
        nullable=True,
        default=None,
        comment="IP address of most recent login (IPv4 or IPv6)",
    )
    last_active_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Last API activity timestamp (throttled updates)",
    )
    login_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total successful logins",
    )

    # ── Notification preferences ──────────────────────────────────
    notify_in_app: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Master toggle for in-app notifications",
    )
    notify_overdue: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Receive overdue sign-out alerts",
    )
    notify_low_stock: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Receive low-stock warnings",
    )
    notify_resupply: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Receive resupply request notifications",
    )
    notify_signouts: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Receive sign-out / return notifications",
    )
    notify_access: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Receive access control notifications",
    )

    # ── Account lifecycle ─────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
        comment="Account enabled. Inactive accounts cannot authenticate.",
    )
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp of account deactivation",
    )
    deactivated_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        comment="Admin who deactivated this account",
    )
    deactivation_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Reason for account deactivation",
    )

    # ── Audit ─────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        nullable=True,
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        comment="Admin who created this account",
    )

    # ── Relationships ─────────────────────────────────────────────
    signouts: Mapped[list["SignOut"]] = relationship(
        "SignOut",
        foreign_keys="SignOut.user_id",
        back_populates="user",
        lazy="noload",
        order_by="SignOut.signed_out_at.desc()",
    )
    resupply_requests: Mapped[list["ResupplyRequest"]] = relationship(
        "ResupplyRequest",
        foreign_keys="ResupplyRequest.requested_by",
        back_populates="requester",
        lazy="noload",
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        foreign_keys="Notification.recipient_id",
        back_populates="recipient",
        lazy="noload",
    )
    deactivator: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[deactivated_by],
        remote_side="User.id",
        lazy="noload",
    )
    creator: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[created_by],
        remote_side="User.id",
        lazy="noload",
    )

    # ── Table constraints ─────────────────────────────────────────
    __table_args__ = (
        # Username format: lowercase alphanumeric + underscores, 3–50 chars
        CheckConstraint(
            "username ~ '^[a-z0-9_]{3,50}$'",
            name="ck_user_username_format",
        ),

        # Email basic format check
        CheckConstraint(
            "email ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'",
            name="ck_user_email_format",
        ),

        # Full name must not be empty
        CheckConstraint(
            "length(trim(full_name)) >= 2",
            name="ck_user_full_name_length",
        ),

        # Failed login count must be non-negative
        CheckConstraint(
            "failed_login_count >= 0",
            name="ck_user_failed_login_positive",
        ),

        # Login count must be non-negative
        CheckConstraint(
            "login_count >= 0",
            name="ck_user_login_count_positive",
        ),

        # Timezone must not be empty
        CheckConstraint(
            "length(trim(timezone)) > 0",
            name="ck_user_timezone_not_empty",
        ),

        # If deactivated, must have a timestamp
        CheckConstraint(
            "is_active OR deactivated_at IS NOT NULL",
            name="ck_user_deactivation_has_timestamp",
        ),

        # Query indexes
        Index("ix_user_role_active", "role", "is_active"),
        Index("ix_user_active_name", "is_active", "full_name"),
        Index("ix_user_last_active", "last_active_at"),
    )

    # ── Computed properties ───────────────────────────────────────
    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.admin

    @property
    def is_viewer(self) -> bool:
        return self.role == UserRole.viewer

    @property
    def can_sign_out(self) -> bool:
        """True if user role permits signing out equipment."""
        return self.role in (UserRole.admin, UserRole.user) and self.is_active

    @property
    def can_approve(self) -> bool:
        """True if user can approve sign-outs and resupply requests."""
        return self.role == UserRole.admin and self.is_active

    @property
    def is_locked(self) -> bool:
        """True if account is currently locked due to failed login attempts."""
        if self.locked_until is None:
            return False
        from datetime import timezone
        return datetime.now(timezone.utc) < self.locked_until

    @property
    def display_name(self) -> str:
        """Formatted name with rank prefix if available."""
        if self.rank:
            return f"{self.rank} {self.full_name}"
        return self.full_name

    @property
    def display_role(self) -> str:
        """Human-friendly role label."""
        return {
            UserRole.admin: "Administrator",
            UserRole.user: "Standard User",
            UserRole.viewer: "Viewer",
        }.get(self.role, self.role.value)

    @property
    def initials(self) -> str:
        """Two-letter initials for avatar fallback."""
        parts = self.full_name.strip().split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return self.full_name[:2].upper()

    @property
    def notification_preferences(self) -> dict[str, bool]:
        """All notification preferences as a dict for API responses."""
        return {
            "in_app": self.notify_in_app,
            "overdue": self.notify_overdue,
            "low_stock": self.notify_low_stock,
            "resupply": self.notify_resupply,
            "signouts": self.notify_signouts,
            "access": self.notify_access,
        }

    def __repr__(self) -> str:
        return (
            f"<User(id={self.id}, username='{self.username}', "
            f"role='{self.role.value}', active={self.is_active})>"
        )