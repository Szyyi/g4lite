"""
G4Lite — Notification Model
=============================

In-app notification system with priority levels, targeted delivery,
deep-link actions, expiry, and acknowledgement workflow.

Design decisions:

TYPES
The original 4 types expand to 14 to cover every auditable event in
the platform. Types are grouped by category for frontend filtering:

  INVENTORY   — signout, return, return_damaged, return_condemned,
                overdue, low_stock, item_condition_change
  RESUPPLY    — resupply_request, resupply_status_change
  ACCESS      — access_granted, access_denied, access_pin_expired
  ADMIN       — user_account, system_alert

PRIORITY
Four levels: low, normal, high, critical.
- `low` / `normal` — standard bell icon, read at leisure
- `high` — visual emphasis in the notification list, may trigger
  a toast on delivery
- `critical` — persists until explicitly acknowledged (not just read),
  visual prominence, cannot be bulk-dismissed

TARGETING
Notifications can target:
1. A specific user by `recipient_id`
2. All users with a given role via `recipient_role`
3. Both (role-wide broadcast that also tags a specific user)

The frontend queries notifications where:
  recipient_id = current_user.id  OR
  (recipient_id IS NULL AND recipient_role IN (current_user.role, 'all'))

READ vs ACKNOWLEDGED
- `is_read` — user has seen the notification (clicked or opened panel)
- `is_acknowledged` — user has explicitly confirmed a critical notification.
  Only relevant for `priority = critical`. This prevents admins from
  accidentally bulk-dismissing a critical overdue or damage report.

EXPIRY
`expires_at` allows time-sensitive notifications (e.g. access PIN
generated — expires in 15 minutes) to auto-hide from the list.
Expired notifications are excluded from unread counts.

ACTION DEEP-LINKS
`action_url` stores a relative path (e.g. '/inventory/42', '/admin/signouts')
so clicking a notification navigates directly to the relevant resource.
`action_label` provides the button text (e.g. 'View Item', 'Review Request').

SOURCE TRACKING
`source_service` records which backend service generated the notification
(e.g. 'signout_service', 'overdue_checker', 'access_control'). Useful for
debugging and audit.
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
    from app.models.user import User


# ── Enums ─────────────────────────────────────────────────────────


class NotificationType(str, enum.Enum):
    """All event types that generate notifications."""

    # Inventory events
    signout = "signout"
    return_ok = "return_ok"
    return_damaged = "return_damaged"
    return_condemned = "return_condemned"
    overdue = "overdue"
    low_stock = "low_stock"
    item_condition_change = "item_condition_change"

    # Resupply events
    resupply_request = "resupply_request"
    resupply_status_change = "resupply_status_change"

    # Access control events
    access_granted = "access_granted"
    access_denied = "access_denied"
    access_pin_expired = "access_pin_expired"

    # Admin / system events
    user_account = "user_account"
    system_alert = "system_alert"


class NotificationPriority(str, enum.Enum):
    """Severity level controlling visual treatment and dismiss behaviour."""

    low = "low"
    normal = "normal"
    high = "high"
    critical = "critical"


class NotificationCategory(str, enum.Enum):
    """Grouping for frontend filter tabs."""

    inventory = "inventory"
    resupply = "resupply"
    access = "access"
    admin = "admin"


# ── Type → Category mapping (used by notification service) ────────

NOTIFICATION_TYPE_CATEGORY: dict[NotificationType, NotificationCategory] = {
    NotificationType.signout: NotificationCategory.inventory,
    NotificationType.return_ok: NotificationCategory.inventory,
    NotificationType.return_damaged: NotificationCategory.inventory,
    NotificationType.return_condemned: NotificationCategory.inventory,
    NotificationType.overdue: NotificationCategory.inventory,
    NotificationType.low_stock: NotificationCategory.inventory,
    NotificationType.item_condition_change: NotificationCategory.inventory,
    NotificationType.resupply_request: NotificationCategory.resupply,
    NotificationType.resupply_status_change: NotificationCategory.resupply,
    NotificationType.access_granted: NotificationCategory.access,
    NotificationType.access_denied: NotificationCategory.access,
    NotificationType.access_pin_expired: NotificationCategory.access,
    NotificationType.user_account: NotificationCategory.admin,
    NotificationType.system_alert: NotificationCategory.admin,
}

# ── Type → default priority (overridable at creation) ─────────────

NOTIFICATION_TYPE_DEFAULT_PRIORITY: dict[NotificationType, NotificationPriority] = {
    NotificationType.signout: NotificationPriority.normal,
    NotificationType.return_ok: NotificationPriority.low,
    NotificationType.return_damaged: NotificationPriority.high,
    NotificationType.return_condemned: NotificationPriority.critical,
    NotificationType.overdue: NotificationPriority.high,
    NotificationType.low_stock: NotificationPriority.high,
    NotificationType.item_condition_change: NotificationPriority.normal,
    NotificationType.resupply_request: NotificationPriority.normal,
    NotificationType.resupply_status_change: NotificationPriority.normal,
    NotificationType.access_granted: NotificationPriority.low,
    NotificationType.access_denied: NotificationPriority.high,
    NotificationType.access_pin_expired: NotificationPriority.low,
    NotificationType.user_account: NotificationPriority.normal,
    NotificationType.system_alert: NotificationPriority.critical,
}


# ── Model ─────────────────────────────────────────────────────────


class Notification(Base):
    """In-app notification with priority, targeting, and acknowledgement."""

    __tablename__ = "notifications"

    # ── Primary key ───────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    # ── Classification ────────────────────────────────────────────
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type_enum"),
        nullable=False,
        comment="Event type that triggered this notification",
    )
    category: Mapped[NotificationCategory] = mapped_column(
        Enum(NotificationCategory, name="notification_category_enum"),
        nullable=False,
        comment="Grouping for frontend filter tabs",
    )
    priority: Mapped[NotificationPriority] = mapped_column(
        Enum(NotificationPriority, name="notification_priority_enum"),
        nullable=False,
        default=NotificationPriority.normal,
        comment="Severity: low, normal, high, critical",
    )

    # ── Content ───────────────────────────────────────────────────
    title: Mapped[str] = mapped_column(
        String(250),
        nullable=False,
        comment="Short headline, e.g. 'Equipment signed out'",
    )
    body: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Detailed message body",
    )
    icon: Mapped[Optional[str]] = mapped_column(
        String(60),
        nullable=True,
        default=None,
        comment="MUI icon identifier override. Null = auto from type.",
    )

    # ── Targeting ─────────────────────────────────────────────────
    recipient_role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="admin",
        comment="Target role: 'admin', 'user', or 'all'",
    )
    recipient_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        default=None,
        index=True,
        comment="Specific user target. NULL = role-wide broadcast.",
    )

    # ── Related entity (polymorphic FK) ───────────────────────────
    related_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=None,
        comment="PK of the related entity (item, signout, resupply, user, etc.)",
    )
    related_type: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        default=None,
        comment="Entity type: 'item', 'signout', 'resupply', 'user', 'access_log'",
    )

    # ── Action deep-link ──────────────────────────────────────────
    action_url: Mapped[Optional[str]] = mapped_column(
        String(300),
        nullable=True,
        default=None,
        comment="Relative URL for click-through, e.g. '/inventory/42'",
    )
    action_label: Mapped[Optional[str]] = mapped_column(
        String(60),
        nullable=True,
        default=None,
        comment="Button text, e.g. 'View Item', 'Review Request'",
    )

    # ── State ─────────────────────────────────────────────────────
    is_read: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
        comment="User has seen this notification",
    )
    read_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp when marked as read",
    )
    is_acknowledged: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Explicit confirmation for critical notifications",
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp when explicitly acknowledged",
    )
    acknowledged_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        comment="User who acknowledged (may differ from recipient for admin actions)",
    )

    # ── Expiry ────────────────────────────────────────────────────
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Auto-hide after this time. NULL = never expires.",
    )

    # ── Source tracking ───────────────────────────────────────────
    source_service: Mapped[Optional[str]] = mapped_column(
        String(80),
        nullable=True,
        default=None,
        comment="Backend service that generated this, e.g. 'signout_service'",
    )
    triggered_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        comment="User whose action triggered this notification",
    )

    # ── Audit ─────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # ── Relationships ─────────────────────────────────────────────
    recipient: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[recipient_id],
        lazy="noload",
    )
    acknowledger: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[acknowledged_by],
        lazy="noload",
    )
    trigger_user: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[triggered_by],
        lazy="noload",
    )

    # ── Table constraints ─────────────────────────────────────────
    __table_args__ = (
        # Recipient role must be valid
        CheckConstraint(
            "recipient_role IN ('admin', 'user', 'all')",
            name="ck_notification_recipient_role",
        ),

        # Related type must be a known entity
        CheckConstraint(
            "related_type IS NULL OR related_type IN "
            "('item', 'signout', 'resupply', 'user', 'access_log', 'category')",
            name="ck_notification_related_type",
        ),

        # If acknowledged, must have a timestamp
        CheckConstraint(
            "NOT is_acknowledged OR acknowledged_at IS NOT NULL",
            name="ck_notification_ack_has_timestamp",
        ),

        # If read, must have a timestamp
        CheckConstraint(
            "NOT is_read OR read_at IS NOT NULL",
            name="ck_notification_read_has_timestamp",
        ),

        # Primary query: unread notifications for a user, newest first
        Index(
            "ix_notification_recipient_unread",
            "recipient_id",
            "is_read",
            "created_at",
        ),

        # Role-broadcast query: unread notifications by role
        Index(
            "ix_notification_role_unread",
            "recipient_role",
            "is_read",
            "created_at",
        ),

        # Filter by category
        Index(
            "ix_notification_category_created",
            "category",
            "created_at",
        ),

        # Expiry cleanup query
        Index(
            "ix_notification_expires",
            "expires_at",
        ),

        # Critical unacknowledged — dashboard alert query
        Index(
            "ix_notification_critical_unacked",
            "priority",
            "is_acknowledged",
            "created_at",
        ),
    )

    # ── Computed properties ───────────────────────────────────────
    @property
    def is_expired(self) -> bool:
        """True if notification has passed its expiry time."""
        if self.expires_at is None:
            return False
        from datetime import timezone
        return datetime.now(timezone.utc) > self.expires_at

    @property
    def requires_acknowledgement(self) -> bool:
        """True if this is a critical notification not yet acknowledged."""
        return (
            self.priority == NotificationPriority.critical
            and not self.is_acknowledged
        )

    @property
    def is_actionable(self) -> bool:
        """True if there is a deep-link the user can click through to."""
        return self.action_url is not None

    @property
    def auto_category(self) -> NotificationCategory:
        """Derive category from type (used if category wasn't set explicitly)."""
        return NOTIFICATION_TYPE_CATEGORY.get(
            self.type, NotificationCategory.admin
        )

    @property
    def auto_priority(self) -> NotificationPriority:
        """Derive default priority from type."""
        return NOTIFICATION_TYPE_DEFAULT_PRIORITY.get(
            self.type, NotificationPriority.normal
        )

    def __repr__(self) -> str:
        return (
            f"<Notification(id={self.id}, type='{self.type.value}', "
            f"priority='{self.priority.value}', read={self.is_read}, "
            f"recipient_id={self.recipient_id})>"
        )