"""
G4Lite — Notification Service
=================================

Central notification creation and delivery logic. All routers call
through this service — no direct Notification model construction
in router code.

Features:
- Preference-aware delivery: checks user's notify_* toggles before
  creating targeted notifications
- Auto-populated category and priority from the type→category and
  type→priority mapping dicts in the model module
- Deep-link action URLs generated automatically from entity type + ID
- 14 dedicated factory functions (one per NotificationType)
- Batch creation for role-wide broadcasts
- Overdue scanner: finds overdue sign-outs and creates notifications
  with deduplication (checks overdue_notified_at / overdue_escalated_at)
- Low-stock scanner: finds items at/below minimum stock and notifies
- Expiry cleanup: purge expired notifications
- All functions are idempotent-safe where possible

Usage from routers:
    from app.services.notification_service import (
        notify_signout,
        notify_damaged_return,
        notify_resupply_request,
        notify_resupply_status_change,
        ...
    )
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import Item
from app.models.notification import (
    NOTIFICATION_TYPE_CATEGORY,
    NOTIFICATION_TYPE_DEFAULT_PRIORITY,
    Notification,
    NotificationCategory,
    NotificationPriority,
    NotificationType,
)
from app.models.signout import SignOut, SignOutStatus
from app.models.user import User, UserRole

logger = logging.getLogger("G4Lite.notifications")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ACTION URL TEMPLATES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Maps related_type → URL template with {id} placeholder
ACTION_URL_TEMPLATES: dict[str, tuple[str, str]] = {
    "item":       ("/inventory/{id}",         "View Item"),
    "signout":    ("/signouts/{id}",          "View Sign-Out"),
    "resupply":   ("/resupply/{id}",          "View Request"),
    "user":       ("/admin/users/{id}",       "View User"),
    "access_log": ("/admin/access-log/{id}",  "View Access Log"),
    "category":   ("/inventory?category={id}", "View Category"),
}


def _action_url(related_type: str | None, related_id: int | None) -> tuple[str | None, str | None]:
    """Generate action URL and label from entity type + ID."""
    if not related_type or not related_id:
        return None, None
    template = ACTION_URL_TEMPLATES.get(related_type)
    if not template:
        return None, None
    url_tpl, label = template
    return url_tpl.replace("{id}", str(related_id)), label


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PREFERENCE CHECKING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Maps NotificationCategory → User preference field name
CATEGORY_PREFERENCE_MAP: dict[NotificationCategory, str] = {
    NotificationCategory.inventory: "notify_signouts",
    NotificationCategory.resupply:  "notify_resupply",
    NotificationCategory.access:    "notify_access",
    NotificationCategory.admin:     "notify_in_app",
}

# Additional overrides for specific types
TYPE_PREFERENCE_MAP: dict[NotificationType, str] = {
    NotificationType.overdue:    "notify_overdue",
    NotificationType.low_stock:  "notify_low_stock",
}


async def _should_notify_user(
    db: AsyncSession,
    user_id: int,
    notification_type: NotificationType,
    category: NotificationCategory,
) -> bool:
    """Check if a specific user has notifications enabled for this type."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()
    if not user:
        return False

    # Master toggle
    if not user.notify_in_app:
        return False

    # Type-specific preference (overrides category)
    type_pref = TYPE_PREFERENCE_MAP.get(notification_type)
    if type_pref:
        return getattr(user, type_pref, True)

    # Category preference
    cat_pref = CATEGORY_PREFERENCE_MAP.get(category, "notify_in_app")
    return getattr(user, cat_pref, True)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CORE CREATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def create_notification(
    db: AsyncSession,
    *,
    notification_type: NotificationType,
    title: str,
    body: str,
    recipient_role: str = "admin",
    recipient_id: int | None = None,
    related_id: int | None = None,
    related_type: str | None = None,
    priority: NotificationPriority | None = None,
    category: NotificationCategory | None = None,
    icon: str | None = None,
    action_url: str | None = None,
    action_label: str | None = None,
    expires_at: datetime | None = None,
    source_service: str | None = None,
    triggered_by: int | None = None,
) -> Notification:
    """Create a single notification with auto-populated defaults.

    Category and priority are derived from the type if not provided.
    Action URL and label are derived from related_type + related_id
    if not provided.
    """
    # Auto-populate category and priority from type
    resolved_category = category or NOTIFICATION_TYPE_CATEGORY.get(
        notification_type, NotificationCategory.admin
    )
    resolved_priority = priority or NOTIFICATION_TYPE_DEFAULT_PRIORITY.get(
        notification_type, NotificationPriority.normal
    )

    # Auto-generate action URL
    if action_url is None:
        action_url, action_label = _action_url(related_type, related_id)

    notification = Notification(
        type=notification_type,
        category=resolved_category,
        priority=resolved_priority,
        title=title,
        body=body,
        icon=icon,
        recipient_role=recipient_role,
        recipient_id=recipient_id,
        related_id=related_id,
        related_type=related_type,
        action_url=action_url,
        action_label=action_label,
        expires_at=expires_at,
        source_service=source_service,
        triggered_by=triggered_by,
    )
    db.add(notification)
    await db.flush()
    return notification


