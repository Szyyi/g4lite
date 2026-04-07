/**
 * G4Lite — TypeScript Type Definitions
 * ======================================
 *
 * Complete type surface for the Phase 2 backend (~100 endpoints, 73 Pydantic schemas).
 * Organised by domain: enums → shared → auth → users → categories → items →
 * signouts → resupply → notifications → assistant → pagination → API utilities.
 *
 * Rules:
 *  - No `any` — every shape is explicitly typed
 *  - All ISO 8601 date strings typed as `string` (parsed by date-fns at call site)
 *  - Nullable fields use `T | null`, never `T | undefined`
 *  - Enums are string unions, not TS enums (better type narrowing, smaller bundle)
 *  - Request types suffixed `Request`, response types suffixed `Response` or `Brief`
 */

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/** User roles — viewer is read-only, user is standard, admin is full access */
export type UserRole = 'admin' | 'user' | 'viewer';

/** Item criticality — drives stock management urgency and approval requirements */
export type CriticalityLevel = 'routine' | 'important' | 'critical' | 'essential';

/** Physical condition states for equipment */
export type ConditionState = 'serviceable' | 'unserviceable' | 'damaged' | 'condemned';

/** Sign-out lifecycle — 8 states with defined transitions */
export type SignOutStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'partially_returned'
  | 'overdue'
  | 'returned'
  | 'lost';

/** Resupply lifecycle — 9 states with defined transitions */
export type ResupplyStatus =
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'cancelled';

/** Resupply urgency levels */
export type ResupplyPriority = 'routine' | 'urgent' | 'critical' | 'emergency';

/** Notification event types — 15 types across 4 categories */
export type NotificationType =
  | 'signout'
  | 'return_ok'
  | 'return_damaged'
  | 'return_unserviceable'
  | 'low_stock'
  | 'overdue'
  | 'overdue_escalation'
  | 'item_condition_change'
  | 'resupply_request'
  | 'resupply_status_change'
  | 'access_granted'
  | 'access_denied'
  | 'pin_expired'
  | 'user_account_event'
  | 'system_alert';

/** Notification categories for filtering and grouping */
export type NotificationCategory = 'inventory' | 'signout' | 'resupply' | 'system';

/** Notification priority — critical requires explicit acknowledgement */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

/** Sort direction for paginated endpoints */
export type SortOrder = 'asc' | 'desc';

/** Item sort fields accepted by GET /api/items */
export type ItemSortField =
  | 'name'
  | 'item_code'
  | 'available_quantity'
  | 'total_quantity'
  | 'criticality_level'
  | 'category'
  | 'created_at'
  | 'updated_at';

/** Sign-out sort fields */
export type SignOutSortField =
  | 'signed_out_at'
  | 'expected_return_date'
  | 'status'
  | 'item_name'
  | 'full_name'
  | 'quantity';

/** Resupply sort fields */
export type ResupplySortField =
  | 'created_at'
  | 'updated_at'
  | 'priority'
  | 'status'
  | 'quantity_requested';


// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/auth/login request */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /api/auth/login response */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

/** POST /api/auth/change-password request */
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

/** PUT /api/auth/profile request */
export interface UpdateProfileRequest {
  full_name?: string;
  rank?: string;
  service_number?: string;
  unit?: string;
  timezone?: string;
}

/** Notification preference booleans */
export interface NotificationPreferences {
  notify_signout: boolean;
  notify_return: boolean;
  notify_overdue: boolean;
  notify_resupply: boolean;
  notify_low_stock: boolean;
  notify_system: boolean;
}

/** GET /api/auth/sessions response */
export interface SessionInfo {
  last_login_at: string | null;
  login_count: number;
  last_login_ip: string | null;
  last_active_at: string | null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

/** Full user response — GET /api/auth/me, GET /api/users/{id} */
export interface UserResponse {
  id: number;
  username: string;
  email: string;
  full_name: string;
  rank: string;
  service_number: string;
  unit: string;
  role: UserRole;
  is_active: boolean;
  timezone: string;

  // Password state
  must_change_password: boolean;
  password_changed_at: string | null;

  // Lockout state
  failed_login_count: number;
  locked_until: string | null;
  is_locked: boolean;

