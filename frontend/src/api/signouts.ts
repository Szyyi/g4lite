/**
 * G4Lite — Sign-Outs API
 * =========================
 *
 * 14 endpoints covering the full 8-status sign-out lifecycle:
 *
 *   pending_approval → approved → active → returned
 *                    ↘ rejected            ↗ partially_returned → returned
 *                                          ↘ overdue → returned
 *                                          ↘ lost
 *
 *   GET    /signouts              — All sign-outs (paginated, filterable) [admin]
 *   GET    /signouts/mine         — Current user's sign-outs
 *   POST   /signouts              — Create sign-out (may trigger approval workflow)
 *   GET    /signouts/{id}         — Single sign-out detail
 *   PUT    /signouts/{id}/return  — Return equipment (per-condition qty breakdown)
 *   PUT    /signouts/{id}/extend  — Extend return date
 *   PUT    /signouts/{id}/approve — Approve pending sign-out [admin]
 *   PUT    /signouts/{id}/reject  — Reject pending sign-out [admin]
 *   PUT    /signouts/{id}/declare-lost — Declare equipment lost [admin]
 *   GET    /signouts/overdue      — All overdue sign-outs [admin]
 *   GET    /signouts/stats        — Sign-out statistics [admin]
 *   GET    /signouts/export/csv   — CSV export [admin]
 *   GET    /signouts/active-count — Count of user's active sign-outs
 *   GET    /signouts/history      — User's returned/completed sign-outs
 */

