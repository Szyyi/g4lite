/**
 * @fileoverview Resupply Request API Module for G4Light Application
 * 
 * This module provides the API layer for the complete resupply request workflow
 * within the G4Light inventory management system. It handles the full lifecycle
 * from request submission through fulfillment, including administrative review,
 * ordering, and cost tracking.
 * 
 * @module api/resupply
 * @version 1.0.0
 * 
 * @description
 * The Resupply API manages a comprehensive 9-status workflow for inventory
 * replenishment requests:
 * 
 * **Status Flow Diagram:**
 * ```
 *   draft → pending → under_review → approved → ordered → partially_fulfilled → fulfilled
 *                                  ↘ rejected                                  ↗
 *                    (any non-terminal) → cancelled
 * ```
 * 
 * **Request Lifecycle:**
 * 1. **Draft**: User creates but hasn't submitted (optional stage)
 * 2. **Pending**: Submitted, awaiting admin review
 * 3. **Under Review**: Admin is actively reviewing
 * 4. **Approved**: Admin approved, ready for ordering
 * 5. **Rejected**: Admin rejected (terminal state)
 * 6. **Ordered**: Purchase order placed with supplier
 * 7. **Partially Fulfilled**: Some items delivered, more expected
 * 8. **Fulfilled**: All items delivered (terminal state)
 * 9. **Cancelled**: Request cancelled (terminal state)
 * 
 * **Key Features:**
 * - Automatic reference number generation (RSP-YYYYMM-NNNN)
 * - Support for existing items or freetext new item descriptions
 * - Priority levels (routine, urgent, critical, emergency)
 * - Cost tracking (estimated and actual, unit and total)
 * - Supplier and order tracking
 * - PDF demand form generation
 * - CSV export for reporting
 * 
 * @example
 * // Import and use the resupply API
 * import { resupplyApi } from './api/resupply';
 * 
 * // Submit a new resupply request
 * const request = await resupplyApi.create({
 *   item_id: 42,
 *   quantity_requested: 10,
 *   priority: 'urgent',
 *   justification: 'Stock critically low for upcoming exercise'
 * });
 * 
 * // Admin workflow
 * await resupplyApi.review(request.id);
 * await resupplyApi.approve(request.id, { estimated_total_cost: 500 });
 * await resupplyApi.order(request.id, { supplier: 'ACME Corp' });
 * await resupplyApi.fulfill(request.id, { quantity_fulfilled: 10 });
 * 
 * @see {@link ../types/index.ts} for type definitions
 * @see {@link ./client.ts} for HTTP client configuration
 * 
 * Backend Endpoint Mapping:
 * - POST   /api/resupply                  → create()
 * - GET    /api/resupply/mine             → listMine()
 * - GET    /api/resupply                  → list() [admin]
 * - GET    /api/resupply/{id}             → get()
 * - GET    /api/resupply/pending-count    → getPendingCount() [admin]
 * - PUT    /api/resupply/{id}/review      → review() [admin]
 * - PUT    /api/resupply/{id}/approve     → approve() [admin]
 * - PUT    /api/resupply/{id}/reject      → reject() [admin]
 * - PUT    /api/resupply/{id}/order       → order() [admin]
 * - PUT    /api/resupply/{id}/fulfill     → fulfill() [admin]
 * - PUT    /api/resupply/{id}/cancel      → cancel()
 * - PUT    /api/resupply/{id}/cost        → updateCost() [admin]
 * - PUT    /api/resupply/{id}/notes       → updateNotes() [admin]
 * - GET    /api/resupply/stats            → getStats() [admin]
 * - GET    /api/resupply/export/csv       → exportCsv() [admin]
 * - GET    /api/resupply/{id}/export      → exportPdf()
 * 
 * Total: 16 endpoints
 */

