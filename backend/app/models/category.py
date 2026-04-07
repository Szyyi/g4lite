"""
G4Lite — Category Model
=========================

Hierarchical equipment category system with audit trail, soft-delete,
display ordering, and visual metadata for the frontend.

Categories support one level of nesting (parent → children) to allow
groupings like:

    Computing
    ├── Single-Board Computers
    ├── Storage Devices
    └── Peripherals

    Communications
    ├── Radio Equipment
    ├── Cabling
    └── Network Infrastructure

Design decisions:
- Single level of nesting only (parent_id). Deep trees add complexity
  with zero operational value in a logistics context.
- Soft-delete via `is_active` flag. Categories with items cannot be
  hard-deleted — they are deactivated and hidden from selection UIs
  but preserved for historical sign-out records.
- `sort_order` controls display sequence in sidebar filters and
  dropdowns. Lower numbers appear first. Ties broken alphabetically.
- `icon` stores a Material Icon identifier string (e.g. "memory",
  "router", "battery_charging_full") for frontend rendering.
- `colour` stores a hex string for visual coding on cards and chips.
  Defaults to the theme accent if null.
- Slug is auto-derived from the name for URL-safe filtering
  (e.g. /inventory?category=single-board-computers).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.item import Item
    from app.models.user import User


def _slugify(value: str) -> str:
    """Convert a name to a URL-safe slug.

    'Single-Board Computers' → 'single-board-computers'
    'Power & Distribution'   → 'power-distribution'
    """
    value = value.lower().strip()
    value = re.sub(r"[&+]", "", value)
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-")


class Category(Base):
    """Equipment category with optional single-level hierarchy."""

    __tablename__ = "categories"

    # ── Primary key ───────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    # ── Identity ──────────────────────────────────────────────────
    name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        comment="Human-readable category name",
    )
    slug: Mapped[str] = mapped_column(
        String(140),
        nullable=False,
        unique=True,
        index=True,
        comment="URL-safe identifier, auto-derived from name",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Operational description of what this category covers",
    )
    code: Mapped[Optional[str]] = mapped_column(
        String(10),
        nullable=True,
        unique=True,
        comment="Short alpha code for labels and reports, e.g. COMP, COMMS, PWR",
    )

    # ── Hierarchy ─────────────────────────────────────────────────
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        index=True,
        comment="Parent category ID. NULL = top-level category.",
    )

    # ── Display ───────────────────────────────────────────────────
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Display order. Lower numbers first, ties broken by name.",
    )
    icon: Mapped[Optional[str]] = mapped_column(
        String(60),
        nullable=True,
        default=None,
        comment="MUI icon identifier, e.g. 'memory', 'router', 'bolt'",
    )
    colour: Mapped[Optional[str]] = mapped_column(
        String(7),
        nullable=True,
        default=None,
        comment="Hex colour for visual coding, e.g. '#3B82F6'. Null = theme accent.",
    )

    # ── Lifecycle ─────────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        index=True,
        comment="Soft-delete flag. Inactive categories hidden from selection UIs.",
    )

    # ── Audit ─────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        onupdate=func.now(),
        nullable=True,
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Admin who created this category",
    )
    updated_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Admin who last modified this category",
    )

    # ── Relationships ─────────────────────────────────────────────
    parent: Mapped[Optional["Category"]] = relationship(
        "Category",
        remote_side="Category.id",
        back_populates="children",
        lazy="selectin",
    )
    children: Mapped[list["Category"]] = relationship(
        "Category",
        back_populates="parent",
        lazy="selectin",
        order_by="Category.sort_order, Category.name",
    )
    items: Mapped[list["Item"]] = relationship(
        "Item",
        back_populates="category",
        lazy="noload",
    )
    creator: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[created_by],
        lazy="noload",
    )

    # ── Table constraints ─────────────────────────────────────────
    __table_args__ = (
        # A parent category's child names must be unique within the parent
        UniqueConstraint("parent_id", "name", name="uq_category_parent_name"),
        # Colour must be valid hex if provided
        CheckConstraint(
            "colour IS NULL OR colour ~ '^#[0-9A-Fa-f]{6}$'",
            name="ck_category_colour_hex",
        ),
        # Code must be uppercase alphanumeric
        CheckConstraint(
            "code IS NULL OR code ~ '^[A-Z0-9]{2,10}$'",
            name="ck_category_code_format",
        ),
        # Prevent self-referencing parent
        CheckConstraint(
            "parent_id IS NULL OR parent_id != id",
            name="ck_category_no_self_parent",
        ),
        # Composite index for common query pattern: active categories sorted
        Index("ix_category_active_sort", "is_active", "sort_order", "name"),
    )

    # ── Convenience ───────────────────────────────────────────────
    @property
    def is_top_level(self) -> bool:
        return self.parent_id is None

    @property
    def display_path(self) -> str:
        """Full path string, e.g. 'Computing > Single-Board Computers'."""
        if self.parent and self.parent.name:
            return f"{self.parent.name} > {self.name}"
        return self.name

    @property
    def code_display(self) -> str:
        """Return the short code or a slug-derived fallback."""
        return self.code or self.slug.upper()[:6]

    def __repr__(self) -> str:
        return (
            f"<Category(id={self.id}, slug='{self.slug}', "
            f"parent_id={self.parent_id}, active={self.is_active})>"
        )


# ── Event listener: auto-generate slug from name before insert/update ──
@event.listens_for(Category, "before_insert")
@event.listens_for(Category, "before_update")
def _auto_slug(mapper, connection, target: Category) -> None:  # noqa: ARG001
    """Regenerate slug whenever the name changes."""
    if target.name:
        target.slug = _slugify(target.name)