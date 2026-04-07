"""
g4lite — Items & Categories Router
=====================================

Core inventory management endpoints covering:

CATEGORIES (8 endpoints)
- List with hierarchy, filtering, item counts
- Full CRUD with audit trail
- Reorder (sort_order management)
- Bulk operations

ITEMS (14 endpoints)
- Paginated list with advanced filtering and multi-sort
- Full CRUD with all expanded fields
- Stock adjustment (with audit reason — separate from edit)
- Condition adjustment (move units between condition states)
- Soft-delete with active sign-out protection
- Restore deleted items
- Low-stock alerts
- Location-based queries
- CSV export
- Statistics / dashboard aggregates

Schemas are defined here temporarily. They will migrate to
schemas/item.py when the schemas directory is refactored.
"""

from __future__ import annotations

import csv
import io
import math
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.category import Category
from app.models.item import Item
from app.models.signout import SignOut, SignOutStatus
from app.models.user import User
from app.utils.security import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["inventory"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


# ── Category schemas ──────────────────────────────────────────────


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    code: Optional[str] = Field(None, pattern=r"^[A-Z0-9]{2,10}$")
    parent_id: Optional[int] = None
    sort_order: int = Field(default=0, ge=0)
    icon: Optional[str] = Field(None, max_length=60)
    colour: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    code: Optional[str] = Field(None, pattern=r"^[A-Z0-9]{2,10}$")
    parent_id: Optional[int] = None
    sort_order: Optional[int] = Field(None, ge=0)
    icon: Optional[str] = Field(None, max_length=60)
    colour: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: Optional[bool] = None


class CategoryResponse(BaseModel):
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

    model_config = {"from_attributes": True}


class CategoryTreeNode(BaseModel):
    id: int
    name: str
    slug: str
    code: Optional[str] = None
    icon: Optional[str] = None
    colour: Optional[str] = None
    item_count: int = 0
    children: list[CategoryTreeNode] = []


# ── Item schemas ──────────────────────────────────────────────────


class ItemCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    item_code: str = Field(..., pattern=r"^[A-Z0-9][A-Z0-9\-]{1,18}[A-Z0-9]$")
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=300)
    category_id: int
    manufacturer: Optional[str] = Field(None, max_length=120)
    model_number: Optional[str] = Field(None, max_length=100)
    nsn: Optional[str] = Field(None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$")
    total_quantity: int = Field(0, ge=0)
    serviceable_count: int = Field(0, ge=0)
    unserviceable_count: int = Field(0, ge=0)
    damaged_count: int = Field(0, ge=0)
    condemned_count: int = Field(0, ge=0)
    minimum_stock_level: int = Field(0, ge=0)
    reorder_quantity: int = Field(0, ge=0)
    unit_of_issue: str = Field("each")
    max_signout_quantity: int = Field(0, ge=0)
    storage_location: Optional[str] = Field(None, max_length=60)
    shelf: Optional[str] = Field(None, max_length=30)
    bin: Optional[str] = Field(None, max_length=30)
    weight_grams: Optional[float] = Field(None, gt=0)
    dimensions: Optional[str] = Field(None, max_length=60)
    criticality: str = Field("medium")
    is_consumable: bool = False
    is_serialised: bool = False
    is_hazmat: bool = False
    requires_approval: bool = False
    tags: Optional[str] = Field(None, max_length=500)
    image_url: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
    handling_instructions: Optional[str] = None

    @field_validator("criticality")
    @classmethod
    def validate_criticality(cls, v: str) -> str:
        allowed = {"low", "medium", "high", "critical"}
        if v not in allowed:
            raise ValueError(f"Must be one of: {', '.join(allowed)}")
        return v

    @field_validator("unit_of_issue")
    @classmethod
    def validate_unit(cls, v: str) -> str:
        allowed = {
            "each", "pack", "pair", "set", "metre",
            "roll", "box", "kit", "spool", "sheet", "litre",
        }
        if v not in allowed:
            raise ValueError(f"Must be one of: {', '.join(allowed)}")
        return v


class ItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    item_code: Optional[str] = Field(None, pattern=r"^[A-Z0-9][A-Z0-9\-]{1,18}[A-Z0-9]$")
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=300)
    category_id: Optional[int] = None
    manufacturer: Optional[str] = Field(None, max_length=120)
    model_number: Optional[str] = Field(None, max_length=100)
    nsn: Optional[str] = Field(None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$")
    minimum_stock_level: Optional[int] = Field(None, ge=0)
    reorder_quantity: Optional[int] = Field(None, ge=0)
    unit_of_issue: Optional[str] = None
    max_signout_quantity: Optional[int] = Field(None, ge=0)
    storage_location: Optional[str] = Field(None, max_length=60)
    shelf: Optional[str] = Field(None, max_length=30)
    bin: Optional[str] = Field(None, max_length=30)
    weight_grams: Optional[float] = Field(None, gt=0)
    dimensions: Optional[str] = Field(None, max_length=60)
    criticality: Optional[str] = None
    is_consumable: Optional[bool] = None
    is_serialised: Optional[bool] = None
    is_hazmat: Optional[bool] = None
    requires_approval: Optional[bool] = None
    tags: Optional[str] = Field(None, max_length=500)
    image_url: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
    handling_instructions: Optional[str] = None


class StockAdjustment(BaseModel):
    """Adjust total stock quantity with audit reason.
    Separate from ItemUpdate because stock changes require justification."""

    adjustment: int = Field(
        ...,
        description="Positive to add stock, negative to remove",
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Mandatory reason for the adjustment",
    )
    condition: str = Field(
        "serviceable",
        description="Which condition pool to adjust",
    )

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v: str) -> str:
        allowed = {"serviceable", "unserviceable", "damaged", "condemned"}
        if v not in allowed:
            raise ValueError(f"Must be one of: {', '.join(allowed)}")
        return v


