"""
g4lite — Sign-Outs Router
============================

Equipment sign-out lifecycle from creation through approval,
collection, extension, partial return, full return, and loss
declaration.

User endpoints:
- POST /                      Create a sign-out
- GET  /mine                  List my sign-outs (active + history)
- GET  /{id}                  View sign-out detail
- PUT  /{id}/return           Return equipment (full or partial)
- PUT  /{id}/extend           Request return date extension

Admin endpoints:
- GET  /                      All sign-outs with filters + pagination
- GET  /overdue               Overdue sign-outs
- PUT  /{id}/approve          Approve a pending sign-out
- PUT  /{id}/reject           Reject a pending sign-out
- PUT  /{id}/extend           Extend return date (admin override)
- PUT  /{id}/return           Process a return (admin can return for any user)
- PUT  /{id}/declare-lost     Declare equipment as lost
- GET  /stats                 Sign-out statistics for dashboard
- GET  /export                CSV export

Reference number: SO-YYYYMM-NNNN (e.g. SO-202604-0037)
"""

from __future__ import annotations

import csv
import io
import math
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.item import Item
from app.models.signout import (
    SIGNOUT_STATUS_TRANSITIONS,
    EquipmentCondition,
    SignOut,
    SignOutStatus,
)
from app.models.user import User
from app.services.notification_service import (
    notify_damaged_return,
    notify_signout,
)
from app.utils.security import get_current_user, require_admin

