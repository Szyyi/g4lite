/**
 * G4Lite — Users API
 * =====================
 *
 * 12 endpoints for user administration [admin only except where noted]:
 *
 *   GET    /users                  — Paginated with search + role + active filters
 *   GET    /users/{id}             — Detail with activity counts
 *   POST   /users                  — Create user (enforces max 2 admin, max 12 total)
 *   PUT    /users/{id}             — Update metadata
 *   PUT    /users/{id}/role        — Change role (admin-count + last-admin protection)
 *   PUT    /users/{id}/deactivate  — Deactivate with reason (self-prevention)
 *   PUT    /users/{id}/reactivate  — Reactivate (respects account limits)
 *   GET    /users/{id}/activity    — Activity log
 *   GET    /users/stats            — 11 metrics + capacity_remaining
 *   GET    /users/export/csv       — CSV export
 *   GET    /users/roles            — Available roles list
 *   GET    /users/limits           — Current account limits and usage
 *
 * Account constraints (enforced server-side, displayed in UI):
 *   - Maximum 2 admin accounts
 *   - Maximum 12 total accounts
 *   - Cannot deactivate yourself
 *   - Cannot remove the last admin
 *   - Cannot change role of the last admin away from admin
 */

import client from './client';
import { buildQueryParams, downloadFile } from './client';
import type {
  UserResponse,
  UserDetailResponse,
  CreateUserRequest,
  UpdateUserRequest,
  ChangeRoleRequest,
  DeactivateUserRequest,
  UserFilterParams,
  UserStats,
  AccountLimits,
  RoleInfo,
  UserActivity,
  PaginatedUsers,
  MessageResponse,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Users API
// ─────────────────────────────────────────────────────────────────────────────

export const usersApi = {

  // ─── List & Detail ───────────────────────────────────────────────────

  /**
   * GET /api/users
   * Paginated user list with filters.
   *
   * Filter params: search (username, full_name, email, service_number),
   *                role (admin|user|viewer), is_active (boolean),
   *                page, page_size
   */
  list: async (filters: UserFilterParams = {}): Promise<PaginatedUsers> => {
    const queryString = buildQueryParams(filters as Record<string, unknown>);
    const { data } = await client.get<PaginatedUsers>(`/users${queryString}`);
    return data;
  },

  /**
   * GET /api/users/{id}
   * Full user detail with activity counts:
   *   active_signout_count, total_signout_count,
   *   resupply_request_count, unread_notification_count
   *
   * Extends UserResponse with these computed aggregate fields.
   */
  get: async (id: number): Promise<UserDetailResponse> => {
    const { data } = await client.get<UserDetailResponse>(`/users/${id}`);
    return data;
  },

  // ─── CRUD ────────────────────────────────────────────────────────────

  /**
   * POST /api/users
   * Create a new user account.
   *
   * Server-side enforcement:
   *   - max 2 admin accounts (returns 409 if exceeded)
   *   - max 12 total accounts (returns 409 if exceeded)
   *   - username uniqueness (returns 409 if taken)
   *   - email uniqueness (returns 409 if taken)
   *   - password complexity validation
   *
   * New users are created with must_change_password = true.
   * The UI should display remaining capacity before showing the form.
   */
  create: async (payload: CreateUserRequest): Promise<UserResponse> => {
    const { data } = await client.post<UserResponse>('/users', payload);
    return data;
  },

  /**
   * PUT /api/users/{id}
   * Update user metadata. Partial updates supported.
   * Allowed fields: email, full_name, rank, service_number, unit, timezone.
   *
   * Cannot change: username, role (use changeRole), password (use resetPassword).
   */
  update: async (id: number, payload: UpdateUserRequest): Promise<UserResponse> => {
    const { data } = await client.put<UserResponse>(`/users/${id}`, payload);
    return data;
  },

  // ─── Role Management ────────────────────────────────────────────────

  /**
   * PUT /api/users/{id}/role
   * Change a user's role.
   *
   * Server-side protections:
   *   - Cannot promote to admin if already at max 2 admins (409)
   *   - Cannot demote the last admin (409)
   *   - Cannot change your own role (use a different admin account)
   *
   * Role changes take effect immediately. The affected user's
   * navigation and permissions update on their next page load
   * or API call.
   */
  changeRole: async (id: number, payload: ChangeRoleRequest): Promise<UserResponse> => {
    const { data } = await client.put<UserResponse>(`/users/${id}/role`, payload);
    return data;
  },

  // ─── Activate / Deactivate ──────────────────────────────────────────

  /**
   * PUT /api/users/{id}/deactivate
   * Deactivate a user account with a reason.
   *
   * Effects:
   *   - User cannot log in
   *   - Active sessions are not forcibly terminated but will fail on next API call
   *   - Records deactivated_at, deactivated_by, deactivation_reason
   *   - Active sign-outs by this user are NOT automatically returned
   *     (admin must handle these separately)
   *
   * Protections:
   *   - Cannot deactivate yourself (400)
   *   - Cannot deactivate the last active admin (409)
   */
  deactivate: async (id: number, payload: DeactivateUserRequest): Promise<UserResponse> => {
    const { data } = await client.put<UserResponse>(
      `/users/${id}/deactivate`,
      payload,
    );
    return data;
  },

  /**
   * PUT /api/users/{id}/reactivate
   * Reactivate a deactivated user account.
   *
   * Respects max total account limit — if at capacity, returns 409.
   * Clears deactivated_at, deactivated_by, deactivation_reason.
   * Sets must_change_password = true for security.
   */
  reactivate: async (id: number): Promise<UserResponse> => {
    const { data } = await client.put<UserResponse>(`/users/${id}/reactivate`);
    return data;
  },

  // ─── Activity ────────────────────────────────────────────────────────

  /**
   * GET /api/users/{id}/activity
   * Activity log for a specific user.
   * Returns recent actions: logins, sign-outs, returns, resupply requests,
   * password changes, profile updates.
   *
   * Each entry includes: action type, detail string, timestamp, IP address.
   */
  getActivity: async (id: number): Promise<UserActivity[]> => {
    const { data } = await client.get<UserActivity[]>(`/users/${id}/activity`);
    return data;
  },

  // ─── Statistics & Metadata ───────────────────────────────────────────

  /**
   * GET /api/users/stats
   * Aggregate user statistics:
   *   total_users, active_users, inactive_users,
   *   admin_count, user_count, viewer_count,
   *   locked_count, must_change_password_count,
   *   max_admins, max_total, capacity_remaining
   */
  getStats: async (): Promise<UserStats> => {
    const { data } = await client.get<UserStats>('/users/stats');
    return data;
  },

  /**
   * GET /api/users/limits
   * Current account limits and usage:
   *   max_admins, max_total,
   *   current_admins, current_total,
   *   admin_slots_remaining, total_slots_remaining
   *
   * Used by the create user form to show remaining capacity
   * and disable the admin role option when at max.
   */
  getLimits: async (): Promise<AccountLimits> => {
    const { data } = await client.get<AccountLimits>('/users/limits');
    return data;
  },

  /**
   * GET /api/users/roles
   * Available roles with labels and descriptions.
   * Used to populate role dropdowns in the create/edit user forms.
   *
   * Returns:
   *   [
   *     { role: 'admin',  label: 'Administrator', description: '...' },
   *     { role: 'user',   label: 'Standard User', description: '...' },
   *     { role: 'viewer', label: 'Read-Only',     description: '...' },
   *   ]
   */
  getRoles: async (): Promise<RoleInfo[]> => {
    const { data } = await client.get<RoleInfo[]>('/users/roles');
    return data;
  },

  // ─── Export ──────────────────────────────────────────────────────────

  /**
   * GET /api/users/export/csv
   * Downloads all users as a CSV file.
   * Excludes password hashes and sensitive security fields.
   */
  exportCsv: async (): Promise<void> => {
    const timestamp = new Date().toISOString().slice(0, 10);
    await downloadFile('/users/export/csv', `G4Lite-users-${timestamp}.csv`);
  },
};