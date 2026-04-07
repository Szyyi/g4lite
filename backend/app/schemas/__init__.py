# app/schemas/__init__.py
"""
Pydantic schema registry.

Centralised re-exports so that routers and services can import from
``app.schemas`` directly instead of reaching into submodules:

    from app.schemas import (
        ItemCreate, ItemResponse, SignOutCreate, UserResponse, ...
    )

Organised by domain.  Helper functions (``*_to_response``,
``*_to_brief``) are included — these are the canonical mappers
from SQLAlchemy model instances to Pydantic response schemas.
"""

# ══════════════════════════════════════════════════════════════════════════
# ITEMS & CATEGORIES
# ══════════════════════════════════════════════════════════════════════════

from app.schemas.item import (
    # Enums
    CriticalityLevel,
    UnitOfIssue,
    ConditionState,
    ItemSortField,
    # Category schemas
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategoryTreeNode,
    # Item schemas
    ItemCreate,
    ItemUpdate,
    ItemResponse,
    ItemBrief,
    StockAdjustment,
    ConditionTransfer,
    ItemStats,
    LowStockItem,
    PaginatedItems,
)

# ══════════════════════════════════════════════════════════════════════════
# SIGN-OUTS
# ══════════════════════════════════════════════════════════════════════════

from app.schemas.signout import (
    # Enums
    SignOutStatus,
    # Schemas
    SignOutCreate,
    SignOutResponse,
    SignOutBrief,
    ReturnRequest,
    ApprovalRequest,
    RejectionRequest,
    ExtensionRequest,
    LossDeclaration,
    PaginatedSignOuts,
    SignOutStats,
    # Helpers
    signout_to_response,
    signout_to_brief,
)

# ══════════════════════════════════════════════════════════════════════════
# RESUPPLY
# ══════════════════════════════════════════════════════════════════════════

from app.schemas.resupply import (
    # Enums
    ResupplyPriority,
    ResupplyStatus,
    # Schemas
    ResupplyCreate,
    ResupplyResponse,
    ResupplyBrief,
    ResupplyApproval,
    ResupplyRejection,
    ResupplyOrderDetails,
    ResupplyFulfillment,
    ResupplyCancellation,
    ResupplyCostUpdate,
    ResupplyAdminNotes,
    PaginatedResupply,
    ResupplyStats,
    # Helpers
    resupply_to_response,
    resupply_to_brief,
)

# ══════════════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ══════════════════════════════════════════════════════════════════════════

from app.schemas.notification import (
    # Enums (re-exported from models via schemas)
    NotificationType,
    NotificationCategory,
    NotificationPriority,
    # Schemas
    NotificationResponse,
    NotificationBrief,
    PaginatedNotifications,
    UnreadCounts,
    BulkDismissRequest,
    BroadcastRequest,
    NotificationCreateInternal,
    NotificationStats,
    # Helpers
    notification_to_response,
    notification_to_brief,
)

# ══════════════════════════════════════════════════════════════════════════
# USERS & AUTH
# ══════════════════════════════════════════════════════════════════════════

from app.schemas.user import (
    # Enums
    UserRole,
    # Auth schemas
    LoginRequest,
    TokenResponse,
    AuthStatusResponse,
    PasswordChangeRequest,
    AdminPasswordResetRequest,
    # Profile schemas
    ProfileUpdateRequest,
    NotificationPreferencesRequest,
    NotificationPreferencesResponse,
    # User management schemas
    UserCreate,
    UserUpdate,
    UserResponse,
    UserDetailResponse,
    UserBrief,
    RoleChange,
    DeactivationRequest,
    PaginatedUsers,
    UserStats,
    UserActivity,
    # Helpers
    user_to_response,
    user_to_brief,
)


__all__ = [
    # ── Item & Category enums ──
    "CriticalityLevel",
    "UnitOfIssue",
    "ConditionState",
    "ItemSortField",
    # ── Item & Category schemas ──
    "CategoryCreate",
    "CategoryUpdate",
    "CategoryResponse",
    "CategoryTreeNode",
    "ItemCreate",
    "ItemUpdate",
    "ItemResponse",
    "ItemBrief",
    "StockAdjustment",
    "ConditionTransfer",
    "ItemStats",
    "LowStockItem",
    "PaginatedItems",
    # ── SignOut enums ──
    "SignOutStatus",
    # ── SignOut schemas ──
    "SignOutCreate",
    "SignOutResponse",
    "SignOutBrief",
    "ReturnRequest",
    "ApprovalRequest",
    "RejectionRequest",
    "ExtensionRequest",
    "LossDeclaration",
    "PaginatedSignOuts",
    "SignOutStats",
    "signout_to_response",
    "signout_to_brief",
    # ── Resupply enums ──
    "ResupplyPriority",
    "ResupplyStatus",
    # ── Resupply schemas ──
    "ResupplyCreate",
    "ResupplyResponse",
    "ResupplyBrief",
    "ResupplyApproval",
    "ResupplyRejection",
    "ResupplyOrderDetails",
    "ResupplyFulfillment",
    "ResupplyCancellation",
    "ResupplyCostUpdate",
    "ResupplyAdminNotes",
    "PaginatedResupply",
    "ResupplyStats",
    "resupply_to_response",
    "resupply_to_brief",
    # ── Notification enums ──
    "NotificationType",
    "NotificationCategory",
    "NotificationPriority",
    # ── Notification schemas ──
    "NotificationResponse",
    "NotificationBrief",
    "PaginatedNotifications",
    "UnreadCounts",
    "BulkDismissRequest",
    "BroadcastRequest",
    "NotificationCreateInternal",
    "NotificationStats",
    "notification_to_response",
    "notification_to_brief",
    # ── User enums ──
    "UserRole",
    # ── Auth schemas ──
    "LoginRequest",
    "TokenResponse",
    "AuthStatusResponse",
    "PasswordChangeRequest",
    "AdminPasswordResetRequest",
    # ── Profile schemas ──
    "ProfileUpdateRequest",
    "NotificationPreferencesRequest",
    "NotificationPreferencesResponse",
    # ── User management schemas ──
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserDetailResponse",
    "UserBrief",
    "RoleChange",
    "DeactivationRequest",
    "PaginatedUsers",
    "UserStats",
    "UserActivity",
    "user_to_response",
    "user_to_brief",
]