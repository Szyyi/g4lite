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

## Frontend (Phase 3 — Operational UI)

The frontend was completely rewritten in Phase 3 to align with the expanded 100-endpoint backend and the G4Lite UI/UX Design System. It is designed to feel like a piece of operational equipment, not a SaaS dashboard.

### Design Philosophy

- **Bloomberg Terminal discipline** meets **Linear.app refinement**
- **Monochromatic dark surfaces** — near-black `#080A0F` base, true-black surfaces, hairline borders
- **Single configurable accent colour** (default `#3B82F6`) used surgically for interactive elements only
- **Monospace font** (JetBrains Mono) for every numeric value, ID, date, and quantity — instant visual distinction between labels and data
- **No gradients, no shadows on dark surfaces, no decorative illustration** — every pixel earns its place
- **Loading, empty, and error states handled on every component** — never a blank screen
- **Air-gap ready** — Montserrat and JetBrains Mono fonts self-hosted, no CDN dependencies

### Frontend Tech Stack

| Component | Technology |
|---|---|
| Framework | React 18 + Vite 6 |
| Language | TypeScript (strict mode) |
| UI Library | MUI v5 |
| Styling | Tailwind CSS (layout/spacing only — colours via MUI theme) |
| State | Zustand (with persistence) |
| Data Fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Routing | React Router v6 |
| Charts | Recharts |
| Notifications | notistack |
| Icons | MUI Icons (Outlined variant only) |
| Fonts | Montserrat + JetBrains Mono (self-hosted) |

### Phase 3A — Foundation

The foundation layer was built first to give every subsequent component a single source of truth for visual primitives, types, and theme.

**Design tokens (`src/tokens.ts`)** — 19 categories of design primitives in a single typed const:
- Surface elevation ladder (8 steps from `base` to `borderMax`)
- Text colour hierarchy (6 levels including `quartery` ghost text)
- Configurable accent colour with 7 shade variants
- Status colours (success/warning/danger/info) each with full/muted/subtle/border variants
- Criticality, priority, and condition semantic colour maps
- Typography scale (12 font sizes, 5 weights, 6 line heights, 9 letter spacings)
- Base-4 spacing scale, layout dimensions, breakpoints
- Border radius, border widths, z-index ladder, shadow scale
- Motion (durations, easings), opacity scale, icon sizes
- Charts palette, scrollbar dimensions, focus ring config
- Helper functions (`getCriticalityConfig`, `getPriorityConfig`, `getConditionConfig`)

**MUI theme (`src/theme.ts`)** — every MUI component overridden to match the design system. Buttons, cards, papers, tables, inputs, chips, dialogs, drawers, tooltips, menus, tabs, dividers, skeletons, alerts, badges, and backdrops all use tokens exclusively. No hardcoded colours anywhere.

**TypeScript types (`src/types/index.ts`)** — complete type definitions for every backend Pydantic schema:
- All enums (UserRole, ItemCriticality, SignOutStatus, ResupplyStatus, ResupplyPriority, NotificationCategory, NotificationPriority, NotificationType, ConditionState)
- Brief and full variants (`ItemBrief` for lists, `ItemResponse` for detail)
- Paginated wrappers for every collection
- Stats response types for every dashboard
- Sort field enums for query builders
- Request/response types for all 100 endpoints

**Tailwind config (`tailwind.config.ts`)** — extends Tailwind with the full token palette so layout utilities can reference design system values. Includes safelist for dynamically-generated classes.

### Phase 3B — API Layer & State

**API client (`src/api/client.ts`)** — Axios instance with:
- JWT bearer token interceptor (reads from Zustand auth store)
- Request ID injection
- 401 auto-logout with clean Zustand reset
- Centralised error message extractor (`getApiErrorMessage`, `getApiErrorStatus`)
- 30-second default timeout

**Typed API modules** — one file per backend router, all returning typed promises:

| File | Endpoints |
|---|---|
| `api/auth.ts` | login, refresh, getMe, changePassword, updateProfile, updateNotificationPreferences, logout |
| `api/items.ts` | list, get, create, update, delete, restore, stats, lowStock, adjustStock, transferCondition, exportCsv, listCategories, getCategoryTree |
| `api/signouts.ts` | list, listMine, get, create, return, extend, approve, reject, declareLost, overdue, stats, exportCsv |
| `api/resupply.ts` | list, listMine, get, create, review, approve, reject, order, fulfill, updateCost, updateNotes, cancel, stats, exportCsv |
| `api/notifications.ts` | list, get, markRead, acknowledge, markAllRead, bulkDismiss, delete, unreadCount, adminListAll, adminStats, broadcast, clearExpired |
| `api/users.ts` | list, get, create, update, changeRole, deactivate, reactivate, activity, stats, exportCsv |
| `api/assistant.ts` | health, chat, listConversations, getConversation, deleteConversation, clearConversations, listModels, usage, queryInventorySummary, querySearchItems |

**Zustand stores:**

- **`store/authStore.ts`** — persisted JWT + user object, role check helpers (`isAdmin`, `canWrite`, `isViewer`), display helpers (`displayName`, `initials`, `roleLabel`), hydration state machine
- **`store/themeStore.ts`** — accent colour preference (6 presets: blue, indigo, violet, slate, teal, emerald) persisted to localStorage and applied at app mount

**Custom hooks:**

- **`hooks/useAuth.ts`** — composes the auth store with TanStack Query mutations. Single hook exposes `user`, `login`, `logout`, `changePassword`, `updateProfile`, role checks, and hydration state.
- **`hooks/useNotifications.ts`** — list query, unread badge poll, mark-read mutation, acknowledge mutation, bulk dismiss

### Phase 3C — Layout & Shell

**`AppShell`** — protected layout wrapper. Handles JWT hydration, redirects to `/login` if unauthenticated, shows the loading splash during hydration, mounts the sidebar + topbar, renders the routed page in the content area.

**`Sidebar`** — 240px fixed-width navigation with collapsible 64px icon-only mode. Sections grouped by role (`NAVIGATION` for everyone, `ADMIN` for admins). Active route gets accent left border + muted accent background. User avatar pinned to bottom with rank and role chip.

**`TopBar`** — sticky 64px header with breadcrumb trail, notification bell (with unread badge), and user menu (profile, settings, logout).

**`NotificationBell`** — badge-counted icon that opens a 380px popover. Shows notifications grouped by category, marks individual or all as read, deep-links to related entities. Critical notifications require explicit acknowledgement before they can be dismissed.

### Phase 3D — Common Components

A library of reusable components every page is built from. All handle their own loading, empty, and error states.

| Component | Purpose |
|---|---|
| **`StatCard`** | Dashboard statistic with monospace value, optional delta indicator, and icon. Border-only — no fills or shadows. |
| **`StatusBadge`** | Lookup-driven badge for sign-out, resupply, and condition statuses. Uses semantic colour tokens. |
| **`CriticalityBadge`** | Item criticality (routine → essential) with semantic colour mapping. |
| **`PriorityBadge`** | Resupply/notification priority (low → emergency) with escalating colour intensity. |
| **`DataRow`** | Key/value display row used in detail panels and drawers. Optional monospace mode for numeric values. |
| **`EmptyState`** | Reusable empty state with icon, title, description, and optional CTA. Never leave a blank area. |
| **`LoadingSkeleton`** | Table/card skeleton with wave animation. Used while queries are pending. |
| **`FilterBar`** | Search input + filter chip row pattern reused across list pages. |
| **`ConfirmDialog`** | Promise-based confirmation modal for destructive actions. |

### Phase 3E — Pages

All 17 pages built or rebuilt from scratch in Phase 3:

| Page | Purpose |
|---|---|
| **`LoginPage`** | Branded sign-in with rate-limit handling, lockout messaging, and "Authenticate" panel layout |
| **`ChangePasswordPage`** | Forced password change for accounts with `must_change_password=True` |
| **`LandingPage`** | Post-login dashboard router (different default for admin vs user) |
| **`InventoryPage`** | Responsive item grid with search, category filter, criticality filter, and pagination |
| **`ItemDetailPage`** | Full item view with condition breakdown chart, location, sign-out history, low-stock indicator |
| **`ItemCreatePage`** | Admin item creation with full Zod validation, all 30+ fields, category selector |
| **`ItemEditPage`** | Admin item editor with stock adjustment workflow and condition transfer modal |
| **`MySignoutsPage`** | User's active and historical sign-outs with status filter |
| **`ResupplyPage`** | User's resupply requests with submit form and status tracking |
| **`AdminPage`** | Admin dashboard with stat cards, Recharts visualisations, and tabbed activity feed |
| **`AdminSignoutsPage`** | Full admin sign-out management table with approve/reject/return/declare-lost actions |
| **`AdminResupplyPage`** | Full resupply lifecycle management table (review → approve → order → fulfill) |
| **`UserManagementPage`** | Admin user CRUD with role changes, deactivation, reactivation, and activity drill-down |
| **`NotificationManagementPage`** | Full notification list with filters, bulk actions, and acknowledgement workflow |
| **`SettingsPage`** | Profile update, notification preferences, accent colour swatches, password change |
| **`AssistantPage`** | Ollama chat interface with conversation history, streaming responses, and quick queries |
| **`NotFoundPage`** | Styled 404 with mono error code and return-home action |

### Forms (`src/components/signout`, `src/components/resupply`)

- **`SignOutForm`** — modal for creating new sign-outs. Fields: full name, rank, task reference, expected return date, duration, optional notes. React Hook Form + Zod validation. Posts to `/api/signouts`.
- **`ReturnForm`** — modal for returning equipment with per-condition quantity breakdown (serviceable, unserviceable, damaged, condemned). Validates total against outstanding quantity. Optional return notes and damage description.
- **`ResupplyForm`** — modal for submitting resupply requests. Supports both existing items (item picker) and free-text new item requests. Quantity, justification, priority, and optional required-by date.

### Frontend Code Quality Rules

These are enforced across every Phase 3 file:

1. **No `any` types** — every data shape has an interface or type
2. **No inline hex strings** — all colours from `tokens` or MUI theme
3. **No `!important` in sx props** — fix specificity properly
4. **One component per file** (with optional small helpers under 50 lines)
5. **All API calls through `src/api/`** — never `fetch()` or `axios` directly in a component
6. **All forms use React Hook Form + Zod** — no `useState` form state
7. **All data fetching uses TanStack Query** — no `useEffect` + `useState` data fetching
8. **Loading states always handled** — render `<LoadingSkeleton>` while `isLoading`
9. **Empty states always handled** — render `<EmptyState>` when data is empty
10. **Error states always handled** — render `<Alert>` or error UI on query error
11. **TypeScript strict mode on** — never suppress with `@ts-ignore`

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
│   │       └── d5b90d4d3f29_initial_schema.py
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── seed.py
│       ├── models/
│       │   ├── user.py
│       │   ├── category.py
│       │   ├── item.py
│       │   ├── signout.py
│       │   ├── resupply.py
│       │   └── notification.py
│       ├── schemas/
│       │   ├── user.py
│       │   ├── item.py
│       │   ├── signout.py
│       │   ├── resupply.py
│       │   └── notification.py
│       ├── routers/
│       │   ├── auth.py
│       │   ├── items.py
│       │   ├── signouts.py
│       │   ├── resupply.py
│       │   ├── notifications.py
│       │   ├── users.py
│       │   └── assistant.py
│       ├── services/
│       │   ├── notification_service.py
│       │   └── ollama_service.py
│       └── utils/
│           └── security.py
│
├── frontend/                                ← Phase 3 rebuild
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   │   └── fonts/                           ← Self-hosted Montserrat + JetBrains Mono
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── tokens.ts                        ← Phase 3A — design tokens
│       ├── theme.ts                         ← Phase 3A — MUI theme
│       ├── types/
│       │   └── index.ts                     ← Phase 3A — backend type mirrors
│       ├── api/
│       │   ├── client.ts                    ← Phase 3B — Axios + interceptors
│       │   ├── auth.ts
│       │   ├── items.ts
│       │   ├── signouts.ts
│       │   ├── resupply.ts
│       │   ├── notifications.ts
│       │   ├── users.ts
│       │   └── assistant.ts
│       ├── store/
│       │   ├── authStore.ts                 ← Phase 3B — JWT + user
│       │   └── themeStore.ts                ← Phase 3B — accent colour
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   └── useNotifications.ts
│       ├── components/
│       │   ├── common/                      ← Phase 3D — shared library
│       │   │   ├── StatCard.tsx
│       │   │   ├── StatusBadge.tsx
│       │   │   ├── CriticalityBadge.tsx
│       │   │   ├── PriorityBadge.tsx
│       │   │   ├── DataRow.tsx
│       │   │   ├── EmptyState.tsx
│       │   │   ├── LoadingSkeleton.tsx
│       │   │   ├── FilterBar.tsx
│       │   │   └── ConfirmDialog.tsx
│       │   ├── layout/                      ← Phase 3C — shell
│       │   │   ├── AppShell.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── TopBar.tsx
│       │   │   └── NotificationBell.tsx
│       │   ├── inventory/
│       │   │   ├── ItemCard.tsx
│       │   │   └── ItemDetailDrawer.tsx
│       │   ├── signout/
│       │   │   ├── SignOutForm.tsx
│       │   │   └── ReturnForm.tsx
│       │   └── resupply/
│       │       └── ResupplyForm.tsx
│       └── pages/                           ← Phase 3E — 17 pages
│           ├── LoginPage.tsx
│           ├── Changepasswordpage.tsx
│           ├── LandingPage.tsx
│           ├── InventoryPage.tsx
│           ├── ItemDetailPage.tsx
│           ├── ItemCreatePage.tsx
│           ├── ItemEditPage.tsx
│           ├── MySignoutsPage.tsx
│           ├── ResupplyPage.tsx
│           ├── AdminPage.tsx
│           ├── AdminSignoutsPage.tsx
│           ├── AdminResupplyPage.tsx
│           ├── UserManagementPage.tsx
│           ├── NotificationManagementPage.tsx
│           ├── SettingsPage.tsx
│           ├── AssistantPage.tsx
│           └── NotFoundPage.tsx
│
└── nginx/
    ├── nginx.conf
    └── nginx.dev.conf
```

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

## Roadmap

### Completed
- ✅ **Phase 1** — Foundation scaffold, Docker Compose, basic CRUD, login flow
- ✅ **Phase 2A** — Models, routers, schemas, services expanded to production grade
- ✅ **Phase 2B** — Infrastructure (config, database, main, security, seed, Alembic, Dockerfile, Compose, Nginx)
- ✅ **Phase 3A** — Frontend foundation (tokens, theme, types, Tailwind config)
- ✅ **Phase 3B** — Frontend API layer & state (Axios client, 7 typed API modules, Zustand stores, hooks)
- ✅ **Phase 3C** — Frontend layout (AppShell, Sidebar, TopBar, NotificationBell)
- ✅ **Phase 3D** — Frontend common components (9 reusable components)
- ✅ **Phase 3E** — Frontend pages (17 pages built or rebuilt)

### Planned
- 🔜 **Phase 4** — Physical access control (ESP32/Nuki integration, PIN generation, cage entry/exit logging)
- 🔜 **Phase 5** — Audit log service, WeasyPrint PDF exports, scheduled overdue scanner
- 🔜 **Phase 6** — Mobile-responsive layout polish, keyboard shortcut palette, command bar

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