async def create_notification_for_admins(
    db: AsyncSession,
    *,
    notification_type: NotificationType,
    title: str,
    body: str,
    related_id: int | None = None,
    related_type: str | None = None,
    priority: NotificationPriority | None = None,
    source_service: str | None = None,
    triggered_by: int | None = None,
    **kwargs,
) -> Notification:
    """Convenience: create a notification targeted at all admins."""
    return await create_notification(
        db,
        notification_type=notification_type,
        title=title,
        body=body,
        recipient_role="admin",
        recipient_id=None,
        related_id=related_id,
        related_type=related_type,
        priority=priority,
        source_service=source_service,
        triggered_by=triggered_by,
        **kwargs,
    )


async def create_notification_for_user(
    db: AsyncSession,
    user_id: int,
    *,
    notification_type: NotificationType,
    title: str,
    body: str,
    related_id: int | None = None,
    related_type: str | None = None,
    priority: NotificationPriority | None = None,
    source_service: str | None = None,
    triggered_by: int | None = None,
    **kwargs,
) -> Notification | None:
    """Create a notification for a specific user, respecting preferences.

    Returns None if the user has disabled notifications for this type.
    """
    category = NOTIFICATION_TYPE_CATEGORY.get(
        notification_type, NotificationCategory.admin
    )
    if not await _should_notify_user(db, user_id, notification_type, category):
        logger.debug(
            "Skipping notification for user %d: preferences disabled for %s",
            user_id, notification_type.value,
        )
        return None

    return await create_notification(
        db,
        notification_type=notification_type,
        title=title,
        body=body,
        recipient_role="user",
        recipient_id=user_id,
        related_id=related_id,
        related_type=related_type,
        priority=priority,
        source_service=source_service,
        triggered_by=triggered_by,
        **kwargs,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  INVENTORY EVENT FACTORIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def notify_signout(
    db: AsyncSession,
    full_name: str,
    item_name: str,
    qty: int,
    signout_id: int,
    triggered_by: int | None = None,
) -> None:
    """Notify admins that equipment has been signed out."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.signout,
        title="Equipment Signed Out",
        body=f"{full_name} signed out {qty}× {item_name}",
        related_id=signout_id,
        related_type="signout",
        source_service="signout_service",
        triggered_by=triggered_by,
    )


async def notify_return_ok(
    db: AsyncSession,
    full_name: str,
    item_name: str,
    qty: int,
    signout_id: int,
) -> None:
    """Notify admins that equipment was returned in serviceable condition."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.return_ok,
        title="Equipment Returned — Serviceable",
        body=f"{full_name} returned {qty}× {item_name} in serviceable condition",
        related_id=signout_id,
        related_type="signout",
        source_service="signout_service",
    )


async def notify_damaged_return(
    db: AsyncSession,
    full_name: str,
    item_name: str,
    condition: str,
    signout_id: int,
) -> None:
    """Notify admins of a damaged or condemned return."""
    type_map = {
        "damaged": NotificationType.return_damaged,
        "unserviceable": NotificationType.return_damaged,
        "condemned": NotificationType.return_condemned,
    }
    n_type = type_map.get(condition, NotificationType.return_damaged)
    priority = (
        NotificationPriority.critical
        if condition == "condemned"
        else NotificationPriority.high
    )

    await create_notification_for_admins(
        db,
        notification_type=n_type,
        title=f"Equipment Returned — {condition.title()}",
        body=f"{full_name} returned {item_name} in {condition} condition. Inspection required.",
        related_id=signout_id,
        related_type="signout",
        priority=priority,
        source_service="signout_service",
    )


