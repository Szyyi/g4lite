"""
G4Lite — Notification Schemas
=================================

Pydantic request/response models for the notification system.
Covers listing, filtering, read/acknowledge state management,
bulk operations, admin broadcast, and statistics.

Organisation:
- Response schemas (single, paginated, unread counts)
- Request schemas (bulk dismiss, broadcast, acknowledge)
- Dashboard schemas (stats)
- Re-exports of model enums for router convenience
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

# Re-export model enums so routers can import everything from schemas
from app.models.notification import (
    NotificationCategory,
    NotificationPriority,
    NotificationType,
)

__all__ = [
    # Enums (re-exported from model)
    "NotificationType",
    "NotificationCategory",
    "NotificationPriority",
    # Response
    "NotificationResponse",
    "PaginatedNotifications",
    "UnreadCounts",
    # Request
    "BulkDismissRequest",
    "BroadcastRequest",
    # Dashboard
    "NotificationStats",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RESPONSE SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class NotificationResponse(BaseModel):
    """Full notification data returned from the API.

    Includes stored fields plus computed properties from the
    Notification model (requires_acknowledgement, is_expired, etc.).
    """

    # Identity
    id: int
    type: str
    category: str
    priority: str

    # Content
    title: str
    body: str
    icon: Optional[str] = None

    # Targeting
    recipient_role: str
    recipient_id: Optional[int] = None

    # Related entity (polymorphic reference)
    related_id: Optional[int] = None
    related_type: Optional[str] = None

    # Action deep-link
    action_url: Optional[str] = None
    action_label: Optional[str] = None

    # Read state
    is_read: bool
    read_at: Optional[datetime] = None

    # Acknowledgement (critical notifications only)
    is_acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[int] = None

    # Computed from model
    requires_acknowledgement: bool = False
    is_expired: bool = False
    is_actionable: bool = False

    # Expiry
    expires_at: Optional[datetime] = None

    # Source tracking
    source_service: Optional[str] = None
    triggered_by: Optional[int] = None

    # Timestamp
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationBrief(BaseModel):
    """Lightweight notification for list views and bell dropdown.

    Omits body text and source tracking to reduce payload size
    when rendering many notifications in the bell popover.
    """

    id: int
    type: str
    category: str
    priority: str
    title: str
    icon: Optional[str] = None
    action_url: Optional[str] = None
    action_label: Optional[str] = None
    is_read: bool
    is_acknowledged: bool
    requires_acknowledgement: bool = False
    is_expired: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedNotifications(BaseModel):
    """Paginated notification list with unread count for the badge."""

    notifications: list[NotificationResponse]
    total: int
    page: int
    page_size: int
    pages: int
    unread_count: int


class UnreadCounts(BaseModel):
    """Badge counts for the notification bell and category filter tabs.

    The frontend uses these to:
    - Show the total unread count on the bell icon
    - Show per-category counts on the filter tabs (Inventory, Resupply, etc.)
    - Show a separate critical count that persists until acknowledged
    """

    total: int
    by_category: dict[str, int] = Field(
        default_factory=dict,
        description="Unread count per NotificationCategory value",
    )
    by_priority: dict[str, int] = Field(
        default_factory=dict,
        description="Unread count per NotificationPriority value",
    )
    critical_unacknowledged: int = Field(
        0,
        description="Critical notifications not yet acknowledged (may be read)",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  REQUEST SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class BulkDismissRequest(BaseModel):
    """Dismiss (delete) multiple notifications by ID.

    Limited to 100 per request to prevent abuse.
    Critical unacknowledged notifications are silently skipped.
    """

    notification_ids: list[int] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of notification IDs to dismiss",
    )


class BroadcastRequest(BaseModel):
    """Admin-created system notification broadcast.

    Creates a single notification record visible to all users
    in the targeted role group. Used for announcements,
    maintenance windows, and operational alerts.
    """

    title: str = Field(
        ...,
        min_length=2,
        max_length=250,
        description="Short headline for the notification",
    )
    body: str = Field(
        ...,
        min_length=2,
        max_length=2000,
        description="Detailed message body",
    )
    recipient_role: str = Field(
        "all",
        pattern=r"^(admin|user|all)$",
        description="Target role: 'admin', 'user', or 'all'",
    )
    priority: NotificationPriority = Field(
        NotificationPriority.normal,
        description="Severity level. 'critical' requires explicit acknowledgement.",
    )
    action_url: Optional[str] = Field(
        None,
        max_length=300,
        description="Optional deep-link URL, e.g. '/admin/signouts'",
    )
    action_label: Optional[str] = Field(
        None,
        max_length=60,
        description="Button text for the action link, e.g. 'View Details'",
    )
    expires_at: Optional[datetime] = Field(
        None,
        description="Auto-hide after this time. Null = never expires.",
    )


class NotificationCreateInternal(BaseModel):
    """Internal schema used by the notification service to create notifications.

    Not exposed via the API — only used by backend services.
    Accepts all fields needed to construct a Notification record.
    """

    type: NotificationType
    category: NotificationCategory
    priority: NotificationPriority
    title: str = Field(..., max_length=250)
    body: str
    icon: Optional[str] = None
    recipient_role: str = "admin"
    recipient_id: Optional[int] = None
    related_id: Optional[int] = None
    related_type: Optional[str] = None
    action_url: Optional[str] = None
    action_label: Optional[str] = None
    expires_at: Optional[datetime] = None
    source_service: Optional[str] = None
    triggered_by: Optional[int] = None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DASHBOARD SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class NotificationStats(BaseModel):
    """System-wide notification statistics for the admin dashboard.

    Provides breakdowns by type, category, and priority so the admin
    can identify notification patterns and adjust preferences.
    """

    total: int
    unread: int
    read: int
    critical_unacknowledged: int
    expired: int
    by_type: dict[str, int] = Field(
        default_factory=dict,
        description="Count per NotificationType value",
    )
    by_category: dict[str, int] = Field(
        default_factory=dict,
        description="Count per NotificationCategory value",
    )
    by_priority: dict[str, int] = Field(
        default_factory=dict,
        description="Count per NotificationPriority value",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HELPER: Build response from ORM model
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def notification_to_response(notif) -> NotificationResponse:
    """Map a Notification ORM model instance to the API response schema.

    Centralised here so both the router and the notification service
    can produce consistent responses without duplicating mapping logic.
    """
    return NotificationResponse(
        id=notif.id,
        type=notif.type.value,
        category=notif.category.value,
        priority=notif.priority.value,
        title=notif.title,
        body=notif.body,
        icon=notif.icon,
        recipient_role=notif.recipient_role,
        recipient_id=notif.recipient_id,
        related_id=notif.related_id,
        related_type=notif.related_type,
        action_url=notif.action_url,
        action_label=notif.action_label,
        is_read=notif.is_read,
        read_at=notif.read_at,
        is_acknowledged=notif.is_acknowledged,
        acknowledged_at=notif.acknowledged_at,
        acknowledged_by=notif.acknowledged_by,
        requires_acknowledgement=notif.requires_acknowledgement,
        is_expired=notif.is_expired,
        is_actionable=notif.is_actionable,
        expires_at=notif.expires_at,
        source_service=notif.source_service,
        triggered_by=notif.triggered_by,
        created_at=notif.created_at,
    )


def notification_to_brief(notif) -> NotificationBrief:
    """Map a Notification ORM model to the lightweight brief schema.

    Used for the bell dropdown where payload size matters.
    """
    return NotificationBrief(
        id=notif.id,
        type=notif.type.value,
        category=notif.category.value,
        priority=notif.priority.value,
        title=notif.title,
        icon=notif.icon,
        action_url=notif.action_url,
        action_label=notif.action_label,
        is_read=notif.is_read,
        is_acknowledged=notif.is_acknowledged,
        requires_acknowledgement=notif.requires_acknowledgement,
        is_expired=notif.is_expired,
        created_at=notif.created_at,
    )