import client from './client';
import { buildQueryParams, downloadFile } from './client';
import type {
  ResupplyResponse,
  ResupplyBrief,
  CreateResupplyRequest,
  ReviewResupplyRequest,
  ApproveResupplyRequest,
  RejectResupplyRequest,
  OrderResupplyRequest,
  FulfillResupplyRequest,
  CancelResupplyRequest,
  UpdateResupplyCostRequest,
  UpdateResupplyNotesRequest,
  ResupplyFilterParams,
  ResupplyStats,
  PaginatedResupply,
  MessageResponse,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// RESUPPLY API
// ═══════════════════════════════════════════════════════════════════════════════
// Comprehensive resupply request management covering the full 9-status workflow
// from submission through fulfillment, with administrative controls and tracking.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resupply API singleton object.
 * 
 * @description
 * Provides methods for managing resupply requests including:
 * - Request submission and tracking
 * - Administrative review workflow
 * - Order and supplier management
 * - Fulfillment recording
 * - Cost tracking and reporting
 * - Export functionality (CSV and PDF)
 * 
 * **Priority Levels:**
 * - `routine`: Standard restocking (default)
 * - `urgent`: Needed soon, expedited handling
 * - `critical`: Operational necessity, high priority
 * - `emergency`: Immediate need, highest priority
 * 
 * @exports resupplyApi
 */
export const resupplyApi = {

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST & DETAIL METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for retrieving resupply request lists and individual details.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves a paginated list of all resupply requests (admin view).
   * 
   * @async
   * @function list
   * @param {ResupplyFilterParams} [filters={}] - Optional filter and pagination parameters
   * @returns {Promise<PaginatedResupply>} Paginated response containing ResupplyBrief array
   * 
   * @description
   * Administrative endpoint providing visibility into all resupply requests
   * across the system with comprehensive filtering capabilities.
   * 
   * **Available Filter Parameters:**
   * - `search`: Text search across request_ref, item name, requester name
   * - `status`: Filter by workflow status (pending, approved, ordered, etc.)
   * - `priority`: Filter by priority level (routine, urgent, critical, emergency)
   * - `item_id`: Filter by specific item
   * - `requested_by`: Filter by requesting user ID
   * - `date_from`: Requests created on or after date
   * - `date_to`: Requests created on or before date
   * - `sort_by`: Field to sort by (created_at, priority, status, etc.)
   * - `sort_order`: 'asc' | 'desc'
   * - `page`: Page number (1-indexed)
   * - `page_size`: Items per page
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * 
   * @example
   * // Get pending urgent requests
   * const requests = await resupplyApi.list({
   *   status: 'pending',
   *   priority: 'urgent',
   *   sort_by: 'created_at',
   *   sort_order: 'desc'
   * });
   */
  list: async (filters: ResupplyFilterParams = {}): Promise<PaginatedResupply> => {
    const queryString = buildQueryParams(filters as Record<string, unknown>);
    const { data } = await client.get<PaginatedResupply>(`/resupply${queryString}`);
    return data;
  },

  /**
   * Retrieves the current user's own resupply requests.
   * 
   * @async
   * @function listMine
   * @returns {Promise<ResupplyBrief[]>} Array of user's resupply requests
   * 
   * @description
   * Fetches all resupply requests submitted by the current user,
   * regardless of status. Allows users to track their requests
   * through the complete workflow lifecycle.
   * 
   * **Includes All Statuses:**
   * - Active requests (pending, under_review, approved, ordered)
   * - Completed requests (fulfilled, partially_fulfilled)
   * - Terminal requests (rejected, cancelled)
   * 
   * **ResupplyBrief Fields:**
   * - `id`, `request_ref`
   * - `item_id`, `item_name` (or `item_name_freetext`)
   * - `quantity_requested`, `quantity_fulfilled`
   * - `status`, `priority`
   * - `created_at`, `updated_at`
   * 
   * @example
   * const myRequests = await resupplyApi.listMine();
   * const pendingCount = myRequests.filter(r => r.status === 'pending').length;
   */
  listMine: async (): Promise<ResupplyBrief[]> => {
    const { data } = await client.get<ResupplyBrief[]>('/resupply/mine');
    return data;
  },

  /**
   * Retrieves complete details for a single resupply request.
   * 
   * @async
   * @function get
   * @param {number} id - The unique identifier of the resupply request
   * @returns {Promise<ResupplyResponse>} Full resupply request detail
   * 
   * @description
   * Fetches comprehensive information about a resupply request including
   * all workflow, tracking, and cost data.
   * 
   * **Response Fields:**
   * 
   * *Identification:*
   * - `id`, `request_ref` (e.g., "RSP-202604-0001")
   * - `item_id`, `item_name` or `item_name_freetext`
   * 
   * *Request Details:*
   * - `quantity_requested`, `quantity_fulfilled`
   * - `priority` (routine | urgent | critical | emergency)
   * - `justification` (user-provided reason)
   * - `status` (current workflow state)
   * 
   * *Requester Info:*
   * - `requested_by`: Embedded UserBrief object
   * - `created_at`, `updated_at`
   * 
   * *Admin Workflow:*
   * - `reviewed_by`, `reviewed_at`
   * - `approved_by`, `approved_at`
   * - `rejected_by`, `rejected_at`, `rejection_reason`
   * - `admin_notes` (admin-only visibility)
   * 
   * *Ordering Info:*
   * - `supplier`, `supplier_reference` (PO number)
   * - `ordered_at`, `expected_delivery_date`
   * 
   * *Fulfillment:*
   * - `fulfilled_at`, `fulfilled_by`
   * 
   * *Cost Tracking:*
   * - `estimated_unit_cost`, `estimated_total_cost`
   * - `actual_unit_cost`, `actual_total_cost`
   * - `currency`
   * 
   * *Cancellation:*
   * - `cancelled_by`, `cancelled_at`, `cancellation_reason`
   * 
   * @throws {AxiosError} 403 - Not authorized to view this request
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * const request = await resupplyApi.get(42);
   * console.log(`${request.request_ref}: ${request.status}`);
   * if (request.supplier) {
   *   console.log(`Ordered from ${request.supplier}`);
   * }
   */
  get: async (id: number): Promise<ResupplyResponse> => {
    const { data } = await client.get<ResupplyResponse>(`/resupply/${id}`);
    return data;
  },

  /**
   * Retrieves the count of pending resupply requests.
   * 
   * @async
   * @function getPendingCount
   * @returns {Promise<{count: number}>} Object containing pending request count
   * 
   * @description
   * Fetches the number of resupply requests in 'pending' status.
   * Used to display a badge count on the admin resupply navigation item,
   * alerting administrators to requests awaiting review.
   * 
   * **Authorization:** Requires admin role
   * 
   * @example
   * const { count } = await resupplyApi.getPendingCount();
   * if (count > 0) {
   *   showBadge(count);
   * }
   */
  getPendingCount: async (): Promise<{ count: number }> => {
    const { data } = await client.get<{ count: number }>('/resupply/pending-count');
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBMIT METHOD
  // ═══════════════════════════════════════════════════════════════════════════
  // Method for creating new resupply requests.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Submits a new resupply request.
   * 
   * @async
   * @function create
   * @param {CreateResupplyRequest} payload - Resupply request data
   * @returns {Promise<ResupplyResponse>} The created resupply request
   * 
   * @description
   * Creates a new resupply request in the system. The backend automatically
   * generates a unique reference number (RSP-YYYYMM-NNNN format) and
   * triggers notifications to administrators.
   * 
   * **Item Specification:**
   * Requests must specify the item using one of:
   * - `item_id`: Reference to an existing inventory item
   * - `item_name_freetext`: Text description for items not in system
   * 
   * At least one must be provided. If both are provided, `item_id` takes precedence.
   * 
   * **Payload Fields:**
   * - `item_id`: Existing item ID (optional if freetext provided)
   * - `item_name_freetext`: New item description (optional if item_id provided)
   * - `quantity_requested`: Number of units needed (required)
   * - `priority`: 'routine' | 'urgent' | 'critical' | 'emergency' (default: 'routine')
   * - `justification`: Reason for the request (required)
   * - `notes`: Additional notes (optional)
   * 
   * **Priority Guidelines:**
   * - `routine`: Standard restocking, process in normal queue
   * - `urgent`: Needed within days, expedite if possible
   * - `critical`: Operational necessity, prioritize immediately
   * - `emergency`: Mission-critical, immediate attention required
   * 
   * @throws {AxiosError} 422 - Validation error (missing required fields)
   * 
   * @example
   * // Request for existing item
   * const request = await resupplyApi.create({
   *   item_id: 42,
   *   quantity_requested: 25,
   *   priority: 'urgent',
   *   justification: 'Stock depleted after exercise, need replenishment before next month'
   * });
   * 
   * @example
   * // Request for new item (not in system)
   * const request = await resupplyApi.create({
   *   item_name_freetext: 'USB-C to Lightning cables (2m)',
   *   quantity_requested: 50,
   *   priority: 'routine',
   *   justification: 'New requirement for mobile device charging stations'
   * });
   */
  create: async (payload: CreateResupplyRequest): Promise<ResupplyResponse> => {
    const { data } = await client.post<ResupplyResponse>('/resupply', payload);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN WORKFLOW METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for administrative processing of resupply requests through the
  // workflow states: review, approve, reject, order, fulfill, cancel.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Marks a pending request as under review.
   * 
   * @async
   * @function review
   * @param {number} id - The ID of the resupply request
   * @param {ReviewResupplyRequest} [payload={}] - Optional review data
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Transitions a resupply request from 'pending' to 'under_review' status,
   * indicating that an administrator is actively evaluating the request.
   * 
   * **Status Transition:** pending → under_review
   * 
   * **Optional Payload:**
   * - `admin_notes`: Notes visible only to administrators
   * 
   * **Use Cases:**
   * - Claiming a request for review
   * - Indicating active processing to other admins
   * - Adding initial assessment notes
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 400 - Invalid status transition
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * await resupplyApi.review(42, {
   *   admin_notes: 'Reviewing with procurement team'
   * });
   */
  review: async (id: number, payload: ReviewResupplyRequest = {}): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/review`,
      payload,
    );
    return data;
  },

  /**
   * Approves a resupply request.
   * 
   * @async
   * @function approve
   * @param {number} id - The ID of the resupply request
   * @param {ApproveResupplyRequest} [payload={}] - Optional approval data with cost estimates
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Approves a resupply request, advancing it to the 'approved' status
   * where it's ready for ordering. Optionally records cost estimates
   * at approval time.
   * 
   * **Status Transitions:**
   * - under_review → approved
   * - pending → approved (direct approval without formal review)
   * 
   * **Optional Payload:**
   * - `estimated_unit_cost`: Estimated cost per unit
   * - `estimated_total_cost`: Estimated total cost
   * - `admin_notes`: Additional notes
   * 
   * **Post-Approval:**
   * - Requester is notified of approval
   * - Request is ready for ordering
   * - Cost estimates recorded for budget tracking
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 400 - Invalid status transition
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * // Simple approval
   * await resupplyApi.approve(42);
   * 
   * @example
   * // Approval with cost estimates
   * await resupplyApi.approve(42, {
   *   estimated_unit_cost: 25.00,
   *   estimated_total_cost: 625.00,
   *   admin_notes: 'Approved - within quarterly budget'
   * });
   */
  approve: async (id: number, payload: ApproveResupplyRequest = {}): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/approve`,
      payload,
    );
    return data;
  },

  /**
   * Rejects a resupply request.
   * 
   * @async
   * @function reject
   * @param {number} id - The ID of the resupply request
   * @param {RejectResupplyRequest} payload - Rejection data with required reason
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Rejects a resupply request, moving it to the terminal 'rejected' status.
   * A rejection reason is required to inform the requester why their
   * request was denied.
   * 
   * **Status Transitions:**
   * - pending → rejected
   * - under_review → rejected
   * 
   * **Required Payload:**
   * - `rejection_reason`: Explanation for the rejection (required)
   * 
   * **Post-Rejection:**
   * - Requester receives notification with rejection reason
   * - Request enters terminal state (cannot be resubmitted)
   * - Requester may submit a new request if appropriate
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 400 - Invalid status transition or missing reason
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * await resupplyApi.reject(42, {
   *   rejection_reason: 'Item discontinued by manufacturer. Please submit request for alternative product.'
   * });
   */
  reject: async (id: number, payload: RejectResupplyRequest): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/reject`,
      payload,
    );
    return data;
  },

  /**
   * Marks an approved request as ordered.
   * 
   * @async
   * @function order
   * @param {number} id - The ID of the resupply request
   * @param {OrderResupplyRequest} payload - Order details including supplier
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Records that a purchase order has been placed with a supplier,
   * transitioning the request to 'ordered' status.
   * 
   * **Status Transition:** approved → ordered
   * 
   * **Payload Fields:**
   * - `supplier`: Supplier/vendor name (required)
   * - `supplier_reference`: PO number or order reference (optional)
   * - `expected_delivery_date`: ISO date string for expected arrival (optional)
   * 
   * **Post-Order:**
   * - Request awaits delivery
   * - Tracking information recorded for follow-up
   * - Requester may be notified of order placement
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 400 - Invalid status transition or missing supplier
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * await resupplyApi.order(42, {
   *   supplier: 'ACME Industrial Supply',
   *   supplier_reference: 'PO-2024-0542',
   *   expected_delivery_date: '2024-04-15'
   * });
   */
  order: async (id: number, payload: OrderResupplyRequest): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/order`,
      payload,
    );
    return data;
  },

  /**
   * Records delivery of ordered items.
   * 
   * @async
   * @function fulfill
   * @param {number} id - The ID of the resupply request
   * @param {FulfillResupplyRequest} payload - Fulfillment data
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Records the delivery and receipt of ordered items. Handles both
   * complete and partial fulfillments.
   * 
   * **Status Transitions:**
   * - If `quantity_fulfilled >= quantity_requested`: ordered → fulfilled
   * - If `quantity_fulfilled < quantity_requested`: ordered → partially_fulfilled
   * - From partially_fulfilled: Another fulfill call can complete it
   * 
   * **Payload Fields:**
   * - `quantity_fulfilled`: Number of units actually received (required)
   * - `actual_unit_cost`: Actual cost per unit (optional)
   * - `actual_total_cost`: Actual total cost (optional)
   * 
   * **Partial Fulfillment:**
   * When fewer items arrive than requested, the status becomes
   * 'partially_fulfilled'. This allows tracking of backorders and
   * recording subsequent deliveries until the full quantity is received.
   * 
   * **Stock Integration:**
   * Fulfillment may trigger automatic stock adjustment for the
   * referenced item (implementation-dependent).
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 400 - Invalid status transition or invalid quantity
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * // Complete fulfillment
   * await resupplyApi.fulfill(42, {
   *   quantity_fulfilled: 25,
   *   actual_unit_cost: 22.50,
   *   actual_total_cost: 562.50
   * });
   * 
   * @example
   * // Partial fulfillment (backorder scenario)
   * await resupplyApi.fulfill(42, {
   *   quantity_fulfilled: 15  // Only 15 of 25 arrived
   * });
   * // Later, when remaining items arrive:
   * await resupplyApi.fulfill(42, {
   *   quantity_fulfilled: 10  // Cumulative now equals requested
   * });
   */
  fulfill: async (id: number, payload: FulfillResupplyRequest): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/fulfill`,
      payload,
    );
    return data;
  },

  /**
   * Cancels a resupply request.
   * 
   * @async
   * @function cancel
   * @param {number} id - The ID of the resupply request
   * @param {CancelResupplyRequest} payload - Cancellation data with reason
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Cancels a resupply request, moving it to the terminal 'cancelled' status.
   * Cancellation permissions depend on user role and request status.
   * 
   * **User Permissions:**
   * - Regular users can cancel their own requests only before ordering
   * - Valid statuses for user cancellation: draft, pending, under_review, approved
   * 
   * **Admin Permissions:**
   * - Admins can cancel any non-terminal request
   * - Valid statuses for admin cancellation: all except fulfilled, rejected, cancelled
   * 
   * **Payload Fields:**
   * - `cancellation_reason`: Explanation for cancellation (required)
   * 
   * **Post-Cancellation:**
   * - Request enters terminal state
   * - Admins notified of user-initiated cancellations
   * - Requesters notified of admin-initiated cancellations
   * 
   * @throws {AxiosError} 400 - Invalid status transition or missing reason
   * @throws {AxiosError} 403 - Not authorized to cancel (status or ownership)
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * // User cancelling their own request
   * await resupplyApi.cancel(42, {
   *   cancellation_reason: 'No longer needed - resolved with alternative solution'
   * });
   * 
   * @example
   * // Admin cancelling an ordered request
   * await resupplyApi.cancel(42, {
   *   cancellation_reason: 'Supplier unable to fulfill - will reorder from alternate vendor'
   * });
   */
  cancel: async (id: number, payload: CancelResupplyRequest): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/cancel`,
      payload,
    );
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COST & NOTES METHODS [ADMIN ONLY]
  // ═══════════════════════════════════════════════════════════════════════════
  // Administrative methods for updating cost tracking and internal notes
  // at any stage of the workflow.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Updates cost tracking fields for a resupply request.
   * 
   * @async
   * @function updateCost
   * @param {number} id - The ID of the resupply request
   * @param {UpdateResupplyCostRequest} payload - Cost data to update
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Updates estimated and/or actual cost fields at any workflow stage.
   * Useful for refining estimates before ordering or recording final
   * costs after fulfillment.
   * 
   * **Payload Fields (all optional):**
   * - `estimated_unit_cost`: Estimated cost per unit
   * - `estimated_total_cost`: Estimated total cost
   * - `actual_unit_cost`: Actual cost per unit (after receipt)
   * - `actual_total_cost`: Actual total cost (after receipt)
   * - `currency`: Currency code (default: system currency)
   * 
   * **Use Cases:**
   * - Update estimates after getting supplier quotes
   * - Record actual costs from invoices
   * - Correct data entry errors
   * - Track price changes
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * // Update after receiving invoice
   * await resupplyApi.updateCost(42, {
   *   actual_unit_cost: 24.99,
   *   actual_total_cost: 624.75,
   *   currency: 'USD'
   * });
   */
  updateCost: async (id: number, payload: UpdateResupplyCostRequest): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/cost`,
      payload,
    );
    return data;
  },

  /**
   * Adds or updates administrative notes for a resupply request.
   * 
   * @async
   * @function updateNotes
   * @param {number} id - The ID of the resupply request
   * @param {UpdateResupplyNotesRequest} payload - Notes data
   * @returns {Promise<ResupplyResponse>} The updated resupply request
   * 
   * @description
   * Updates the admin_notes field for internal tracking and communication
   * between administrators. Notes are NOT visible to the requesting user.
   * 
   * **Payload Fields:**
   * - `admin_notes`: Internal notes text (replaces existing notes)
   * 
   * **Use Cases:**
   * - Documenting procurement decisions
   * - Recording supplier communications
   * - Noting special handling requirements
   * - Tracking follow-up actions needed
   * 
   * **Visibility:**
   * Admin notes are only visible to administrators, not to the
   * user who submitted the request. Use request comments or
   * notifications for user-facing communication.
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Request not found
   * 
   * @example
   * await resupplyApi.updateNotes(42, {
   *   admin_notes: 'Supplier confirmed 2-week lead time. Follow up on April 20 if not received.'
   * });
   */
  updateNotes: async (id: number, payload: UpdateResupplyNotesRequest): Promise<ResupplyResponse> => {
    const { data } = await client.put<ResupplyResponse>(
      `/resupply/${id}/notes`,
      payload,
    );
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS & EXPORT METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for reporting, analytics, and data export.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves aggregate resupply statistics.
   * 
   * @async
   * @function getStats
   * @returns {Promise<ResupplyStats>} Comprehensive resupply statistics
   * 
   * @description
   * Fetches aggregate statistics about resupply requests for dashboard
   * displays and reporting. Includes counts by status and cost summaries.
   * 
   * **Returned Statistics:**
   * 
   * *Request Counts:*
   * - `total_requests`: Total number of resupply requests
   * - `pending_count`: Requests awaiting review
   * - `under_review_count`: Requests being reviewed
   * - `approved_count`: Approved, ready for ordering
   * - `rejected_count`: Rejected requests
   * - `ordered_count`: Orders placed with suppliers
   * - `partially_fulfilled_count`: Partial deliveries received
   * - `fulfilled_count`: Completely fulfilled
   * - `cancelled_count`: Cancelled requests
   * 
   * *Cost Summaries:*
   * - `total_estimated_cost`: Sum of estimated costs (approved+)
   * - `total_actual_cost`: Sum of actual costs (fulfilled)
   * - `currency`: Currency code for cost values
   * 
   * *Performance Metrics:*
   * - `avg_fulfilment_days`: Average days from submission to fulfillment
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * 
   * @example
   * const stats = await resupplyApi.getStats();
   * console.log(`Pending requests: ${stats.pending_count}`);
   * console.log(`Total spend: ${stats.currency} ${stats.total_actual_cost}`);
   * console.log(`Avg fulfillment: ${stats.avg_fulfilment_days} days`);
   */
  getStats: async (): Promise<ResupplyStats> => {
    const { data } = await client.get<ResupplyStats>('/resupply/stats');
    return data;
  },

  /**
   * Exports all resupply requests to a CSV file.
   * 
   * @async
   * @function exportCsv
   * @returns {Promise<void>} Resolves when download is triggered
   * 
   * @description
   * Downloads all resupply requests as a CSV file for reporting and
   * analysis. The browser's save dialog appears with a timestamp-based
   * filename.
   * 
   * **Filename Format:** `G4Lite-resupply-YYYY-MM-DD.csv`
   * 
   * **CSV Contents:**
   * All resupply requests with fields including:
   * - Request identification (ref, id)
   * - Item information
   * - Quantities (requested, fulfilled)
   * - Status and priority
   * - Requester information
   * - Workflow timestamps
   * - Supplier and order details
   * - Cost information (estimated and actual)
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {Error} If download fails
   * 
   * @example
   * const handleExport = async () => {
   *   await resupplyApi.exportCsv();
   *   toast.success('Resupply report downloaded');
   * };
   */
  exportCsv: async (): Promise<void> => {
    const timestamp = new Date().toISOString().slice(0, 10);
    await downloadFile('/resupply/export/csv', `G4Lite-resupply-${timestamp}.csv`);
  },

  /**
   * Exports a single resupply request as a PDF demand form.
   * 
   * @async
   * @function exportPdf
   * @param {number} id - The ID of the resupply request
   * @returns {Promise<void>} Resolves when download is triggered
   * 
   * @description
   * Downloads a formatted PDF document for a single resupply request.
   * The document serves as an official demand form that can be printed
   * or attached to procurement paperwork.
   * 
   * **Filename Format:** `{request_ref}-demand-form.pdf`
   * Example: `RSP-202604-0042-demand-form.pdf`
   * 
   * **PDF Contents:**
   * - Request reference and details
   * - Item information and quantities
   * - Requester information
   * - Justification text
   * - Approval signatures/timestamps (if applicable)
   * - Cost estimates (if recorded)
   * 
   * **Authorization:**
   * - Users can export their own requests
   * - Admins can export any request
   * 
   * @throws {AxiosError} 403 - Not authorized to view this request
   * @throws {AxiosError} 404 - Request not found
   * @throws {Error} If PDF generation or download fails
   * 
   * @example
   * // Download demand form for a specific request
   * await resupplyApi.exportPdf(42);
   */
  exportPdf: async (id: number): Promise<void> => {
    const { data: request } = await client.get<ResupplyResponse>(`/resupply/${id}`);
    const ref = request.request_ref ?? `RSP-${id}`;
    await downloadFile(`/resupply/${id}/export`, `${ref}-demand-form.pdf`);
  },
};