import client from './client';
import { buildQueryParams, downloadFile } from './client';
import type {
  SignOutResponse,
  SignOutBrief,
  CreateSignOutRequest,
  ReturnRequest,
  ExtendSignOutRequest,
  RejectSignOutRequest,
  DeclareLostRequest,
  SignOutFilterParams,
  SignOutStats,
  PaginatedSignOuts,
  MessageResponse,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Sign-Outs API
// ─────────────────────────────────────────────────────────────────────────────

export const signoutsApi = {

  // ─── List & Detail ───────────────────────────────────────────────────

  /**
   * GET /api/signouts
   * All sign-outs (admin view) — paginated with filters.
   *
   * Filter params: search, status, item_id, user_id, overdue_only
   * Sort fields: signed_out_at, expected_return_date, status, item_name,
   *              full_name, quantity
   */
  list: async (filters: SignOutFilterParams = {}): Promise<PaginatedSignOuts> => {
    const queryString = buildQueryParams(filters as Record<string, unknown>);
    const { data } = await client.get<PaginatedSignOuts>(`/signouts${queryString}`);
    return data;
  },

  /**
   * GET /api/signouts/mine
   * Current user's active sign-outs.
   * Includes all non-terminal statuses: pending_approval, approved,
   * active, partially_returned, overdue.
   */
  listMine: async (): Promise<SignOutBrief[]> => {
    const { data } = await client.get<SignOutBrief[]>('/signouts/mine');
    return data;
  },

  /**
   * GET /api/signouts/history
   * Current user's completed sign-outs (returned, lost, rejected).
   * Used for the "History" tab on MySignoutsPage.
   */
  listHistory: async (): Promise<SignOutBrief[]> => {
    const { data } = await client.get<SignOutBrief[]>('/signouts/history');
    return data;
  },

  /**
   * GET /api/signouts/{id}
   * Full sign-out detail including:
   *  - signout_ref (e.g. "SO-202604-0001")
   *  - Item snapshot (name + code frozen at sign-out time)
   *  - Approval workflow (approved_by, rejected_by, rejection_reason)
   *  - Extension tracking (original_expected_return_date, extension_count)
   *  - Return breakdown (per-condition quantities, damage_description)
   *  - Overdue tracking (overdue_notified_at, overdue_escalated_at)
   *  - Loss tracking (lost_declared_by, loss_report)
   */
  get: async (id: number): Promise<SignOutResponse> => {
    const { data } = await client.get<SignOutResponse>(`/signouts/${id}`);
    return data;
  },

  /**
   * GET /api/signouts/active-count
   * Returns the count of the current user's active sign-outs.
   * Used for badge display on the "My Sign-outs" nav item.
   */
  getActiveCount: async (): Promise<{ count: number }> => {
    const { data } = await client.get<{ count: number }>('/signouts/active-count');
    return data;
  },

  // ─── Create ──────────────────────────────────────────────────────────

  /**
   * POST /api/signouts
   * Create a new sign-out.
   *
   * If the item has requires_approval = true, the sign-out starts
   * in 'pending_approval' status and stock is NOT deducted until
   * an admin approves. Otherwise, it goes directly to 'active' and
   * stock is deducted immediately.
   *
   * Backend also:
   *  - Generates signout_ref (SO-YYYYMM-NNNN)
   *  - Snapshots item name + code at sign-out time
   *  - Triggers admin notification
   */
  create: async (payload: CreateSignOutRequest): Promise<SignOutResponse> => {
    const { data } = await client.post<SignOutResponse>('/signouts', payload);
    return data;
  },

  // ─── Return ──────────────────────────────────────────────────────────

  /**
   * PUT /api/signouts/{id}/return
   * Return equipment with per-condition quantity breakdown.
   *
   * The return form requires:
   *   returned_serviceable_qty  — at least one must be > 0
   *   returned_unserviceable_qty
   *   returned_damaged_qty
   *   damage_description       — required if returned_damaged_qty > 0
   *   return_notes             — optional
   *
   * Rules:
   *  - Sum of returned quantities must equal original sign-out quantity
   *    (for full return → status becomes 'returned')
   *  - If sum < original quantity, it's a partial return
   *    (status becomes 'partially_returned', remainder stays active)
   *  - If any damaged/unserviceable qty > 0, triggers admin notification
   *  - Backend restores stock to appropriate condition buckets
   */
  returnItem: async (id: number, payload: ReturnRequest): Promise<SignOutResponse> => {
    const { data } = await client.put<SignOutResponse>(`/signouts/${id}/return`, payload);
    return data;
  },

  // ─── Extend ──────────────────────────────────────────────────────────

  /**
   * PUT /api/signouts/{id}/extend
   * Extend the expected return date.
   *
   * Preserves original_expected_return_date (set on first extension).
   * Increments extension_count. Requires a reason string.
   */
  extend: async (id: number, payload: ExtendSignOutRequest): Promise<SignOutResponse> => {
    const { data } = await client.put<SignOutResponse>(`/signouts/${id}/extend`, payload);
    return data;
  },

  // ─── Approval Workflow [admin] ───────────────────────────────────────

  /**
   * PUT /api/signouts/{id}/approve
   * Approve a pending sign-out.
   * Deducts stock from inventory and transitions status to 'active'.
   * Records approved_by and approved_at.
   */
  approve: async (id: number): Promise<SignOutResponse> => {
    const { data } = await client.put<SignOutResponse>(`/signouts/${id}/approve`);
    return data;
  },

  /**
   * PUT /api/signouts/{id}/reject
   * Reject a pending sign-out.
   * No stock is deducted. Records rejected_by and rejection_reason.
   * Triggers notification to the requesting user.
   */
  reject: async (id: number, payload: RejectSignOutRequest): Promise<SignOutResponse> => {
    const { data } = await client.put<SignOutResponse>(`/signouts/${id}/reject`, payload);
    return data;
  },

  // ─── Loss Declaration [admin] ────────────────────────────────────────

  /**
   * PUT /api/signouts/{id}/declare-lost
   * Declare signed-out equipment as lost.
   * Permanently removes quantity from inventory (does not restore stock).
   * Records lost_declared_by and loss_report.
   * Terminal status — cannot be changed after this.
   */
  declareLost: async (id: number, payload: DeclareLostRequest): Promise<SignOutResponse> => {
    const { data } = await client.put<SignOutResponse>(
      `/signouts/${id}/declare-lost`,
      payload,
    );
    return data;
  },

  // ─── Overdue ─────────────────────────────────────────────────────────

  /**
   * GET /api/signouts/overdue
   * All currently overdue sign-outs [admin].
   * A sign-out is overdue when: status is 'active' or 'partially_returned'
   * AND expected_return_date < now.
   */
  listOverdue: async (): Promise<SignOutBrief[]> => {
    const { data } = await client.get<SignOutBrief[]>('/signouts/overdue');
    return data;
  },

  // ─── Statistics & Export ─────────────────────────────────────────────

  /**
   * GET /api/signouts/stats
   * Aggregate sign-out statistics [admin]:
   *   total_signouts, active_count, pending_approval_count, overdue_count,
   *   returned_count, lost_count, partially_returned_count,
   *   avg_duration_days, top_overdue_items (top 5)
   */
  getStats: async (): Promise<SignOutStats> => {
    const { data } = await client.get<SignOutStats>('/signouts/stats');
    return data;
  },

  /**
   * GET /api/signouts/export/csv
   * Downloads all sign-outs as a CSV file [admin].
   */
  exportCsv: async (): Promise<void> => {
    const timestamp = new Date().toISOString().slice(0, 10);
    await downloadFile('/signouts/export/csv', `G4Lite-signouts-${timestamp}.csv`);
  },
};