  // Session tracking
  last_login_at: string | null;
  last_active_at: string | null;
  login_count: number;
  last_login_ip: string | null;

  // Notification preferences
  notify_signout: boolean;
  notify_return: boolean;
  notify_overdue: boolean;
  notify_resupply: boolean;
  notify_low_stock: boolean;
  notify_system: boolean;

  // Deactivation
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;

  // Timestamps
  created_at: string;
  updated_at: string | null;
}

/** Embedded user reference — used inside SignOutResponse, ResupplyResponse, etc. */
export interface UserBrief {
  id: number;
  username: string;
  full_name: string;
  rank: string;
  role: UserRole;
}

/** User with activity counts — GET /api/users/{id} (admin detail view) */
export interface UserDetailResponse extends UserResponse {
  active_signout_count: number;
  total_signout_count: number;
  resupply_request_count: number;
  unread_notification_count: number;
}

/** POST /api/users create request */
export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  full_name: string;
  rank: string;
  service_number?: string;
  unit?: string;
  role: UserRole;
}

/** PUT /api/users/{id} update request */
export interface UpdateUserRequest {
  email?: string;
  full_name?: string;
  rank?: string;
  service_number?: string;
  unit?: string;
  timezone?: string;
}

/** PUT /api/users/{id}/role request */
export interface ChangeRoleRequest {
  role: UserRole;
}

/** PUT /api/users/{id}/deactivate request */
export interface DeactivateUserRequest {
  reason: string;
}

/** GET /api/users filter params */
export interface UserFilterParams {
  page?: number;
  page_size?: number;
  search?: string;
  role?: UserRole;
  is_active?: boolean;
}

/** GET /api/users/stats response */
export interface UserStats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  admin_count: number;
  user_count: number;
  viewer_count: number;
  locked_count: number;
  must_change_password_count: number;
  max_admins: number;
  max_total: number;
  capacity_remaining: number;
}

/** GET /api/users/limits response */
export interface AccountLimits {
  max_admins: number;
  max_total: number;
  current_admins: number;
  current_total: number;
  admin_slots_remaining: number;
  total_slots_remaining: number;
}

/** GET /api/users/roles response */
export interface RoleInfo {
  role: UserRole;
  label: string;
  description: string;
}

/** User activity log entry */
export interface UserActivity {
  id: number;
  action: string;
  detail: string;
  timestamp: string;
  ip_address: string | null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

/** Full category response */
export interface CategoryResponse {
  id: number;
  name: string;
  code: string;
  description: string;
  parent_id: number | null;
  parent_name: string | null;
  display_order: number;
  icon: string | null;
  colour_hex: string | null;
  item_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

/** Category in tree structure — GET /api/categories/tree */
export interface CategoryTreeNode extends CategoryResponse {
  children: CategoryTreeNode[];
}

/** Embedded category reference */
export interface CategoryBrief {
  id: number;
  name: string;
  code: string;
}

/** POST /api/categories create request */
export interface CreateCategoryRequest {
  name: string;
  code?: string;
  description?: string;
  parent_id?: number | null;
  display_order?: number;
  icon?: string;
  colour_hex?: string;
}

/** PUT /api/categories/{id} update request */
export interface UpdateCategoryRequest {
  name?: string;
  code?: string;
  description?: string;
  parent_id?: number | null;
  display_order?: number;
  icon?: string;
  colour_hex?: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// Items
// ─────────────────────────────────────────────────────────────────────────────

/** Full item response — GET /api/items/{id} */
export interface ItemResponse {
  id: number;
  item_code: string;
  name: string;
  short_description: string;
  description: string;
  slug: string;
  manufacturer: string;
  model_number: string;

  // Category
  category_id: number;
  category_name: string;
  category_code: string;

  // Quantities
  total_quantity: number;
  available_quantity: number;
  serviceable_count: number;
  unserviceable_count: number;
  damaged_count: number;
  condemned_count: number;
  checked_out_count: number;

  // Stock management
  minimum_stock_level: number;
  reorder_quantity: number;
  criticality_level: CriticalityLevel;
  is_low_stock: boolean;

  // Location
  storage_location: string;
  shelf: string;
  bin_location: string;