class ConditionTransfer(BaseModel):
    """Move units between condition states (e.g. damaged → condemned)."""

    quantity: int = Field(..., gt=0)
    from_condition: str
    to_condition: str
    reason: str = Field(..., min_length=5, max_length=500)

    @field_validator("from_condition", "to_condition")
    @classmethod
    def validate_condition(cls, v: str) -> str:
        allowed = {"serviceable", "unserviceable", "damaged", "condemned"}
        if v not in allowed:
            raise ValueError(f"Must be one of: {', '.join(allowed)}")
        return v


class ItemResponse(BaseModel):
    id: int
    name: str
    slug: str
    item_code: str
    nsn: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    category_id: int
    category_name: str = ""
    category_code: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    total_quantity: int
    available_quantity: int
    checked_out_count: int
    serviceable_count: int
    unserviceable_count: int
    damaged_count: int
    condemned_count: int
    minimum_stock_level: int
    reorder_quantity: int
    unit_of_issue: str
    max_signout_quantity: int
    storage_location: Optional[str] = None
    shelf: Optional[str] = None
    bin: Optional[str] = None
    location_display: Optional[str] = None
    weight_grams: Optional[float] = None
    dimensions: Optional[str] = None
    criticality: str
    is_consumable: bool
    is_serialised: bool
    is_hazmat: bool
    requires_approval: bool
    is_low_stock: bool
    is_out_of_stock: bool
    utilisation_pct: float
    tags: Optional[str] = None
    tag_list: list[str] = []
    image_url: Optional[str] = None
    notes: Optional[str] = None
    handling_instructions: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaginatedItems(BaseModel):
    items: list[ItemResponse]
    total: int
    page: int
    page_size: int
    pages: int
    filters_applied: dict = {}


class ItemStats(BaseModel):
    """Dashboard-level inventory statistics."""

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
    id: int
    name: str
    item_code: str
    category_name: str
    available_quantity: int
    minimum_stock_level: int
    reorder_quantity: int
    criticality: str
    deficit: int


# ── Sort enum ─────────────────────────────────────────────────────


class ItemSortField(str, Enum):
    name = "name"
    item_code = "item_code"
    available_quantity = "available_quantity"
    total_quantity = "total_quantity"
    criticality = "criticality"
    updated_at = "updated_at"
    created_at = "created_at"
    checked_out_count = "checked_out_count"


