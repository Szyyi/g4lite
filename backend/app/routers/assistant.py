"""
g4lite — Assistant Router
============================

AI-powered logistics assistant backed by a local Ollama instance.
Provides conversational help, inventory queries, and operational
guidance — all running on-premise with zero cloud dependencies.

Capabilities:
- General conversation about equipment logistics
- Inventory lookups ("what power banks do we have?")
- Sign-out status queries ("who has the Raspberry Pis?")
- Resupply guidance ("we're low on Cat6 cables, what should I do?")
- Platform help ("how do I extend a sign-out?")

Architecture:
- Conversations are persisted in DB for continuity across sessions
- System prompt injects live platform context (inventory summary,
  user role, active sign-outs) so the LLM gives grounded answers
- Streaming via Server-Sent Events for responsive UX
- Context window management: conversation history is trimmed to
  fit the model's context length, preserving system prompt + most
  recent exchanges
- Admin endpoints for model management and usage monitoring

Schemas are defined here for now — extract to schemas/assistant.py
when the schemas directory is refactored in Phase 2.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.item import Item
from app.models.signout import SignOut, SignOutStatus
from app.models.user import User, UserRole
from app.services.ollama_service import (
    OllamaError,
    check_ollama_health,
    chat_with_ollama,
    chat_with_ollama_stream,
    list_ollama_models,
)
from app.utils.security import get_current_user, require_admin

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


# ── Schemas ───────────────────────────────────────────────────────


class MessageRole(str, enum.Enum):
    system = "system"
    user = "user"
    assistant = "assistant"


class ConversationMessage(BaseModel):
    """Single message in a conversation."""

    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatRequest(BaseModel):
    """Incoming chat message from the user."""

    message: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="User's message text",
    )
    conversation_id: Optional[str] = Field(
        default=None,
        description="Existing conversation ID to continue. Null = new conversation.",
    )
    stream: bool = Field(
        default=False,
        description="If true, response is streamed via SSE",
    )
    include_context: bool = Field(
        default=True,
        description="If true, inject live inventory/signout context into system prompt",
    )


class ChatResponse(BaseModel):
    """Non-streaming chat response."""

    conversation_id: str
    response: str
    model: str
    context_injected: bool
    tokens_used: Optional[int] = None
    duration_ms: Optional[int] = None


class ConversationSummary(BaseModel):
    """Conversation list item."""

    conversation_id: str
    title: str
    message_count: int
    created_at: datetime
    last_message_at: datetime


class ConversationDetail(BaseModel):
    """Full conversation with message history."""

    conversation_id: str
    title: str
    messages: list[ConversationMessage]
    created_at: datetime
    last_message_at: datetime
    total_tokens: int


class HealthResponse(BaseModel):
    """Ollama service health status."""

    status: str
    ollama_reachable: bool
    model_loaded: str | None = None
    available_models: list[str] = []
    gpu_available: bool = False
    message: str = ""


class ModelInfo(BaseModel):
    """Available LLM model details."""

    name: str
    size: str | None = None
    modified_at: str | None = None
    family: str | None = None


class UsageStats(BaseModel):
    """Assistant usage statistics for admin dashboard."""

    total_conversations: int
    total_messages: int
    total_tokens_used: int
    active_users: int
    conversations_today: int
    avg_messages_per_conversation: float
    most_active_user: str | None = None


# ── In-memory conversation store ──────────────────────────────────
# Phase 2 migrates this to a DB table. For now, in-memory dict
# keyed by conversation_id, storing message history per user.

_conversations: dict[str, dict] = {}


def _get_or_create_conversation(
    conversation_id: str | None,
    user_id: int,
) -> tuple[str, list[dict]]:
    """Retrieve existing conversation or create a new one."""
    if conversation_id and conversation_id in _conversations:
        conv = _conversations[conversation_id]
        if conv["user_id"] != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Conversation belongs to another user",
            )
        return conversation_id, conv["messages"]

    new_id = f"conv-{uuid.uuid4().hex[:12]}"
    _conversations[new_id] = {
        "user_id": user_id,
        "messages": [],
        "created_at": datetime.now(timezone.utc),
        "last_message_at": datetime.now(timezone.utc),
        "title": "New Conversation",
        "total_tokens": 0,
    }
    return new_id, _conversations[new_id]["messages"]


# ── System prompt builder ─────────────────────────────────────────

SYSTEM_PROMPT_BASE = """You are g4lite Assistant, an AI logistics advisor embedded in the g4lite equipment management platform. You operate in a professional, military-adjacent environment where precision and clarity are paramount.