async def notify_overdue(
    db: AsyncSession,
    full_name: str,
    item_name: str,
    signout_id: int,
    days_overdue: int,
) -> None:
    """Notify admins of an overdue sign-out."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.overdue,
        title="Overdue Sign-Out",
        body=(
            f"{full_name} has not returned {item_name} — "
            f"{days_overdue} day{'s' if days_overdue != 1 else ''} overdue"
        ),
        related_id=signout_id,
        related_type="signout",
        source_service="overdue_checker",
    )


async def notify_overdue_escalation(
    db: AsyncSession,
    full_name: str,
    item_name: str,
    signout_id: int,
    days_overdue: int,
) -> None:
    """Escalation notification for long-overdue sign-outs (48h+)."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.overdue,
        title="ESCALATION — Overdue Sign-Out",
        body=(
            f"ESCALATION: {full_name} has not returned {item_name} — "
            f"{days_overdue} days overdue. Immediate follow-up required."
        ),
        related_id=signout_id,
        related_type="signout",
        priority=NotificationPriority.critical,
        source_service="overdue_checker",
    )


async def notify_low_stock(
    db: AsyncSession,
    item_name: str,
    item_code: str,
    item_id: int,
    available: int,
    minimum: int,
) -> None:
    """Notify admins of an item at or below minimum stock level."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.low_stock,
        title="Low Stock Alert",
        body=(
            f"{item_name} ({item_code}) is at {available} available — "
            f"below minimum threshold of {minimum}"
        ),
        related_id=item_id,
        related_type="item",
        source_service="stock_monitor",
    )


async def notify_item_condition_change(
    db: AsyncSession,
    item_name: str,
    item_id: int,
    change_description: str,
    admin_id: int,
) -> None:
    """Notify of a manual condition/stock adjustment."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.item_condition_change,
        title="Inventory Adjustment",
        body=f"{item_name}: {change_description}",
        related_id=item_id,
        related_type="item",
        source_service="inventory_service",
        triggered_by=admin_id,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RESUPPLY EVENT FACTORIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def notify_resupply_request(
    db: AsyncSession,
    requester_name: str,
    item_name: str,
    qty: int,
    request_id: int,
    triggered_by: int | None = None,
) -> None:
    """Notify admins of a new resupply request."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.resupply_request,
        title="New Resupply Request",
        body=f"{requester_name} requested {qty}× {item_name}",
        related_id=request_id,
        related_type="resupply",
        source_service="resupply_service",
        triggered_by=triggered_by,
    )


async def notify_resupply_status_change(
    db: AsyncSession,
    request_id: int,
    request_number: str,
    new_status: str,
    requester_id: int,
) -> None:
    """Notify the requester that their resupply request status changed."""
    status_messages = {
        "approved": ("Request Approved", f"Your resupply request {request_number} has been approved"),
        "rejected": ("Request Rejected", f"Your resupply request {request_number} has been rejected"),
        "ordered": ("Order Placed", f"Your resupply request {request_number} has been ordered from the supplier"),
        "partially fulfilled": ("Partial Delivery", f"A partial delivery has been received for request {request_number}"),
        "fulfilled": ("Request Fulfilled", f"Your resupply request {request_number} has been fully delivered"),
    }

    title, body = status_messages.get(
        new_status,
        ("Request Updated", f"Your resupply request {request_number} status changed to: {new_status}"),
    )

    await create_notification_for_user(
        db,
        requester_id,
        notification_type=NotificationType.resupply_status_change,
        title=title,
        body=body,
        related_id=request_id,
        related_type="resupply",
        source_service="resupply_service",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ACCESS CONTROL EVENT FACTORIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def notify_access_granted(
    db: AsyncSession,
    user_name: str,
    user_id: int,
    access_log_id: int,
) -> None:
    """Notify admins of a successful cage access event."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.access_granted,
        title="Cage Access Granted",
        body=f"{user_name} entered the equipment cage",
        related_id=access_log_id,
        related_type="access_log",
        source_service="access_control",
        triggered_by=user_id,
    )


