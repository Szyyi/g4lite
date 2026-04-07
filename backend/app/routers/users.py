"""
g4lite — Users Router
========================

User account management for administrators. Standard users and
viewers cannot access these endpoints — they manage their own
profile via /api/auth/profile.

Endpoints (12 total):
- GET    /                 Paginated user list with filters
- GET    /stats            User statistics for dashboard
- GET    /export           CSV export
- GET    /{id}             User detail with activity summary
- POST   /                 Create a new user account
- PUT    /{id}             Update user metadata
- PUT    /{id}/role        Change user role (with admin count protection)
- PUT    /{id}/deactivate  Deactivate with reason + signout check
- PUT    /{id}/reactivate  Reactivate a deactivated account
- GET    /{id}/activity    User's recent activity summary
- GET    /{id}/signouts    User's sign-out history
- GET    /{id}/resupply    User's resupply request history

Security:
- All endpoints require admin role
- Admins cannot deactivate themselves
- Maximum 2 active admin accounts enforced
- Self-role-change prevented
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.notification import Notification
from app.models.resupply import ResupplyRequest
from app.models.signout import SignOut, SignOutStatus
from app.models.user import User, UserRole
from app.utils.security import hash_password, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])

# ── Configuration ─────────────────────────────────────────────────

MAX_ADMIN_ACCOUNTS = 2
MAX_TOTAL_ACCOUNTS = 12  # 2 admin + 10 users as per project spec


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SCHEMAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-z0-9_]+$")
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=120)
    rank: Optional[str] = Field(None, max_length=50)
    role: str = Field("user")
    service_number: Optional[str] = Field(None, max_length=30)
    unit: Optional[str] = Field(None, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=30)
    timezone: str = Field("Europe/London", max_length=50)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"admin", "user", "viewer"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(allowed)}")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_upper and has_lower and has_digit):
            raise ValueError(
                "Password must contain uppercase, lowercase, and digit"
            )
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=120)
    email: Optional[str] = Field(None, max_length=255)
    rank: Optional[str] = Field(None, max_length=50)
    service_number: Optional[str] = Field(None, max_length=30)
    unit: Optional[str] = Field(None, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=30)
    timezone: Optional[str] = Field(None, max_length=50)
    bio: Optional[str] = Field(None, max_length=500)


class RoleChange(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"admin", "user", "viewer"}
        if v not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(allowed)}")
        return v


class DeactivationRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    rank: Optional[str] = None
    role: str
    display_name: str = ""
    display_role: str = ""
    initials: str = ""
    service_number: Optional[str] = None
    unit: Optional[str] = None
    contact_number: Optional[str] = None
    timezone: str = "Europe/London"
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    is_locked: bool = False
    must_change_password: bool = False
    # Session info
    last_login_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    login_count: int = 0
    # Notification preferences
    notification_preferences: dict = {}
    # Lifecycle
    created_at: datetime
    updated_at: Optional[datetime] = None
    deactivated_at: Optional[datetime] = None
    deactivation_reason: Optional[str] = None

    model_config = {"from_attributes": True}


class UserDetailResponse(UserResponse):
    """Extended response with activity counts."""

    active_signouts: int = 0
    total_signouts: int = 0
    overdue_signouts: int = 0
    pending_resupply: int = 0
    total_resupply: int = 0
    unread_notifications: int = 0


class PaginatedUsers(BaseModel):
    users: list[UserResponse]
    total: int
    page: int
    page_size: int
    pages: int


class UserStats(BaseModel):
    total_accounts: int
    active_accounts: int
    inactive_accounts: int
    admin_count: int
    user_count: int
    viewer_count: int
    locked_count: int
    must_change_password: int
    logged_in_today: int
    never_logged_in: int
    capacity_remaining: int


class UserActivity(BaseModel):
    """Recent activity summary for a user."""

    recent_signouts: list[dict] = []
    recent_returns: list[dict] = []
    recent_resupply: list[dict] = []


class UserSortField(str, Enum):
    full_name = "full_name"
    username = "username"
    role = "role"
    created_at = "created_at"
    last_login_at = "last_login_at"
    last_active_at = "last_active_at"


# ── Helpers ───────────────────────────────────────────────────────


def _user_to_response(user: User) -> UserResponse:
    """Map a User ORM model to the API response."""
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        rank=user.rank,
        role=user.role.value,
        display_name=user.display_name,
        display_role=user.display_role,
        initials=user.initials,
        service_number=user.service_number,
        unit=user.unit,
        contact_number=user.contact_number,
        timezone=user.timezone,
        bio=user.bio,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        is_locked=user.is_locked,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
        last_active_at=user.last_active_at,
        login_count=user.login_count,
        notification_preferences=user.notification_preferences,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deactivated_at=user.deactivated_at,
        deactivation_reason=user.deactivation_reason,
    )


async def _get_user_or_404(user_id: int, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _count_active_admins(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(User.id)).where(
            User.role == UserRole.admin,
            User.is_active.is_(True),
        )
    )
    return result.scalar() or 0


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "",
    response_model=PaginatedUsers,
    summary="List all users",
)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    search: Optional[str] = Query(None, max_length=200),
    role: Optional[str] = Query(None, pattern="^(admin|user|viewer)$"),
    is_active: Optional[bool] = Query(None),
    sort_by: UserSortField = Query(UserSortField.full_name),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> PaginatedUsers:
    """Paginated user list with search, role filter, and sorting."""
    query = select(User)

    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                User.full_name.ilike(pattern),
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.rank.ilike(pattern),
                User.unit.ilike(pattern),
                User.service_number.ilike(pattern),
            )
        )

    if role:
        query = query.where(User.role == UserRole(role))

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # Count
    import math
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Sort
    sort_column = getattr(User, sort_by.value, User.full_name)
    order = desc(sort_column) if sort_dir == "desc" else sort_column
    query = query.order_by(order).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    users = [_user_to_response(u) for u in result.scalars().all()]

    return PaginatedUsers(
        users=users,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 1,
    )


@router.get(
    "/stats",
    response_model=UserStats,
    summary="User statistics for dashboard",
)
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserStats:
    """Aggregate user statistics."""
    today = datetime.now(timezone.utc).date()

    total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active = (await db.execute(
        select(func.count(User.id)).where(User.is_active.is_(True))
    )).scalar() or 0

    # Role breakdown (active only)
    role_result = await db.execute(
        select(User.role, func.count(User.id))
        .where(User.is_active.is_(True))
        .group_by(User.role)
    )
    role_counts = {row[0].value: row[1] for row in role_result.all()}

    locked = (await db.execute(
        select(func.count(User.id)).where(
            User.locked_until.isnot(None),
            User.locked_until > datetime.now(timezone.utc),
        )
    )).scalar() or 0

    must_change = (await db.execute(
        select(func.count(User.id)).where(
            User.must_change_password.is_(True),
            User.is_active.is_(True),
        )
    )).scalar() or 0

    logged_today = (await db.execute(
        select(func.count(User.id)).where(
            func.date(User.last_login_at) == today,
        )
    )).scalar() or 0

    never_logged = (await db.execute(
        select(func.count(User.id)).where(
            User.last_login_at.is_(None),
            User.is_active.is_(True),
        )
    )).scalar() or 0

    return UserStats(
        total_accounts=total,
        active_accounts=active,
        inactive_accounts=total - active,
        admin_count=role_counts.get("admin", 0),
        user_count=role_counts.get("user", 0),
        viewer_count=role_counts.get("viewer", 0),
        locked_count=locked,
        must_change_password=must_change,
        logged_in_today=logged_today,
        never_logged_in=never_logged,
        capacity_remaining=max(0, MAX_TOTAL_ACCOUNTS - active),
    )


@router.get(
    "/export",
    summary="Export users as CSV",
)
async def export_users_csv(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> StreamingResponse:
    """Download user list as CSV. Admin only. Never includes passwords."""
    query = select(User).order_by(User.full_name)
    if not include_inactive:
        query = query.where(User.is_active.is_(True))

    result = await db.execute(query)
    users = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Username", "Full Name", "Rank", "Email", "Role",
        "Service Number", "Unit", "Contact", "Active",
        "Last Login", "Login Count", "Created",
    ])

    for u in users:
        writer.writerow([
            u.username,
            u.full_name,
            u.rank or "",
            u.email,
            u.role.value,
            u.service_number or "",
            u.unit or "",
            u.contact_number or "",
            "Yes" if u.is_active else "No",
            u.last_login_at.strftime("%Y-%m-%d %H:%M") if u.last_login_at else "Never",
            u.login_count,
            u.created_at.strftime("%Y-%m-%d") if u.created_at else "",
        ])

    output.seek(0)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="g4lite-users-{timestamp}.csv"'},
    )


@router.get(
    "/{user_id}",
    response_model=UserDetailResponse,
    summary="Get user detail with activity summary",
)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserDetailResponse:
    """User profile with activity counts (sign-outs, resupply, notifications)."""
    user = await _get_user_or_404(user_id, db)
    base = _user_to_response(user)

    # Activity counts
    active_so = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.user_id == user_id,
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
                SignOutStatus.pending_approval,
                SignOutStatus.approved,
            ]),
        )
    )).scalar() or 0

    total_so = (await db.execute(
        select(func.count(SignOut.id)).where(SignOut.user_id == user_id)
    )).scalar() or 0

    overdue_so = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.user_id == user_id,
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.overdue,
                SignOutStatus.partially_returned,
            ]),
            SignOut.expected_return_date < datetime.now(timezone.utc).date(),
        )
    )).scalar() or 0

    pending_rs = (await db.execute(
        select(func.count(ResupplyRequest.id)).where(
            ResupplyRequest.requested_by == user_id,
            ResupplyRequest.status.in_(["pending", "under_review"]),
        )
    )).scalar() or 0

    total_rs = (await db.execute(
        select(func.count(ResupplyRequest.id)).where(
            ResupplyRequest.requested_by == user_id,
        )
    )).scalar() or 0

    unread = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.recipient_id == user_id,
            Notification.is_read.is_(False),
        )
    )).scalar() or 0

    return UserDetailResponse(
        **base.model_dump(),
        active_signouts=active_so,
        total_signouts=total_so,
        overdue_signouts=overdue_so,
        pending_resupply=pending_rs,
        total_resupply=total_rs,
        unread_notifications=unread,
    )


@router.post(
    "",
    response_model=UserResponse,
    status_code=201,
    summary="Create a new user account",
)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserResponse:
    """Create a new user account. Admin only.

    Enforces:
    - Maximum total account limit
    - Maximum admin account limit
    - Username and email uniqueness
    - Service number uniqueness (if provided)
    - Password complexity requirements
    """
    # Check total account limit
    total_active = (await db.execute(
        select(func.count(User.id)).where(User.is_active.is_(True))
    )).scalar() or 0

    if total_active >= MAX_TOTAL_ACCOUNTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Maximum account limit ({MAX_TOTAL_ACCOUNTS}) reached",
        )

    # Check admin limit
    if body.role == "admin":
        admin_count = await _count_active_admins(db)
        if admin_count >= MAX_ADMIN_ACCOUNTS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Maximum admin accounts ({MAX_ADMIN_ACCOUNTS}) reached",
            )

    # Check uniqueness: username
    existing_username = await db.execute(
        select(User).where(User.username == body.username)
    )
    if existing_username.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{body.username}' is already taken",
        )

    # Check uniqueness: email
    existing_email = await db.execute(
        select(User).where(User.email == body.email.lower())
    )
    if existing_email.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already in use",
        )

    # Check uniqueness: service number
    if body.service_number:
        existing_sn = await db.execute(
            select(User).where(User.service_number == body.service_number)
        )
        if existing_sn.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Service number '{body.service_number}' is already assigned",
            )

    user = User(
        username=body.username,
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        rank=body.rank,
        role=UserRole(body.role),
        service_number=body.service_number,
        unit=body.unit,
        contact_number=body.contact_number,
        timezone=body.timezone,
        must_change_password=True,
        created_by=admin.id,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return _user_to_response(user)


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update user metadata",
)
async def update_user(
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserResponse:
    """Update user profile fields. Does not change role or password."""
    user = await _get_user_or_404(user_id, db)

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Email uniqueness check
    if "email" in update_data:
        update_data["email"] = update_data["email"].lower().strip()
        existing = await db.execute(
            select(User).where(
                User.email == update_data["email"],
                User.id != user_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address is already in use",
            )

    # Service number uniqueness check
    if "service_number" in update_data and update_data["service_number"]:
        existing = await db.execute(
            select(User).where(
                User.service_number == update_data["service_number"],
                User.id != user_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Service number is already assigned",
            )

    for key, value in update_data.items():
        setattr(user, key, value)

    await db.flush()
    await db.refresh(user)

    return _user_to_response(user)


@router.put(
    "/{user_id}/role",
    response_model=UserResponse,
    summary="Change user role",
)
async def change_role(
    user_id: int,
    body: RoleChange,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserResponse:
    """Change a user's role. Admin only.

    Enforces:
    - Cannot change your own role
    - Cannot exceed max admin count
    - Cannot demote the last active admin
    """
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )

    user = await _get_user_or_404(user_id, db)
    new_role = UserRole(body.role)

    if new_role == user.role:
        return _user_to_response(user)

    # Check admin limits
    if new_role == UserRole.admin:
        admin_count = await _count_active_admins(db)
        if admin_count >= MAX_ADMIN_ACCOUNTS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Maximum admin accounts ({MAX_ADMIN_ACCOUNTS}) reached",
            )

    # Prevent removing last admin
    if user.role == UserRole.admin and new_role != UserRole.admin:
        admin_count = await _count_active_admins(db)
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot demote the last active admin",
            )

    user.role = new_role
    await db.flush()
    await db.refresh(user)

    return _user_to_response(user)


@router.put(
    "/{user_id}/deactivate",
    response_model=UserResponse,
    summary="Deactivate a user account",
)
async def deactivate_user(
    user_id: int,
    body: DeactivationRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserResponse:
    """Deactivate a user account with mandatory reason.

    Enforces:
    - Cannot deactivate yourself
    - Cannot deactivate the last active admin
    - Warns about active sign-outs (but allows deactivation)
    """
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    user = await _get_user_or_404(user_id, db)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is already deactivated",
        )

    # Prevent removing last admin
    if user.role == UserRole.admin:
        admin_count = await _count_active_admins(db)
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot deactivate the last active admin",
            )

    # Check for active sign-outs (warn but don't block)
    active_so = (await db.execute(
        select(func.count(SignOut.id)).where(
            SignOut.user_id == user_id,
            SignOut.status.in_([
                SignOutStatus.active,
                SignOutStatus.partially_returned,
                SignOutStatus.overdue,
            ]),
        )
    )).scalar() or 0

    now = datetime.now(timezone.utc)
    user.is_active = False
    user.deactivated_at = now
    user.deactivated_by = admin.id
    user.deactivation_reason = body.reason
    user.locked_until = None
    user.failed_login_count = 0

    await db.flush()
    await db.refresh(user)

    response = _user_to_response(user)

    # Include warning about active sign-outs in a non-standard way
    # (the caller can check the sign-out count separately)
    if active_so > 0:
        response.deactivation_reason = (
            f"{body.reason} [WARNING: User has {active_so} active sign-out(s)]"
        )

    return response


@router.put(
    "/{user_id}/reactivate",
    response_model=UserResponse,
    summary="Reactivate a deactivated account",
)
async def reactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserResponse:
    """Reactivate a deactivated user account.
    Resets lockout state and forces password change."""
    user = await _get_user_or_404(user_id, db)

    if user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is already active",
        )

    # Check account limits
    total_active = (await db.execute(
        select(func.count(User.id)).where(User.is_active.is_(True))
    )).scalar() or 0

    if total_active >= MAX_TOTAL_ACCOUNTS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Maximum account limit ({MAX_TOTAL_ACCOUNTS}) reached",
        )

    if user.role == UserRole.admin:
        admin_count = await _count_active_admins(db)
        if admin_count >= MAX_ADMIN_ACCOUNTS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Maximum admin accounts ({MAX_ADMIN_ACCOUNTS}) reached. "
                       f"Change the user's role first.",
            )

    user.is_active = True
    user.deactivated_at = None
    user.deactivated_by = None
    user.deactivation_reason = None
    user.failed_login_count = 0
    user.locked_until = None
    user.must_change_password = True

    await db.flush()
    await db.refresh(user)

    return _user_to_response(user)


# ── Activity endpoints ────────────────────────────────────────────


@router.get(
    "/{user_id}/activity",
    response_model=UserActivity,
    summary="User's recent activity",
)
async def get_user_activity(
    user_id: int,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserActivity:
    """Recent sign-outs, returns, and resupply requests for a user."""
    await _get_user_or_404(user_id, db)

    # Recent sign-outs
    so_result = await db.execute(
        select(SignOut)
        .where(SignOut.user_id == user_id)
        .order_by(desc(SignOut.signed_out_at))
        .limit(limit)
    )
    recent_signouts = [
        {
            "id": so.id,
            "ref": so.signout_ref,
            "item_name": so.item_name_snapshot or "",
            "quantity": so.quantity,
            "status": so.status.value,
            "signed_out_at": so.signed_out_at.isoformat() if so.signed_out_at else None,
            "expected_return": str(so.expected_return_date),
        }
        for so in so_result.scalars().all()
    ]

    # Recent returns
    ret_result = await db.execute(
        select(SignOut)
        .where(
            SignOut.user_id == user_id,
            SignOut.status == SignOutStatus.returned,
        )
        .order_by(desc(SignOut.returned_at))
        .limit(limit)
    )
    recent_returns = [
        {
            "id": so.id,
            "ref": so.signout_ref,
            "item_name": so.item_name_snapshot or "",
            "quantity_returned": so.quantity_returned,
            "condition": so.condition_on_return.value if so.condition_on_return else None,
            "returned_at": so.returned_at.isoformat() if so.returned_at else None,
        }
        for so in ret_result.scalars().all()
    ]

    # Recent resupply
    rs_result = await db.execute(
        select(ResupplyRequest)
        .where(ResupplyRequest.requested_by == user_id)
        .order_by(desc(ResupplyRequest.created_at))
        .limit(limit)
    )
    recent_resupply = [
        {
            "id": r.id,
            "ref": r.request_number,
            "item_name": r.display_item_name,
            "quantity": r.quantity_requested,
            "status": r.status.value,
            "priority": r.priority.value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rs_result.scalars().all()
    ]

    return UserActivity(
        recent_signouts=recent_signouts,
        recent_returns=recent_returns,
        recent_resupply=recent_resupply,
    )