# ── Helpers ───────────────────────────────────────────────────────


def _item_to_response(item: Item) -> ItemResponse:
    """Map an Item ORM model to the API response schema."""
    return ItemResponse(
        id=item.id,
        name=item.name,
        slug=item.slug,
        item_code=item.item_code,
        nsn=item.nsn,
        description=item.description,
        short_description=item.short_description,
        category_id=item.category_id,
        category_name=item.category.name if item.category else "",
        category_code=item.category.code if item.category else None,
        manufacturer=item.manufacturer,
        model_number=item.model_number,
        total_quantity=item.total_quantity,
        available_quantity=item.available_quantity,
        checked_out_count=item.checked_out_count,
        serviceable_count=item.serviceable_count,
        unserviceable_count=item.unserviceable_count,
        damaged_count=item.damaged_count,
        condemned_count=item.condemned_count,
        minimum_stock_level=item.minimum_stock_level,
        reorder_quantity=item.reorder_quantity,
        unit_of_issue=item.unit_of_issue,
        max_signout_quantity=item.max_signout_quantity,
        storage_location=item.storage_location,
        shelf=item.shelf,
        bin=item.bin,
        location_display=item.location_display,
        weight_grams=item.weight_grams,
        dimensions=item.dimensions,
        criticality=item.criticality,
        is_consumable=item.is_consumable,
        is_serialised=item.is_serialised,
        is_hazmat=item.is_hazmat,
        requires_approval=item.requires_approval,
        is_low_stock=item.is_low_stock,
        is_out_of_stock=item.is_out_of_stock,
        utilisation_pct=item.utilisation_pct,
        tags=item.tags,
        tag_list=item.tag_list,
        image_url=item.image_url,
        notes=item.notes,
        handling_instructions=item.handling_instructions,
        is_active=item.is_active,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _category_to_response(cat: Category, item_count: int = 0) -> CategoryResponse:
    """Map a Category ORM model to the API response."""
    return CategoryResponse(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        description=cat.description,
        code=cat.code,
        parent_id=cat.parent_id,
        parent_name=cat.parent.name if cat.parent else None,
        sort_order=cat.sort_order,
        icon=cat.icon,
        colour=cat.colour,
        is_active=cat.is_active,
        item_count=item_count,
        children=[],
        created_at=cat.created_at,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CATEGORY ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "/categories",
    response_model=list[CategoryResponse],
    summary="List all categories",
)
async def list_categories(
    include_inactive: bool = Query(False),
    include_counts: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CategoryResponse]:
    """List categories with optional item counts and inactive filter."""
    query = select(Category).options(selectinload(Category.parent))

    if not include_inactive:
        query = query.where(Category.is_active.is_(True))

    query = query.order_by(Category.sort_order, Category.name)
    result = await db.execute(query)
    categories = result.scalars().all()

    # Get item counts per category if requested
    counts: dict[int, int] = {}
    if include_counts:
        count_result = await db.execute(
            select(
                Item.category_id,
                func.count(Item.id).label("count"),
            )
            .where(Item.is_active.is_(True))
            .group_by(Item.category_id)
        )
        counts = {row.category_id: row.count for row in count_result.all()}

    return [
        _category_to_response(cat, counts.get(cat.id, 0))
        for cat in categories
    ]


@router.get(
    "/categories/tree",
    response_model=list[CategoryTreeNode],
    summary="Get category hierarchy tree",
)
async def get_category_tree(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CategoryTreeNode]:
    """Return categories as a nested tree structure for sidebar/filter UI."""
    result = await db.execute(
        select(Category)
        .where(Category.is_active.is_(True))
        .order_by(Category.sort_order, Category.name)
    )
    all_cats = result.scalars().all()

    # Item counts
    count_result = await db.execute(
        select(Item.category_id, func.count(Item.id).label("count"))
        .where(Item.is_active.is_(True))
        .group_by(Item.category_id)
    )
    counts = {row.category_id: row.count for row in count_result.all()}

    # Build tree
    top_level = [c for c in all_cats if c.parent_id is None]
    children_map: dict[int, list[Category]] = {}
    for c in all_cats:
        if c.parent_id is not None:
            children_map.setdefault(c.parent_id, []).append(c)

    def _build_node(cat: Category) -> CategoryTreeNode:
        kids = children_map.get(cat.id, [])
        return CategoryTreeNode(
            id=cat.id,
            name=cat.name,
            slug=cat.slug,
            code=cat.code,
            icon=cat.icon,
            colour=cat.colour,
            item_count=counts.get(cat.id, 0),
            children=[_build_node(k) for k in kids],
        )

    return [_build_node(c) for c in top_level]


@router.get(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    summary="Get category by ID",
)
async def get_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CategoryResponse:
    result = await db.execute(
        select(Category)
        .options(selectinload(Category.parent))
        .where(Category.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    count_result = await db.execute(
        select(func.count(Item.id))
        .where(Item.category_id == category_id, Item.is_active.is_(True))
    )
    count = count_result.scalar() or 0

    return _category_to_response(cat, count)


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=201,
    summary="Create a category",
)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CategoryResponse:
    # Check name uniqueness within parent scope
    uniqueness_query = select(Category).where(Category.name == body.name)
    if body.parent_id is not None:
        uniqueness_query = uniqueness_query.where(
            Category.parent_id == body.parent_id
        )
    else:
        uniqueness_query = uniqueness_query.where(
            Category.parent_id.is_(None)
        )

    existing = await db.execute(uniqueness_query)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with this name already exists at this level",
        )

    # Validate parent exists
    if body.parent_id is not None:
        parent = await db.execute(
            select(Category).where(Category.id == body.parent_id)
        )
        if not parent.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent category not found",
            )

    # Check code uniqueness
    if body.code:
        code_check = await db.execute(
            select(Category).where(Category.code == body.code)
        )
        if code_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category code '{body.code}' is already in use",
            )

    cat = Category(**body.model_dump(), created_by=admin.id)
    db.add(cat)
    await db.flush()
    await db.refresh(cat, ["parent"])

    return _category_to_response(cat)