  // Flags
  is_consumable: boolean;
  is_serialised: boolean;
  requires_approval: boolean;
  is_hazmat: boolean;
  is_active: boolean;

  // Physical
  weight_kg: number | null;
  tags: string[];

  // Notes
  notes: string;

  // Audit
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** Item in list views — abbreviated for grid/table display */
export interface ItemBrief {
  id: number;
  item_code: string;
  name: string;
  short_description: string;
  category_id: number;
  category_name: string;
  category_code: string;
  total_quantity: number;
  available_quantity: number;
  serviceable_count: number;
  unserviceable_count: number;
  damaged_count: number;
  condemned_count: number;
  checked_out_count: number;
  criticality_level: CriticalityLevel;
  is_low_stock: boolean;
  is_consumable: boolean;
  requires_approval: boolean;
  is_active: boolean;
  storage_location: string;
  tags: string[];
}

/** POST /api/items create request */
export interface CreateItemRequest {
  name: string;
  short_description?: string;
  description?: string;
  manufacturer?: string;
  model_number?: string;
  category_id: number;
  total_quantity: number;
  serviceable_count: number;
  unserviceable_count?: number;
  damaged_count?: number;
  condemned_count?: number;
  minimum_stock_level?: number;
  reorder_quantity?: number;
  criticality_level?: CriticalityLevel;
  storage_location?: string;
  shelf?: string;
  bin_location?: string;
  is_consumable?: boolean;
  is_serialised?: boolean;
  requires_approval?: boolean;
  is_hazmat?: boolean;
  weight_kg?: number | null;
  tags?: string[];
  notes?: string;
}

/** PUT /api/items/{id} update request */
export interface UpdateItemRequest {
  name?: string;
  short_description?: string;
  description?: string;
  manufacturer?: string;
  model_number?: string;
  category_id?: number;
  total_quantity?: number;
  serviceable_count?: number;
  unserviceable_count?: number;
  damaged_count?: number;
  condemned_count?: number;
  minimum_stock_level?: number;
  reorder_quantity?: number;
  criticality_level?: CriticalityLevel;
  storage_location?: string;
  shelf?: string;
  bin_location?: string;
  is_consumable?: boolean;
  is_serialised?: boolean;
  requires_approval?: boolean;
  is_hazmat?: boolean;
  weight_kg?: number | null;
  tags?: string[];
  notes?: string;
}

/** POST /api/items/{id}/adjust-stock request */
export interface StockAdjustmentRequest {
  adjustment: number;
  condition: ConditionState;
  reason: string;
}

/** POST /api/items/{id}/transfer-condition request */
export interface ConditionTransferRequest {
  from_condition: ConditionState;
  to_condition: ConditionState;
  quantity: number;
  reason: string;
}

/** GET /api/items filter params */
export interface ItemFilterParams {
  page?: number;
  page_size?: number;
  search?: string;
  category_id?: number;
  criticality?: CriticalityLevel;
  is_consumable?: boolean;
  requires_approval?: boolean;
  is_active?: boolean;
  min_available?: number;
  max_available?: number;
  storage_location?: string;
  tags?: string;
  sort_by?: ItemSortField;
  sort_order?: SortOrder;
}

/** GET /api/items/stats response */
export interface ItemStats {
  total_items: number;
  active_items: number;
  total_quantity: number;
  total_available: number;
  total_checked_out: number;
  total_serviceable: number;
  total_unserviceable: number;
  total_damaged: number;
  total_condemned: number;
  low_stock_count: number;
  categories_count: number;
  items_requiring_approval: number;
  consumable_items: number;
  hazmat_items: number;
  serialised_items: number;
  average_availability_pct: number;
}

/** GET /api/items/low-stock response item */
export interface LowStockItem {
  id: number;
  item_code: string;
  name: string;
  category_name: string;
  available_quantity: number;
  minimum_stock_level: number;
  criticality_level: CriticalityLevel;
  deficit: number;
}


// ─────────────────────────────────────────────────────────────────────────────
// Sign-Outs
// ─────────────────────────────────────────────────────────────────────────────

/** Full sign-out response — GET /api/signouts/{id} */
export interface SignOutResponse {
  id: number;
  signout_ref: string;