Your role:
- Help users navigate the g4lite platform (sign-outs, returns, resupply requests)
- Answer questions about equipment inventory, availability, and specifications
- Provide guidance on logistics procedures and best practices
- Assist admins with inventory management decisions

Communication style:
- Concise and direct — no filler or pleasantries beyond what's professional
- Use equipment terminology naturally
- When referencing quantities, always include context (e.g. "12 available of 15 total")
- If you don't know something specific about the inventory, say so clearly
- Never fabricate inventory data — use only the context provided

Platform knowledge:
- Users can browse inventory, sign out equipment, return equipment, and submit resupply requests
- Admins manage inventory, approve requests, process returns, and handle user accounts
- Equipment conditions: serviceable, unserviceable, damaged, condemned
- Sign-outs require: full name, rank, task reference, expected return date
- Returns require: condition assessment (serviceable/unserviceable/damaged/condemned)
- Resupply requests require: item, quantity, justification, priority level
- Items flagged as 'requires_approval' need admin sign-off before collection
"""


async def _build_system_prompt(
    db: AsyncSession,
    user: User,
    include_context: bool,
) -> str:
    """Build system prompt with optional live platform context."""
    parts = [SYSTEM_PROMPT_BASE]

    parts.append(
        f"\nCurrent user: {user.display_name} "
        f"(role: {user.role.value}, username: {user.username})"
    )

    if not include_context:
        return "\n".join(parts)

    # ── Inject live inventory summary ─────────────────────────────
    try:
        # Top-level inventory stats
        item_stats = await db.execute(
            select(
                func.count(Item.id).label("total_items"),
                func.coalesce(func.sum(Item.total_quantity), 0).label("total_units"),
                func.coalesce(func.sum(Item.available_quantity), 0).label("available_units"),
                func.coalesce(func.sum(Item.checked_out_count), 0).label("checked_out_units"),
                func.coalesce(func.sum(Item.damaged_count), 0).label("damaged_units"),
            ).where(Item.is_active.is_(True))
        )
        stats = item_stats.one()

        parts.append(f"""