@router.put(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    summary="Update a category",
)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CategoryResponse:
    result = await db.execute(
        select(Category).where(Category.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    update_data = body.model_dump(exclude_unset=True)

    # Prevent self-parenting
    if "parent_id" in update_data and update_data["parent_id"] == category_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A category cannot be its own parent",
        )

    # Name uniqueness within parent scope
    if "name" in update_data:
        parent_id = update_data.get("parent_id", cat.parent_id)
        uniqueness_query = select(Category).where(
            Category.name == update_data["name"],
            Category.id != category_id,
        )
        if parent_id is not None:
            uniqueness_query = uniqueness_query.where(
                Category.parent_id == parent_id
            )
        else:
            uniqueness_query = uniqueness_query.where(
                Category.parent_id.is_(None)
            )
        existing = await db.execute(uniqueness_query)
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A category with this name already exists at this level",
            )

    # Code uniqueness
    if "code" in update_data and update_data["code"]:
        code_check = await db.execute(
            select(Category).where(
                Category.code == update_data["code"],
                Category.id != category_id,
            )
        )
        if code_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category code '{update_data['code']}' is already in use",
            )

    cat.updated_by = admin.id
    for key, value in update_data.items():
        setattr(cat, key, value)

    await db.flush()
    await db.refresh(cat, ["parent"])

    count_result = await db.execute(
        select(func.count(Item.id))
        .where(Item.category_id == category_id, Item.is_active.is_(True))
    )
    count = count_result.scalar() or 0

    return _category_to_response(cat, count)


@router.delete(
    "/categories/{category_id}",
    status_code=204,
    response_model=None,
    summary="Deactivate a category",
)