  // Item snapshot (frozen at sign-out time)
  item_id: number;
  item_name_snapshot: string;
  item_code_snapshot: string;

  // User
  user_id: number;
  user: UserBrief;
  full_name: string;
  rank: string;

  // Sign-out details
  quantity: number;
  task_reference: string;
  expected_return_date: string;
  original_expected_return_date: string;
  duration_days: number | null;
  notes: string | null;
  status: SignOutStatus;

  // Extension tracking
  extension_count: number;
  extension_reason: string | null;

  // Approval workflow
  approved_by: number | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejection_reason: string | null;

  // Return details
  returned_serviceable_qty: number;
  returned_unserviceable_qty: number;
  returned_damaged_qty: number;
  damage_description: string | null;
  return_notes: string | null;
  returned_at: string | null;

  // Overdue tracking
  overdue_notified_at: string | null;
  overdue_escalated_at: string | null;

  // Loss tracking
  lost_declared_by: number | null;
  loss_report: string | null;

  // Timestamps
  signed_out_at: string;
  created_at: string;
  updated_at: string | null;
}

/** Sign-out in list views */
export interface SignOutBrief {
  id: number;
  signout_ref: string;
  item_id: number;
  item_name_snapshot: string;
  item_code_snapshot: string;
  user_id: number;
  full_name: string;
  rank: string;
  quantity: number;
  task_reference: string;
  expected_return_date: string;
  status: SignOutStatus;
  signed_out_at: string;
  returned_at: string | null;
}

/** POST /api/signouts create request */
export interface CreateSignOutRequest {
  item_id: number;
  quantity: number;
  full_name: string;
  rank: string;
  task_reference: string;
  expected_return_date: string;
  duration_days?: number | null;
  notes?: string;
}

/** PUT /api/signouts/{id}/return request */
export interface ReturnRequest {
  returned_serviceable_qty: number;
  returned_unserviceable_qty: number;
  returned_damaged_qty: number;
  damage_description?: string;
  return_notes?: string;
}

/** PUT /api/signouts/{id}/extend request */
export interface ExtendSignOutRequest {
  new_expected_return_date: string;
  extension_reason: string;
}

/** PUT /api/signouts/{id}/reject request */
export interface RejectSignOutRequest {
  rejection_reason: string;
}

/** PUT /api/signouts/{id}/declare-lost request */
export interface DeclareLostRequest {
  loss_report: string;
}

/** GET /api/signouts filter params */
export interface SignOutFilterParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: SignOutStatus;
  item_id?: number;
  user_id?: number;
  overdue_only?: boolean;
  sort_by?: SignOutSortField;
  sort_order?: SortOrder;
}

/** GET /api/signouts/stats response */
export interface SignOutStats {
  total_signouts: number;
  active_count: number;
  pending_approval_count: number;
  overdue_count: number;
  returned_count: number;
  lost_count: number;
  partially_returned_count: number;
  avg_duration_days: number | null;
  top_overdue_items: OverdueItemStat[];
}

/** Overdue item stat within SignOutStats */
export interface OverdueItemStat {
  item_id: number;
  item_name: string;
  item_code: string;
  overdue_count: number;
}


// ─────────────────────────────────────────────────────────────────────────────
// Resupply
// ─────────────────────────────────────────────────────────────────────────────

/** Full resupply response — GET /api/resupply/{id} */
export interface ResupplyResponse {
  id: number;
  request_ref: string;

  // Item reference (nullable for free-text requests)
  item_id: number | null;
  item_name: string;
  item_code: string | null;
  item_name_freetext: string;

  // Requester
  requested_by: number;
  requester: UserBrief;
  requester_name: string;

  // Request details
  quantity_requested: number;
  justification: string;
  priority: ResupplyPriority;
  status: ResupplyStatus;

  // Admin workflow
  admin_notes: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejection_reason: string | null;

  // Ordering
  supplier: string | null;
  supplier_reference: string | null;
  expected_delivery_date: string | null;
  ordered_at: string | null;
  ordered_by: number | null;

  // Fulfilment
  quantity_fulfilled: number;
  fulfilled_at: string | null;
  fulfilled_by: number | null;

