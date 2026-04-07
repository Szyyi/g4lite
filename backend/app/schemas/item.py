"""
G4Lite — Item & Category Schemas
====================================

Pydantic request/response models for the inventory management
endpoints. These are the single source of truth for API validation
and serialisation — routers import from here, never define inline.

Organisation:
- Category schemas (create, update, response, tree node)
- Item schemas (create, update, response, paginated)
- Stock management schemas (adjustment, condition transfer)
- Dashboard schemas (stats, low stock)
- Sort/filter enums
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ENUMS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ItemSortField(str, Enum):
    """Allowed sort fields for the item list endpoint."""

    name = "name"
    item_code = "item_code"
    available_quantity = "available_quantity"
    total_quantity = "total_quantity"
    criticality = "criticality"
    updated_at = "updated_at"
    created_at = "created_at"
    checked_out_count = "checked_out_count"


class CriticalityLevel(str, Enum):
    """Equipment criticality classification."""

    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class UnitOfIssue(str, Enum):
    """Allowed unit-of-issue values for inventory items."""

    each = "each"
    pack = "pack"
    pair = "pair"
    set = "set"
    metre = "metre"
    roll = "roll"
    box = "box"
    kit = "kit"
    spool = "spool"
    sheet = "sheet"
    litre = "litre"


class ConditionState(str, Enum):
    """Equipment condition states matching the Item model."""

    serviceable = "serviceable"
    unserviceable = "unserviceable"
    damaged = "damaged"
    condemned = "condemned"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CATEGORY SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class CategoryCreate(BaseModel):
    """Create a new equipment category."""

    name: str = Field(
        ...,
        min_length=2,
        max_length=120,
        description="Human-readable category name",
    )
    description: Optional[str] = Field(
        None,
        max_length=2000,
        description="Operational description of what this category covers",
    )
    code: Optional[str] = Field(
        None,
        pattern=r"^[A-Z0-9]{2,10}$",
        description="Short alpha code for labels/reports, e.g. COMP, COMMS",
    )
    parent_id: Optional[int] = Field(
        None,
        description="Parent category ID for nesting. Null = top-level.",
    )
    sort_order: int = Field(
        default=0,
        ge=0,
        description="Display order. Lower numbers first.",
    )
    icon: Optional[str] = Field(
        None,
        max_length=60,
        description="MUI icon identifier, e.g. 'memory', 'router', 'bolt'",
    )
    colour: Optional[str] = Field(
        None,
        pattern=r"^#[0-9A-Fa-f]{6}$",
        description="Hex colour for visual coding, e.g. '#3B82F6'",
    )


class CategoryUpdate(BaseModel):
    """Update an existing category. All fields optional — partial update."""

    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    code: Optional[str] = Field(None, pattern=r"^[A-Z0-9]{2,10}$")
    parent_id: Optional[int] = None
    sort_order: Optional[int] = Field(None, ge=0)
    icon: Optional[str] = Field(None, max_length=60)
    colour: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: Optional[bool] = None


class CategoryResponse(BaseModel):
    """Category data returned from the API."""

    id: int
    name: str
    slug: str
    description: Optional[str] = None
    code: Optional[str] = None
    parent_id: Optional[int] = None
    parent_name: Optional[str] = None
    sort_order: int
    icon: Optional[str] = None
    colour: Optional[str] = None
    is_active: bool
    item_count: int = 0
    children: list[CategoryResponse] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CategoryTreeNode(BaseModel):
    """Lightweight category node for the sidebar/filter tree."""

    id: int
    name: str
    slug: str
    code: Optional[str] = None
    icon: Optional[str] = None
    colour: Optional[str] = None
    item_count: int = 0
    children: list[CategoryTreeNode] = []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ITEM SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ItemCreate(BaseModel):
    """Create a new inventory item. Admin only."""

    # Identity
    name: str = Field(..., min_length=2, max_length=200)
    item_code: str = Field(
        ...,
        pattern=r"^[A-Z0-9][A-Z0-9\-]{1,18}[A-Z0-9]$",
        description="Unique short code, e.g. 'RPI4-8GB', 'CAT6-30M'",
    )
    description: Optional[str] = Field(None, description="Detailed specs and notes")
    short_description: Optional[str] = Field(
        None,
        max_length=300,
        description="One-line summary for card views",
    )
    nsn: Optional[str] = Field(
        None,
        pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$",
        description="NATO Stock Number, e.g. '7025-99-123-4567'",
    )

    # Category
    category_id: int

    # Manufacturer
    manufacturer: Optional[str] = Field(None, max_length=120)
    model_number: Optional[str] = Field(None, max_length=100)

    # Quantities
    total_quantity: int = Field(0, ge=0)
    serviceable_count: int = Field(0, ge=0)
    unserviceable_count: int = Field(0, ge=0)
    damaged_count: int = Field(0, ge=0)
    condemned_count: int = Field(0, ge=0)

    # Stock management
    minimum_stock_level: int = Field(0, ge=0)
    reorder_quantity: int = Field(0, ge=0)
    unit_of_issue: UnitOfIssue = UnitOfIssue.each
    max_signout_quantity: int = Field(
        0,
        ge=0,
        description="Max per single sign-out. 0 = no limit.",
    )

    # Location
    storage_location: Optional[str] = Field(None, max_length=60)
    shelf: Optional[str] = Field(None, max_length=30)
    bin: Optional[str] = Field(None, max_length=30)
    weight_grams: Optional[float] = Field(None, gt=0)
    dimensions: Optional[str] = Field(
        None,
        max_length=60,
        description="L×W×H in mm, e.g. '88×58×19.5'",
    )

    # Classification
    criticality: CriticalityLevel = CriticalityLevel.medium
    is_consumable: bool = False
    is_serialised: bool = False
    is_hazmat: bool = False
    requires_approval: bool = False

    # Metadata
    tags: Optional[str] = Field(
        None,
        max_length=500,
        description="Comma-separated tags, e.g. 'gpio,prototype,field-kit'",
    )
    image_url: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, description="Internal admin notes")
    handling_instructions: Optional[str] = Field(
        None,
        description="Special handling shown during sign-out",
    )


class ItemUpdate(BaseModel):
    """Update item metadata. Partial update — only provided fields change.

    Does NOT modify stock quantities. Use /adjust-stock and
    /transfer-condition for quantity changes.
    """

    # Identity
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    item_code: Optional[str] = Field(
        None, pattern=r"^[A-Z0-9][A-Z0-9\-]{1,18}[A-Z0-9]$"
    )
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=300)
    nsn: Optional[str] = Field(
        None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$"
    )

    # Category
    category_id: Optional[int] = None

    # Manufacturer
    manufacturer: Optional[str] = Field(None, max_length=120)
    model_number: Optional[str] = Field(None, max_length=100)

    # Stock management (thresholds only — not actual quantities)
    minimum_stock_level: Optional[int] = Field(None, ge=0)
    reorder_quantity: Optional[int] = Field(None, ge=0)
    unit_of_issue: Optional[UnitOfIssue] = None
    max_signout_quantity: Optional[int] = Field(None, ge=0)

    # Location
    storage_location: Optional[str] = Field(None, max_length=60)
    shelf: Optional[str] = Field(None, max_length=30)
    bin: Optional[str] = Field(None, max_length=30)
    weight_grams: Optional[float] = Field(None, gt=0)
    dimensions: Optional[str] = Field(None, max_length=60)

    # Classification
    criticality: Optional[CriticalityLevel] = None
    is_consumable: Optional[bool] = None
    is_serialised: Optional[bool] = None
    is_hazmat: Optional[bool] = None
    requires_approval: Optional[bool] = None

    # Metadata
    tags: Optional[str] = Field(None, max_length=500)
    image_url: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
    handling_instructions: Optional[str] = None


class ItemResponse(BaseModel):
    """Full item data returned from the API.

    Includes all stored fields plus computed properties from the
    Item model (is_low_stock, utilisation_pct, location_display, etc.).
    """

    # Identity
    id: int
    name: str
    slug: str
    item_code: str
    nsn: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None

    # Category
    category_id: int
    category_name: str = ""
    category_code: Optional[str] = None

    # Manufacturer
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None

    # Quantities
    total_quantity: int
    available_quantity: int
    checked_out_count: int
    serviceable_count: int
    unserviceable_count: int
    damaged_count: int
    condemned_count: int

    # Stock management
    minimum_stock_level: int
    reorder_quantity: int
    unit_of_issue: str
    max_signout_quantity: int

    # Location
    storage_location: Optional[str] = None
    shelf: Optional[str] = None
    bin: Optional[str] = None
    location_display: Optional[str] = None
    weight_grams: Optional[float] = None
    dimensions: Optional[str] = None

    # Classification
    criticality: str
    is_consumable: bool
    is_serialised: bool
    is_hazmat: bool
    requires_approval: bool

    # Computed
    is_low_stock: bool
    is_out_of_stock: bool
    utilisation_pct: float

    # Metadata
    tags: Optional[str] = None
    tag_list: list[str] = []
    image_url: Optional[str] = None
    notes: Optional[str] = None
    handling_instructions: Optional[str] = None

    # Lifecycle
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class ItemBrief(BaseModel):
    """Lightweight item summary for list views, cards, and dropdowns."""

    id: int
    name: str
    slug: str
    item_code: str
    short_description: Optional[str] = None
    category_id: int
    category_name: str = ""
    category_code: Optional[str] = None
    total_quantity: int
    available_quantity: int
    checked_out_count: int
    criticality: str
    is_consumable: bool
    is_hazmat: bool
    requires_approval: bool
    is_low_stock: bool
    is_out_of_stock: bool
    is_active: bool
    storage_location: Optional[str] = None
    location_display: Optional[str] = None
    image_url: Optional[str] = None

    model_config = {"from_attributes": True}

class PaginatedItems(BaseModel):
    """Paginated item list with applied filter metadata."""

    items: list[ItemResponse]
    total: int
    page: int
    page_size: int
    pages: int
    filters_applied: dict = {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  STOCK MANAGEMENT SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class StockAdjustment(BaseModel):
    """Add or remove stock from a specific condition pool.

    Positive adjustment = stock received, found, or corrected upward.
    Negative adjustment = stock consumed, written off, or corrected downward.
    Always requires a reason for the audit trail.

    This is deliberately separate from ItemUpdate because stock changes
    have operational consequences and require justification.
    """

    adjustment: int = Field(
        ...,
        description="Positive to add, negative to remove",
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Mandatory justification for the adjustment",
    )
    condition: ConditionState = Field(
        ConditionState.serviceable,
        description="Which condition pool to adjust",
    )


class ConditionTransfer(BaseModel):
    """Transfer units between condition states without changing totals.

    E.g. move 3 damaged items to condemned after assessment, or
    move 2 unserviceable items to serviceable after repair.
    """

    quantity: int = Field(..., gt=0, description="Number of units to transfer")
    from_condition: ConditionState = Field(
        ..., description="Source condition pool"
    )
    to_condition: ConditionState = Field(
        ..., description="Destination condition pool"
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Mandatory justification",
    )

    @field_validator("to_condition")
    @classmethod
    def conditions_must_differ(cls, v: ConditionState, info) -> ConditionState:
        if info.data.get("from_condition") == v:
            raise ValueError("Source and destination conditions must be different")
        return v


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DASHBOARD SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ItemStats(BaseModel):
    """Aggregated inventory statistics for the admin dashboard.

    Provides a complete snapshot of inventory health in a single
    API call — no need for the frontend to compute anything.
    """

    total_item_types: int
    total_active_items: int
    total_units: int
    available_units: int
    checked_out_units: int
    serviceable_units: int
    unserviceable_units: int
    damaged_units: int
    condemned_units: int
    low_stock_count: int
    out_of_stock_count: int
    critical_items: int
    hazmat_items: int
    approval_required_items: int
    categories_active: int
    utilisation_pct: float


class LowStockItem(BaseModel):
    """Item at or below its minimum stock threshold.

    Sorted by criticality (critical first) then by deficit size.
    Used by the dashboard alert panel and the AI assistant's
    context injection.
    """

    id: int
    name: str
    item_code: str
    category_name: str
    available_quantity: int
    minimum_stock_level: int
    reorder_quantity: int
    criticality: str
    deficit: int