async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    """Soft-delete a category. Fails if active items still reference it."""
    result = await db.execute(
        select(Category).where(Category.id == category_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Check for active items
    item_count = await db.execute(
        select(func.count(Item.id)).where(
            Item.category_id == category_id,
            Item.is_active.is_(True),
        )
    )
    if (item_count.scalar() or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot deactivate category with active items. "
                   "Reassign or deactivate items first.",
        )

    cat.is_active = False
    cat.updated_by = admin.id
    await db.flush()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ITEM ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "/items",
    response_model=PaginatedItems,
    summary="List items with advanced filtering",
)
async def list_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query("", max_length=200),
    category_id: Optional[int] = Query(None),
    criticality: Optional[str] = Query(None),
    is_consumable: Optional[bool] = Query(None),
    is_hazmat: Optional[bool] = Query(None),
    requires_approval: Optional[bool] = Query(None),
    low_stock_only: bool = Query(False),
    out_of_stock_only: bool = Query(False),
    include_inactive: bool = Query(False),
    storage_location: Optional[str] = Query(None, max_length=60),
    tag: Optional[str] = Query(None, max_length=100),
    sort_by: ItemSortField = Query(ItemSortField.name),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedItems:
    """Paginated item list with comprehensive filtering and sorting."""
    query = select(Item)

    if not include_inactive:
        query = query.where(Item.is_active.is_(True))

    # ── Filters ───────────────────────────────────────────────────
    filters_applied: dict = {}

    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Item.name.ilike(pattern),
                Item.item_code.ilike(pattern),
                Item.description.ilike(pattern),
                Item.short_description.ilike(pattern),
                Item.tags.ilike(pattern),
                Item.manufacturer.ilike(pattern),
                Item.model_number.ilike(pattern),
            )
        )
        filters_applied["search"] = search

    if category_id is not None:
        # Include child categories
        child_result = await db.execute(
            select(Category.id).where(Category.parent_id == category_id)
        )
        child_ids = [row[0] for row in child_result.all()]
        all_category_ids = [category_id] + child_ids

        query = query.where(Item.category_id.in_(all_category_ids))
        filters_applied["category_id"] = category_id

    if criticality:
        query = query.where(Item.criticality == criticality)
        filters_applied["criticality"] = criticality

    if is_consumable is not None:
        query = query.where(Item.is_consumable == is_consumable)
        filters_applied["is_consumable"] = is_consumable

    if is_hazmat is not None:
        query = query.where(Item.is_hazmat == is_hazmat)
        filters_applied["is_hazmat"] = is_hazmat

    if requires_approval is not None:
        query = query.where(Item.requires_approval == requires_approval)
        filters_applied["requires_approval"] = requires_approval

    if low_stock_only:
        query = query.where(
            Item.minimum_stock_level > 0,
            Item.available_quantity <= Item.minimum_stock_level,
        )
        filters_applied["low_stock_only"] = True

    if out_of_stock_only:
        query = query.where(Item.available_quantity <= 0)
        filters_applied["out_of_stock_only"] = True

    if storage_location:
        query = query.where(Item.storage_location.ilike(f"%{storage_location}%"))
        filters_applied["storage_location"] = storage_location

    if tag:
        query = query.where(Item.tags.ilike(f"%{tag}%"))
        filters_applied["tag"] = tag

    # ── Count ─────────────────────────────────────────────────────
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # ── Sort ──────────────────────────────────────────────────────
    sort_column = getattr(Item, sort_by.value, Item.name)
    if sort_by == ItemSortField.criticality:
        # Custom sort order: critical > high > medium > low
        sort_column = case(
            (Item.criticality == "critical", 0),
            (Item.criticality == "high", 1),
            (Item.criticality == "medium", 2),
            (Item.criticality == "low", 3),
            else_=4,
        )
    order = desc(sort_column) if sort_dir == "desc" else sort_column
    query = query.order_by(order).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = [_item_to_response(i) for i in result.scalars().all()]

    return PaginatedItems(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 1,
        filters_applied=filters_applied,
    )