router = APIRouter(prefix="/api/signouts", tags=["signouts"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class SignOutCreate(BaseModel):
    """Create a new equipment sign-out."""

    item_id: int
    quantity: int = Field(..., gt=0)
    full_name: str = Field(..., min_length=2, max_length=120)
    rank: Optional[str] = Field(None, max_length=50)
    unit: Optional[str] = Field(None, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=30)
    task_reference: str = Field(..., min_length=2, max_length=200)
    purpose: Optional[str] = Field(None, max_length=2000)
    expected_return_date: date
    duration_days: Optional[int] = Field(None, gt=0)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("expected_return_date")
    @classmethod
    def validate_return_date(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("Expected return date must be in the future")
        return v


class ReturnRequest(BaseModel):
    """Return equipment — supports per-condition quantity breakdown."""

    # Per-condition quantities (must sum to quantity_returning)
    quantity_serviceable: int = Field(0, ge=0)
    quantity_unserviceable: int = Field(0, ge=0)
    quantity_damaged: int = Field(0, ge=0)
    quantity_condemned: int = Field(0, ge=0)
    return_notes: Optional[str] = Field(None, max_length=2000)
    damage_description: Optional[str] = Field(None, max_length=2000)
    return_inspected: bool = Field(
        False,
        description="True if admin physically verified condition",
    )

    @property
    def total_returning(self) -> int:
        return (
            self.quantity_serviceable
            + self.quantity_unserviceable
            + self.quantity_damaged
            + self.quantity_condemned
        )


class ExtensionRequest(BaseModel):
    """Extend the expected return date."""

    new_return_date: date
    reason: str = Field(..., min_length=5, max_length=500)

    @field_validator("new_return_date")
    @classmethod
    def validate_date(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("New return date must be in the future")
        return v


class ApprovalRequest(BaseModel):
    admin_notes: Optional[str] = Field(None, max_length=2000)


class RejectionRequest(BaseModel):
    rejected_reason: str = Field(..., min_length=5, max_length=2000)


class LossDeclaration(BaseModel):
    quantity_lost: int = Field(..., gt=0)
    loss_report: str = Field(..., min_length=20, max_length=5000)


class SignOutResponse(BaseModel):
    id: int
    signout_ref: str
    item_id: int
    item_name: str
    item_code: Optional[str] = None
    item_name_snapshot: Optional[str] = None
    user_id: int
    full_name: str
    rank: Optional[str] = None
    unit: Optional[str] = None
    contact_number: Optional[str] = None
    task_reference: str
    purpose: Optional[str] = None
    quantity: int
    quantity_returned: int
    quantity_outstanding: int
    quantity_lost: int
    return_completion_pct: float
    # Per-condition return breakdown
    quantity_returned_serviceable: int
    quantity_returned_unserviceable: int
    quantity_returned_damaged: int
    quantity_returned_condemned: int
    # Dates
    expected_return_date: date
    original_return_date: date
    duration_days: Optional[int] = None
    days_remaining: int
    overdue_days: int
    # Extension
    extension_count: int
    was_extended: bool
    # Condition
    condition_on_issue: str
    condition_on_return: Optional[str] = None
    has_damage: bool
    # Status
    status: str
    is_overdue_now: bool
    notes: Optional[str] = None
    return_notes: Optional[str] = None
    damage_description: Optional[str] = None
    return_inspected: bool
    rejected_reason: Optional[str] = None
    loss_report: Optional[str] = None
    # Approval
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    requires_approval: bool = False
    # Timestamps
    signed_out_at: datetime
    collected_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaginatedSignOuts(BaseModel):
    signouts: list[SignOutResponse]
    total: int
    page: int
    page_size: int
    pages: int


class SignOutStats(BaseModel):
    total_signouts: int
    active: int
    overdue: int
    pending_approval: int
    returned_today: int
    returned_this_week: int
    partially_returned: int
    lost: int
    total_units_out: int
    avg_duration_days: Optional[float] = None
    overdue_by_item: list[dict] = []


class SignOutSortField(str, Enum):
    signed_out_at = "signed_out_at"
    expected_return_date = "expected_return_date"
    full_name = "full_name"
    quantity = "quantity"
    status = "status"
    signout_ref = "signout_ref"


# ── Helpers ───────────────────────────────────────────────────────


async def _generate_signout_ref(db: AsyncSession) -> str:
    """Generate the next sequential sign-out reference: SO-YYYYMM-NNNN."""
    now = datetime.now(timezone.utc)
    prefix = f"SO-{now.strftime('%Y%m')}-"

    result = await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.signout_ref.like(f"{prefix}%")
        )
    )
    count = (result.scalar() or 0) + 1
    return f"{prefix}{count:04d}"


def _signout_to_response(so: SignOut) -> SignOutResponse:
    """Map a SignOut ORM model to the API response."""
    item_name = so.item.name if so.item else (so.item_name_snapshot or "")
    item_code = so.item.item_code if so.item else (so.item_code_snapshot or None)
    requires_approval = so.item.requires_approval if so.item else False

    return SignOutResponse(
        id=so.id,
        signout_ref=so.signout_ref,
        item_id=so.item_id,
        item_name=item_name,
        item_code=item_code,
        item_name_snapshot=so.item_name_snapshot,
        user_id=so.user_id,
        full_name=so.full_name,
        rank=so.rank,
        unit=so.unit,
        contact_number=so.contact_number,
        task_reference=so.task_reference,
        purpose=so.purpose,
        quantity=so.quantity,
        quantity_returned=so.quantity_returned,
        quantity_outstanding=so.quantity_outstanding,
        quantity_lost=so.quantity_lost,
        return_completion_pct=so.return_completion_pct,
        quantity_returned_serviceable=so.quantity_returned_serviceable,
        quantity_returned_unserviceable=so.quantity_returned_unserviceable,
        quantity_returned_damaged=so.quantity_returned_damaged,
        quantity_returned_condemned=so.quantity_returned_condemned,
        expected_return_date=so.expected_return_date,
        original_return_date=so.original_return_date,
        duration_days=so.duration_days,
        days_remaining=so.days_remaining,
        overdue_days=so.overdue_days,
        extension_count=so.extension_count,
        was_extended=so.was_extended,
        condition_on_issue=so.condition_on_issue.value,
        condition_on_return=so.condition_on_return.value if so.condition_on_return else None,
        has_damage=so.has_damage,
        status=so.status.value,
        is_overdue_now=so.is_overdue_now,
        notes=so.notes,
        return_notes=so.return_notes,
        damage_description=so.damage_description,
        return_inspected=so.return_inspected,
        rejected_reason=so.rejected_reason,
        loss_report=so.loss_report,
        approved_by=so.approved_by,
        approved_at=so.approved_at,
        requires_approval=requires_approval,
        signed_out_at=so.signed_out_at,
        collected_at=so.collected_at,
        returned_at=so.returned_at,
        created_at=so.created_at,
        updated_at=so.updated_at,
    )


def _validate_transition(so: SignOut, target: SignOutStatus) -> None:
    """Validate status transition or raise 409."""
    allowed, reason = so.can_transition_to(target)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=reason,
        )


async def _get_signout_or_404(
    signout_id: int,
    db: AsyncSession,
) -> SignOut:
    """Fetch a sign-out by ID or raise 404."""
    result = await db.execute(
        select(SignOut).where(SignOut.id == signout_id)
    )
    so = result.scalar_one_or_none()
    if not so:
        raise HTTPException(status_code=404, detail="Sign-out not found")
    return so


def _determine_worst_condition(
    svc: int, unsvc: int, dmg: int, cond: int,
) -> EquipmentCondition:
    """Determine the worst condition from a return breakdown."""
    if cond > 0:
        return EquipmentCondition.condemned
    if dmg > 0:
        return EquipmentCondition.damaged
    if unsvc > 0:
        return EquipmentCondition.unserviceable
    return EquipmentCondition.serviceable


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  USER ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.post(
    "",
    response_model=SignOutResponse,
    status_code=201,
    summary="Sign out equipment",
)
async def create_signout(
    body: SignOutCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SignOutResponse:
    """Create a new equipment sign-out.

    Items with `requires_approval=True` start in `pending_approval`
    status. All others go straight to `active` and immediately
    decrement the item's available quantity.
    """
    # Validate item
    result = await db.execute(
        select(Item).where(Item.id == body.item_id, Item.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found or inactive")

    # Check sign-out eligibility via model method
    can_so, reason = item.can_sign_out(body.quantity)
    if not can_so:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=reason,
        )

    # Calculate duration
    duration = body.duration_days
    if not duration:
        delta = body.expected_return_date - date.today()
        duration = max(delta.days, 1)

    # Generate reference
    signout_ref = await _generate_signout_ref(db)

    # Determine initial status
    if item.requires_approval:
        initial_status = SignOutStatus.pending_approval
    else:
        initial_status = SignOutStatus.active
        # Immediately deduct from available stock
        item.available_quantity -= body.quantity
        item.checked_out_count += body.quantity

    signout = SignOut(
        signout_ref=signout_ref,
        item_id=body.item_id,
        item_code_snapshot=item.item_code,
        item_name_snapshot=item.name,
        user_id=current_user.id,
        quantity=body.quantity,
        full_name=body.full_name,
        rank=body.rank,
        unit=body.unit,
        contact_number=body.contact_number,
        task_reference=body.task_reference,
        purpose=body.purpose,
        expected_return_date=body.expected_return_date,
        original_return_date=body.expected_return_date,
        duration_days=duration,
        notes=body.notes,
        status=initial_status,
        condition_on_issue=EquipmentCondition.serviceable,
    )
    db.add(signout)
    await db.flush()
    await db.refresh(signout, ["item", "user"])

    # Notify admins
    try:
        await notify_signout(
            db, body.full_name, item.name, body.quantity, signout.id
        )
    except Exception:
        pass

    return _signout_to_response(signout)


@router.get(
    "/mine",
    response_model=list[SignOutResponse],
    summary="List my sign-outs",
)
async def list_my_signouts(
    status_filter: Optional[SignOutStatus] = Query(None, alias="status"),
    active_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SignOutResponse]:
    """List the current user's sign-outs with optional filtering."""
    query = select(SignOut).where(SignOut.user_id == current_user.id)

    if status_filter is not None:
        query = query.where(SignOut.status == status_filter)
    elif active_only:
        query = query.where(
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.pending_approval,
                SignOutStatus.approved,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
            ])
        )

    query = query.order_by(desc(SignOut.signed_out_at)).limit(limit)
    result = await db.execute(query)

    return [_signout_to_response(so) for so in result.scalars().all()]


@router.get(
    "/{signout_id}",
    response_model=SignOutResponse,
    summary="Get sign-out detail",
)
async def get_signout(
    signout_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SignOutResponse:
    """Get a single sign-out. Users see their own; admins see all."""
    so = await _get_signout_or_404(signout_id, db)

    if so.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return _signout_to_response(so)


@router.put(
    "/{signout_id}/return",
    response_model=SignOutResponse,
    summary="Return equipment",
)
async def return_signout(
    signout_id: int,
    body: ReturnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SignOutResponse:
    """Return equipment with per-condition quantity breakdown.

    Supports partial returns: if total_returning < quantity_outstanding,
    the sign-out moves to partially_returned. If total_returning equals
    quantity_outstanding, it moves to returned (terminal).

    Each condition quantity updates the corresponding count on the Item
    model, maintaining the quantity invariant.
    """
    so = await _get_signout_or_404(signout_id, db)

    # Permission check
    if so.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to return this sign-out",
        )

    # Must be in a returnable state
    if so.status not in (
        SignOutStatus.active,
        SignOutStatus.partially_returned,
        SignOutStatus.overdue,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot return a sign-out in '{so.status.value}' state",
        )

    total_returning = body.total_returning
    if total_returning <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must return at least 1 unit. Provide quantities per condition.",
        )

    if total_returning > so.quantity_outstanding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Returning {total_returning} units but only "
                f"{so.quantity_outstanding} outstanding"
            ),
        )

    now = datetime.now(timezone.utc)

    # ── Update sign-out condition counts ──────────────────────────
    so.quantity_returned += total_returning
    so.quantity_returned_serviceable += body.quantity_serviceable
    so.quantity_returned_unserviceable += body.quantity_unserviceable
    so.quantity_returned_damaged += body.quantity_damaged
    so.quantity_returned_condemned += body.quantity_condemned
    so.return_notes = body.return_notes
    so.damage_description = body.damage_description
    so.return_inspected = body.return_inspected

    # Set overall return condition to worst condition returned
    so.condition_on_return = _determine_worst_condition(
        body.quantity_serviceable,
        body.quantity_unserviceable,
        body.quantity_damaged,
        body.quantity_condemned,
    )

    # Admin processing the return
    if current_user.is_admin:
        so.received_by = current_user.id

    # ── Determine new status ──────────────────────────────────────
    if so.quantity_outstanding == 0:
        so.status = SignOutStatus.returned
        so.returned_at = now
    else:
        so.status = SignOutStatus.partially_returned

    # ── Update item stock ─────────────────────────────────────────
    item_result = await db.execute(
        select(Item).where(Item.id == so.item_id)
    )
    item = item_result.scalar_one_or_none()
    if item:
        # Return units to their respective condition pools
        item.serviceable_count += body.quantity_serviceable
        item.unserviceable_count += body.quantity_unserviceable
        item.damaged_count += body.quantity_damaged
        item.condemned_count += body.quantity_condemned

        # Decrease checked out count
        item.checked_out_count -= total_returning

        # Available = serviceable not checked out
        item.available_quantity = item.serviceable_count - item.checked_out_count

    await db.flush()
    await db.refresh(so, ["item", "user"])

    # ── Notify if damaged/condemned ───────────────────────────────
    if body.quantity_damaged > 0 or body.quantity_condemned > 0:
        try:
            worst = so.condition_on_return.value if so.condition_on_return else "damaged"
            await notify_damaged_return(
                db, so.full_name,
                item.name if item else so.item_name_snapshot or "",
                worst, so.id,
            )
        except Exception:
            pass

    return _signout_to_response(so)