async def notify_access_denied(
    db: AsyncSession,
    user_name: str,
    user_id: int,
    reason: str,
    access_log_id: int,
) -> None:
    """Notify admins of a denied cage access attempt."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.access_denied,
        title="Cage Access DENIED",
        body=f"{user_name} was denied cage access: {reason}",
        related_id=access_log_id,
        related_type="access_log",
        priority=NotificationPriority.high,
        source_service="access_control",
        triggered_by=user_id,
    )


async def notify_access_pin_expired(
    db: AsyncSession,
    user_id: int,
    signout_ref: str,
) -> None:
    """Notify the user that their access PIN has expired."""
    await create_notification_for_user(
        db,
        user_id,
        notification_type=NotificationType.access_pin_expired,
        title="Access PIN Expired",
        body=f"Your access PIN for sign-out {signout_ref} has expired. Request a new one if needed.",
        source_service="access_control",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN / SYSTEM EVENT FACTORIES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def notify_user_account_event(
    db: AsyncSession,
    user_id: int,
    event: str,
    admin_id: int | None = None,
) -> None:
    """Notify admins of a user account event (created, deactivated, role changed, etc.)."""
    await create_notification_for_admins(
        db,
        notification_type=NotificationType.user_account,
        title="User Account Update",
        body=event,
        related_id=user_id,
        related_type="user",
        source_service="user_service",
        triggered_by=admin_id,
    )


async def notify_system_alert(
    db: AsyncSession,
    title: str,
    body: str,
    priority: NotificationPriority = NotificationPriority.high,
    recipient_role: str = "admin",
) -> None:
    """Create a system-level alert notification."""
    await create_notification(
        db,
        notification_type=NotificationType.system_alert,
        title=title,
        body=body,
        recipient_role=recipient_role,
        priority=priority,
        source_service="system",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  BATCH OPERATIONS / SCANNERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def scan_overdue_signouts(db: AsyncSession) -> int:
    """Scan for overdue sign-outs and create notifications.

    Deduplication:
    - First notification: sets overdue_notified_at on the sign-out
    - Escalation (48h+): sets overdue_escalated_at

    Returns the number of notifications created.
    """
    today = date.today()
    now = datetime.now(timezone.utc)
    created = 0

    # ── First-time overdue notifications ──────────────────────────
    result = await db.execute(
        select(SignOut).where(
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
            ]),
            SignOut.expected_return_date < today,
            SignOut.overdue_notified_at.is_(None),
        )
    )

    for so in result.scalars().all():
        days = (today - so.expected_return_date).days
        item_name = so.item_name_snapshot or (so.item.name if so.item else "Unknown")

        await notify_overdue(db, so.full_name, item_name, so.id, days)
        so.overdue_notified_at = now
        so.status = SignOutStatus.overdue
        created += 1

    # ── Escalation (48h+ overdue) ─────────────────────────────────
    escalation_result = await db.execute(
        select(SignOut).where(
            SignOut.status == SignOutStatus.overdue,
            SignOut.expected_return_date < today - timedelta(days=2),
            SignOut.overdue_notified_at.isnot(None),
            SignOut.overdue_escalated_at.is_(None),
        )
    )

    for so in escalation_result.scalars().all():
        days = (today - so.expected_return_date).days
        item_name = so.item_name_snapshot or (so.item.name if so.item else "Unknown")

        await notify_overdue_escalation(db, so.full_name, item_name, so.id, days)
        so.overdue_escalated_at = now
        created += 1

    if created:
        await db.flush()
        logger.info("Overdue scan complete: %d notifications created", created)

    return created


async def scan_low_stock(db: AsyncSession) -> int:
    """Scan for items at or below minimum stock and notify.

    Only notifies once per item per day to prevent spam. Uses the
    notification table to check for existing low_stock notifications
    created today for the same item.
    """
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    created = 0

    result = await db.execute(
        select(Item).where(
            Item.is_active.is_(True),
            Item.minimum_stock_level > 0,
            Item.available_quantity <= Item.minimum_stock_level,
        )
    )

    for item in result.scalars().all():
        # Check if we already notified about this item today
        existing = await db.execute(
            select(func.count(Notification.id)).where(
                Notification.type == NotificationType.low_stock,
                Notification.related_id == item.id,
                Notification.related_type == "item",
                Notification.created_at >= today_start,
            )
        )
        if (existing.scalar() or 0) > 0:
            continue

        await notify_low_stock(
            db,
            item.name,
            item.item_code,
            item.id,
            item.available_quantity,
            item.minimum_stock_level,
        )
        created += 1

    if created:
        await db.flush()
        logger.info("Low-stock scan complete: %d notifications created", created)

    return created


async def cleanup_expired_notifications(db: AsyncSession) -> int:
    """Delete all notifications past their expiry date.

    Returns the number deleted. Call from a scheduled task or
    the admin /clear-expired endpoint.
    """
    now = datetime.now(timezone.utc)

    from sqlalchemy import delete
    result = await db.execute(
        delete(Notification).where(
            Notification.expires_at.isnot(None),
            Notification.expires_at <= now,
        )
    )
    count = result.rowcount
    if count:
        logger.info("Expired notification cleanup: %d removed", count)
    return count