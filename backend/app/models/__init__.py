# app/models/__init__.py
"""
SQLAlchemy model registry.

Every model class MUST be imported here so that:

1. ``Base.metadata`` contains all tables for Alembic autogenerate.
2. SQLAlchemy relationship back-references resolve correctly at
   mapper configuration time.
3. Other modules can do ``from app.models import User, Item, ...``
   instead of reaching into submodules.

Import order follows the foreign-key dependency graph (parents before
children) to avoid mapper configuration warnings.
"""

from app.database import Base  # noqa: F401 — must be importable from here

# ── Core models (dependency order) ─────────────────────────────────────
from app.models.user import User, UserRole
from app.models.category import Category
from app.models.item import Item
from app.models.signout import SignOut
from app.models.resupply import ResupplyRequest
from app.models.notification import Notification

# ── Enums & constants re-exported for convenience ──────────────────────
from app.models.signout import SignOutStatus
from app.models.resupply import ResupplyStatus, ResupplyPriority, RESUPPLY_STATUS_TRANSITIONS
from app.models.notification import (
    NotificationType,
    NotificationCategory,
    NotificationPriority,
    NOTIFICATION_TYPE_CATEGORY,
    NOTIFICATION_TYPE_DEFAULT_PRIORITY,
)
from app.models.item import CriticalityLevel, ConditionState

__all__ = [
    # Base
    "Base",
    # Models
    "User",
    "Category",
    "Item",
    "SignOut",
    "ResupplyRequest",
    "Notification",
    # Enums
    "UserRole",
    "SignOutStatus",
    "ResupplyStatus",
    "ResupplyPriority",
    "CriticalityLevel",
    "ConditionState",
    "NotificationType",
    "NotificationCategory",
    "NotificationPriority",
    # Constants
    "RESUPPLY_STATUS_TRANSITIONS",
    "NOTIFICATION_TYPE_CATEGORY",
    "NOTIFICATION_TYPE_DEFAULT_PRIORITY",
]