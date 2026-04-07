"""
g4lite — Item Model
=====================

Core equipment inventory item with full logistics metadata suitable
for a C2-grade store management platform.

Key design decisions:

IDENTITY
- `item_code` is the primary human-facing identifier. Format enforced
  at DB level: uppercase alphanumeric + hyphens, 3–20 chars.
  Examples: "RPI4-8GB", "CAT6-30M", "PB-50K", "NUC-I7-01".
  This is what gets printed on labels, referenced in reports, and
  spoken over radio.
- `slug` is URL-safe, auto-derived from name (same pattern as Category).
- `nsn` (NATO Stock Number) is optional — used when items have a real
  NSN for interoperability with military logistics systems.

STOCK MANAGEMENT
- `total_quantity` = serviceable + unserviceable + damaged + checked_out.
  This is a hard invariant enforced by a CHECK constraint.
- `available_quantity` = serviceable items not currently checked out.
  This is the number shown to users as "available to sign out".
- `minimum_stock_level` triggers a low-stock warning when
  available_quantity drops to or below this threshold.
- `reorder_quantity` is the suggested quantity for resupply requests.

CONDITION TRACKING
- Four condition states: serviceable, unserviceable, damaged, condemned.
  Condemned is new — items beyond economical repair awaiting disposal.
- `checked_out_count` is denormalized for fast dashboard queries.
  It equals total_quantity - serviceable - unserviceable - damaged - condemned.

PHYSICAL ATTRIBUTES
- Location fields: `storage_location`, `shelf`, `bin` — supports a
  hierarchical physical addressing scheme like "CAGE-A / SHELF-03 / BIN-12".
- `weight_grams` and `dimensions` for packing lists and transport planning.
- `is_serialised` flag distinguishes tracked-by-serial items (laptops)
  from bulk consumables (cable ties). Serialised items may later get
  individual serial tracking via a separate `serial_numbers` table.

CLASSIFICATION
- `criticality`: low | medium | high | critical — drives dashboard
  priority sorting and low-stock alert severity.
- `is_consumable`: consumable items (cable ties, thermal paste) are
  expected to not return. Non-consumable items trigger overdue checks.
- `is_hazmat`: flags items requiring special handling procedures.
- `requires_approval`: if true, sign-outs for this item require admin
  approval before the access PIN is generated.

LIFECYCLE
- Soft-delete via `is_active` (renamed from `is_deleted` for positive
  semantics, consistent with Category model).
- `deleted_at` + `deleted_by` for audit trail on deactivation.
- Full audit: created_by, updated_by with timestamps.
"""

from __future__ import annotations

import re
from datetime import datetime
import enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    event,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.signout import SignOut
    from app.models.resupply import ResupplyRequest
    from app.models.user import User