  // Cost tracking
  estimated_unit_cost: number | null;
  estimated_total_cost: number | null;
  actual_unit_cost: number | null;
  actual_total_cost: number | null;
  currency: string;

  // Cancellation
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancellation_reason: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

/** Resupply in list views */
export interface ResupplyBrief {
  id: number;
  request_ref: string;
  item_name: string;
  item_name_freetext: string;
  requester_name: string;
  quantity_requested: number;
  priority: ResupplyPriority;
  status: ResupplyStatus;
  created_at: string;
  updated_at: string;
}

/** POST /api/resupply create request */
export interface CreateResupplyRequest {
  item_id?: number | null;
  item_name_freetext: string;
  quantity_requested: number;
  justification: string;
  priority?: ResupplyPriority;
}

/** PUT /api/resupply/{id}/review request */
export interface ReviewResupplyRequest {
  admin_notes?: string;
}

/** PUT /api/resupply/{id}/approve request */
export interface ApproveResupplyRequest {
  admin_notes?: string;
  estimated_unit_cost?: number;
  estimated_total_cost?: number;
}

/** PUT /api/resupply/{id}/reject request */
export interface RejectResupplyRequest {
  rejection_reason: string;
}

/** PUT /api/resupply/{id}/order request */
export interface OrderResupplyRequest {
  supplier: string;
  supplier_reference?: string;
  expected_delivery_date?: string;
}

/** PUT /api/resupply/{id}/fulfill request */
export interface FulfillResupplyRequest {
  quantity_fulfilled: number;
  actual_unit_cost?: number;
  actual_total_cost?: number;
}

/** PUT /api/resupply/{id}/cancel request */
export interface CancelResupplyRequest {
  cancellation_reason: string;
}

/** PUT /api/resupply/{id}/cost request */
export interface UpdateResupplyCostRequest {
  estimated_unit_cost?: number;
  estimated_total_cost?: number;
  actual_unit_cost?: number;
  actual_total_cost?: number;
  currency?: string;
}

/** PUT /api/resupply/{id}/notes request */
export interface UpdateResupplyNotesRequest {
  admin_notes: string;
}

/** GET /api/resupply filter params */
export interface ResupplyFilterParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: ResupplyStatus;
  priority?: ResupplyPriority;
  item_id?: number;
  requested_by?: number;
  sort_by?: ResupplySortField;
  sort_order?: SortOrder;
}

/** GET /api/resupply/stats response */
export interface ResupplyStats {
  total_requests: number;
  pending_count: number;
  under_review_count: number;
  approved_count: number;
  ordered_count: number;
  fulfilled_count: number;
  rejected_count: number;
  cancelled_count: number;
  total_estimated_cost: number;
  total_actual_cost: number;
  currency: string;
  avg_fulfilment_days: number | null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

/** Full notification response */
export interface NotificationResponse {
  id: number;
  recipient_role: UserRole | null;
  recipient_id: number | null;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  related_id: number | null;
  related_type: string | null;
  is_read: boolean;
  read_at: string | null;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  is_dismissed: boolean;
  dismissed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Notification in list/bell views */
export interface NotificationBrief {
  id: number;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  related_id: number | null;
  related_type: string | null;
  is_read: boolean;
  is_acknowledged: boolean;
  created_at: string;
}

/** GET /api/notifications/unread-counts response */
export interface UnreadCounts {
  total: number;
  by_category: Record<NotificationCategory, number>;
  by_priority: Record<NotificationPriority, number>;
  critical_unacknowledged: number;
}

/** GET /api/notifications filter params */
export interface NotificationFilterParams {
  page?: number;
  page_size?: number;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  type?: NotificationType;
  is_read?: boolean;
}

/** POST /api/notifications/bulk-dismiss request */
export interface BulkDismissRequest {
  notification_ids: number[];
}

/** POST /api/notifications/admin/broadcast request */
export interface BroadcastRequest {
  title: string;
  body: string;
  priority?: NotificationPriority;
  target_role?: UserRole | null;
}

/** GET /api/notifications/admin/stats response */
export interface NotificationAdminStats {
  total_notifications: number;
  unread_count: number;
  read_count: number;
  acknowledged_count: number;
  dismissed_count: number;
  expired_count: number;
  by_type: Record<NotificationType, number>;
  by_category: Record<NotificationCategory, number>;
  by_priority: Record<NotificationPriority, number>;
}

/** GET /api/notifications/types response item */
export interface NotificationTypeInfo {
  type: NotificationType;
  category: NotificationCategory;
  label: string;
  description: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/assistant/chat request */
export interface ChatRequest {
  message: string;
  conversation_id?: number | null;
}

/** SSE stream token event */
export interface ChatStreamToken {
  token: string;
}

/** SSE stream completion event */
export interface ChatStreamDone {
  done: true;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/** Union of SSE events from assistant chat */
export type ChatStreamEvent = ChatStreamToken | ChatStreamDone;

/** Conversation list item */
export interface ConversationResponse {
  id: number;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/** Single message within a conversation */
export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** Conversation with messages — GET /api/assistant/conversations/{id} */
export interface ConversationDetailResponse extends ConversationResponse {
  messages: ConversationMessage[];
}

/** PUT /api/assistant/conversations/{id}/rename request */
export interface RenameConversationRequest {
  title: string;
}

/** Ollama model info — GET /api/assistant/models */
export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  details: Record<string, string>;
}

/** POST /api/assistant/models/pull request */
export interface PullModelRequest {
  model_name: string;
}

/** GET /api/assistant/health response */
export interface AssistantHealth {
  status: 'healthy' | 'degraded' | 'unavailable';
  ollama_reachable: boolean;
  model_loaded: boolean;
  model_name: string | null;
  response_time_ms: number | null;
}

/** GET /api/assistant/usage response */
export interface AssistantUsage {
  total_conversations: number;
  total_messages: number;
  messages_today: number;
  messages_this_week: number;
  top_users: AssistantUserUsage[];
}

/** User usage stat within AssistantUsage */
export interface AssistantUserUsage {
  user_id: number;
  username: string;
  message_count: number;
}

/** GET /api/assistant/quick/inventory-summary response */
export interface InventorySummary {
  total_items: number;
  total_quantity: number;
  available_quantity: number;
  checked_out: number;
  low_stock_items: number;
  categories: number;
}

/** GET /api/assistant/quick/search-items params */
export interface QuickSearchParams {
  q: string;
  limit?: number;
}


// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

/** Generic paginated response wrapper — all list endpoints return this shape */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  filters_applied: Record<string, unknown>;
}

/** Convenience aliases for common paginated types */
export type PaginatedItems = PaginatedResponse<ItemBrief>;
export type PaginatedSignOuts = PaginatedResponse<SignOutBrief>;
export type PaginatedResupply = PaginatedResponse<ResupplyBrief>;
export type PaginatedNotifications = PaginatedResponse<NotificationBrief>;
export type PaginatedUsers = PaginatedResponse<UserResponse>;
export type PaginatedConversations = PaginatedResponse<ConversationResponse>;


// ─────────────────────────────────────────────────────────────────────────────
// API Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Standard error response from backend — all errors follow this shape */
export interface ApiError {
  detail: string;
}

/** Health check response — GET /api/health */
export interface HealthCheck {
  status: 'healthy' | 'degraded';
  version: string;
  database: boolean;
  database_latency_ms: number;
  ollama: boolean;
  uptime_seconds: number;
}

/** Generic success message response */
export interface MessageResponse {
  message: string;
}

/** CSV export response metadata */
export interface ExportResponse {
  filename: string;
  content_type: string;
  data: Blob;
}


// ─────────────────────────────────────────────────────────────────────────────
// UI-Only Types (not in backend schemas — used for frontend state)
// ─────────────────────────────────────────────────────────────────────────────

/** View mode for inventory page */
export type InventoryViewMode = 'grid' | 'table';

/** Sidebar collapsed state */
export type SidebarState = 'expanded' | 'collapsed';

/** Notification bell popover tab */
export type NotificationTab = 'all' | NotificationCategory;

/** Sort configuration for data tables */
export interface SortConfig<T extends string = string> {
  field: T;
  order: SortOrder;
}

/** Breadcrumb segment */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** Confirm dialog configuration */
export interface ConfirmDialogConfig {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
}

/** Toast notification variant (for notistack) */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/** Command palette action */
export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  group?: string;
  adminOnly?: boolean;
}