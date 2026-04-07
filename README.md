<p align="center">
  <img src="https://img.shields.io/badge/G4-LIGHT-3B82F6?style=for-the-badge&labelColor=080A0F" alt="g4lite" />
</p>

<h1 align="center">G4Lite</h1>

<p align="center">
  <strong>C2-grade self-hosted equipment logistics platform</strong><br/>
  Track inventory, manage sign-outs, handle resupply, control physical access — entirely on your own infrastructure.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/MUI-v5-007FFF?logo=mui&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## Overview

G4Lite is a containerised logistics management platform designed for small teams (~12 users) managing a physical technical equipment store. It runs entirely in Docker with **zero external internet dependencies** in production, making it suitable for air-gapped and classified environments.

The platform is built to **C2 (Command & Control) operational standards** — data-dense, keyboard-navigable, and designed for people who make decisions under pressure with zero tolerance for friction.

### Key Features

| Feature | Description |
|---|---|
| **Inventory Management** | Full catalogue with item codes, NSN tracking, condition breakdown, criticality levels, physical location addressing, and stock thresholds |
| **Equipment Sign-out** | Approval workflows, partial returns, per-condition quantity breakdown, extension tracking, loss declaration, and overdue escalation |
| **Resupply Procurement** | 9-state lifecycle from draft through ordering to partial/full fulfillment, with cost tracking, supplier management, and request numbering |
| **Notification System** | Priority-based (low → critical) with category filtering, acknowledgement workflow for critical alerts, deep-link actions, and expiry |
| **User Management** | Role-based access (admin/user/viewer), account lockout with escalation, password lifecycle, notification preferences, and activity tracking |
| **AI Assistant** | Context-aware Ollama-powered LLM with live inventory injection, conversation management, streaming SSE, and quick-query endpoints |
| **Physical Security** | Access PIN generation, smart lock integration (ESP32/Nuki), cage entry/exit audit trail *(Phase 2 — planned)* |
| **Dark Operations UI** | Bloomberg Terminal discipline meets Linear.app refinement — monochromatic, data-dense, surgical accent usage |
| **CSV Export** | Every data table exportable to CSV with filters |
| **Air-Gap Ready** | Self-hosted fonts, no CDN dependencies, offline Docker packaging |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx :80                          │
│              Reverse proxy & static files                │
├─────────────────────┬───────────────────────────────────┤
│                     │                                   │
│   React Frontend    │      FastAPI Backend :8000        │
│   (Vite + MUI +     │      (async, SQLAlchemy 2.0)      │
│    Tailwind)        │              │                    │
│                     │     ┌────────┴────────┐           │
│                     │     │   PostgreSQL    │           │
│                     │     │     :5432       │           │
│                     │     └────────────────┘           │
│                     │                                   │
│                     │     ┌────────────────┐           │
│                     │     │    Ollama       │  (opt.)   │
│                     │     │    :11434       │           │
│                     │     └────────────────┘           │
│                     │                                   │
│                     │     ┌────────────────┐           │
│                     │     │  ESP32 / Nuki   │  (opt.)   │
│                     │     │  Smart Lock     │           │
│                     │     └────────────────┘           │
└─────────────────────┴───────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) v20.10+
- [Docker Compose](https://docs.docker.com/compose/install/) v2.0+
- 2GB RAM minimum (4GB recommended with Ollama)

### 1. Clone the repository

```bash
git clone https://github.com/Szyyi/g4lite.git
cd g4lite
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set a secure `SECRET_KEY` and `POSTGRES_PASSWORD`:

```env
SECRET_KEY=your-very-long-random-secret-key-here
POSTGRES_PASSWORD=a-strong-database-password
```

### 3. Start the platform

```bash
# Production
docker compose up -d --build

# Development (with hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Full rebuild (after model/schema changes)
docker compose down --remove-orphans && docker compose up -d --build
```

### 4. Run database migrations

```bash
docker compose exec backend alembic upgrade head
```

### 5. Seed initial data

```bash
docker compose exec backend python -m app.seed
```

### 6. Access the platform

| Service | URL |
|---|---|
| **Application** | [http://localhost](http://localhost) |
| **API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) |

---

## Default Credentials

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `admin2` | `admin123` | Admin |
| `user1` – `user5` | `user1234` | User |

> **Change these immediately in production.** All accounts have `must_change_password=True` by default.

---

## Data Models (Phase 2 — Expanded)

### Category
Hierarchical equipment categories with single-level nesting, auto-generated slugs, short codes, icon/colour metadata, display ordering, and soft-delete.

**Key fields:** `name`, `slug`, `code`, `parent_id`, `sort_order`, `icon`, `colour`, `is_active`, `created_by`, `updated_by`

### Item
Full logistics item with identity (item_code, NSN), manufacturer tracking, stock management with hard quantity invariant, physical location (storage/shelf/bin), classification (criticality, consumable, serialised, hazmat, requires_approval), and comprehensive condition tracking.

**Key fields:** `item_code`, `slug`, `nsn`, `category_id`, `manufacturer`, `model_number`, `total_quantity`, `available_quantity`, `serviceable_count`, `unserviceable_count`, `damaged_count`, `condemned_count`, `checked_out_count`, `minimum_stock_level`, `criticality`, `storage_location`, `shelf`, `bin`, `tags`

**Invariant enforced at DB level:** `total_quantity = serviceable + unserviceable + damaged + condemned + checked_out`

### SignOut
Equipment sign-out with approval workflow, partial returns with per-condition breakdown, extension tracking, loss declaration, overdue escalation, and item snapshots for historical records.

**Status lifecycle:** `pending_approval → approved → active → returned | partially_returned → returned | overdue → returned | lost`

**Key fields:** `signout_ref` (SO-YYYYMM-NNNN), `quantity`, `quantity_returned`, `quantity_returned_serviceable/unserviceable/damaged/condemned`, `quantity_lost`, `condition_on_issue`, `condition_on_return`, `extension_count`, `original_return_date`, `overdue_notified_at`

### ResupplyRequest
Full procurement lifecycle with approval chain, cost tracking, delivery tracking, and supplier management.

**Status lifecycle:** `draft → pending → under_review → approved → ordered → partially_fulfilled → fulfilled | rejected | cancelled`

**Key fields:** `request_number` (RSP-YYYYMM-NNNN), `priority` (routine/urgent/critical/emergency), `quantity_requested`, `quantity_fulfilled`, `estimated_unit_cost`, `actual_unit_cost`, `budget_code`, `supplier_name`, `external_po_number`, `required_by_date`

### Notification
Priority-based notification system with category filtering, acknowledgement workflow, deep-link actions, and expiry.

**14 types across 4 categories:** inventory (signout, return_ok, return_damaged, return_condemned, overdue, low_stock, item_condition_change), resupply (resupply_request, resupply_status_change), access (access_granted, access_denied, access_pin_expired), admin (user_account, system_alert)

**4 priority levels:** low, normal, high, critical (critical requires explicit acknowledgement)

### User
Platform account with security hardening, session tracking, notification preferences, and account lifecycle.

**3 roles:** admin (max 2), user (max 10), viewer (read-only)

**Security:** failed login lockout with escalating duration (5min → 15min → 60min → account disabled), password reuse prevention, forced password change, IP tracking

---

## API Reference — Complete Endpoint Map

All endpoints prefixed with `/api`. Interactive docs at `/docs`.

### Auth (11 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/login` | — | Authenticate with lockout enforcement + session tracking |
| `POST` | `/auth/refresh` | User | Refresh JWT with sliding expiry |
| `GET` | `/auth/me` | User | Current user profile |
| `POST` | `/auth/change-password` | User | Change own password with complexity + reuse validation |
| `POST` | `/auth/admin/reset-password` | Admin | Reset another user's password (forces change on next login) |
| `POST` | `/auth/admin/unlock-account` | Admin | Unlock a locked account + reset failed attempts |
| `PUT` | `/auth/profile` | User | Update own profile (name, email, rank, unit, contact, timezone) |
| `GET` | `/auth/notifications/preferences` | User | Get notification preference toggles |
| `PUT` | `/auth/notifications/preferences` | User | Update notification preference toggles |

### Categories (7 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/categories` | User | List with item counts, optional inactive filter |
| `GET` | `/categories/tree` | User | Nested hierarchy tree for sidebar/filter UI |
| `GET` | `/categories/{id}` | User | Single category detail |
| `POST` | `/categories` | Admin | Create with parent validation + code uniqueness |
| `PUT` | `/categories/{id}` | Admin | Update with self-parent prevention |
| `DELETE` | `/categories/{id}` | Admin | Soft-delete (fails if active items exist) |

### Items (15 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/items` | User | Paginated list with 12 filters + 8 sort fields |
| `GET` | `/items/stats` | User | Dashboard aggregates (16 metrics) |
| `GET` | `/items/low-stock` | User | Items at/below minimum stock, sorted by criticality |
| `GET` | `/items/export` | Admin | CSV export with filters |
| `GET` | `/items/{id}` | User | Full item detail with computed properties |
| `POST` | `/items` | Admin | Create with invariant validation + uniqueness checks |
| `PUT` | `/items/{id}` | Admin | Update metadata (no quantity changes) |
| `POST` | `/items/{id}/adjust-stock` | Admin | Add/remove stock with mandatory audit reason |
| `POST` | `/items/{id}/transfer-condition` | Admin | Move units between condition states |
| `DELETE` | `/items/{id}` | Admin | Soft-delete (fails if active sign-outs exist) |
| `POST` | `/items/{id}/restore` | Admin | Restore a deactivated item |

### Sign-Outs (14 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/signouts` | Admin | Paginated list with 8 filters + 6 sort fields |
| `GET` | `/signouts/mine` | User | Current user's sign-outs with status filter |
| `GET` | `/signouts/overdue` | Admin | All overdue sign-outs, sorted most overdue first |
| `GET` | `/signouts/stats` | Admin | Dashboard statistics (11 metrics + top overdue items) |
| `GET` | `/signouts/export` | Admin | CSV export with status/overdue filters |
| `GET` | `/signouts/{id}` | User | Sign-out detail with ownership check |
| `POST` | `/signouts` | User | Create with approval workflow + item validation |
| `PUT` | `/signouts/{id}/return` | User | Return with per-condition quantity breakdown |
| `PUT` | `/signouts/{id}/extend` | User | Extend return date with reason |
| `PUT` | `/signouts/{id}/approve` | Admin | Approve pending sign-out (deducts stock) |
| `PUT` | `/signouts/{id}/reject` | Admin | Reject with mandatory reason (restores stock) |
| `PUT` | `/signouts/{id}/declare-lost` | Admin | Declare equipment lost (permanently removes from inventory) |

### Resupply (16 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/resupply` | Admin | Paginated list with 10 filters + priority sorting |
| `GET` | `/resupply/mine` | User | Current user's requests with status filter |
| `GET` | `/resupply/stats` | Admin | Dashboard statistics (10 metrics including costs) |
| `GET` | `/resupply/export` | Admin | 20-column CSV export |
| `GET` | `/resupply/{id}` | User | Request detail with ownership check |
| `POST` | `/resupply` | User | Submit with request number generation + validation |
| `PUT` | `/resupply/{id}/review` | Admin | Begin review (pending → under_review) |
| `PUT` | `/resupply/{id}/approve` | Admin | Approve with optional cost estimate |
| `PUT` | `/resupply/{id}/reject` | Admin | Reject with mandatory reason |
| `PUT` | `/resupply/{id}/order` | Admin | Mark ordered with supplier details |
| `PUT` | `/resupply/{id}/fulfill` | Admin | Record delivery (partial or full) |
| `PUT` | `/resupply/{id}/cost` | Admin | Update cost tracking |
| `PUT` | `/resupply/{id}/notes` | Admin | Update admin notes |
| `PUT` | `/resupply/{id}/cancel` | User | Cancel (users before ordering, admins any non-terminal) |

### Notifications (13 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications` | User | Paginated list with category/priority/type/read filters |
| `GET` | `/notifications/unread-count` | User | Badge counts by category + priority + critical unacked |
| `GET` | `/notifications/{id}` | User | Single notification detail |
| `PUT` | `/notifications/{id}/read` | User | Mark as read with timestamp |
| `PUT` | `/notifications/{id}/acknowledge` | User | Acknowledge critical notification |
| `PUT` | `/notifications/read-all` | User | Bulk read (skips critical unacknowledged) |
| `POST` | `/notifications/dismiss` | User | Bulk dismiss by IDs (skips critical unacked) |
| `DELETE` | `/notifications/{id}` | User | Delete (refuses critical unacked) |
| `GET` | `/notifications/admin/all` | Admin | System-wide notification list |
| `GET` | `/notifications/admin/stats` | Admin | Notification statistics |
| `POST` | `/notifications/admin/broadcast` | Admin | Send system-wide announcement |
| `POST` | `/notifications/admin/clear-expired` | Admin | Purge expired notifications |

### Users (12 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | Admin | Paginated list with search + role + active filters |
| `GET` | `/users/stats` | Admin | Account statistics (11 metrics + capacity remaining) |
| `GET` | `/users/export` | Admin | CSV export (never includes passwords) |
| `GET` | `/users/{id}` | Admin | Detail with activity counts (signouts, resupply, notifications) |
| `POST` | `/users` | Admin | Create with account limits + uniqueness validation |
| `PUT` | `/users/{id}` | Admin | Update metadata |
| `PUT` | `/users/{id}/role` | Admin | Change role (admin count protection, self-change prevention) |
| `PUT` | `/users/{id}/deactivate` | Admin | Deactivate with reason (self-deactivation prevention) |
| `PUT` | `/users/{id}/reactivate` | Admin | Reactivate with limit checks + forced password change |
| `GET` | `/users/{id}/activity` | Admin | Recent sign-outs, returns, and resupply requests |

### AI Assistant (12 endpoints)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/assistant/health` | — | Ollama status + available models |
| `POST` | `/assistant/chat` | User | Chat with context injection + optional SSE streaming |
| `GET` | `/assistant/conversations` | User | List conversations |
| `GET` | `/assistant/conversations/{id}` | User | Conversation history |
| `PUT` | `/assistant/conversations/{id}/title` | User | Rename conversation |
| `DELETE` | `/assistant/conversations/{id}` | User | Delete conversation |
| `DELETE` | `/assistant/conversations` | User | Clear all conversations |
| `GET` | `/assistant/models` | User | List available Ollama models |
| `GET` | `/assistant/usage` | Admin | Assistant usage statistics |
| `GET` | `/assistant/query/inventory-summary` | User | Structured inventory stats (no LLM) |
| `GET` | `/assistant/query/search-items` | User | Quick item search (no LLM) |

**Total: 100 endpoints** (up from 21 in Phase 1)

---

## Roles & Permissions

| Action | Admin | User | Viewer |
|---|---|---|---|
| Browse inventory | ✓ | ✓ | ✓ |
| View dashboards & stats | ✓ | — | ✓ |
| Sign out equipment | ✓ | ✓ | — |
| Return equipment | ✓ | Own | — |
| Extend sign-out | ✓ | Own | — |
| Submit resupply request | ✓ | ✓ | — |
| Cancel own resupply request | ✓ | ✓ | — |
| Approve/reject sign-outs | ✓ | — | — |
| Approve/reject/fulfill resupply | ✓ | — | — |
| Create/edit/delete items | ✓ | — | — |
| Adjust stock quantities | ✓ | — | — |
| Transfer condition states | ✓ | — | — |
| Manage categories | ✓ | — | — |
| Manage users | ✓ | — | — |
| Declare equipment lost | ✓ | — | — |
| Broadcast notifications | ✓ | — | — |
| Export CSV | ✓ | — | — |
| Reset passwords / unlock accounts | ✓ | — | — |
| View assistant usage stats | ✓ | — | — |
| Use AI assistant | ✓ | ✓ | ✓ |
| Update own profile | ✓ | ✓ | ✓ |
| Update notification preferences | ✓ | ✓ | ✓ |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_HOST` | `postgres` | Database hostname |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_DB` | `g4lite` | Database name |
| `POSTGRES_USER` | `g4admin` | Database user |
| `POSTGRES_PASSWORD` | `changeme` | Database password (**change this**) |
| `SECRET_KEY` | — | JWT signing secret (**change this**) |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Token lifetime |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Allowed origins |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `mistral` | Default LLM model |
| `LOCK_ENABLED` | `false` | Enable physical lock integration |
| `LOCK_TYPE` | `mock` | `esp32`, `nuki`, `salto`, or `mock` |
| `LOCK_API_URL` | — | Lock device API endpoint |
| `LOCK_API_KEY` | — | Lock device API key |
| `LOCK_TIMEOUT_SECONDS` | `30` | Lock open duration |
| `ACCESS_PIN_VALIDITY_MINUTES` | `15` | Access PIN expiry |
| `ACCESS_PIN_LENGTH` | `6` | Access PIN digit count |

---

## Tech Stack

### Backend

| Component | Technology |
|---|---|
| Language | Python 3.11+ |
| Framework | FastAPI (async) |
| ORM | SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 15 |
| Migrations | Alembic |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| PDF Export | WeasyPrint |
| LLM | Ollama REST API via httpx |

### Frontend

| Component | Technology |
|---|---|
| Framework | React 18 + Vite |
| Language | TypeScript (strict) |
| UI Library | MUI v5 |
| Layout | Tailwind CSS (layout/spacing only) |
| State | Zustand |
| Data Fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Routing | React Router v6 |
| Charts | Recharts |
| Notifications | notistack |
| Fonts | Montserrat + JetBrains Mono (self-hosted) |

### Infrastructure

| Component | Technology |
|---|---|
| Containerisation | Docker + Docker Compose |
| Reverse Proxy | Nginx |
| LLM Runtime | Ollama (optional, `--profile ai`) |
| Physical Lock | ESP32 / Nuki / SALTO (optional) |

---

## Project Structure

```
g4lite/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   │       ├── 001_initial.py
│   │       └── 002_phase2_expansion.py     ← NEW
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── seed.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── user.py                     ← EXPANDED (3 roles, security, prefs)
│       │   ├── category.py                 ← EXPANDED (hierarchy, slug, audit)
│       │   ├── item.py                     ← EXPANDED (40+ fields, invariants)
│       │   ├── signout.py                  ← EXPANDED (8 statuses, partial returns)
│       │   ├── resupply.py                 ← EXPANDED (9 statuses, procurement)
│       │   ├── notification.py             ← EXPANDED (14 types, 4 priorities)
│       │   ├── access.py                   ← NEW (access codes + access logs)
│       │   └── audit.py                    ← NEW (audit log entries)
│       ├── schemas/                        ← TO BE EXPANDED (next session)
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── auth.py                     ← EXPANDED (11 endpoints)
│       │   ├── items.py                    ← EXPANDED (22 endpoints, cat + items)
│       │   ├── signouts.py                 ← EXPANDED (14 endpoints)
│       │   ├── resupply.py                 ← EXPANDED (16 endpoints)
│       │   ├── notifications.py            ← EXPANDED (13 endpoints)
│       │   ├── users.py                    ← EXPANDED (12 endpoints)
│       │   ├── assistant.py                ← EXPANDED (12 endpoints)
│       │   └── access.py                   ← NEW (planned — physical security)
│       ├── services/                       ← TO BE EXPANDED (next session)
│       └── utils/                          ← TO BE EXPANDED (next session)
│
├── frontend/                               ← Phase 2 rebuild after backend
│   └── src/
│       ├── tokens.ts
│       ├── theme.ts
│       └── ...
│
└── nginx/
    └── nginx.conf
```

---

All **models** (6 files) and all **routers** (7 files) have been expanded to production grade. The routers currently define their schemas inline — these need to be extracted to the schemas directory.

#### 1. Schemas Directory — Extract & Align

The expanded routers define Pydantic schemas inline. These must be extracted into the schemas directory to match the project's separation-of-concerns architecture:

| File | Contents |
|---|---|
| `schemas/user.py` | `LoginRequest`, `TokenResponse`, `UserResponse`, `UserCreate`, `UserUpdate`, `UserDetailResponse`, `RoleChange`, `DeactivationRequest`, `ProfileUpdateRequest`, `PasswordChangeRequest`, `AdminPasswordResetRequest`, `NotificationPreferencesRequest/Response`, `AuthStatusResponse`, `PaginatedUsers`, `UserStats`, `UserActivity`, `UserSortField` |
| `schemas/item.py` | `ItemCreate`, `ItemUpdate`, `ItemResponse`, `PaginatedItems`, `StockAdjustment`, `ConditionTransfer`, `ItemStats`, `LowStockItem`, `CategoryCreate`, `CategoryUpdate`, `CategoryResponse`, `CategoryTreeNode`, `ItemSortField` |
| `schemas/signout.py` | `SignOutCreate`, `ReturnRequest`, `ExtensionRequest`, `ApprovalRequest`, `RejectionRequest`, `LossDeclaration`, `SignOutResponse`, `PaginatedSignOuts`, `SignOutStats`, `SignOutSortField` |
| `schemas/resupply.py` | `ResupplyCreate`, `ResupplyApproval`, `ResupplyRejection`, `ResupplyOrderDetails`, `ResupplyFulfillment`, `ResupplyCostUpdate`, `ResupplyAdminNotes`, `ResupplyCancellation`, `ResupplyResponse`, `PaginatedResupply`, `ResupplyStats`, `ResupplySortField` |
| `schemas/notification.py` | `NotificationResponse`, `PaginatedNotifications`, `UnreadCounts`, `BulkDismissRequest`, `BroadcastRequest`, `NotificationStats` |
| `schemas/assistant.py` | `ChatRequest`, `ChatResponse`, `ConversationMessage`, `ConversationSummary`, `ConversationDetail`, `HealthResponse`, `ModelInfo`, `UsageStats` |

#### 2. Services Directory — Expand

| File | Current State | Expansion Needed |
|---|---|---|
| `services/notification_service.py` | Creates basic notifications | Add: `notify_resupply_status_change()`, `notify_low_stock()`, `notify_access_granted/denied()`, `notify_overdue()`, `notify_return_ok()`, `notify_return_condemned()`. Use `NOTIFICATION_TYPE_CATEGORY` and `NOTIFICATION_TYPE_DEFAULT_PRIORITY` from the model for auto-population. Respect user notification preferences (`notify_in_app`, `notify_overdue`, etc.) |
| `services/ollama_service.py` | Basic chat + health | Add: `chat_with_ollama_stream()` (async generator for SSE), `list_ollama_models()`, `OllamaError` exception class. Current `chat_with_ollama()` should accept full message list (not just string + history). |
| `services/access_service.py` | Does not exist | Create: PIN generation, PIN validation, lock API integration (ESP32/Nuki/mock), access log recording. Environment-variable-driven lock type selection. |
| `services/audit_service.py` | Does not exist | Create: Generic audit log recording for all mutations. Captures user_id, action, entity_type, entity_id, before/after JSON diff, IP address, timestamp. |
| `services/overdue_service.py` | Does not exist | Create: Scheduled task (or on-demand endpoint) that scans active sign-outs past expected_return_date, transitions status to `overdue`, sends notifications (respecting `overdue_notified_at` to prevent duplicates), and escalates after 48 hours (checking `overdue_escalated_at`). |
| `services/export_service.py` | Does not exist | Create: Shared CSV generation logic. WeasyPrint PDF generation for resupply demand forms and sign-out receipts. |

#### 3. Utils Directory — Expand

| File | Current State | Expansion Needed |
|---|---|---|
| `utils/security.py` | JWT create/verify, password hash, `get_current_user`, `require_admin` | Add: `hash_password()` export (currently only in `create_user`), `require_viewer_or_above` dependency, rate limiting decorator, input sanitisation helpers |

#### 4. Config — Expand

`config.py` needs new settings for:

```python
# Access control
LOCK_ENABLED: bool = False
LOCK_TYPE: str = "mock"
LOCK_API_URL: str = ""
LOCK_API_KEY: str = ""
LOCK_TIMEOUT_SECONDS: int = 30
ACCESS_PIN_VALIDITY_MINUTES: int = 15
ACCESS_PIN_LENGTH: int = 6

# Security
MAX_FAILED_LOGIN_ATTEMPTS: int = 8
PASSWORD_MIN_LENGTH: int = 8
PASSWORD_MAX_AGE_DAYS: int = 90

# Notifications
NOTIFICATION_POLL_INTERVAL_SECONDS: int = 30
OVERDUE_CHECK_INTERVAL_MINUTES: int = 60
OVERDUE_ESCALATION_HOURS: int = 48
```

#### 5. Database — Expand

`database.py` currently provides the async engine and session factory. Needs:
- Connection pool tuning for production (`pool_size`, `max_overflow`)
- Health check query function
- Optional: middleware for `last_active_at` throttled updates

#### 6. Seed Script — Expand

`seed.py` currently seeds 7 users, 4 categories, 15 items. Phase 2 expansion:
- **50+ items** with full descriptions, item codes, manufacturers, model numbers, storage locations, condition breakdowns, criticality levels, min stock thresholds
- **Subcategories** using the new hierarchy (e.g. Computing → Single-Board Computers, Storage Devices)
- **Category codes and icons** (COMP, COMMS, PWR, ACC with matching MUI icon names)
- **Realistic stock levels** with some items low-stock and some with mixed conditions
- See the Phase 2 Handover Document §5 "Expanded Equipment Catalogue" for the full target list

#### 7. New Models — Create

| File | Purpose |
|---|---|
| `models/access.py` | `AccessCode` (one-time PINs for cage entry) + `AccessLog` (entry/exit/denied events). See Phase 2 Handover §4. |
| `models/audit.py` | `AuditEntry` — generic audit log for all mutations. Fields: `user_id`, `action` (create/update/delete/login/etc.), `entity_type`, `entity_id`, `changes_json`, `ip_address`, `timestamp`. |

#### 8. Alembic Migration

A new migration `002_phase2_expansion.py` is required to:
- Add all new columns to existing tables (with sensible defaults for existing rows)
- Add new tables (access_codes, access_logs, audit_entries)
- Add new constraints and indexes
- Handle the `is_deleted → is_active` rename on items (invert existing boolean values)
- Add `slug` columns with auto-generation for existing rows
- Add `item_code` column with auto-generation for existing items (e.g. derive from name)
- Add `signout_ref` / `request_number` for existing records

---

## Enabling the AI Assistant

```bash
# Start with the AI profile
docker compose --profile ai up -d

# Pull a model (run once)
docker compose exec ollama ollama pull mistral
```

The assistant injects live inventory data into its system prompt — it knows your actual stock levels, low-stock items, and active sign-out counts. Supports streaming responses via SSE.

---

## Air-Gap Deployment

g4lite is designed to run without internet access:

1. **Fonts**: Montserrat and JetBrains Mono self-hosted in `/public/fonts/`
2. **Docker images**: Pre-pull, then `docker save` / `docker load`
3. **npm packages**: Build frontend on connected machine, copy `dist/`
4. **Ollama models**: Pull on connected machine, copy volume data
5. **No CDN dependencies**: All libraries bundled in the build

---

## Development

### Full rebuild after model changes

```bash
docker compose down --remove-orphans && docker compose up -d --build
```

### Running migrations

```bash
# Create a new migration after model changes
docker compose exec backend alembic revision --autogenerate -m "description"

# Apply
docker compose exec backend alembic upgrade head

# Rollback
docker compose exec backend alembic downgrade -1
```

### Local backend development (Windows)

```bash
cd backend
py -3.12 -m pip install -r requirements.txt
py -3.12 -m uvicorn app.main:app --reload --port 8000
```

### Local frontend development

```bash
cd frontend
npm install
npm run dev
```

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---