@router.get(
    "/items/stats",
    response_model=ItemStats,
    summary="Inventory statistics for dashboard",
)
async def get_item_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ItemStats:
    """Aggregated inventory statistics for the admin dashboard."""
    # Core stats
    result = await db.execute(
        select(
            func.count(Item.id).label("total"),
            func.coalesce(func.sum(Item.total_quantity), 0).label("total_units"),
            func.coalesce(func.sum(Item.available_quantity), 0).label("available"),
            func.coalesce(func.sum(Item.checked_out_count), 0).label("checked_out"),
            func.coalesce(func.sum(Item.serviceable_count), 0).label("serviceable"),
            func.coalesce(func.sum(Item.unserviceable_count), 0).label("unserviceable"),
            func.coalesce(func.sum(Item.damaged_count), 0).label("damaged"),
            func.coalesce(func.sum(Item.condemned_count), 0).label("condemned"),
        ).where(Item.is_active.is_(True))
    )
    row = result.one()

    # Low stock count
    low_stock = await db.execute(
        select(func.count(Item.id)).where(
            Item.is_active.is_(True),
            Item.minimum_stock_level > 0,
            Item.available_quantity <= Item.minimum_stock_level,
        )
    )

    # Out of stock count
    out_of_stock = await db.execute(
        select(func.count(Item.id)).where(
            Item.is_active.is_(True),
            Item.available_quantity <= 0,
            Item.total_quantity > 0,
        )
    )

    # Classification counts
    critical_count = await db.execute(
        select(func.count(Item.id)).where(
            Item.is_active.is_(True),
            Item.criticality == "critical",
        )
    )
    hazmat_count = await db.execute(
        select(func.count(Item.id)).where(
            Item.is_active.is_(True),
            Item.is_hazmat.is_(True),
        )
    )
    approval_count = await db.execute(
        select(func.count(Item.id)).where(
            Item.is_active.is_(True),
            Item.requires_approval.is_(True),
        )
    )

    # Active categories
    cat_count = await db.execute(
        select(func.count(Category.id)).where(Category.is_active.is_(True))
    )

    # Total items (including inactive, for context)
    total_all = await db.execute(select(func.count(Item.id)))

    total_units = int(row.total_units)
    checked_out = int(row.checked_out)
    utilisation = round((checked_out / total_units * 100), 1) if total_units > 0 else 0.0

    return ItemStats(
        total_item_types=total_all.scalar() or 0,
        total_active_items=row.total,
        total_units=total_units,
        available_units=int(row.available),
        checked_out_units=checked_out,
        serviceable_units=int(row.serviceable),
        unserviceable_units=int(row.unserviceable),
        damaged_units=int(row.damaged),
        condemned_units=int(row.condemned),
        low_stock_count=low_stock.scalar() or 0,
        out_of_stock_count=out_of_stock.scalar() or 0,
        critical_items=critical_count.scalar() or 0,
        hazmat_items=hazmat_count.scalar() or 0,
        approval_required_items=approval_count.scalar() or 0,
        categories_active=cat_count.scalar() or 0,
        utilisation_pct=utilisation,
    )


@router.get(
    "/items/low-stock",
    response_model=list[LowStockItem],
    summary="Items at or below minimum stock",
)
async def get_low_stock_items(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LowStockItem]:
    """Items where available_quantity ≤ minimum_stock_level."""
    result = await db.execute(
        select(Item)
        .where(
            Item.is_active.is_(True),
            Item.minimum_stock_level > 0,
            Item.available_quantity <= Item.minimum_stock_level,
        )
        .order_by(
            # Most critical first, then by largest deficit
            case(
                (Item.criticality == "critical", 0),
                (Item.criticality == "high", 1),
                (Item.criticality == "medium", 2),
                (Item.criticality == "low", 3),
                else_=4,
            ),
            (Item.available_quantity - Item.minimum_stock_level),
        )
    )
    items = result.scalars().all()

    return [
        LowStockItem(
            id=item.id,
            name=item.name,
            item_code=item.item_code,
            category_name=item.category.name if item.category else "",
            available_quantity=item.available_quantity,
            minimum_stock_level=item.minimum_stock_level,
            reorder_quantity=item.reorder_quantity,
            criticality=item.criticality,
            deficit=item.minimum_stock_level - item.available_quantity,
        )
        for item in items
    ]