# ── Enums ─────────────────────────────────────────────────────────
class CriticalityLevel(str, enum.Enum):
    """Item criticality classification."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ConditionState(str, enum.Enum):
    """Physical condition of an item."""
    SERVICEABLE = "serviceable"
    UNSERVICEABLE = "unserviceable"
    DAMAGED = "damaged"
    CONDEMNED = "condemned"


def _slugify(value: str) -> str:
    """Convert a name to a URL-safe slug."""
    value = value.lower().strip()
    value = re.sub(r"[&+]", "", value)
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-")


class Item(Base):
    """Physical equipment item tracked in the g4lite store."""

    __tablename__ = "items"

    # ── Primary key ───────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    # ── Identity ──────────────────────────────────────────────────
    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        index=True,
        comment="Full display name, e.g. 'Raspberry Pi 4 Model B (8GB)'",
    )
    slug: Mapped[str] = mapped_column(
        String(220),
        nullable=False,
        unique=True,
        index=True,
        comment="URL-safe identifier, auto-derived from name",
    )
    item_code: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        unique=True,
        index=True,
        comment="Human-facing short code for labels and reports, e.g. 'RPI4-8GB'",
    )
    nsn: Mapped[Optional[str]] = mapped_column(
        String(16),
        nullable=True,
        unique=True,
        default=None,
        comment="NATO Stock Number if applicable, e.g. '7025-99-123-4567'",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Detailed operational description and specifications",
    )
    short_description: Mapped[Optional[str]] = mapped_column(
        String(300),
        nullable=True,
        default=None,
        comment="One-line summary for card views and table rows",
    )

    # ── Category ──────────────────────────────────────────────────
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="FK to categories. RESTRICT prevents deleting categories with items.",
    )

    # ── Manufacturer / Model ──────────────────────────────────────
    manufacturer: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        default=None,
        comment="Manufacturer or brand name",
    )
    model_number: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        default=None,
        comment="Manufacturer model or part number",
    )

    # ── Stock quantities ──────────────────────────────────────────
    total_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total items on charge (all conditions + checked out)",
    )
    available_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Serviceable items not currently checked out",
    )
    serviceable_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Items in serviceable condition (on shelf)",
    )
    unserviceable_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Items requiring repair",
    )
    damaged_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Items damaged, awaiting assessment",
    )
    condemned_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Items beyond economical repair, awaiting disposal",
    )
    checked_out_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Items currently signed out (denormalized for fast queries)",
    )

    # ── Stock management ──────────────────────────────────────────
    minimum_stock_level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Low-stock warning threshold on available_quantity",
    )
    reorder_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Suggested quantity for resupply requests",
    )
    unit_of_issue: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="each",
        comment="Unit type: 'each', 'pack', 'metre', 'box', 'set', etc.",
    )
    max_signout_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Max items a single user can sign out at once. 0 = no limit.",
    )

    # ── Physical attributes ───────────────────────────────────────
    storage_location: Mapped[Optional[str]] = mapped_column(
        String(60),
        nullable=True,
        default=None,
        comment="Primary location identifier, e.g. 'CAGE-A'",
    )
    shelf: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        default=None,
        comment="Shelf within location, e.g. 'SHELF-03'",
    )
    bin: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        default=None,
        comment="Bin within shelf, e.g. 'BIN-12'",
    )
    weight_grams: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=None,
        comment="Unit weight in grams for packing lists",
    )
    dimensions: Mapped[Optional[str]] = mapped_column(
        String(60),
        nullable=True,
        default=None,
        comment="L×W×H in mm, e.g. '88×58×19.5'",
    )

    # ── Classification ────────────────────────────────────────────
    criticality: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="medium",
        comment="low | medium | high | critical — drives alert severity",
    )
    is_consumable: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Consumable items are not expected to return",
    )
    is_serialised: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Serialised items may have individual serial number tracking",
    )
    is_hazmat: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Requires special handling procedures",
    )
    requires_approval: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Sign-outs require admin approval before access PIN generated",
    )

    # ── Additional metadata ───────────────────────────────────────
    tags: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        default=None,
        comment="Comma-separated tags for flexible search, e.g. 'gpio,prototype,field-kit'",
    )
    image_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        default=None,
        comment="Relative path to item image, e.g. '/uploads/items/rpi4-8gb.jpg'",
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Internal admin notes — not shown to standard users",
    )
    handling_instructions: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Special handling or storage instructions shown during sign-out",
    )

    # ── Lifecycle ─────────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
        comment="Soft-delete. Inactive items hidden from browse but preserved in history.",
    )

    # ── Audit ─────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp of soft-deletion",
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Admin who created this item",
    )
    updated_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Admin who last modified this item",
    )
    deleted_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Admin who deactivated this item",
    )

    # ── Relationships ─────────────────────────────────────────────
    category: Mapped["Category"] = relationship(
        "Category",
        back_populates="items",
        lazy="joined",
    )
    signouts: Mapped[list["SignOut"]] = relationship(
        "SignOut",
        back_populates="item",
        lazy="noload",
        order_by="SignOut.signed_out_at.desc()",
    )
    resupply_requests: Mapped[list["ResupplyRequest"]] = relationship(
        "ResupplyRequest",
        back_populates="item",
        lazy="noload",
    )
    creator: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[created_by],
        lazy="noload",
    )

    # ── Table constraints ─────────────────────────────────────────
    __table_args__ = (
        # All quantity fields must be non-negative
        CheckConstraint("total_quantity >= 0", name="ck_item_total_qty_positive"),
        CheckConstraint("available_quantity >= 0", name="ck_item_avail_qty_positive"),
        CheckConstraint("serviceable_count >= 0", name="ck_item_svc_count_positive"),
        CheckConstraint("unserviceable_count >= 0", name="ck_item_unsvc_count_positive"),
        CheckConstraint("damaged_count >= 0", name="ck_item_dmg_count_positive"),
        CheckConstraint("condemned_count >= 0", name="ck_item_cond_count_positive"),
        CheckConstraint("checked_out_count >= 0", name="ck_item_co_count_positive"),
        CheckConstraint("minimum_stock_level >= 0", name="ck_item_min_stock_positive"),
        CheckConstraint("reorder_quantity >= 0", name="ck_item_reorder_qty_positive"),
        CheckConstraint("max_signout_quantity >= 0", name="ck_item_max_so_qty_positive"),

        # Invariant: total = all conditions + checked out
        CheckConstraint(
            "total_quantity = serviceable_count + unserviceable_count "
            "+ damaged_count + condemned_count + checked_out_count",
            name="ck_item_quantity_invariant",
        ),

        # Available cannot exceed serviceable
        CheckConstraint(
            "available_quantity <= serviceable_count",
            name="ck_item_avail_lte_serviceable",
        ),

        # Criticality enum
        CheckConstraint(
            "criticality IN ('low', 'medium', 'high', 'critical')",
            name="ck_item_criticality_enum",
        ),

        # Unit of issue enum
        CheckConstraint(
            "unit_of_issue IN ('each', 'pack', 'pair', 'set', 'metre', "
            "'roll', 'box', 'kit', 'spool', 'sheet', 'litre')",
            name="ck_item_unit_of_issue_enum",
        ),

        # Item code format: uppercase alphanumeric + hyphens
        CheckConstraint(
            "item_code ~ '^[A-Z0-9][A-Z0-9\\-]{1,18}[A-Z0-9]$'",
            name="ck_item_code_format",
        ),

        # NSN format if provided: NNNN-NN-NNN-NNNN
        CheckConstraint(
            "nsn IS NULL OR nsn ~ '^[0-9]{4}-[0-9]{2}-[0-9]{3}-[0-9]{4}$'",
            name="ck_item_nsn_format",
        ),

        # Weight must be positive if provided
        CheckConstraint(
            "weight_grams IS NULL OR weight_grams > 0",
            name="ck_item_weight_positive",
        ),

        # Composite indexes for common query patterns
        Index("ix_item_category_active", "category_id", "is_active"),
        Index("ix_item_active_name", "is_active", "name"),
        Index("ix_item_criticality_active", "criticality", "is_active"),
        Index("ix_item_location", "storage_location", "shelf", "bin"),
    )

    # ── Computed properties ───────────────────────────────────────
    @property
    def is_low_stock(self) -> bool:
        """True if available quantity is at or below the minimum stock level."""
        return (
            self.minimum_stock_level > 0
            and self.available_quantity <= self.minimum_stock_level
        )

    @property
    def is_out_of_stock(self) -> bool:
        """True if no items available for sign-out."""
        return self.available_quantity <= 0

    @property
    def utilisation_pct(self) -> float:
        """Percentage of total stock currently checked out. 0–100."""
        if self.total_quantity == 0:
            return 0.0
        return round((self.checked_out_count / self.total_quantity) * 100, 1)

    @property
    def condition_breakdown(self) -> dict[str, int]:
        """Condition distribution as a dict for frontend charts."""
        return {
            "serviceable": self.serviceable_count,
            "unserviceable": self.unserviceable_count,
            "damaged": self.damaged_count,
            "condemned": self.condemned_count,
            "checked_out": self.checked_out_count,
        }

    @property
    def location_display(self) -> str | None:
        """Full physical location string, e.g. 'CAGE-A / SHELF-03 / BIN-12'."""
        parts = [p for p in (self.storage_location, self.shelf, self.bin) if p]
        return " / ".join(parts) if parts else None

    @property
    def tag_list(self) -> list[str]:
        """Tags as a clean list."""
        if not self.tags:
            return []
        return [t.strip() for t in self.tags.split(",") if t.strip()]

    def can_sign_out(self, requested_qty: int) -> tuple[bool, str]:
        """Check whether a sign-out of the given quantity is possible.

        Returns (allowed, reason) tuple.
        """
        if not self.is_active:
            return False, "Item is deactivated"
        if requested_qty <= 0:
            return False, "Quantity must be at least 1"
        if requested_qty > self.available_quantity:
            return False, (
                f"Insufficient stock: {self.available_quantity} available, "
                f"{requested_qty} requested"
            )
        if self.max_signout_quantity > 0 and requested_qty > self.max_signout_quantity:
            return False, (
                f"Exceeds maximum sign-out quantity of {self.max_signout_quantity}"
            )
        return True, "OK"

    def __repr__(self) -> str:
        return (
            f"<Item(id={self.id}, code='{self.item_code}', "
            f"avail={self.available_quantity}/{self.total_quantity}, "
            f"active={self.is_active})>"
        )


# ── Event listener: auto-generate slug from name ──────────────────
@event.listens_for(Item, "before_insert")
@event.listens_for(Item, "before_update")
def _auto_slug(mapper, connection, target: Item) -> None:  # noqa: ARG001
    """Regenerate slug whenever the name changes."""
    if target.name:
        target.slug = _slugify(target.name)