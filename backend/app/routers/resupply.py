"""
g4lite — Resupply Router
===========================

Full procurement lifecycle from request submission through approval,
ordering, delivery, and fulfillment.

User endpoints:
- POST /                  Submit a new resupply request
- GET  /mine              List current user's requests
- GET  /{id}              View request detail
- PUT  /{id}/cancel       Cancel own request (if not yet ordered)

Admin endpoints:
- GET  /                  All requests with filters + pagination
- PUT  /{id}/review       Begin review (pending → under_review)
- PUT  /{id}/approve      Approve request
- PUT  /{id}/reject       Reject with reason
- PUT  /{id}/order        Mark as ordered with supplier details
- PUT  /{id}/fulfill      Record delivery (partial or full)
- PUT  /{id}/cost         Update cost tracking
- PUT  /{id}/notes        Update admin notes
- PUT  /{id}/cancel       Admin cancel with reason
- GET  /stats             Dashboard statistics
- GET  /export            CSV export

Request number generation:
  RSP-YYYYMM-NNNN (e.g. RSP-202604-0012)
  Sequential within each month, generated at creation time.
"""

from __future__ import annotations

import csv
import io
import math
from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.category import Category
from app.models.item import Item
from app.models.resupply import (
    RESUPPLY_STATUS_TRANSITIONS,
    ResupplyPriority,
    ResupplyRequest,
    ResupplyStatus,
)
from app.models.user import User
from app.services.notification_service import (
    notify_resupply_request,
    notify_resupply_status_change,
)
from app.utils.security import get_current_user, require_admin

