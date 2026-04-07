"""
g4lite — Notifications Router
================================

Notification delivery, filtering, acknowledgement, and management.

Targeting logic:
A notification is visible to a user if ANY of:
1. recipient_id = current_user.id  (directly targeted)
2. recipient_id IS NULL AND recipient_role = current_user.role  (role broadcast)
3. recipient_id IS NULL AND recipient_role = 'all'  (global broadcast)

Expired notifications (expires_at < now) are excluded from all
list queries and unread counts.

Read vs Acknowledged:
- All notifications can be marked as read (seen).
- Only `priority = critical` notifications require explicit acknowledgement.
- "Mark all read" skips critical unacknowledged notifications — they
  persist until explicitly acknowledged.

Endpoints (13 total):
- GET  /                    Paginated list with filters
- GET  /unread-count        Badge counts by category
- GET  /{id}                Single notification detail
- PUT  /{id}/read           Mark one as read
- PUT  /{id}/acknowledge    Acknowledge a critical notification
- PUT  /read-all            Bulk mark as read (excludes critical)
- POST /dismiss             Bulk dismiss (delete) by IDs
- DELETE /{id}              Delete single notification
- GET  /admin/all           Admin: all notifications system-wide
- GET  /admin/stats         Admin: notification statistics
- POST /admin/broadcast     Admin: send a system notification
- POST /admin/clear-expired Admin: purge expired notifications
- POST /test                Dev: create test notification (non-prod)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.notification import (
    NOTIFICATION_TYPE_CATEGORY,
    NOTIFICATION_TYPE_DEFAULT_PRIORITY,
    Notification,
    NotificationCategory,
    NotificationPriority,
    NotificationType,
)
from app.models.user import User
from app.utils.security import get_current_user, require_admin

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class NotificationResponse(BaseModel):
    id: int
    type: str
    category: str
    priority: str
    title: str
    body: str
    icon: Optional[str] = None
    recipient_role: str
    recipient_id: Optional[int] = None
    related_id: Optional[int] = None
    related_type: Optional[str] = None
    action_url: Optional[str] = None
    action_label: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    is_acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    requires_acknowledgement: bool = False
    is_expired: bool = False
    expires_at: Optional[datetime] = None
    source_service: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedNotifications(BaseModel):
    notifications: list[NotificationResponse]
    total: int
    page: int
    page_size: int
    pages: int
    unread_count: int


class UnreadCounts(BaseModel):
    """Badge counts for the notification bell and filter tabs."""

    total: int
    by_category: dict[str, int]
    by_priority: dict[str, int]
    critical_unacknowledged: int


class BulkDismissRequest(BaseModel):
    notification_ids: list[int] = Field(
        ..., min_length=1, max_length=100
    )


class BroadcastRequest(BaseModel):
    """Admin-created system notification."""

    title: str = Field(..., min_length=2, max_length=250)
    body: str = Field(..., min_length=2, max_length=2000)
    recipient_role: str = Field("all", pattern="^(admin|user|all)$")
    priority: NotificationPriority = NotificationPriority.normal
    action_url: Optional[str] = Field(None, max_length=300)
    action_label: Optional[str] = Field(None, max_length=60)
    expires_at: Optional[datetime] = None


class NotificationStats(BaseModel):
    total: int
    unread: int
    read: int
    critical_unacknowledged: int
    expired: int
    by_type: dict[str, int]
    by_category: dict[str, int]
    by_priority: dict[str, int]


# ── Helpers ───────────────────────────────────────────────────────


def _targeting_filter(user: User):
    """SQLAlchemy filter clause for notifications visible to this user."""
    now = datetime.now(timezone.utc)
    return and_(
        or_(
            Notification.recipient_id == user.id,
            and_(
                Notification.recipient_id.is_(None),
                or_(
                    Notification.recipient_role == user.role.value,
                    Notification.recipient_role == "all",
                ),
            ),
        ),
        # Exclude expired
        or_(
            Notification.expires_at.is_(None),
            Notification.expires_at > now,
        ),
    )


def _notif_to_response(notif: Notification) -> NotificationResponse:
    """Map a Notification ORM model to the API response."""
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
        requires_acknowledgement=notif.requires_acknowledgement,
        is_expired=notif.is_expired,
        expires_at=notif.expires_at,
        source_service=notif.source_service,
        created_at=notif.created_at,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  USER ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "",
    response_model=PaginatedNotifications,
    summary="List notifications with filters",
)
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    category: Optional[NotificationCategory] = Query(None),
    priority: Optional[NotificationPriority] = Query(None),
    notification_type: Optional[NotificationType] = Query(None, alias="type"),
    is_read: Optional[bool] = Query(None),
    is_acknowledged: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedNotifications:
    """Paginated notification list with category, priority, and read filters."""
    base_filter = _targeting_filter(current_user)
    query = select(Notification).where(base_filter)

    # ── Optional filters ──────────────────────────────────────────
    if category is not None:
        query = query.where(Notification.category == category)

    if priority is not None:
        query = query.where(Notification.priority == priority)

    if notification_type is not None:
        query = query.where(Notification.type == notification_type)

    if is_read is not None:
        query = query.where(Notification.is_read == is_read)

    if is_acknowledged is not None:
        query = query.where(Notification.is_acknowledged == is_acknowledged)

    # ── Count ─────────────────────────────────────────────────────
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # ── Unread count (unfiltered, for badge) ──────────────────────
    unread_q = select(func.count()).where(
        base_filter,
        Notification.is_read.is_(False),
    )
    unread_count = (await db.execute(unread_q)).scalar() or 0

    # ── Sort and paginate ─────────────────────────────────────────
    # Critical unacknowledged first, then by recency
    query = query.order_by(
        desc(
            and_(
                Notification.priority == NotificationPriority.critical,
                Notification.is_acknowledged.is_(False),
            )
        ),
        desc(Notification.created_at),
    ).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    notifications = [_notif_to_response(n) for n in result.scalars().all()]

    import math
    return PaginatedNotifications(
        notifications=notifications,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 1,
        unread_count=unread_count,
    )


@router.get(
    "/unread-count",
    response_model=UnreadCounts,
    summary="Unread notification counts for badge",
)
async def get_unread_counts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCounts:
    """Return unread counts broken down by category and priority.
    Used by the notification bell badge and filter tabs."""
    base_filter = _targeting_filter(current_user)
    unread_filter = and_(base_filter, Notification.is_read.is_(False))

    # Total unread
    total_result = await db.execute(
        select(func.count()).where(unread_filter)
    )
    total = total_result.scalar() or 0

    # By category
    cat_result = await db.execute(
        select(
            Notification.category,
            func.count(Notification.id),
        )
        .where(unread_filter)
        .group_by(Notification.category)
    )
    by_category = {row[0].value: row[1] for row in cat_result.all()}

    # By priority
    pri_result = await db.execute(
        select(
            Notification.priority,
            func.count(Notification.id),
        )
        .where(unread_filter)
        .group_by(Notification.priority)
    )
    by_priority = {row[0].value: row[1] for row in pri_result.all()}

    # Critical unacknowledged (may be read but not acknowledged)
    critical_result = await db.execute(
        select(func.count()).where(
            base_filter,
            Notification.priority == NotificationPriority.critical,
            Notification.is_acknowledged.is_(False),
        )
    )
    critical_unacked = critical_result.scalar() or 0

    return UnreadCounts(
        total=total,
        by_category=by_category,
        by_priority=by_priority,
        critical_unacknowledged=critical_unacked,
    )


@router.get(
    "/{notification_id}",
    response_model=NotificationResponse,
    summary="Get a single notification",
)
async def get_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            _targeting_filter(current_user),
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return _notif_to_response(notif)


@router.put(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark notification as read",
)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    """Mark a notification as read. Sets read_at timestamp."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            _targeting_filter(current_user),
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        await db.flush()

    return _notif_to_response(notif)