@router.put(
    "/{signout_id}/extend",
    response_model=SignOutResponse,
    summary="Extend return date",
)
async def extend_signout(
    signout_id: int,
    body: ExtensionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SignOutResponse:
    """Extend the expected return date. Both users and admins can extend.

    The new date must be after the current expected return date.
    The original return date is preserved for audit purposes.
    """
    so = await _get_signout_or_404(signout_id, db)

    if so.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    if so.is_terminal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot extend a sign-out in '{so.status.value}' state",
        )

    if body.new_return_date <= so.expected_return_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New return date must be after the current expected date",
        )

    now = datetime.now(timezone.utc)
    so.expected_return_date = body.new_return_date
    so.extension_count += 1
    so.last_extended_at = now
    so.last_extended_by = current_user.id

    # If was overdue, revert to active
    if so.status == SignOutStatus.overdue and not so.is_overdue_now:
        so.status = SignOutStatus.active

    # Recalculate duration
    so.duration_days = (body.new_return_date - date.today()).days

    await db.flush()
    await db.refresh(so, ["item", "user"])

    return _signout_to_response(so)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "",
    response_model=PaginatedSignOuts,
    summary="List all sign-outs (admin)",
)
async def list_all_signouts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=200),
    status_filter: Optional[SignOutStatus] = Query(None, alias="status"),
    item_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    overdue_only: bool = Query(False),
    has_damage: bool = Query(False),
    sort_by: SignOutSortField = Query(SignOutSortField.signed_out_at),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> PaginatedSignOuts:
    """Paginated list of all sign-outs with advanced filtering. Admin only."""
    query = select(SignOut)

    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                SignOut.signout_ref.ilike(pattern),
                SignOut.full_name.ilike(pattern),
                SignOut.task_reference.ilike(pattern),
                SignOut.unit.ilike(pattern),
                SignOut.item_name_snapshot.ilike(pattern),
            )
        )

    if status_filter is not None:
        query = query.where(SignOut.status == status_filter)

    if item_id is not None:
        query = query.where(SignOut.item_id == item_id)

    if user_id is not None:
        query = query.where(SignOut.user_id == user_id)

    if overdue_only:
        query = query.where(
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
            ]),
            SignOut.expected_return_date < date.today(),
        )

    if has_damage:
        query = query.where(
            or_(
                SignOut.quantity_returned_damaged > 0,
                SignOut.quantity_returned_condemned > 0,
            )
        )

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Sort
    sort_column = getattr(SignOut, sort_by.value, SignOut.signed_out_at)
    order = desc(sort_column) if sort_dir == "desc" else sort_column
    query = query.order_by(order).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    signouts = [_signout_to_response(so) for so in result.scalars().all()]

    return PaginatedSignOuts(
        signouts=signouts,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 1,
    )