Live inventory summary:
- {stats.total_items} item types in catalogue
- {stats.total_units} total units on charge
- {stats.available_units} units available for sign-out
- {stats.checked_out_units} units currently checked out
- {stats.damaged_units} units damaged/awaiting assessment""")

        # Low-stock items
        low_stock_result = await db.execute(
            select(Item.name, Item.item_code, Item.available_quantity, Item.minimum_stock_level)
            .where(
                Item.is_active.is_(True),
                Item.minimum_stock_level > 0,
                Item.available_quantity <= Item.minimum_stock_level,
            )
            .order_by(Item.available_quantity)
            .limit(10)
        )
        low_stock = low_stock_result.all()
        if low_stock:
            parts.append("\nLow-stock items requiring attention:")
            for item in low_stock:
                parts.append(
                    f"  - {item.name} ({item.item_code}): "
                    f"{item.available_quantity} available "
                    f"(minimum: {item.minimum_stock_level})"
                )

        # Active sign-outs count
        active_signouts = await db.execute(
            select(func.count(SignOut.id)).where(
                SignOut.status.in_([
                    SignOutStatus.active,
                    SignOutStatus.overdue,
                    SignOutStatus.partially_returned,
                ])
            )
        )
        active_count = active_signouts.scalar() or 0

        overdue_signouts = await db.execute(
            select(func.count(SignOut.id)).where(
                SignOut.status == SignOutStatus.overdue
            )
        )
        overdue_count = overdue_signouts.scalar() or 0

        parts.append(
            f"\nActive sign-outs: {active_count} "
            f"(including {overdue_count} overdue)"
        )

        # If admin, show more detail
        if user.is_admin:
            parts.append(
                "\nAs an admin, you can help with: inventory adjustments, "
                "user management queries, sign-out approvals, resupply decisions, "
                "and overdue follow-up guidance."
            )

    except Exception:
        parts.append(
            "\n[Live inventory context temporarily unavailable — "
            "answering from general knowledge only]"
        )

    return "\n".join(parts)


# ── Helper: trim conversation history to fit context window ───────

MAX_HISTORY_MESSAGES = 40  # Keep last N messages (user + assistant pairs)
MAX_HISTORY_CHARS = 24_000  # Rough char limit for history portion


def _trim_history(messages: list[dict]) -> list[dict]:
    """Keep conversation history within context window limits."""
    if len(messages) <= MAX_HISTORY_MESSAGES:
        trimmed = messages
    else:
        trimmed = messages[-MAX_HISTORY_MESSAGES:]

    # Further trim by character count if needed
    total_chars = sum(len(m.get("content", "")) for m in trimmed)
    while total_chars > MAX_HISTORY_CHARS and len(trimmed) > 2:
        removed = trimmed.pop(0)
        total_chars -= len(removed.get("content", ""))

    return trimmed


# ── Routes ────────────────────────────────────────────────────────


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Check Ollama service status",
)
async def assistant_health() -> HealthResponse:
    """Check if the Ollama LLM backend is reachable and which models
    are available. Does not require authentication — used by frontend
    to show/hide the assistant widget."""
    try:
        health = await check_ollama_health()
        models = await list_ollama_models()
        return HealthResponse(
            status="operational" if health.get("ok") else "degraded",
            ollama_reachable=health.get("ok", False),
            model_loaded=health.get("model"),
            available_models=[m.get("name", "") for m in models],
            gpu_available=health.get("gpu", False),
            message=health.get("message", ""),
        )
    except Exception as e:
        return HealthResponse(
            status="offline",
            ollama_reachable=False,
            message=f"Ollama service unavailable: {str(e)}",
        )


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Send a message to the assistant",
)
async def assistant_chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse | StreamingResponse:
    """Send a message and receive a response from the AI assistant.

    If `stream=true`, returns a Server-Sent Events stream instead of
    a JSON response. The frontend should use an EventSource or fetch
    with ReadableStream to consume it.

    If `include_context=true` (default), the system prompt is enriched
    with live inventory data, sign-out statistics, and low-stock alerts
    so the assistant can give grounded, accurate answers.
    """
    # Get or create conversation
    conversation_id, history = _get_or_create_conversation(
        body.conversation_id, current_user.id
    )

    # Build system prompt with optional live context
    system_prompt = await _build_system_prompt(
        db, current_user, body.include_context
    )

    # Append user message to history
    history.append({"role": "user", "content": body.message})

    # Trim history to fit context window
    trimmed_history = _trim_history(history)

    # Build full message list for Ollama
    ollama_messages = [{"role": "system", "content": system_prompt}]
    ollama_messages.extend(trimmed_history)

    # Update conversation metadata
    conv = _conversations[conversation_id]
    conv["last_message_at"] = datetime.now(timezone.utc)

    # Auto-title from first user message
    if conv["title"] == "New Conversation":
        conv["title"] = body.message[:80].strip()
        if len(body.message) > 80:
            conv["title"] += "..."

    # ── Streaming response ────────────────────────────────────────
    if body.stream:
        async def event_generator():
            full_response = []
            try:
                async for chunk in chat_with_ollama_stream(ollama_messages):
                    full_response.append(chunk)
                    yield f"data: {chunk}\n\n"

                # Signal completion
                yield f"data: [DONE]\n\n"

                # Save assistant response to history
                assistant_content = "".join(full_response)
                history.append({
                    "role": "assistant",
                    "content": assistant_content,
                })
            except OllamaError as e:
                yield f"data: [ERROR] {str(e)}\n\n"
            except Exception as e:
                yield f"data: [ERROR] An unexpected error occurred\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Conversation-Id": conversation_id,
            },
        )

    # ── Standard response ─────────────────────────────────────────
    try:
        import time
        start = time.monotonic()

        result = await chat_with_ollama(ollama_messages)

        duration_ms = int((time.monotonic() - start) * 1000)

        assistant_content = result.get("content", result) if isinstance(result, dict) else str(result)
        tokens = result.get("tokens_used") if isinstance(result, dict) else None

        # Save assistant response to history
        history.append({"role": "assistant", "content": assistant_content})

        # Track tokens
        if tokens:
            conv["total_tokens"] = conv.get("total_tokens", 0) + tokens

        return ChatResponse(
            conversation_id=conversation_id,
            response=assistant_content,
            model=result.get("model", "unknown") if isinstance(result, dict) else "unknown",
            context_injected=body.include_context,
            tokens_used=tokens,
            duration_ms=duration_ms,
        )
    except OllamaError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Assistant service error: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your message",
        )


# ── Conversation management ───────────────────────────────────────


@router.get(
    "/conversations",
    response_model=list[ConversationSummary],
    summary="List user's conversations",
)
async def list_conversations(
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[ConversationSummary]:
    """List the current user's recent conversations, newest first."""
    user_convs = [
        ConversationSummary(
            conversation_id=cid,
            title=conv["title"],
            message_count=len(conv["messages"]),
            created_at=conv["created_at"],
            last_message_at=conv["last_message_at"],
        )
        for cid, conv in _conversations.items()
        if conv["user_id"] == current_user.id
    ]

    user_convs.sort(key=lambda c: c.last_message_at, reverse=True)
    return user_convs[:limit]


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetail,
    summary="Get conversation history",
)
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
) -> ConversationDetail:
    """Retrieve full message history for a conversation."""
    if conversation_id not in _conversations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    conv = _conversations[conversation_id]
    if conv["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return ConversationDetail(
        conversation_id=conversation_id,
        title=conv["title"],
        messages=[
            ConversationMessage(
                role=MessageRole(m["role"]),
                content=m["content"],
            )
            for m in conv["messages"]
        ],
        created_at=conv["created_at"],
        last_message_at=conv["last_message_at"],
        total_tokens=conv.get("total_tokens", 0),
    )


