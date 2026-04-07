"""
G4Lite — Sign-Out Schemas
=============================

Pydantic request/response models for the equipment sign-out
lifecycle. Each workflow stage has a dedicated request schema
enforcing exactly the right fields at the right time.

Organisation:
- Enums (sort fields, re-exported status/condition from model)
- Creation schemas (user creates sign-out)
- Return schemas (full/partial return with per-condition breakdown)
- Workflow schemas (approve, reject, extend, declare lost)
- Response schemas (full, paginated)
- Dashboard schemas (stats)
- Helper function (ORM → response mapping)
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

# Re-export model enums for router convenience
from app.models.signout import (
    EquipmentCondition,
    SIGNOUT_STATUS_TRANSITIONS,
    SignOutStatus,
)

__all__ = [
    # Enums
    "SignOutStatus",
    "EquipmentCondition",
    "SignOutSortField",
    "SIGNOUT_STATUS_TRANSITIONS",
    # Creation
    "SignOutCreate",
    # Return
    "ReturnRequest",
    # Workflow
    "ApprovalRequest",
    "RejectionRequest",
    "ExtensionRequest",
    "LossDeclaration",
    # Response
    "SignOutResponse",
    "PaginatedSignOuts",
    # Dashboard
    "SignOutStats",
    # Helper
    "signout_to_response",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ENUMS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class SignOutSortField(str, Enum):
    """Allowed sort fields for the sign-out list endpoint."""

    signed_out_at = "signed_out_at"
    expected_return_date = "expected_return_date"
    full_name = "full_name"
    quantity = "quantity"
    status = "status"
    signout_ref = "signout_ref"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CREATION SCHEMA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class SignOutCreate(BaseModel):
    """Create a new equipment sign-out.

    Items with `requires_approval=True` will start in pending_approval
    status. All others go straight to active.
    """

    item_id: int
    quantity: int = Field(
        ...,
        gt=0,
        description="Number of units to sign out",
    )
    full_name: str = Field(
        ...,
        min_length=2,
        max_length=120,
        description="Full name of the person collecting equipment",
    )
    rank: Optional[str] = Field(
        None,
        max_length=50,
        description="Rank or title of the collector",
    )
    unit: Optional[str] = Field(
        None,
        max_length=100,
        description="Unit, team, or department",
    )
    contact_number: Optional[str] = Field(
        None,
        max_length=30,
        description="Contact number for overdue follow-up",
    )
    task_reference: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Task, exercise, operation, or project reference",
    )
    purpose: Optional[str] = Field(
        None,
        max_length=2000,
        description="Detailed purpose or justification",
    )
    expected_return_date: date = Field(
        ...,
        description="When equipment is expected to be returned",
    )
    duration_days: Optional[int] = Field(
        None,
        gt=0,
        description="Planned duration in days (auto-calculated if omitted)",
    )
    notes: Optional[str] = Field(
        None,
        max_length=2000,
        description="Additional notes for the sign-out",
    )

    @field_validator("expected_return_date")
    @classmethod
    def validate_return_date(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("Expected return date must be in the future")
        return v


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RETURN SCHEMA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ReturnRequest(BaseModel):
    """Return equipment with per-condition quantity breakdown.

    Supports partial returns: if total < outstanding, the sign-out
    moves to partially_returned. If total == outstanding, it moves
    to returned (terminal).

    The four condition quantities must sum to at least 1 and cannot
    exceed the sign-out's outstanding quantity (validated by the router
    against live data).

    Example: Returning 5 items from a sign-out of 10
      quantity_serviceable: 3
      quantity_unserviceable: 0
      quantity_damaged: 1
      quantity_condemned: 1
      → total returning: 5, outstanding after: 5, status: partially_returned
    """

    quantity_serviceable: int = Field(
        0,
        ge=0,
        description="Units returned in serviceable condition",
    )
    quantity_unserviceable: int = Field(
        0,
        ge=0,
        description="Units returned requiring repair",
    )
    quantity_damaged: int = Field(
        0,
        ge=0,
        description="Units returned damaged",
    )
    quantity_condemned: int = Field(
        0,
        ge=0,
        description="Units returned beyond economical repair",
    )
    return_notes: Optional[str] = Field(
        None,
        max_length=2000,
        description="Notes on the return (user-facing)",
    )
    damage_description: Optional[str] = Field(
        None,
        max_length=2000,
        description="Detailed damage report if items damaged/condemned",
    )
    return_inspected: bool = Field(
        False,
        description="True if admin physically verified condition",
    )

    @property
    def total_returning(self) -> int:
        """Sum of all condition quantities being returned."""
        return (
            self.quantity_serviceable
            + self.quantity_unserviceable
            + self.quantity_damaged
            + self.quantity_condemned
        )

    @model_validator(mode="after")
    def validate_at_least_one(self) -> "ReturnRequest":
        if self.total_returning <= 0:
            raise ValueError(
                "Must return at least 1 unit. "
                "Provide quantities in at least one condition field."
            )
        return self

    @model_validator(mode="after")
    def validate_damage_description(self) -> "ReturnRequest":
        if (self.quantity_damaged > 0 or self.quantity_condemned > 0) and not self.damage_description:
            raise ValueError(
                "damage_description is required when returning damaged or condemned items"
            )
        return self


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  WORKFLOW SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ApprovalRequest(BaseModel):
    """Admin approves a pending sign-out.

    Stock is deducted from the item on approval, not on creation.
    The user can then collect equipment (access PIN generated separately).
    """

    admin_notes: Optional[str] = Field(
        None,
        max_length=2000,
        description="Notes appended to the sign-out record",
    )


class RejectionRequest(BaseModel):
    """Admin rejects a pending or approved sign-out.

    If the sign-out was already approved (stock deducted), stock is
    restored automatically. Mandatory reason enforced.
    """

    rejected_reason: str = Field(
        ...,
        min_length=5,
        max_length=2000,
        description="Explanation for why the sign-out was rejected",
    )


class ExtensionRequest(BaseModel):
    """Extend the expected return date of an active sign-out.

    The new date must be after the current expected return date.
    The original return date is preserved for audit purposes.
    Extension count is incremented automatically.
    """

    new_return_date: date = Field(
        ...,
        description="New expected return date",
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Justification for the extension",
    )

    @field_validator("new_return_date")
    @classmethod
    def validate_future_date(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("New return date must be in the future")
        return v


class LossDeclaration(BaseModel):
    """Declare some or all outstanding equipment as lost.

    Lost units are permanently removed from the item's total inventory.
    A detailed loss report is mandatory for the audit trail.
    """

    quantity_lost: int = Field(
        ...,
        gt=0,
        description="Number of units to declare as lost",
    )
    loss_report: str = Field(
        ...,
        min_length=20,
        max_length=5000,
        description="Detailed narrative of how/when equipment was lost",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RESPONSE SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class SignOutResponse(BaseModel):
    """Full sign-out data returned from the API.

    Includes all stored fields plus computed properties from the
    SignOut model (quantity_outstanding, overdue_days, has_damage,
    return_completion_pct, etc.).
    """

    # Identity
    id: int
    signout_ref: str

    # Item reference
    item_id: int
    item_name: str
    item_code: Optional[str] = None
    item_name_snapshot: Optional[str] = None

    # Personnel
    user_id: int
    full_name: str
    rank: Optional[str] = None
    unit: Optional[str] = None
    contact_number: Optional[str] = None

    # Task context
    task_reference: str
    purpose: Optional[str] = None

    # Quantities
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

    # Extensions
    extension_count: int
    was_extended: bool

    # Condition
    condition_on_issue: str
    condition_on_return: Optional[str] = None
    has_damage: bool

    # Status
    status: str
    is_overdue_now: bool

    # Notes
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


class SignOutBrief(BaseModel):
    """Lightweight sign-out summary for table views and user activity.

    Omits notes, damage description, loss report, and per-condition
    breakdown to keep table rendering fast.
    """

    id: int
    signout_ref: str
    item_name: str
    item_code: Optional[str] = None
    full_name: str
    rank: Optional[str] = None
    quantity: int
    quantity_returned: int
    quantity_outstanding: int
    status: str
    is_overdue_now: bool
    expected_return_date: date
    overdue_days: int
    extension_count: int
    has_damage: bool
    signed_out_at: datetime
    returned_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaginatedSignOuts(BaseModel):
    """Paginated sign-out list."""

    signouts: list[SignOutResponse]
    total: int
    page: int
    page_size: int
    pages: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DASHBOARD SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class SignOutStats(BaseModel):
    """Aggregate sign-out statistics for the admin dashboard."""

    total_signouts: int
    active: int
    overdue: int
    pending_approval: int
    returned_today: int
    returned_this_week: int
    partially_returned: int
    lost: int
    total_units_out: int = Field(
        0,
        description="Total individual units currently in the field",
    )
    avg_duration_days: Optional[float] = Field(
        None,
        description="Average sign-out duration for returned items",
    )
    overdue_by_item: list[dict] = Field(
        default_factory=list,
        description="Top 5 items with most overdue sign-outs: [{item_name, count}]",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HELPER: ORM → Response mapping
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def signout_to_response(so) -> SignOutResponse:
    """Map a SignOut ORM model to the API response schema.

    Centralised here so the router and any services that need to
    return sign-out data use consistent mapping logic.
    """
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


def signout_to_brief(so) -> SignOutBrief:
    """Map a SignOut ORM model to the lightweight brief schema."""
    return SignOutBrief(
        id=so.id,
        signout_ref=so.signout_ref,
        item_name=so.item.name if so.item else (so.item_name_snapshot or ""),
        item_code=so.item.item_code if so.item else (so.item_code_snapshot or None),
        full_name=so.full_name,
        rank=so.rank,
        quantity=so.quantity,
        quantity_returned=so.quantity_returned,
        quantity_outstanding=so.quantity_outstanding,
        status=so.status.value,
        is_overdue_now=so.is_overdue_now,
        expected_return_date=so.expected_return_date,
        overdue_days=so.overdue_days,
        extension_count=so.extension_count,
        has_damage=so.has_damage,
        signed_out_at=so.signed_out_at,
        returned_at=so.returned_at,
    )