@router.get(
    "/items/export",
    summary="Export inventory as CSV",
)
async def export_items_csv(
    category_id: Optional[int] = Query(None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> StreamingResponse:
    """Export inventory items as a downloadable CSV file. Admin only."""
    query = select(Item)
    if not include_inactive:
        query = query.where(Item.is_active.is_(True))
    if category_id:
        query = query.where(Item.category_id == category_id)
    query = query.order_by(Item.item_code)

    result = await db.execute(query)
    items = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Item Code", "Name", "Category", "Total Qty", "Available",
        "Checked Out", "Serviceable", "Unserviceable", "Damaged",
        "Condemned", "Min Stock", "Criticality", "Location",
        "Unit of Issue", "Manufacturer", "Model", "NSN", "Status",
    ])

    for item in items:
        writer.writerow([
            item.item_code,
            item.name,
            item.category.name if item.category else "",
            item.total_quantity,
            item.available_quantity,
            item.checked_out_count,
            item.serviceable_count,
            item.unserviceable_count,
            item.damaged_count,
            item.condemned_count,
            item.minimum_stock_level,
            item.criticality,
            item.location_display or "",
            item.unit_of_issue,
            item.manufacturer or "",
            item.model_number or "",
            item.nsn or "",
            "Active" if item.is_active else "Inactive",
        ])

    output.seek(0)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    filename = f"g4lite-inventory-{timestamp}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/items/{item_id}",
    response_model=ItemResponse,
    summary="Get item by ID",
)
async def get_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ItemResponse:
    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _item_to_response(item)


@router.post(
    "/items",
    response_model=ItemResponse,
    status_code=201,
    summary="Create an item",
)
async def create_item(
    body: ItemCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ItemResponse:
    """Create a new inventory item. Admin only.

    Validates category exists, item_code uniqueness, and sets
    initial available_quantity = serviceable_count.
    """
    # Validate category
    cat_result = await db.execute(
        select(Category).where(
            Category.id == body.category_id,
            Category.is_active.is_(True),
        )
    )
    if not cat_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category not found or inactive",
        )

    # Check item_code uniqueness
    code_check = await db.execute(
        select(Item).where(Item.item_code == body.item_code)
    )
    if code_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Item code '{body.item_code}' is already in use",
        )

    # Check NSN uniqueness if provided
    if body.nsn:
        nsn_check = await db.execute(
            select(Item).where(Item.nsn == body.nsn)
        )
        if nsn_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"NSN '{body.nsn}' is already assigned to another item",
            )

    # Build item with computed fields
    item_data = body.model_dump()

    # Validate quantity invariant
    condition_sum = (
        item_data["serviceable_count"]
        + item_data["unserviceable_count"]
        + item_data["damaged_count"]
        + item_data["condemned_count"]
    )
    if item_data["total_quantity"] == 0:
        item_data["total_quantity"] = condition_sum

    if item_data["total_quantity"] != condition_sum:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Total quantity ({item_data['total_quantity']}) must equal "
                f"sum of condition counts ({condition_sum})"
            ),
        )

    # Set computed fields
    item_data["available_quantity"] = item_data["serviceable_count"]
    item_data["checked_out_count"] = 0

    item = Item(**item_data, created_by=admin.id)
    db.add(item)
    await db.flush()
    await db.refresh(item, ["category"])

    return _item_to_response(item)


@router.put(
    "/items/{item_id}",
    response_model=ItemResponse,
    summary="Update item metadata",
)
async def update_item(
    item_id: int,
    body: ItemUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ItemResponse:
    """Update item metadata fields. Admin only.

    Does NOT modify stock quantities — use /items/{id}/adjust-stock
    and /items/{id}/transfer-condition for quantity changes.
    """
    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    update_data = body.model_dump(exclude_unset=True)

    # Validate uniqueness constraints on updated fields
    if "item_code" in update_data:
        code_check = await db.execute(
            select(Item).where(
                Item.item_code == update_data["item_code"],
                Item.id != item_id,
            )
        )
        if code_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Item code '{update_data['item_code']}' is already in use",
            )

    if "nsn" in update_data and update_data["nsn"]:
        nsn_check = await db.execute(
            select(Item).where(
                Item.nsn == update_data["nsn"],
                Item.id != item_id,
            )
        )
        if nsn_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"NSN '{update_data['nsn']}' is already assigned",
            )

    if "category_id" in update_data:
        cat_check = await db.execute(
            select(Category).where(
                Category.id == update_data["category_id"],
                Category.is_active.is_(True),
            )
        )
        if not cat_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Category not found or inactive",
            )

    item.updated_by = admin.id
    for key, value in update_data.items():
        setattr(item, key, value)

    await db.flush()
    await db.refresh(item, ["category"])

    return _item_to_response(item)