@router.put(
    "/conversations/{conversation_id}/title",
    summary="Rename a conversation",
)
async def rename_conversation(
    conversation_id: str,
    title: str = Query(..., min_length=1, max_length=120),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Update the title of a conversation."""
    if conversation_id not in _conversations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    conv = _conversations[conversation_id]
    if conv["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    conv["title"] = title
    return {"conversation_id": conversation_id, "title": title}


@router.delete(
    "/conversations/{conversation_id}",
    summary="Delete a conversation",
)
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Permanently delete a conversation and its history."""
    if conversation_id not in _conversations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    conv = _conversations[conversation_id]
    if conv["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    del _conversations[conversation_id]
    return {"detail": "Conversation deleted", "conversation_id": conversation_id}


@router.delete(
    "/conversations",
    summary="Clear all conversations",
)
async def clear_conversations(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Delete all conversations for the current user."""
    to_delete = [
        cid for cid, conv in _conversations.items()
        if conv["user_id"] == current_user.id
    ]
    for cid in to_delete:
        del _conversations[cid]

    return {"detail": f"Deleted {len(to_delete)} conversations"}


# ── Model management (admin) ─────────────────────────────────────


@router.get(
    "/models",
    response_model=list[ModelInfo],
    summary="List available LLM models",
)
async def get_available_models(
    _: User = Depends(get_current_user),
) -> list[ModelInfo]:
    """List all models available in the Ollama instance."""
    try:
        models = await list_ollama_models()
        return [
            ModelInfo(
                name=m.get("name", "unknown"),
                size=m.get("size"),
                modified_at=m.get("modified_at"),
                family=m.get("details", {}).get("family") if isinstance(m.get("details"), dict) else None,
            )
            for m in models
        ]
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Cannot retrieve models — Ollama service may be offline",
        )


# ── Usage statistics (admin) ──────────────────────────────────────


@router.get(
    "/usage",
    response_model=UsageStats,
    summary="Assistant usage statistics",
    dependencies=[Depends(require_admin)],
)
async def get_usage_stats() -> UsageStats:
    """Usage statistics for the AI assistant. Admin only."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    all_convs = list(_conversations.values())
    total_messages = sum(len(c["messages"]) for c in all_convs)
    total_tokens = sum(c.get("total_tokens", 0) for c in all_convs)
    today_convs = sum(
        1 for c in all_convs if c["created_at"] >= today_start
    )

    # Find most active user by conversation count
    user_counts: dict[int, int] = {}
    for conv in all_convs:
        uid = conv["user_id"]
        user_counts[uid] = user_counts.get(uid, 0) + 1

    most_active_uid = max(user_counts, key=user_counts.get) if user_counts else None

    return UsageStats(
        total_conversations=len(all_convs),
        total_messages=total_messages,
        total_tokens_used=total_tokens,
        active_users=len(user_counts),
        conversations_today=today_convs,
        avg_messages_per_conversation=round(
            total_messages / max(len(all_convs), 1), 1
        ),
        most_active_user=str(most_active_uid) if most_active_uid else None,
    )


# ── Quick query endpoints ─────────────────────────────────────────
# Structured endpoints that bypass the LLM for fast, deterministic
# answers. The chat endpoint can suggest these to users.


@router.get(
    "/query/inventory-summary",
    summary="Quick inventory summary (no LLM)",
)
async def query_inventory_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a structured inventory summary without invoking the LLM.
    Useful for the assistant widget's quick-action buttons."""
    result = await db.execute(
        select(
            func.count(Item.id).label("total_items"),
            func.coalesce(func.sum(Item.total_quantity), 0).label("total_units"),
            func.coalesce(func.sum(Item.available_quantity), 0).label("available"),
            func.coalesce(func.sum(Item.checked_out_count), 0).label("checked_out"),
            func.coalesce(func.sum(Item.damaged_count), 0).label("damaged"),
            func.coalesce(func.sum(Item.condemned_count), 0).label("condemned"),
        ).where(Item.is_active.is_(True))
    )
    row = result.one()

    # Low-stock count
    low_stock_count = await db.execute(
        select(func.count(Item.id)).where(
            Item.is_active.is_(True),
            Item.minimum_stock_level > 0,
            Item.available_quantity <= Item.minimum_stock_level,
        )
    )

    return {
        "total_item_types": row.total_items,
        "total_units": row.total_units,
        "available_units": row.available,
        "checked_out_units": row.checked_out,
        "damaged_units": row.damaged,
        "condemned_units": row.condemned,
        "low_stock_item_count": low_stock_count.scalar() or 0,
    }


@router.get(
    "/query/search-items",
    summary="Quick item search (no LLM)",
)
async def query_search_items(
    q: str = Query(..., min_length=1, max_length=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Search inventory items by name, code, or description.
    Returns structured results without invoking the LLM."""
    search_pattern = f"%{q}%"
    result = await db.execute(
        select(
            Item.id,
            Item.name,
            Item.item_code,
            Item.short_description,
            Item.available_quantity,
            Item.total_quantity,
            Item.criticality,
        )
        .where(
            Item.is_active.is_(True),
            (
                Item.name.ilike(search_pattern)
                | Item.item_code.ilike(search_pattern)
                | Item.description.ilike(search_pattern)
                | Item.tags.ilike(search_pattern)
            ),
        )
        .order_by(Item.name)
        .limit(20)
    )
    items = result.all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "item_code": item.item_code,
            "short_description": item.short_description,
            "available_quantity": item.available_quantity,
            "total_quantity": item.total_quantity,
            "criticality": item.criticality,
        }
        for item in items
    ]