@router.get(
    "/overdue",
    response_model=list[SignOutResponse],
    summary="List overdue sign-outs",
)
async def list_overdue(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[SignOutResponse]:
    """All sign-outs past their expected return date, sorted by most overdue first."""
    today = date.today()
    result = await db.execute(
        select(SignOut)
        .where(
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
            ]),
            SignOut.expected_return_date < today,
        )
        .order_by(SignOut.expected_return_date.asc())
    )

    return [_signout_to_response(so) for so in result.scalars().all()]


@router.put(
    "/{signout_id}/approve",
    response_model=SignOutResponse,
    summary="Approve a pending sign-out",
)
async def approve_signout(
    signout_id: int,
    body: ApprovalRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SignOutResponse:
    """Approve a pending_approval sign-out → approved.

    Deducts the item's available quantity and increments checked_out_count.
    The user can now collect equipment (access PIN generated separately).
    """
    so = await _get_signout_or_404(signout_id, db)
    _validate_transition(so, SignOutStatus.approved)

    now = datetime.now(timezone.utc)
    so.status = SignOutStatus.approved
    so.approved_by = admin.id
    so.approved_at = now

    if body.admin_notes:
        so.notes = (so.notes or "") + f"\n[Admin: {body.admin_notes}]"

    # Deduct stock now that approval is granted
    item_result = await db.execute(
        select(Item).where(Item.id == so.item_id)
    )
    item = item_result.scalar_one_or_none()
    if item:
        if item.available_quantity < so.quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Insufficient stock to approve. Available: "
                    f"{item.available_quantity}, required: {so.quantity}"
                ),
            )
        item.available_quantity -= so.quantity
        item.checked_out_count += so.quantity

    await db.flush()
    await db.refresh(so, ["item", "user"])

    return _signout_to_response(so)