@router.put(
    "/{notification_id}/acknowledge",
    response_model=NotificationResponse,
    summary="Acknowledge a critical notification",
)
async def acknowledge_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    """Explicitly acknowledge a critical notification.

    Only applicable to priority=critical notifications. Also marks
    as read if not already. Records who acknowledged and when.
    """
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            _targeting_filter(current_user),
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notif.priority != NotificationPriority.critical:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only critical notifications require acknowledgement",
        )

    if notif.is_acknowledged:
        return _notif_to_response(notif)

    now = datetime.now(timezone.utc)
    notif.is_acknowledged = True
    notif.acknowledged_at = now
    notif.acknowledged_by = current_user.id

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = now

    await db.flush()
    return _notif_to_response(notif)


@router.put(
    "/read-all",
    summary="Mark all notifications as read",
)
async def mark_all_read(
    category: Optional[NotificationCategory] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Bulk mark all notifications as read.

    IMPORTANT: Skips critical unacknowledged notifications — those
    must be individually acknowledged via the /acknowledge endpoint.

    Optionally filter by category to mark only one tab as read.
    """
    now = datetime.now(timezone.utc)

    conditions = [
        _targeting_filter(current_user),
        Notification.is_read.is_(False),
        # Do NOT bulk-read critical unacknowledged
        or_(
            Notification.priority != NotificationPriority.critical,
            Notification.is_acknowledged.is_(True),
        ),
    ]

    if category is not None:
        conditions.append(Notification.category == category)

    stmt = (
        update(Notification)
        .where(*conditions)
        .values(is_read=True, read_at=now)
        .execution_options(synchronize_session=False)
    )

    result = await db.execute(stmt)
    count = result.rowcount

    return {
        "detail": f"Marked {count} notifications as read",
        "count": count,
        "skipped_critical": True,
    }


@router.post(
    "/dismiss",
    summary="Bulk dismiss notifications",
)
async def bulk_dismiss(
    body: BulkDismissRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Delete multiple notifications by ID.

    Only deletes notifications the current user can see.
    Refuses to dismiss critical unacknowledged notifications.
    """
    # Fetch the notifications to validate ownership and criticality
    result = await db.execute(
        select(Notification).where(
            Notification.id.in_(body.notification_ids),
            _targeting_filter(current_user),
        )
    )
    notifications = result.scalars().all()

    deletable_ids = []
    skipped_critical = 0

    for notif in notifications:
        if (
            notif.priority == NotificationPriority.critical
            and not notif.is_acknowledged
        ):
            skipped_critical += 1
            continue
        deletable_ids.append(notif.id)

    if deletable_ids:
        await db.execute(
            delete(Notification).where(Notification.id.in_(deletable_ids))
        )

    return {
        "detail": f"Dismissed {len(deletable_ids)} notifications",
        "dismissed": len(deletable_ids),
        "skipped_critical": skipped_critical,
    }


@router.delete(
    "/{notification_id}",
    status_code=204,
    response_model=None,
    summary="Delete a single notification",
)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a notification. Cannot delete critical unacknowledged."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            _targeting_filter(current_user),
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    if (
        notif.priority == NotificationPriority.critical
        and not notif.is_acknowledged
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Critical notifications must be acknowledged before deletion",
        )

    await db.delete(notif)
    await db.flush()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "/admin/all",
    response_model=list[NotificationResponse],
    summary="Admin: list all notifications system-wide",
    dependencies=[Depends(require_admin)],
)
async def admin_list_all(
    limit: int = Query(100, ge=1, le=500),
    notification_type: Optional[NotificationType] = Query(None, alias="type"),
    category: Optional[NotificationCategory] = Query(None),
    priority: Optional[NotificationPriority] = Query(None),
    include_expired: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationResponse]:
    """Admin view of all notifications across all users.
    Useful for auditing and debugging notification delivery."""
    now = datetime.now(timezone.utc)
    query = select(Notification)

    if not include_expired:
        query = query.where(
            or_(
                Notification.expires_at.is_(None),
                Notification.expires_at > now,
            )
        )

    if notification_type is not None:
        query = query.where(Notification.type == notification_type)
    if category is not None:
        query = query.where(Notification.category == category)
    if priority is not None:
        query = query.where(Notification.priority == priority)

    query = query.order_by(desc(Notification.created_at)).limit(limit)
    result = await db.execute(query)

    return [_notif_to_response(n) for n in result.scalars().all()]