@router.post(
    "/items/{item_id}/adjust-stock",
    response_model=ItemResponse,
    summary="Adjust stock quantity with audit reason",
)
async def adjust_stock(
    item_id: int,
    body: StockAdjustment,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ItemResponse:
    """Add or remove stock from a specific condition pool.

    Positive adjustment = stock received / found.
    Negative adjustment = stock consumed / written off / lost.
    Always requires a reason for audit trail.
    """
    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    condition_field = f"{body.condition}_count"
    current_value = getattr(item, condition_field, None)
    if current_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid condition: {body.condition}",
        )

    new_value = current_value + body.adjustment
    if new_value < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot reduce {body.condition} count below 0. "
                f"Current: {current_value}, adjustment: {body.adjustment}"
            ),
        )

    # Apply changes
    setattr(item, condition_field, new_value)
    item.total_quantity += body.adjustment

    # Recalculate available_quantity if serviceable changed
    if body.condition == "serviceable":
        item.available_quantity = item.serviceable_count - item.checked_out_count

    item.updated_by = admin.id
    await db.flush()
    await db.refresh(item, ["category"])

    # TODO: Create audit log entry with body.reason

    return _item_to_response(item)


@router.post(
    "/items/{item_id}/transfer-condition",
    response_model=ItemResponse,
    summary="Transfer units between condition states",
)
async def transfer_condition(
    item_id: int,
    body: ConditionTransfer,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ItemResponse:
    """Move units from one condition state to another.

    E.g. move 3 damaged items to condemned after assessment.
    Total quantity is unchanged — only condition distribution shifts.
    """
    if body.from_condition == body.to_condition:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and destination conditions must be different",
        )

    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.is_active.is_(True))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    from_field = f"{body.from_condition}_count"
    to_field = f"{body.to_condition}_count"

    from_value = getattr(item, from_field)
    to_value = getattr(item, to_field)

    if body.quantity > from_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Insufficient {body.from_condition} units. "
                f"Available: {from_value}, requested: {body.quantity}"
            ),
        )

    # Apply transfer
    setattr(item, from_field, from_value - body.quantity)
    setattr(item, to_field, to_value + body.quantity)

    # Recalculate available if serviceable was involved
    if "serviceable" in (body.from_condition, body.to_condition):
        item.available_quantity = item.serviceable_count - item.checked_out_count

    item.updated_by = admin.id
    await db.flush()
    await db.refresh(item, ["category"])

    # TODO: Create audit log entry with body.reason

    return _item_to_response(item)


@router.delete(
    "/items/{item_id}",
    status_code=204,
    response_model=None,
    summary="Deactivate an item",
)
async def delete_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    """Soft-delete an item. Fails if there are active sign-outs."""
    result = await db.execute(
        select(Item).where(Item.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if not item.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item is already deactivated",
        )

    # Check for active sign-outs
    active_signouts = await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.item_id == item_id,
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.pending_approval,
                SignOutStatus.approved,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
            ]),
        )
    )
    if (active_signouts.scalar() or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot deactivate item with active sign-outs. "
                   "Process all returns first.",
        )

    item.is_active = False
    item.deleted_at = datetime.now(timezone.utc)
    item.deleted_by = admin.id
    item.updated_by = admin.id
    await db.flush()


@router.post(
    "/items/{item_id}/restore",
    response_model=ItemResponse,
    summary="Restore a deactivated item",
)
async def restore_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> ItemResponse:
    """Restore a soft-deleted item back to active status."""
    result = await db.execute(
        select(Item).where(Item.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item is already active",
        )

    item.is_active = True
    item.deleted_at = None
    item.deleted_by = None
    item.updated_by = admin.id
    await db.flush()
    await db.refresh(item, ["category"])

    return _item_to_response(item)