@router.put(
    "/{signout_id}/reject",
    response_model=SignOutResponse,
    summary="Reject a pending sign-out",
)
async def reject_signout(
    signout_id: int,
    body: RejectionRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SignOutResponse:
    """Reject a pending or approved sign-out with mandatory reason.
    No stock changes — stock was never deducted for pending, or is
    restored for approved."""
    so = await _get_signout_or_404(signout_id, db)
    _validate_transition(so, SignOutStatus.rejected)

    # If was approved (stock already deducted), restore it
    if so.status == SignOutStatus.approved:
        item_result = await db.execute(
            select(Item).where(Item.id == so.item_id)
        )
        item = item_result.scalar_one_or_none()
        if item:
            item.available_quantity += so.quantity
            item.checked_out_count -= so.quantity

    so.status = SignOutStatus.rejected
    so.rejected_reason = body.rejected_reason

    await db.flush()
    await db.refresh(so, ["item", "user"])

    return _signout_to_response(so)


@router.put(
    "/{signout_id}/declare-lost",
    response_model=SignOutResponse,
    summary="Declare equipment as lost",
)
async def declare_lost(
    signout_id: int,
    body: LossDeclaration,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SignOutResponse:
    """Declare some or all outstanding equipment as lost.

    Reduces the item's total quantity and checked_out_count by the
    lost amount. The lost units are permanently removed from inventory.
    """
    so = await _get_signout_or_404(signout_id, db)

    if so.is_terminal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot declare loss on a '{so.status.value}' sign-out",
        )

    if body.quantity_lost > so.quantity_outstanding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot lose {body.quantity_lost} units — "
                f"only {so.quantity_outstanding} outstanding"
            ),
        )

    now = datetime.now(timezone.utc)
    so.quantity_lost += body.quantity_lost
    so.loss_report = body.loss_report
    so.lost_declared_at = now
    so.lost_declared_by = admin.id

    # If nothing outstanding after loss, mark as lost (terminal)
    if so.quantity_outstanding == 0:
        so.status = SignOutStatus.lost
    # If some items were already returned, keep partially_returned
    # The overdue checker will handle status separately

    # ── Update item stock — lost units are removed from inventory ─
    item_result = await db.execute(
        select(Item).where(Item.id == so.item_id)
    )
    item = item_result.scalar_one_or_none()
    if item:
        item.checked_out_count -= body.quantity_lost
        item.total_quantity -= body.quantity_lost
        item.available_quantity = item.serviceable_count - item.checked_out_count

    await db.flush()
    await db.refresh(so, ["item", "user"])

    return _signout_to_response(so)