@router.get(
    "/admin/stats",
    response_model=NotificationStats,
    summary="Admin: notification statistics",
    dependencies=[Depends(require_admin)],
)
async def admin_stats(
    db: AsyncSession = Depends(get_db),
) -> NotificationStats:
    """System-wide notification statistics for the admin dashboard."""
    now = datetime.now(timezone.utc)

    # Total
    total = (await db.execute(
        select(func.count(Notification.id))
    )).scalar() or 0

    # Unread
    unread = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.is_read.is_(False)
        )
    )).scalar() or 0

    # Critical unacknowledged
    critical_unacked = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.priority == NotificationPriority.critical,
            Notification.is_acknowledged.is_(False),
        )
    )).scalar() or 0

    # Expired
    expired = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.expires_at.isnot(None),
            Notification.expires_at <= now,
        )
    )).scalar() or 0

    # By type
    type_result = await db.execute(
        select(Notification.type, func.count(Notification.id))
        .group_by(Notification.type)
    )
    by_type = {row[0].value: row[1] for row in type_result.all()}

    # By category
    cat_result = await db.execute(
        select(Notification.category, func.count(Notification.id))
        .group_by(Notification.category)
    )
    by_category = {row[0].value: row[1] for row in cat_result.all()}

    # By priority
    pri_result = await db.execute(
        select(Notification.priority, func.count(Notification.id))
        .group_by(Notification.priority)
    )
    by_priority = {row[0].value: row[1] for row in pri_result.all()}

    return NotificationStats(
        total=total,
        unread=unread,
        read=total - unread,
        critical_unacknowledged=critical_unacked,
        expired=expired,
        by_type=by_type,
        by_category=by_category,
        by_priority=by_priority,
    )


