"""
g4lite — Sign-Out Model
==========================

Equipment sign-out with full lifecycle tracking from request through
approval, collection, extension, partial return, and final return
with condition assessment.

Lifecycle:

    pending_approval → approved → active → returned
                                        → partially_returned → returned
                                        → overdue → returned
                                        → lost
                     → rejected

    Items where `requires_approval = False` skip straight to `active`.

Status transitions:
- pending_approval → approved     : Admin approves (generates access PIN)
- pending_approval → rejected     : Admin rejects
- approved → active               : User collects equipment (access PIN used)
- active → returned               : Full return, all items accounted for
- active → partially_returned     : Some items returned, remainder outstanding
- active → overdue                : Past expected return date (set by scheduler)
- active → lost                   : Declared lost by admin after investigation
- partially_returned → returned   : Remaining items returned
- partially_returned → overdue    : Past expected return date on remainder
- overdue → returned              : Late return processed
- overdue → lost                  : Written off as lost

Design decisions:

REFERENCE NUMBER
- `signout_ref` formatted as "SO-YYYYMM-NNNN" (e.g. SO-202604-0037).
  Printed on collection receipts and referenced in audit trails.

CONDITION TRACKING
- `condition_on_issue` records item state when signed out. This
  establishes a baseline so damage on return can be attributed.
- `condition_on_return` records state when returned. Expanded to
  include `condemned` (aligned with Item model's condemned_count).
- `quantity_returned_serviceable`, `quantity_returned_unserviceable`,
  `quantity_returned_damaged`, `quantity_returned_condemned` — when
  multiple units are signed out, they may come back in mixed condition.
  These must sum to quantity_returned.

PARTIAL RETURNS
- `quantity_returned` tracks how many units have been returned so far.
- When quantity_returned < quantity, status is `partially_returned`.
- Each partial return is a separate API call that increments the counts.

OVERDUE ESCALATION
- `overdue_notified_at` — timestamp when the first overdue notification
  was sent. Prevents duplicate notifications.
- `overdue_escalated_at` — timestamp when escalation notification was
  sent (e.g. after 48 hours overdue).
- `overdue_days` — computed property for dashboard display.

EXTENSIONS
- `extension_count` — how many times the return date has been pushed.
- `original_return_date` — preserves the first expected date even after
  extensions, for audit purposes.
- Extensions are processed by updating `expected_return_date` and
  incrementing `extension_count`.

ACCESS CONTROL INTEGRATION
- `access_code_id` — FK to the access_codes table (Phase 2 physical
  security). Links the sign-out to the PIN that granted cage entry.
- `collected_at` — timestamp when equipment was physically picked up
  (distinct from `signed_out_at` which is when the sign-out was created).

APPROVAL
- Items with `requires_approval = True` start in `pending_approval`.
- `approved_by` / `approved_at` — admin who approved.
- `rejected_reason` — required when rejected.

RETURN PROCESSING
- `received_by` — admin who processed the return and verified condition.
- `return_inspected` — flag indicating condition was physically verified,
  not just self-reported by the user.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.item import Item
    from app.models.user import User


# ── Enums ─────────────────────────────────────────────────────────


class SignOutStatus(str, enum.Enum):
    """Lifecycle states for an equipment sign-out."""

    pending_approval = "pending_approval"
    approved = "approved"
    rejected = "rejected"
    active = "active"
    partially_returned = "partially_returned"
    overdue = "overdue"
    returned = "returned"
    lost = "lost"


class EquipmentCondition(str, enum.Enum):
    """Condition state for equipment at issue or return.

    Shared between issue and return — same vocabulary for consistency.
    Aligned with Item model's condition counts.
    """

    serviceable = "serviceable"
    unserviceable = "unserviceable"
    damaged = "damaged"
    condemned = "condemned"


# ── Valid status transitions (enforced by service layer) ──────────

SIGNOUT_STATUS_TRANSITIONS: dict[SignOutStatus, set[SignOutStatus]] = {
    SignOutStatus.pending_approval: {
        SignOutStatus.approved,
        SignOutStatus.rejected,
    },
    SignOutStatus.approved: {
        SignOutStatus.active,
        SignOutStatus.rejected,   # Admin can still cancel before collection
    },
    SignOutStatus.active: {
        SignOutStatus.returned,
        SignOutStatus.partially_returned,
        SignOutStatus.overdue,
        SignOutStatus.lost,
    },
    SignOutStatus.partially_returned: {
        SignOutStatus.returned,
        SignOutStatus.overdue,
        SignOutStatus.lost,
    },
    SignOutStatus.overdue: {
        SignOutStatus.returned,
        SignOutStatus.lost,
    },
    SignOutStatus.rejected: set(),    # Terminal
    SignOutStatus.returned: set(),    # Terminal
    SignOutStatus.lost: set(),        # Terminal
}


# ── Model ─────────────────────────────────────────────────────────


class SignOut(Base):
    """Equipment sign-out record with full lifecycle and condition tracking."""

    __tablename__ = "signouts"

    # ── Primary key ───────────────────────────────────────────────
    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    # ── Human-readable reference ──────────────────────────────────
    signout_ref: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        unique=True,
        index=True,
        comment="Sequential ref: SO-YYYYMM-NNNN, generated by service layer",
    )

    # ── Item reference ────────────────────────────────────────────
    item_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="FK to item being signed out. RESTRICT prevents deleting items with active sign-outs.",
    )
    item_code_snapshot: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        default=None,
        comment="Item code at time of sign-out (denormalized for history/reports)",
    )
    item_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        default=None,
        comment="Item name at time of sign-out (denormalized for history/reports)",
    )

    # ── User / personnel ──────────────────────────────────────────
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="FK to the platform user performing the sign-out",
    )
    full_name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        comment="Full name of person collecting equipment (may differ from user account)",
    )
    rank: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        default=None,
        comment="Rank or title of the person collecting",
    )
    unit: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        default=None,
        comment="Unit, team, or department",
    )
    contact_number: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        default=None,
        comment="Contact number for follow-up on overdue items",
    )

    # ── Task context ──────────────────────────────────────────────
    task_reference: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Task, exercise, operation, or project reference",
    )
    purpose: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Detailed purpose or justification for the sign-out",
    )

    # ── Quantities ────────────────────────────────────────────────
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Number of units signed out",
    )
    quantity_returned: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total units returned so far (sum of all conditions)",
    )
    quantity_returned_serviceable: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Units returned in serviceable condition",
    )
    quantity_returned_unserviceable: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Units returned in unserviceable condition",
    )
    quantity_returned_damaged: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Units returned in damaged condition",
    )
    quantity_returned_condemned: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Units returned condemned (beyond repair)",
    )

    # ── Dates / duration ──────────────────────────────────────────
    expected_return_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Current expected return date (may be extended)",
    )
    original_return_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Original return date at time of sign-out (preserved through extensions)",
    )
    duration_days: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=None,
        comment="Planned duration in days (informational)",
    )
    extension_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Number of times the return date has been extended",
    )
    last_extended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp of most recent extension",
    )
    last_extended_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        comment="Admin or user who last extended the return date",
    )

    # ── Condition tracking ────────────────────────────────────────
    condition_on_issue: Mapped[EquipmentCondition] = mapped_column(
        Enum(EquipmentCondition, name="equipment_condition_enum",
             create_constraint=False),
        nullable=False,
        default=EquipmentCondition.serviceable,
        comment="Condition of equipment when issued (baseline for return comparison)",
    )
    condition_on_return: Mapped[Optional[EquipmentCondition]] = mapped_column(
        Enum(EquipmentCondition, name="equipment_condition_enum",
             create_constraint=False),
        nullable=True,
        default=None,
        comment="Overall condition on return (worst condition if mixed)",
    )

    # ── Status workflow ───────────────────────────────────────────
    status: Mapped[SignOutStatus] = mapped_column(
        Enum(SignOutStatus, name="signout_status_enum"),
        nullable=False,
        default=SignOutStatus.active,
        index=True,
        comment="Current lifecycle state",
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Sign-out notes from the requester",
    )

    # ── Approval (for items requiring admin approval) ─────────────
    approved_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        comment="Admin who approved the sign-out",
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    rejected_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Reason for rejection (required when status = rejected)",
    )

    # ── Collection ────────────────────────────────────────────────
    signed_out_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Timestamp when sign-out record was created",
    )
    collected_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp when equipment was physically collected (access PIN used)",
    )
    access_code_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=None,
        comment="FK to access_codes table (physical security integration)",
    )

    # ── Return processing ─────────────────────────────────────────
    returned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="Timestamp of final return (all items accounted for)",
    )
    return_notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Notes provided on return (user-facing)",
    )
    damage_description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Detailed damage report if items returned damaged/condemned",
    )
    received_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        comment="Admin who processed and verified the return",
    )
    return_inspected: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="True if condition was physically verified by admin, not self-reported",
    )

    # ── Overdue tracking ──────────────────────────────────────────
    overdue_notified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="When the first overdue notification was sent",
    )
    overdue_escalated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        comment="When the escalation notification was sent (e.g. 48h overdue)",
    )

    # ── Loss tracking ─────────────────────────────────────────────
    lost_declared_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    lost_declared_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )
    loss_report: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default=None,
        comment="Narrative description of how/when equipment was lost",
    )
    quantity_lost: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Number of units declared lost",
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

    # ── Relationships ─────────────────────────────────────────────
    item: Mapped["Item"] = relationship(
        "Item",
        back_populates="signouts",
        lazy="joined",
    )
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="joined",
    )
    approver: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[approved_by],
        lazy="noload",
    )
    receiver: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[received_by],
        lazy="noload",
    )
    extender: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[last_extended_by],
        lazy="noload",
    )
    loss_declarer: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[lost_declared_by],
        lazy="noload",
    )

    # ── Table constraints ─────────────────────────────────────────
    __table_args__ = (
        # Quantity constraints
        CheckConstraint(
            "quantity > 0",
            name="ck_signout_qty_positive",
        ),
        CheckConstraint(
            "quantity_returned >= 0",
            name="ck_signout_returned_positive",
        ),
        CheckConstraint(
            "quantity_returned_serviceable >= 0",
            name="ck_signout_ret_svc_positive",
        ),
        CheckConstraint(
            "quantity_returned_unserviceable >= 0",
            name="ck_signout_ret_unsvc_positive",
        ),
        CheckConstraint(
            "quantity_returned_damaged >= 0",
            name="ck_signout_ret_dmg_positive",
        ),
        CheckConstraint(
            "quantity_returned_condemned >= 0",
            name="ck_signout_ret_cond_positive",
        ),
        CheckConstraint(
            "quantity_lost >= 0",
            name="ck_signout_lost_positive",
        ),

        # Returned + lost cannot exceed signed out
        CheckConstraint(
            "quantity_returned + quantity_lost <= quantity",
            name="ck_signout_return_plus_lost_lte_qty",
        ),

        # Return condition breakdown must sum to quantity_returned
        CheckConstraint(
            "quantity_returned = quantity_returned_serviceable "
            "+ quantity_returned_unserviceable "
            "+ quantity_returned_damaged "
            "+ quantity_returned_condemned",
            name="ck_signout_return_breakdown_sum",
        ),

        # Extension count must be non-negative
        CheckConstraint(
            "extension_count >= 0",
            name="ck_signout_extension_count_positive",
        ),

        # Duration must be positive if provided
        CheckConstraint(
            "duration_days IS NULL OR duration_days > 0",
            name="ck_signout_duration_positive",
        ),

        # Rejection requires a reason
        CheckConstraint(
            "status != 'rejected' OR (rejected_reason IS NOT NULL "
            "AND length(trim(rejected_reason)) > 0)",
            name="ck_signout_rejection_has_reason",
        ),

        # Loss requires a report
        CheckConstraint(
            "status != 'lost' OR (loss_report IS NOT NULL "
            "AND length(trim(loss_report)) > 0)",
            name="ck_signout_loss_has_report",
        ),

        # Signout ref format
        CheckConstraint(
            "signout_ref ~ '^SO-[0-9]{6}-[0-9]{4}$'",
            name="ck_signout_ref_format",
        ),

        # Query indexes
        Index("ix_signout_status_date", "status", "expected_return_date"),
        Index("ix_signout_user_status", "user_id", "status"),
        Index("ix_signout_item_status", "item_id", "status"),
        Index("ix_signout_overdue_check", "status", "expected_return_date",
              "overdue_notified_at"),
        Index("ix_signout_active_items", "item_id", "status", "quantity"),
    )

    # ── Computed properties ───────────────────────────────────────
    @property
    def is_terminal(self) -> bool:
        """True if the sign-out is in a final state."""
        return self.status in (
            SignOutStatus.returned,
            SignOutStatus.rejected,
            SignOutStatus.lost,
        )

    @property
    def is_active_or_overdue(self) -> bool:
        """True if equipment is still out in the field."""
        return self.status in (
            SignOutStatus.active,
            SignOutStatus.partially_returned,
            SignOutStatus.overdue,
        )

    @property
    def quantity_outstanding(self) -> int:
        """Units still out in the field (not returned, not lost)."""
        return max(0, self.quantity - self.quantity_returned - self.quantity_lost)

    @property
    def is_overdue_now(self) -> bool:
        """True if past expected return date and not in a terminal state."""
        if self.is_terminal:
            return False
        return date.today() > self.expected_return_date

    @property
    def overdue_days(self) -> int:
        """Number of days past the expected return date. 0 if not overdue."""
        if not self.is_overdue_now:
            return 0
        return (date.today() - self.expected_return_date).days

    @property
    def days_remaining(self) -> int:
        """Days until expected return. Negative = overdue."""
        return (self.expected_return_date - date.today()).days

    @property
    def return_completion_pct(self) -> float:
        """Percentage of signed-out quantity that has been returned. 0–100."""
        if self.quantity == 0:
            return 0.0
        return round(
            ((self.quantity_returned + self.quantity_lost) / self.quantity) * 100,
            1,
        )

    @property
    def has_damage(self) -> bool:
        """True if any items returned in damaged or condemned condition."""
        return (self.quantity_returned_damaged + self.quantity_returned_condemned) > 0

    @property
    def return_condition_breakdown(self) -> dict[str, int]:
        """Return condition distribution for frontend charts."""
        return {
            "serviceable": self.quantity_returned_serviceable,
            "unserviceable": self.quantity_returned_unserviceable,
            "damaged": self.quantity_returned_damaged,
            "condemned": self.quantity_returned_condemned,
            "outstanding": self.quantity_outstanding,
            "lost": self.quantity_lost,
        }

    @property
    def was_extended(self) -> bool:
        """True if the return date was extended at least once."""
        return self.extension_count > 0

    @property
    def needs_escalation(self) -> bool:
        """True if overdue for 48+ hours and not yet escalated."""
        if not self.is_overdue_now:
            return False
        if self.overdue_escalated_at is not None:
            return False
        return self.overdue_days >= 2

    def can_transition_to(self, new_status: SignOutStatus) -> tuple[bool, str]:
        """Check if a status transition is valid.

        Returns (allowed, reason) tuple.
        """
        valid_targets = SIGNOUT_STATUS_TRANSITIONS.get(self.status, set())
        if new_status in valid_targets:
            return True, "OK"
        return False, (
            f"Cannot transition from '{self.status.value}' to "
            f"'{new_status.value}'. Valid transitions: "
            f"{', '.join(s.value for s in valid_targets) or 'none (terminal state)'}"
        )

    def __repr__(self) -> str:
        return (
            f"<SignOut(id={self.id}, ref='{self.signout_ref}', "
            f"status='{self.status.value}', "
            f"qty={self.quantity_returned}/{self.quantity} returned, "
            f"outstanding={self.quantity_outstanding})>"
        )