# ── Statistics ────────────────────────────────────────────────────


@router.get(
    "/stats",
    response_model=SignOutStats,
    summary="Sign-out statistics for dashboard",
    dependencies=[Depends(require_admin)],
)
async def get_signout_stats(
    db: AsyncSession = Depends(get_db),
) -> SignOutStats:
    """Aggregate sign-out statistics for the admin dashboard."""
    today = date.today()
    week_ago = today - timedelta(days=7)

    total = (await db.execute(
        select(func.count(SignOut.id))
    )).scalar() or 0

    # Status counts
    active = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.status == SignOutStatus.active
        )
    )).scalar() or 0

    overdue = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
            ]),
            SignOut.expected_return_date < today,
        )
    )).scalar() or 0

    pending = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.status == SignOutStatus.pending_approval
        )
    )).scalar() or 0

    partial = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.status == SignOutStatus.partially_returned
        )
    )).scalar() or 0

    lost = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.status == SignOutStatus.lost
        )
    )).scalar() or 0

    # Returns today and this week
    returned_today = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.status == SignOutStatus.returned,
            func.date(SignOut.returned_at) == today,
        )
    )).scalar() or 0

    returned_week = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.status == SignOutStatus.returned,
            func.date(SignOut.returned_at) >= week_ago,
        )
    )).scalar() or 0

    # Total units currently out
    units_out = (await db.execute(
        select(func.coalesce(
            func.sum(SignOut.quantity - SignOut.quantity_returned - SignOut.quantity_lost), 0
        )).where(
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
                SignOutStatus.approved,
            ])
        )
    )).scalar() or 0

    # Top overdue items
    overdue_items_result = await db.execute(
        select(
            SignOut.item_name_snapshot,
            func.count(SignOut.id).label("count"),
        )
        .where(
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.overdue,
                SignOutStatus.partially_returned,
            ]),
            SignOut.expected_return_date < today,
        )
        .group_by(SignOut.item_name_snapshot)
        .order_by(desc("count"))
        .limit(5)
    )
    overdue_by_item = [
        {"item_name": row[0] or "Unknown", "count": row[1]}
        for row in overdue_items_result.all()
    ]

    return SignOutStats(
        total_signouts=total,
        active=active,
        overdue=overdue,
        pending_approval=pending,
        returned_today=returned_today,
        returned_this_week=returned_week,
        partially_returned=partial,
        lost=lost,
        total_units_out=int(units_out),
        overdue_by_item=overdue_by_item,
    )