@router.post(
    "/admin/broadcast",
    response_model=NotificationResponse,
    status_code=201,
    summary="Admin: send a system broadcast",
    dependencies=[Depends(require_admin)],
)
async def admin_broadcast(
    body: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> NotificationResponse:
    """Create a system-wide notification visible to the targeted role group."""
    notif = Notification(
        type=NotificationType.system_alert,
        category=NotificationCategory.admin,
        priority=body.priority,
        title=body.title,
        body=body.body,
        recipient_role=body.recipient_role,
        recipient_id=None,
        action_url=body.action_url,
        action_label=body.action_label,
        expires_at=body.expires_at,
        source_service="admin_broadcast",
        triggered_by=admin.id,
    )
    db.add(notif)
    await db.flush()
    await db.refresh(notif)

    return _notif_to_response(notif)


@router.post(
    "/admin/clear-expired",
    summary="Admin: purge expired notifications",
    dependencies=[Depends(require_admin)],
)
async def admin_clear_expired(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete all notifications past their expiry date.
    Run periodically or on-demand to keep the table clean."""
    now = datetime.now(timezone.utc)

    result = await db.execute(
        delete(Notification).where(
            Notification.expires_at.isnot(None),
            Notification.expires_at <= now,
        )
    )
    count = result.rowcount

    return {
        "detail": f"Purged {count} expired notifications",
        "count": count,
    }