router = APIRouter(prefix="/api/resupply", tags=["resupply"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ResupplyCreate(BaseModel):
    """User submits a new resupply request."""

    item_id: Optional[int] = Field(
        None,
        description="Existing item ID for restock. Null for new item request.",
    )
    item_name_freetext: Optional[str] = Field(
        None,
        max_length=250,
        description="Name for new item not in catalogue",
    )
    item_description: Optional[str] = Field(
        None,
        max_length=2000,
        description="Specs for new item request",
    )
    suggested_category_id: Optional[int] = None
    suggested_supplier: Optional[str] = Field(None, max_length=200)
    quantity_requested: int = Field(..., gt=0)
    justification: str = Field(..., min_length=10, max_length=2000)
    priority: ResupplyPriority = ResupplyPriority.routine
    required_by_date: Optional[date] = None
    task_reference: Optional[str] = Field(None, max_length=150)


class ResupplyApproval(BaseModel):
    admin_notes: Optional[str] = Field(None, max_length=2000)
    estimated_unit_cost: Optional[float] = Field(None, ge=0)
    budget_code: Optional[str] = Field(None, max_length=50)


class ResupplyRejection(BaseModel):
    rejection_reason: str = Field(..., min_length=5, max_length=2000)
    admin_notes: Optional[str] = Field(None, max_length=2000)


class ResupplyOrderDetails(BaseModel):
    supplier_name: str = Field(..., min_length=2, max_length=200)
    supplier_reference: Optional[str] = Field(None, max_length=100)
    external_po_number: Optional[str] = Field(None, max_length=60)
    expected_delivery_date: Optional[date] = None
    estimated_unit_cost: Optional[float] = Field(None, ge=0)
    actual_unit_cost: Optional[float] = Field(None, ge=0)
    admin_notes: Optional[str] = Field(None, max_length=2000)


class ResupplyFulfillment(BaseModel):
    quantity_received: int = Field(..., gt=0)
    actual_unit_cost: Optional[float] = Field(None, ge=0)
    actual_delivery_date: Optional[date] = None
    delivery_notes: Optional[str] = Field(None, max_length=2000)


class ResupplyCostUpdate(BaseModel):
    estimated_unit_cost: Optional[float] = Field(None, ge=0)
    actual_unit_cost: Optional[float] = Field(None, ge=0)
    budget_code: Optional[str] = Field(None, max_length=50)


class ResupplyAdminNotes(BaseModel):
    admin_notes: str = Field(..., min_length=1, max_length=2000)


class ResupplyCancellation(BaseModel):
    cancellation_reason: str = Field(..., min_length=5, max_length=2000)


class ResupplyResponse(BaseModel):
    id: int
    request_number: str
    item_id: Optional[int] = None
    item_name: str
    item_code: Optional[str] = None
    is_new_item_request: bool
    item_name_freetext: Optional[str] = None
    item_description: Optional[str] = None
    suggested_category_id: Optional[int] = None
    suggested_category_name: Optional[str] = None
    suggested_supplier: Optional[str] = None
    requested_by: int
    requester_name: str
    requester_rank: Optional[str] = None
    quantity_requested: int
    quantity_fulfilled: int
    quantity_outstanding: int
    fulfillment_pct: float
    justification: str
    priority: str
    required_by_date: Optional[date] = None
    task_reference: Optional[str] = None
    status: str
    is_overdue: bool = False
    days_until_required: Optional[int] = None
    # Review / approval
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    # Cost
    estimated_unit_cost: Optional[float] = None
    actual_unit_cost: Optional[float] = None
    estimated_total_cost: Optional[float] = None
    actual_total_cost: Optional[float] = None
    budget_code: Optional[str] = None
    # Procurement
    supplier_name: Optional[str] = None
    supplier_reference: Optional[str] = None
    external_po_number: Optional[str] = None
    expected_delivery_date: Optional[date] = None
    actual_delivery_date: Optional[date] = None
    delivery_notes: Optional[str] = None
    # Lifecycle
    admin_notes: Optional[str] = None
    cancellation_reason: Optional[str] = None
    fulfilled_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaginatedResupply(BaseModel):
    requests: list[ResupplyResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ResupplyStats(BaseModel):
    total_requests: int
    by_status: dict[str, int]
    by_priority: dict[str, int]
    pending_review: int
    overdue_requests: int
    total_estimated_cost: float
    total_actual_cost: float
    avg_fulfillment_days: Optional[float] = None
    new_item_requests: int
    this_month_count: int


class ResupplySortField(str, Enum):
    created_at = "created_at"
    priority = "priority"
    status = "status"
    required_by_date = "required_by_date"
    quantity_requested = "quantity_requested"
    request_number = "request_number"


# ── Helpers ───────────────────────────────────────────────────────


async def _generate_request_number(db: AsyncSession) -> str:
    """Generate the next sequential request number: RSP-YYYYMM-NNNN."""
    now = datetime.now(timezone.utc)
    prefix = f"RSP-{now.strftime('%Y%m')}-"

    result = await db.execute(
        select(func.count(ResupplyRequest.id)).where(
            ResupplyRequest.request_number.like(f"{prefix}%")
        )
    )
    count = (result.scalar() or 0) + 1
    return f"{prefix}{count:04d}"


def _resupply_to_response(r: ResupplyRequest) -> ResupplyResponse:
    """Map a ResupplyRequest ORM model to the API response."""
    item_name = r.display_item_name
    item_code = None
    if r.item:
        item_code = r.item.item_code

    suggested_cat_name = None
    if hasattr(r, "suggested_category") and r.suggested_category:
        suggested_cat_name = r.suggested_category.name

    return ResupplyResponse(
        id=r.id,
        request_number=r.request_number,
        item_id=r.item_id,
        item_name=item_name,
        item_code=item_code,
        is_new_item_request=r.is_new_item_request,
        item_name_freetext=r.item_name_freetext,
        item_description=r.item_description,
        suggested_category_id=r.suggested_category_id,
        suggested_category_name=suggested_cat_name,
        suggested_supplier=r.suggested_supplier,
        requested_by=r.requested_by,
        requester_name=r.requester.full_name if r.requester else "",
        requester_rank=r.requester.rank if r.requester else None,
        quantity_requested=r.quantity_requested,
        quantity_fulfilled=r.quantity_fulfilled,
        quantity_outstanding=r.quantity_outstanding,
        fulfillment_pct=r.fulfillment_pct,
        justification=r.justification,
        priority=r.priority.value,
        required_by_date=r.required_by_date,
        task_reference=r.task_reference,
        status=r.status.value,
        is_overdue=r.is_overdue,
        days_until_required=r.days_until_required,
        reviewed_by=r.reviewed_by,
        reviewed_at=r.reviewed_at,
        approved_by=r.approved_by,
        approved_at=r.approved_at,
        rejection_reason=r.rejection_reason,
        estimated_unit_cost=r.estimated_unit_cost,
        actual_unit_cost=r.actual_unit_cost,
        estimated_total_cost=r.estimated_total_cost,
        actual_total_cost=r.actual_total_cost,
        budget_code=r.budget_code,
        supplier_name=r.supplier_name,
        supplier_reference=r.supplier_reference,
        external_po_number=r.external_po_number,
        expected_delivery_date=r.expected_delivery_date,
        actual_delivery_date=r.actual_delivery_date,
        delivery_notes=r.delivery_notes,
        admin_notes=r.admin_notes,
        cancellation_reason=r.cancellation_reason,
        fulfilled_at=r.fulfilled_at,
        cancelled_at=r.cancelled_at,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


def _validate_transition(
    request: ResupplyRequest,
    target_status: ResupplyStatus,
) -> None:
    """Validate and raise if status transition is not allowed."""
    allowed, reason = request.can_transition_to(target_status)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=reason,
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  USER ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.post(
    "",
    response_model=ResupplyResponse,
    status_code=201,
    summary="Submit a resupply request",
)
async def create_resupply_request(
    body: ResupplyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResupplyResponse:
    """Submit a new resupply request.

    For existing items: provide item_id. The item must exist and be active.
    For new items: leave item_id null, provide item_name_freetext and
    optionally item_description, suggested_category_id, suggested_supplier.
    """
    # Validate: must have either item_id or freetext name
    if not body.item_id and not body.item_name_freetext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either an existing item ID or a new item name",
        )

    item_name = body.item_name_freetext or ""
    is_new_item = body.item_id is None

    # Validate existing item
    if body.item_id:
        result = await db.execute(
            select(Item).where(
                Item.id == body.item_id,
                Item.is_active.is_(True),
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found or inactive",
            )
        item_name = item.name

    # Validate suggested category if provided
    if body.suggested_category_id:
        cat_result = await db.execute(
            select(Category).where(
                Category.id == body.suggested_category_id,
                Category.is_active.is_(True),
            )
        )
        if not cat_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Suggested category not found or inactive",
            )

    # Validate required_by_date is in the future
    if body.required_by_date and body.required_by_date <= date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Required-by date must be in the future",
        )

    # Generate request number
    request_number = await _generate_request_number(db)

    request = ResupplyRequest(
        request_number=request_number,
        item_id=body.item_id,
        requested_by=current_user.id,
        item_name_freetext=body.item_name_freetext,
        item_description=body.item_description,
        suggested_category_id=body.suggested_category_id,
        suggested_supplier=body.suggested_supplier,
        quantity_requested=body.quantity_requested,
        justification=body.justification,
        priority=body.priority,
        required_by_date=body.required_by_date,
        task_reference=body.task_reference,
        is_new_item_request=is_new_item,
        status=ResupplyStatus.pending,
    )
    db.add(request)
    await db.flush()
    await db.refresh(request, ["item", "requester"])

    # Notify admins
    try:
        await notify_resupply_request(
            db,
            current_user.full_name,
            item_name,
            body.quantity_requested,
            request.id,
        )
    except Exception:
        pass  # Don't fail the request if notification fails

    return _resupply_to_response(request)


@router.get(
    "/mine",
    response_model=list[ResupplyResponse],
    summary="List my resupply requests",
)
async def list_my_requests(
    status_filter: Optional[ResupplyStatus] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ResupplyResponse]:
    """List the current user's resupply requests, newest first."""
    query = (
        select(ResupplyRequest)
        .where(ResupplyRequest.requested_by == current_user.id)
    )

    if status_filter is not None:
        query = query.where(ResupplyRequest.status == status_filter)

    query = query.order_by(desc(ResupplyRequest.created_at)).limit(limit)
    result = await db.execute(query)

    return [_resupply_to_response(r) for r in result.scalars().all()]


@router.get(
    "/{request_id}",
    response_model=ResupplyResponse,
    summary="Get resupply request detail",
)
async def get_resupply_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResupplyResponse:
    """Get a single resupply request. Users can only see their own;
    admins can see all."""
    result = await db.execute(
        select(ResupplyRequest).where(ResupplyRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Resupply request not found")

    if request.requested_by != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return _resupply_to_response(request)


@router.put(
    "/{request_id}/cancel",
    response_model=ResupplyResponse,
    summary="Cancel a resupply request",
)
async def cancel_request(
    request_id: int,
    body: ResupplyCancellation,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResupplyResponse:
    """Cancel a resupply request. Users can cancel their own requests
    if not yet ordered. Admins can cancel any non-terminal request."""
    result = await db.execute(
        select(ResupplyRequest).where(ResupplyRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Resupply request not found")

    # Permission check
    if request.requested_by != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    # Users can only cancel before ordering
    if not current_user.is_admin and request.status in (
        ResupplyStatus.ordered,
        ResupplyStatus.partially_fulfilled,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot cancel a request that has already been ordered. Contact an admin.",
        )

    _validate_transition(request, ResupplyStatus.cancelled)

    now = datetime.now(timezone.utc)
    request.status = ResupplyStatus.cancelled
    request.cancelled_by = current_user.id
    request.cancelled_at = now
    request.cancellation_reason = body.cancellation_reason

    await db.flush()
    await db.refresh(request, ["item", "requester"])

    return _resupply_to_response(request)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "",
    response_model=PaginatedResupply,
    summary="List all resupply requests (admin)",
)
async def list_resupply_requests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=200),
    status_filter: Optional[ResupplyStatus] = Query(None, alias="status"),
    priority_filter: Optional[ResupplyPriority] = Query(None, alias="priority"),
    requester_id: Optional[int] = Query(None),
    item_id: Optional[int] = Query(None),
    is_new_item: Optional[bool] = Query(None),
    is_overdue: Optional[bool] = Query(None),
    sort_by: ResupplySortField = Query(ResupplySortField.created_at),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> PaginatedResupply:
    """Paginated list of all resupply requests with filters. Admin only."""
    query = select(ResupplyRequest)

    # ── Filters ───────────────────────────────────────────────────
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                ResupplyRequest.request_number.ilike(pattern),
                ResupplyRequest.item_name_freetext.ilike(pattern),
                ResupplyRequest.justification.ilike(pattern),
                ResupplyRequest.task_reference.ilike(pattern),
                ResupplyRequest.supplier_name.ilike(pattern),
                ResupplyRequest.external_po_number.ilike(pattern),
            )
        )

    if status_filter is not None:
        query = query.where(ResupplyRequest.status == status_filter)

    if priority_filter is not None:
        query = query.where(ResupplyRequest.priority == priority_filter)

    if requester_id is not None:
        query = query.where(ResupplyRequest.requested_by == requester_id)

    if item_id is not None:
        query = query.where(ResupplyRequest.item_id == item_id)

    if is_new_item is not None:
        query = query.where(ResupplyRequest.is_new_item_request == is_new_item)

    if is_overdue is True:
        query = query.where(
            ResupplyRequest.required_by_date.isnot(None),
            ResupplyRequest.required_by_date < date.today(),
            ResupplyRequest.status.notin_([
                ResupplyStatus.fulfilled,
                ResupplyStatus.rejected,
                ResupplyStatus.cancelled,
            ]),
        )

    # ── Count ─────────────────────────────────────────────────────
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # ── Sort ──────────────────────────────────────────────────────
    sort_column = getattr(ResupplyRequest, sort_by.value, ResupplyRequest.created_at)
    if sort_by == ResupplySortField.priority:
        from sqlalchemy import case
        sort_column = case(
            (ResupplyRequest.priority == ResupplyPriority.emergency, 0),
            (ResupplyRequest.priority == ResupplyPriority.critical, 1),
            (ResupplyRequest.priority == ResupplyPriority.urgent, 2),
            (ResupplyRequest.priority == ResupplyPriority.routine, 3),
            else_=4,
        )

    order = desc(sort_column) if sort_dir == "desc" else sort_column
    query = query.order_by(order).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    requests = [_resupply_to_response(r) for r in result.scalars().all()]

    return PaginatedResupply(
        requests=requests,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 1,
    )


@router.put(
    "/{request_id}/review",
    response_model=ResupplyResponse,
    summary="Begin review of a request",
)
async def review_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ResupplyResponse:
    """Move request from pending → under_review. Records who started reviewing."""
    request = await _get_request_or_404(request_id, db)
    _validate_transition(request, ResupplyStatus.under_review)

    request.status = ResupplyStatus.under_review
    request.reviewed_by = admin.id
    request.reviewed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(request, ["item", "requester"])
    return _resupply_to_response(request)


@router.put(
    "/{request_id}/approve",
    response_model=ResupplyResponse,
    summary="Approve a resupply request",
)
async def approve_request(
    request_id: int,
    body: ResupplyApproval,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ResupplyResponse:
    """Approve a request (under_review → approved).
    Optionally set cost estimate and budget code."""
    request = await _get_request_or_404(request_id, db)
    _validate_transition(request, ResupplyStatus.approved)

    now = datetime.now(timezone.utc)
    request.status = ResupplyStatus.approved
    request.approved_by = admin.id
    request.approved_at = now

    if not request.reviewed_by:
        request.reviewed_by = admin.id
        request.reviewed_at = now

    if body.admin_notes:
        request.admin_notes = body.admin_notes
    if body.estimated_unit_cost is not None:
        request.estimated_unit_cost = body.estimated_unit_cost
    if body.budget_code:
        request.budget_code = body.budget_code

    await db.flush()
    await db.refresh(request, ["item", "requester"])

    try:
        await notify_resupply_status_change(
            db, request.id, request.request_number,
            "approved", request.requested_by,
        )
    except Exception:
        pass

    return _resupply_to_response(request)


@router.put(
    "/{request_id}/reject",
    response_model=ResupplyResponse,
    summary="Reject a resupply request",
)
async def reject_request(
    request_id: int,
    body: ResupplyRejection,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ResupplyResponse:
    """Reject a request with mandatory reason."""
    request = await _get_request_or_404(request_id, db)
    _validate_transition(request, ResupplyStatus.rejected)

    now = datetime.now(timezone.utc)
    request.status = ResupplyStatus.rejected
    request.rejection_reason = body.rejection_reason

    if not request.reviewed_by:
        request.reviewed_by = admin.id
        request.reviewed_at = now

    if body.admin_notes:
        request.admin_notes = body.admin_notes

    await db.flush()
    await db.refresh(request, ["item", "requester"])

    try:
        await notify_resupply_status_change(
            db, request.id, request.request_number,
            "rejected", request.requested_by,
        )
    except Exception:
        pass

    return _resupply_to_response(request)


@router.put(
    "/{request_id}/order",
    response_model=ResupplyResponse,
    summary="Mark as ordered with supplier details",
)
async def mark_as_ordered(
    request_id: int,
    body: ResupplyOrderDetails,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ResupplyResponse:
    """Record that the order has been placed with a supplier."""
    request = await _get_request_or_404(request_id, db)
    _validate_transition(request, ResupplyStatus.ordered)

    request.status = ResupplyStatus.ordered
    request.supplier_name = body.supplier_name
    request.supplier_reference = body.supplier_reference
    request.external_po_number = body.external_po_number
    request.expected_delivery_date = body.expected_delivery_date

    if body.estimated_unit_cost is not None:
        request.estimated_unit_cost = body.estimated_unit_cost
    if body.actual_unit_cost is not None:
        request.actual_unit_cost = body.actual_unit_cost
    if body.admin_notes:
        request.admin_notes = body.admin_notes

    await db.flush()
    await db.refresh(request, ["item", "requester"])

    try:
        await notify_resupply_status_change(
            db, request.id, request.request_number,
            "ordered", request.requested_by,
        )
    except Exception:
        pass

    return _resupply_to_response(request)


@router.put(
    "/{request_id}/fulfill",
    response_model=ResupplyResponse,
    summary="Record delivery (partial or full)",
)
async def fulfill_request(
    request_id: int,
    body: ResupplyFulfillment,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ResupplyResponse:
    """Record a delivery of stock. Supports incremental partial fulfillment.

    If quantity_received brings total to quantity_requested, status
    moves to fulfilled. Otherwise, status moves to partially_fulfilled.
    """
    request = await _get_request_or_404(request_id, db)

    # Must be in ordered or partially_fulfilled state
    if request.status not in (
        ResupplyStatus.ordered,
        ResupplyStatus.partially_fulfilled,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot fulfill a request in '{request.status.value}' state. "
                   f"Must be 'ordered' or 'partially_fulfilled'.",
        )

    new_total = request.quantity_fulfilled + body.quantity_received
    if new_total > request.quantity_requested:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Received quantity ({body.quantity_received}) plus already fulfilled "
                f"({request.quantity_fulfilled}) exceeds requested ({request.quantity_requested})"
            ),
        )

    now = datetime.now(timezone.utc)
    request.quantity_fulfilled = new_total

    if body.actual_unit_cost is not None:
        request.actual_unit_cost = body.actual_unit_cost
    if body.actual_delivery_date:
        request.actual_delivery_date = body.actual_delivery_date
    if body.delivery_notes:
        request.delivery_notes = body.delivery_notes

    if new_total >= request.quantity_requested:
        request.status = ResupplyStatus.fulfilled
        request.fulfilled_at = now
        request.fulfilled_by = admin.id
        status_label = "fulfilled"
    else:
        request.status = ResupplyStatus.partially_fulfilled
        status_label = "partially fulfilled"

    await db.flush()
    await db.refresh(request, ["item", "requester"])

    try:
        await notify_resupply_status_change(
            db, request.id, request.request_number,
            status_label, request.requested_by,
        )
    except Exception:
        pass

    return _resupply_to_response(request)


@router.put(
    "/{request_id}/cost",
    response_model=ResupplyResponse,
    summary="Update cost tracking",
)
async def update_cost(
    request_id: int,
    body: ResupplyCostUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> ResupplyResponse:
    """Update cost estimates and actuals at any point in the lifecycle."""
    request = await _get_request_or_404(request_id, db)

    if body.estimated_unit_cost is not None:
        request.estimated_unit_cost = body.estimated_unit_cost
    if body.actual_unit_cost is not None:
        request.actual_unit_cost = body.actual_unit_cost
    if body.budget_code is not None:
        request.budget_code = body.budget_code

    await db.flush()
    await db.refresh(request, ["item", "requester"])
    return _resupply_to_response(request)


@router.put(
    "/{request_id}/notes",
    response_model=ResupplyResponse,
    summary="Update admin notes",
)
async def update_admin_notes(
    request_id: int,
    body: ResupplyAdminNotes,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> ResupplyResponse:
    """Append or replace admin notes on a request."""
    request = await _get_request_or_404(request_id, db)
    request.admin_notes = body.admin_notes

    await db.flush()
    await db.refresh(request, ["item", "requester"])
    return _resupply_to_response(request)


# ── Statistics ────────────────────────────────────────────────────


@router.get(
    "/stats",
    response_model=ResupplyStats,
    summary="Resupply statistics for dashboard",
    dependencies=[Depends(require_admin)],
)
async def get_resupply_stats(
    db: AsyncSession = Depends(get_db),
) -> ResupplyStats:
    """Aggregate resupply statistics for the admin dashboard."""
    total = (await db.execute(
        select(func.count(ResupplyRequest.id))
    )).scalar() or 0

    status_result = await db.execute(
        select(ResupplyRequest.status, func.count(ResupplyRequest.id))
        .group_by(ResupplyRequest.status)
    )
    by_status = {row[0].value: row[1] for row in status_result.all()}

    priority_result = await db.execute(
        select(ResupplyRequest.priority, func.count(ResupplyRequest.id))
        .group_by(ResupplyRequest.priority)
    )
    by_priority = {row[0].value: row[1] for row in priority_result.all()}

    pending_review = (await db.execute(
        select(func.count(ResupplyRequest.id)).where(
            ResupplyRequest.status.in_([
                ResupplyStatus.pending,
                ResupplyStatus.under_review,
            ])
        )
    )).scalar() or 0

    overdue = (await db.execute(
        select(func.count(ResupplyRequest.id)).where(
            ResupplyRequest.required_by_date.isnot(None),
            ResupplyRequest.required_by_date < date.today(),
            ResupplyRequest.status.notin_([
                ResupplyStatus.fulfilled,
                ResupplyStatus.rejected,
                ResupplyStatus.cancelled,
            ]),
        )
    )).scalar() or 0

    cost_result = await db.execute(
        select(
            func.coalesce(
                func.sum(ResupplyRequest.estimated_unit_cost * ResupplyRequest.quantity_requested), 0
            ).label("est_total"),
            func.coalesce(
                func.sum(ResupplyRequest.actual_unit_cost * ResupplyRequest.quantity_fulfilled), 0
            ).label("act_total"),
        )
    )
    costs = cost_result.one()

    new_items = (await db.execute(
        select(func.count(ResupplyRequest.id)).where(
            ResupplyRequest.is_new_item_request.is_(True)
        )
    )).scalar() or 0

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month = (await db.execute(
        select(func.count(ResupplyRequest.id)).where(
            ResupplyRequest.created_at >= month_start
        )
    )).scalar() or 0

    return ResupplyStats(
        total_requests=total,
        by_status=by_status,
        by_priority=by_priority,
        pending_review=pending_review,
        overdue_requests=overdue,
        total_estimated_cost=round(float(costs.est_total), 2),
        total_actual_cost=round(float(costs.act_total), 2),
        new_item_requests=new_items,
        this_month_count=this_month,
    )


# ── CSV Export ────────────────────────────────────────────────────


@router.get(
    "/export",
    summary="Export resupply requests as CSV",
    dependencies=[Depends(require_admin)],
)
async def export_resupply_csv(
    status_filter: Optional[ResupplyStatus] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Download resupply requests as CSV. Admin only."""
    query = select(ResupplyRequest).order_by(desc(ResupplyRequest.created_at))
    if status_filter:
        query = query.where(ResupplyRequest.status == status_filter)

    result = await db.execute(query)
    requests = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Request No", "Status", "Priority", "Item", "Item Code",
        "New Item?", "Qty Requested", "Qty Fulfilled", "Requester",
        "Justification", "Task Ref", "Required By", "Supplier",
        "PO Number", "Est. Unit Cost", "Act. Unit Cost",
        "Est. Total", "Act. Total", "Created", "Updated",
    ])

    for r in requests:
        writer.writerow([
            r.request_number,
            r.status.value,
            r.priority.value,
            r.display_item_name,
            r.item.item_code if r.item else "",
            "Yes" if r.is_new_item_request else "No",
            r.quantity_requested,
            r.quantity_fulfilled,
            r.requester.full_name if r.requester else "",
            r.justification[:200],
            r.task_reference or "",
            str(r.required_by_date) if r.required_by_date else "",
            r.supplier_name or "",
            r.external_po_number or "",
            r.estimated_unit_cost or "",
            r.actual_unit_cost or "",
            r.estimated_total_cost or "",
            r.actual_total_cost or "",
            r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
            r.updated_at.strftime("%Y-%m-%d %H:%M") if r.updated_at else "",
        ])

    output.seek(0)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    filename = f"g4lite-resupply-{timestamp}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Internal helper ───────────────────────────────────────────────


async def _get_request_or_404(
    request_id: int,
    db: AsyncSession,
) -> ResupplyRequest:
    """Fetch a resupply request by ID or raise 404."""
    result = await db.execute(
        select(ResupplyRequest).where(ResupplyRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resupply request not found",
        )
    return request