# ── CSV Export ────────────────────────────────────────────────────


@router.get(
    "/export",
    summary="Export sign-outs as CSV",
    dependencies=[Depends(require_admin)],
)
async def export_signouts_csv(
    status_filter: Optional[SignOutStatus] = Query(None, alias="status"),
    overdue_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Download sign-outs as CSV. Admin only."""
    query = select(SignOut).order_by(desc(SignOut.signed_out_at))

    if status_filter:
        query = query.where(SignOut.status == status_filter)
    if overdue_only:
        query = query.where(
            SignOut.expected_return_date < date.today(),
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
            ]),
        )

    result = await db.execute(query)
    signouts = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Ref", "Status", "Item", "Item Code", "Qty", "Returned",
        "Outstanding", "Lost", "Full Name", "Rank", "Unit",
        "Task Ref", "Signed Out", "Due Date", "Returned At",
        "Overdue Days", "Extensions", "Condition on Return",
        "Damage Description",
    ])

    for so in signouts:
        writer.writerow([
            so.signout_ref,
            so.status.value,
            so.item_name_snapshot or (so.item.name if so.item else ""),
            so.item_code_snapshot or "",
            so.quantity,
            so.quantity_returned,
            so.quantity_outstanding,
            so.quantity_lost,
            so.full_name,
            so.rank or "",
            so.unit or "",
            so.task_reference,
            so.signed_out_at.strftime("%Y-%m-%d %H:%M") if so.signed_out_at else "",
            str(so.expected_return_date),
            so.returned_at.strftime("%Y-%m-%d %H:%M") if so.returned_at else "",
            so.overdue_days,
            so.extension_count,
            so.condition_on_return.value if so.condition_on_return else "",
            so.damage_description or "",
        ])

    output.seek(0)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    filename = f"g4lite-signouts-{timestamp}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )