"""
G4Lite — Resupply Schemas
=============================

Pydantic request/response models for the resupply procurement
lifecycle. Each stage of the workflow has a dedicated request schema
to enforce exactly the right fields at the right time.

Organisation:
- Enums (sort fields, re-exported status/priority from model)
- Creation schemas (user submits request)
- Workflow schemas (review, approve, reject, order, fulfill, cancel)
- Maintenance schemas (cost update, admin notes)
- Response schemas (full, paginated)
- Dashboard schemas (stats)
- Helper function (ORM → response mapping)
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Re-export model enums for router convenience
from app.models.resupply import (
    RESUPPLY_STATUS_TRANSITIONS,
    ResupplyPriority,
    ResupplyStatus,
)

__all__ = [
    # Enums
    "ResupplyStatus",
    "ResupplyPriority",
    "ResupplySortField",
    "RESUPPLY_STATUS_TRANSITIONS",
    # Creation
    "ResupplyCreate",
    # Workflow
    "ResupplyApproval",
    "ResupplyRejection",
    "ResupplyOrderDetails",
    "ResupplyFulfillment",
    "ResupplyCancellation",
    # Maintenance
    "ResupplyCostUpdate",
    "ResupplyAdminNotes",
    # Response
    "ResupplyResponse",
    "PaginatedResupply",
    # Dashboard
    "ResupplyStats",
    # Helper
    "resupply_to_response",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ENUMS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ResupplySortField(str, Enum):
    """Allowed sort fields for the resupply list endpoint."""

    created_at = "created_at"
    priority = "priority"
    status = "status"
    required_by_date = "required_by_date"
    quantity_requested = "quantity_requested"
    request_number = "request_number"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CREATION SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ResupplyCreate(BaseModel):
    """User submits a new resupply request.

    For existing items: provide item_id.
    For new items not in catalogue: leave item_id null, provide
    item_name_freetext and optionally item_description,
    suggested_category_id, and suggested_supplier.
    """

    item_id: Optional[int] = Field(
        None,
        description="FK to existing item for restock. Null = new item request.",
    )
    item_name_freetext: Optional[str] = Field(
        None,
        max_length=250,
        description="Name of new item not yet in catalogue",
    )
    item_description: Optional[str] = Field(
        None,
        max_length=2000,
        description="Specifications and details for new item requests",
    )
    suggested_category_id: Optional[int] = Field(
        None,
        description="Suggested category for new item requests",
    )
    suggested_supplier: Optional[str] = Field(
        None,
        max_length=200,
        description="Requester's suggested supplier or source",
    )
    quantity_requested: int = Field(
        ...,
        gt=0,
        description="Number of units requested",
    )
    justification: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="Operational justification for the request",
    )
    priority: ResupplyPriority = Field(
        ResupplyPriority.routine,
        description="Urgency: routine, urgent, critical, emergency",
    )
    required_by_date: Optional[date] = Field(
        None,
        description="Date by which items are operationally needed",
    )
    task_reference: Optional[str] = Field(
        None,
        max_length=150,
        description="Task, exercise, or project driving this request",
    )

    @field_validator("required_by_date")
    @classmethod
    def validate_future_date(cls, v: date | None) -> date | None:
        if v is not None and v <= date.today():
            raise ValueError("Required-by date must be in the future")
        return v


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  WORKFLOW SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ResupplyApproval(BaseModel):
    """Admin approves a request (under_review → approved).

    Optionally attach a cost estimate and budget code at approval time.
    """

    admin_notes: Optional[str] = Field(None, max_length=2000)
    estimated_unit_cost: Optional[float] = Field(
        None,
        ge=0,
        description="Estimated cost per unit in base currency (GBP)",
    )
    budget_code: Optional[str] = Field(
        None,
        max_length=50,
        description="External budget or cost centre reference",
    )


class ResupplyRejection(BaseModel):
    """Admin rejects a request with mandatory reason."""

    rejection_reason: str = Field(
        ...,
        min_length=5,
        max_length=2000,
        description="Explanation for why the request was rejected",
    )
    admin_notes: Optional[str] = Field(None, max_length=2000)


class ResupplyOrderDetails(BaseModel):
    """Admin records that an order has been placed with a supplier.

    Captures supplier identity, PO reference, expected delivery,
    and cost information. Transitions status: approved → ordered.
    """

    supplier_name: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Supplier or vendor name",
    )
    supplier_reference: Optional[str] = Field(
        None,
        max_length=100,
        description="Supplier's order or quote reference",
    )
    external_po_number: Optional[str] = Field(
        None,
        max_length=60,
        description="External purchase order number",
    )
    expected_delivery_date: Optional[date] = Field(
        None,
        description="Expected delivery date from supplier",
    )
    estimated_unit_cost: Optional[float] = Field(None, ge=0)
    actual_unit_cost: Optional[float] = Field(None, ge=0)
    admin_notes: Optional[str] = Field(None, max_length=2000)


class ResupplyFulfillment(BaseModel):
    """Record a delivery (partial or full).

    quantity_received is additive — each call increments the
    request's quantity_fulfilled. When quantity_fulfilled reaches
    quantity_requested, the request auto-transitions to fulfilled.
    """

    quantity_received: int = Field(
        ...,
        gt=0,
        description="Units received in this delivery",
    )
    actual_unit_cost: Optional[float] = Field(
        None,
        ge=0,
        description="Actual cost per unit for this delivery",
    )
    actual_delivery_date: Optional[date] = Field(
        None,
        description="Date this delivery was received",
    )
    delivery_notes: Optional[str] = Field(
        None,
        max_length=2000,
        description="Notes on this delivery (partial, damaged in transit, etc.)",
    )


class ResupplyCancellation(BaseModel):
    """Cancel a resupply request with mandatory reason.

    Users can cancel their own requests before ordering.
    Admins can cancel any non-terminal request.
    """

    cancellation_reason: str = Field(
        ...,
        min_length=5,
        max_length=2000,
        description="Reason for cancelling the request",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MAINTENANCE SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ResupplyCostUpdate(BaseModel):
    """Update cost tracking at any point in the lifecycle."""

    estimated_unit_cost: Optional[float] = Field(None, ge=0)
    actual_unit_cost: Optional[float] = Field(None, ge=0)
    budget_code: Optional[str] = Field(None, max_length=50)


class ResupplyAdminNotes(BaseModel):
    """Update or replace admin notes on a request."""

    admin_notes: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RESPONSE SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ResupplyResponse(BaseModel):
    """Full resupply request data returned from the API.

    Includes all stored fields plus computed properties from the
    ResupplyRequest model (quantity_outstanding, fulfillment_pct,
    is_overdue, days_until_required, estimated/actual_total_cost).
    """

    # Identity
    id: int
    request_number: str

    # Item reference
    item_id: Optional[int] = None
    item_name: str
    item_code: Optional[str] = None
    is_new_item_request: bool

    # New item details
    item_name_freetext: Optional[str] = None
    item_description: Optional[str] = None
    suggested_category_id: Optional[int] = None
    suggested_category_name: Optional[str] = None
    suggested_supplier: Optional[str] = None

    # Requester
    requested_by: int
    requester_name: str
    requester_rank: Optional[str] = None

    # Quantities
    quantity_requested: int
    quantity_fulfilled: int
    quantity_outstanding: int
    fulfillment_pct: float

    # Request details
    justification: str
    priority: str
    required_by_date: Optional[date] = None
    task_reference: Optional[str] = None

    # Status
    status: str
    is_overdue: bool = False
    days_until_required: Optional[int] = None

    # Review / approval chain
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    # Cost tracking
    estimated_unit_cost: Optional[float] = None
    actual_unit_cost: Optional[float] = None
    estimated_total_cost: Optional[float] = None
    actual_total_cost: Optional[float] = None
    budget_code: Optional[str] = None

    # External procurement
    supplier_name: Optional[str] = None
    supplier_reference: Optional[str] = None
    external_po_number: Optional[str] = None

    # Delivery tracking
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


class ResupplyBrief(BaseModel):
    """Lightweight resupply summary for list views and dashboards.

    Omits full justification, delivery notes, and rejection details
    to keep table rendering fast.
    """

    id: int
    request_number: str
    item_name: str
    item_code: Optional[str] = None
    is_new_item_request: bool
    requester_name: str
    quantity_requested: int
    quantity_fulfilled: int
    fulfillment_pct: float
    priority: str
    status: str
    is_overdue: bool = False
    required_by_date: Optional[date] = None
    supplier_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedResupply(BaseModel):
    """Paginated resupply request list."""

    requests: list[ResupplyResponse]
    total: int
    page: int
    page_size: int
    pages: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DASHBOARD SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ResupplyStats(BaseModel):
    """Aggregate resupply statistics for the admin dashboard."""

    total_requests: int
    by_status: dict[str, int] = Field(
        default_factory=dict,
        description="Count per ResupplyStatus value",
    )
    by_priority: dict[str, int] = Field(
        default_factory=dict,
        description="Count per ResupplyPriority value",
    )
    pending_review: int = Field(
        0,
        description="Requests in pending or under_review status",
    )
    overdue_requests: int = Field(
        0,
        description="Active requests past their required_by_date",
    )
    total_estimated_cost: float = Field(
        0.0,
        description="Sum of estimated_unit_cost × quantity_requested",
    )
    total_actual_cost: float = Field(
        0.0,
        description="Sum of actual_unit_cost × quantity_fulfilled",
    )
    avg_fulfillment_days: Optional[float] = Field(
        None,
        description="Average days from creation to fulfillment",
    )
    new_item_requests: int = Field(
        0,
        description="Requests for items not in current catalogue",
    )
    this_month_count: int = Field(
        0,
        description="Requests submitted this calendar month",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  HELPER: ORM → Response mapping
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def resupply_to_response(r) -> ResupplyResponse:
    """Map a ResupplyRequest ORM model to the API response schema.

    Centralised here so the router and any services that need to
    return resupply data use consistent mapping logic.
    """
    item_name = r.display_item_name
    item_code = r.item.item_code if r.item else None

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


def resupply_to_brief(r) -> ResupplyBrief:
    """Map a ResupplyRequest ORM model to the lightweight brief schema."""
    return ResupplyBrief(
        id=r.id,
        request_number=r.request_number,
        item_name=r.display_item_name,
        item_code=r.item.item_code if r.item else None,
        is_new_item_request=r.is_new_item_request,
        requester_name=r.requester.full_name if r.requester else "",
        quantity_requested=r.quantity_requested,
        quantity_fulfilled=r.quantity_fulfilled,
        fulfillment_pct=r.fulfillment_pct,
        priority=r.priority.value,
        status=r.status.value,
        is_overdue=r.is_overdue,
        required_by_date=r.required_by_date,
        supplier_name=r.supplier_name,
        created_at=r.created_at,
    )