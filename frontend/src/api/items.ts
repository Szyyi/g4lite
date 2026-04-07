/**
 * @fileoverview Items and Categories API Module for G4Lite Application
 * 
 * This module provides the API layer for inventory item management and category
 * organization within the G4Lite inventory management system. It handles all
 * CRUD operations, stock management, reporting, and hierarchical category structures.
 * 
 * @module api/items
 * @version 1.0.0
 * 
 * @description
 * The Items & Categories API encompasses two main functional areas:
 * 
 * **Items Management (11 endpoints):**
 * - Paginated listing with advanced filtering (12 filter options)
 * - Full CRUD operations with soft-delete support
 * - Stock quantity adjustments with audit trail
 * - Condition state transfers between inventory conditions
 * - Statistical reporting and low-stock alerts
 * - CSV export functionality
 * 
 * **Categories Management (6 endpoints):**
 * - Flat and hierarchical category listings
 * - Parent-child relationship management
 * - Category CRUD with item count tracking
 * 
 * @example
 * // Import and use the items API
 * import { itemsApi, categoriesApi } from './api/items';
 * 
 * // Fetch paginated items with filters
 * const items = await itemsApi.list({ category_id: 5, criticality: 'essential' });
 * 
 * // Get category tree for sidebar
 * const tree = await categoriesApi.getTree();
 * 
 * @see {@link ../types/index.ts} for type definitions
 * @see {@link ./client.ts} for HTTP client configuration
 * 
 * Backend Endpoint Mapping — Items:
 * - GET    /api/items                     → list()
 * - GET    /api/items/{id}                → get()
 * - POST   /api/items                     → create() [admin]
 * - PUT    /api/items/{id}                → update() [admin]
 * - DELETE /api/items/{id}                → delete() [admin]
 * - POST   /api/items/{id}/restore        → restore() [admin]
 * - GET    /api/items/stats               → getStats()
 * - GET    /api/items/low-stock           → getLowStock()
 * - POST   /api/items/{id}/adjust-stock   → adjustStock() [admin]
 * - POST   /api/items/{id}/transfer-condition → transferCondition() [admin]
 * - GET    /api/items/export/csv          → exportCsv() [admin]
 * 
 * Backend Endpoint Mapping — Categories:
 * - GET    /api/categories                → list()
 * - GET    /api/categories/tree           → getTree()
 * - GET    /api/categories/{id}           → get()
 * - POST   /api/categories                → create() [admin]
 * - PUT    /api/categories/{id}           → update() [admin]
 * - DELETE /api/categories/{id}           → delete() [admin]
 * 
 * Total: 17 endpoints
 */

import client from './client';
import { buildQueryParams, downloadFile } from './client';
import type {
  ItemResponse,
  ItemBrief,
  CreateItemRequest,
  UpdateItemRequest,
  ItemFilterParams,
  ItemStats,
  LowStockItem,
  StockAdjustmentRequest,
  ConditionTransferRequest,
  PaginatedItems,
  CategoryResponse,
  CategoryTreeNode,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  MessageResponse,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// ITEMS API
// ═══════════════════════════════════════════════════════════════════════════════
// Comprehensive inventory item management including CRUD operations,
// stock adjustments, condition tracking, and reporting.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Items API singleton object.
 * 
 * @description
 * Provides methods for managing inventory items including:
 * - Listing and searching with advanced filters
 * - Full CRUD operations (admin-only for mutations)
 * - Stock quantity management
 * - Condition state tracking
 * - Statistical reporting
 * - Data export
 * 
 * @exports itemsApi
 */
export const itemsApi = {

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST & DETAIL METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for retrieving item lists and individual item details.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves a paginated list of inventory items with filtering and sorting.
   * 
   * @async
   * @function list
   * @param {ItemFilterParams} [filters={}] - Optional filter and pagination parameters
   * @returns {Promise<PaginatedItems>} Paginated response containing ItemBrief array
   * 
   * @description
   * Fetches inventory items with comprehensive filtering capabilities.
   * Returns abbreviated item data (ItemBrief) for list performance.
   * Use `get()` to fetch full item details when needed.
   * 
   * **Available Filter Parameters:**
   * - `search`: Text search across name, item_code, description
   * - `category_id`: Filter by category (includes subcategories)
   * - `criticality`: Filter by criticality level ('essential' | 'important' | 'standard')
   * - `is_consumable`: Filter consumable vs non-consumable items
   * - `requires_approval`: Filter items requiring sign-out approval
   * - `is_active`: Filter active vs soft-deleted items
   * - `min_available`: Minimum available quantity threshold
   * - `max_available`: Maximum available quantity threshold
   * - `storage_location`: Filter by storage location string
   * - `tags`: Filter by tag (comma-separated for multiple)
   * 
   * **Available Sort Fields:**
   * - `name`, `item_code`, `available_quantity`, `total_quantity`
   * - `criticality_level`, `category`, `created_at`, `updated_at`
   * 
   * **Pagination Parameters:**
   * - `page`: Page number (1-indexed, default: 1)
   * - `limit`: Items per page (default: 20, max: 100)
   * - `sort_by`: Field to sort by
   * - `sort_order`: 'asc' | 'desc'
   * 
   * @example
   * // Basic listing with pagination
   * const page1 = await itemsApi.list({ page: 1, limit: 20 });
   * 
   * @example
   * // Filtered search for essential items in a category
   * const items = await itemsApi.list({
   *   category_id: 5,
   *   criticality: 'essential',
   *   search: 'antenna',
   *   sort_by: 'available_quantity',
   *   sort_order: 'asc'
   * });
   */
  list: async (filters: ItemFilterParams = {}): Promise<PaginatedItems> => {
    const queryString = buildQueryParams(filters as Record<string, unknown>);
    const { data } = await client.get<PaginatedItems>(`/items${queryString}`);
    return data;
  },

  /**
   * Retrieves complete details for a single inventory item.
   * 
   * @async
   * @function get
   * @param {number} id - The unique identifier of the item
   * @returns {Promise<ItemResponse>} Full item detail object with 40+ fields
   * 
   * @description
   * Fetches comprehensive item information including:
   * 
   * **Core Identification:**
   * - `id`, `item_code`, `name`, `description`
   * - `category_id`, `category_name`
   * 
   * **Stock Information:**
   * - `total_quantity`, `available_quantity`, `checked_out_quantity`
   * - `serviceable_quantity`, `unserviceable_quantity`
   * - `damaged_quantity`, `condemned_quantity`
   * 
   * **Management Thresholds:**
   * - `minimum_stock_level`, `reorder_point`, `reorder_quantity`
   * - `maximum_stock_level`
   * 
   * **Item Flags:**
   * - `is_consumable`, `is_serialized`, `requires_approval`
   * - `is_hazmat`, `is_active`
   * 
   * **Location & Classification:**
   * - `storage_location`, `storage_bin`
   * - `criticality_level`, `unit_of_measure`
   * - `tags` (array)
   * 
   * **Audit Metadata:**
   * - `created_at`, `updated_at`, `created_by`, `updated_by`
   * 
   * @throws {AxiosError} 404 - Item not found
   * 
   * @example
   * const item = await itemsApi.get(42);
   * console.log(`${item.name}: ${item.available_quantity}/${item.total_quantity}`);
   */
  get: async (id: number): Promise<ItemResponse> => {
    const { data } = await client.get<ItemResponse>(`/items/${id}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD METHODS [ADMIN ONLY]
  // ═══════════════════════════════════════════════════════════════════════════
  // Create, update, delete, and restore operations. All mutations require
  // admin role authorization.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Creates a new inventory item.
   * 
   * @async
   * @function create
   * @param {CreateItemRequest} payload - Item creation data
   * @returns {Promise<ItemResponse>} The newly created item with generated fields
   * 
   * @description
   * Creates a new item in the inventory system. The backend automatically
   * generates the `item_code` based on category prefix and sequence number
   * (e.g., "G4L-SBC-001" for the first item in a category).
   * 
   * **Required Fields:**
   * - `name`: Display name for the item
   * - `category_id`: ID of the parent category
   * 
   * **Optional Fields:**
   * - `description`: Detailed item description
   * - `total_quantity`: Initial stock quantity (default: 0)
   * - `unit_of_measure`: Unit string (default: 'each')
   * - `storage_location`: Physical storage location
   * - `storage_bin`: Specific bin/shelf identifier
   * - `minimum_stock_level`: Low-stock alert threshold
   * - `reorder_point`: Automatic reorder trigger level
   * - `reorder_quantity`: Standard reorder amount
   * - `is_consumable`: Whether item is consumed on use
   * - `is_serialized`: Whether individual units are tracked
   * - `requires_approval`: Whether sign-out needs approval
   * - `is_hazmat`: Hazardous materials flag
   * - `criticality_level`: 'essential' | 'important' | 'standard'
   * - `tags`: Array of categorization tags
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 422 - Validation error
   * 
   * @example
   * const newItem = await itemsApi.create({
   *   name: 'Tactical Radio Battery',
   *   category_id: 3,
   *   description: 'Lithium-ion battery pack for PRC-152',
   *   total_quantity: 50,
   *   minimum_stock_level: 10,
   *   is_consumable: true,
   *   criticality_level: 'essential'
   * });
   */
  create: async (payload: CreateItemRequest): Promise<ItemResponse> => {
    const { data } = await client.post<ItemResponse>('/items', payload);
    return data;
  },

  /**
   * Updates an existing inventory item.
   * 
   * @async
   * @function update
   * @param {number} id - The ID of the item to update
   * @param {UpdateItemRequest} payload - Fields to update (partial update supported)
   * @returns {Promise<ItemResponse>} The updated item with all fields
   * 
   * @description
   * Modifies an existing item's attributes. Supports partial updates —
   * only include the fields that need to change; omitted fields retain
   * their current values.
   * 
   * **Note:** To change stock quantities, use `adjustStock()` instead
   * of updating quantity fields directly. This ensures proper audit trails.
   * 
   * **Common Update Scenarios:**
   * - Updating description or storage location
   * - Changing stock thresholds (min/max levels)
   * - Modifying flags (requires_approval, is_hazmat, etc.)
   * - Updating criticality level
   * - Adding/removing tags
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Item not found
   * @throws {AxiosError} 422 - Validation error
   * 
   * @example
   * // Update storage location and reorder threshold
   * const updated = await itemsApi.update(42, {
   *   storage_location: 'Building A, Room 101',
   *   storage_bin: 'Shelf 3, Bin 5',
   *   reorder_point: 15
   * });
   */
  update: async (id: number, payload: UpdateItemRequest): Promise<ItemResponse> => {
    const { data } = await client.put<ItemResponse>(`/items/${id}`, payload);
    return data;
  },

  /**
   * Soft-deletes an inventory item.
   * 
   * @async
   * @function delete
   * @param {number} id - The ID of the item to delete
   * @returns {Promise<MessageResponse>} Confirmation message
   * 
   * @description
   * Performs a soft-delete by setting `is_active = false`. The item
   * remains in the database for audit purposes but is excluded from
   * normal queries and cannot be signed out.
   * 
   * **Deletion Blockers:**
   * The backend will reject deletion (409 Conflict) if the item has:
   * - Active sign-outs (items currently checked out)
   * - Pending return requests
   * 
   * Items must be fully returned before deletion.
   * 
   * **Recovery:**
   * Soft-deleted items can be restored using the `restore()` method.
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Item not found
   * @throws {AxiosError} 409 - Item has active sign-outs
   * 
   * @example
   * try {
   *   await itemsApi.delete(42);
   *   toast.success('Item archived successfully');
   * } catch (error) {
   *   if (getApiErrorStatus(error) === 409) {
   *     toast.error('Cannot delete: item has active sign-outs');
   *   }
   * }
   */
  delete: async (id: number): Promise<MessageResponse> => {
    const { data } = await client.delete<MessageResponse>(`/items/${id}`);
    return data;
  },

  /**
   * Restores a soft-deleted inventory item.
   * 
   * @async
   * @function restore
   * @param {number} id - The ID of the item to restore
   * @returns {Promise<ItemResponse>} The restored item with is_active = true
   * 
   * @description
   * Reverses a soft-delete operation by setting `is_active = true`.
   * The item will reappear in normal queries and become available
   * for sign-out operations.
   * 
   * **Use Cases:**
   * - Recovering accidentally deleted items
   * - Reactivating seasonal equipment
   * - Restoring items after temporary decommission
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Item not found
   * @throws {AxiosError} 400 - Item is not currently deleted
   * 
   * @example
   * const restoredItem = await itemsApi.restore(42);
   * console.log(`${restoredItem.name} is now active`);
   */
  restore: async (id: number): Promise<ItemResponse> => {
    const { data } = await client.post<ItemResponse>(`/items/${id}/restore`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS & REPORTING METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for retrieving aggregate inventory metrics and alerts.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves aggregate inventory statistics.
   * 
   * @async
   * @function getStats
   * @returns {Promise<ItemStats>} Object containing 16 inventory metrics
   * 
   * @description
   * Fetches comprehensive inventory statistics for dashboard displays
   * and reporting. All metrics are calculated server-side for accuracy.
   * 
   * **Returned Metrics:**
   * 
   * *Item Counts:*
   * - `total_items`: Total number of items in the system
   * - `active_items`: Items with is_active = true
   * - `categories_count`: Number of categories
   * 
   * *Quantity Totals:*
   * - `total_quantity`: Sum of all item quantities
   * - `total_available`: Sum of available (not checked out) quantities
   * - `total_checked_out`: Sum of currently checked out quantities
   * 
   * *Condition Breakdown:*
   * - `total_serviceable`: Quantity in serviceable condition
   * - `total_unserviceable`: Quantity needing repair
   * - `total_damaged`: Quantity marked as damaged
   * - `total_condemned`: Quantity condemned/write-off
   * 
   * *Special Categories:*
   * - `low_stock_count`: Items below minimum_stock_level
   * - `items_requiring_approval`: Items with requires_approval flag
   * - `consumable_items`: Count of consumable items
   * - `hazmat_items`: Count of hazardous material items
   * - `serialised_items`: Count of serialized (tracked) items
   * 
   * *Calculated Metrics:*
   * - `average_availability_pct`: (available / total) * 100
   * 
   * @example
   * const stats = await itemsApi.getStats();
   * console.log(`Low stock alerts: ${stats.low_stock_count}`);
   * console.log(`Availability: ${stats.average_availability_pct.toFixed(1)}%`);
   */
  getStats: async (): Promise<ItemStats> => {
    const { data } = await client.get<ItemStats>('/items/stats');
    return data;
  },

  /**
   * Retrieves items that are below their minimum stock level.
   * 
   * @async
   * @function getLowStock
   * @returns {Promise<LowStockItem[]>} Array of low-stock items sorted by priority
   * 
   * @description
   * Returns items where `available_quantity < minimum_stock_level`.
   * Results are sorted by urgency:
   * 
   * **Sort Priority:**
   * 1. Criticality level (essential → important → standard)
   * 2. Deficit percentage (larger deficit = higher priority)
   * 
   * **LowStockItem Fields:**
   * - `id`, `name`, `item_code`
   * - `available_quantity`: Current available stock
   * - `minimum_stock_level`: Configured minimum threshold
   * - `deficit`: minimum_stock_level - available_quantity
   * - `criticality_level`: Item criticality classification
   * - `reorder_quantity`: Suggested reorder amount
   * 
   * **Use Cases:**
   * - Dashboard low-stock alerts widget
   * - Resupply request generation
   * - Inventory health monitoring
   * 
   * @example
   * const lowStock = await itemsApi.getLowStock();
   * if (lowStock.length > 0) {
   *   console.log(`${lowStock.length} items need restocking`);
   *   lowStock.forEach(item => {
   *     console.log(`${item.name}: ${item.available_quantity}/${item.minimum_stock_level}`);
   *   });
   * }
   */
  getLowStock: async (): Promise<LowStockItem[]> => {
    const { data } = await client.get<LowStockItem[]>('/items/low-stock');
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STOCK MANAGEMENT METHODS [ADMIN ONLY]
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for adjusting stock quantities and transferring items between
  // condition states. All operations require audit reasons and admin role.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Adjusts stock quantity for a specific condition state.
   * 
   * @async
   * @function adjustStock
   * @param {number} id - The ID of the item to adjust
   * @param {StockAdjustmentRequest} payload - Adjustment details with audit reason
   * @returns {Promise<ItemResponse>} Updated item with new quantities
   * 
   * @description
   * Adjusts the stock quantity for an item in a specific condition state.
   * Creates an audit record for accountability and traceability.
   * 
   * **Adjustment Types:**
   * - Positive adjustment: Add stock (delivery, found items, returns)
   * - Negative adjustment: Remove stock (loss, damage, write-off)
   * 
   * **Payload Fields:**
   * - `adjustment`: Positive or negative quantity change
   * - `condition`: Target condition state
   *   - 'serviceable' | 'unserviceable' | 'damaged' | 'condemned'
   * - `reason`: Required audit reason string
   * 
   * **Backend Validation:**
   * - Cannot reduce below zero for any condition
   * - Reason is required and logged for audit
   * - Updates total_quantity accordingly
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 400 - Would result in negative quantity
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Item not found
   * 
   * @example
   * // Add 5 serviceable units from delivery
   * await itemsApi.adjustStock(42, {
   *   adjustment: 5,
   *   condition: 'serviceable',
   *   reason: 'Delivery received - PO#12345'
   * });
   * 
   * @example
   * // Write off 2 damaged units
   * await itemsApi.adjustStock(42, {
   *   adjustment: -2,
   *   condition: 'damaged',
   *   reason: 'Board of survey - items condemned'
   * });
   */
  adjustStock: async (id: number, payload: StockAdjustmentRequest): Promise<ItemResponse> => {
    const { data } = await client.post<ItemResponse>(
      `/items/${id}/adjust-stock`,
      payload,
    );
    return data;
  },

  /**
   * Transfers quantity between condition states without changing total.
   * 
   * @async
   * @function transferCondition
   * @param {number} id - The ID of the item to transfer
   * @param {ConditionTransferRequest} payload - Transfer details with audit reason
   * @returns {Promise<ItemResponse>} Updated item with redistributed quantities
   * 
   * @description
   * Moves inventory quantity from one condition state to another.
   * This operation does NOT change the total_quantity — it only
   * redistributes units between condition categories.
   * 
   * **Common Transfer Scenarios:**
   * 
   * *Repair Workflow:*
   * - unserviceable → serviceable (after repair)
   * - damaged → unserviceable (assessed for repair)
   * - damaged → condemned (beyond repair)
   * 
   * *Damage Assessment:*
   * - serviceable → damaged (damage discovered)
   * - serviceable → unserviceable (needs maintenance)
   * 
   * **Payload Fields:**
   * - `from_condition`: Source condition state
   * - `to_condition`: Destination condition state
   * - `quantity`: Number of units to transfer
   * - `reason`: Required audit reason string
   * 
   * **Backend Validation:**
   * - Source condition must have sufficient quantity
   * - from_condition !== to_condition
   * - Quantity must be positive
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 400 - Insufficient quantity in source condition
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Item not found
   * @throws {AxiosError} 422 - Invalid condition states
   * 
   * @example
   * // 3 unserviceable units repaired and returned to service
   * await itemsApi.transferCondition(42, {
   *   from_condition: 'unserviceable',
   *   to_condition: 'serviceable',
   *   quantity: 3,
   *   reason: 'Repaired by tech workshop - WO#789'
   * });
   * 
   * @example
   * // 1 damaged unit condemned (beyond economic repair)
   * await itemsApi.transferCondition(42, {
   *   from_condition: 'damaged',
   *   to_condition: 'condemned',
   *   quantity: 1,
   *   reason: 'Beyond economic repair - Board of Survey #456'
   * });
   */
  transferCondition: async (
    id: number,
    payload: ConditionTransferRequest,
  ): Promise<ItemResponse> => {
    const { data } = await client.post<ItemResponse>(
      `/items/${id}/transfer-condition`,
      payload,
    );
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for exporting inventory data in various formats.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Exports the complete inventory to a CSV file.
   * 
   * @async
   * @function exportCsv
   * @returns {Promise<void>} Resolves when download is triggered
   * 
   * @description
   * Downloads the full inventory dataset as a CSV file. The browser's
   * native save dialog will appear with a suggested filename including
   * the current date.
   * 
   * **Filename Format:** `G4Lite-inventory-YYYY-MM-DD.csv`
   * 
   * **CSV Contents:**
   * All active items with fields including:
   * - Item identification (code, name, description)
   * - Category information
   * - All quantity fields (total, available, by condition)
   * - Stock thresholds
   * - Location information
   * - Flags and classifications
   * - Timestamps
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {Error} If download fails
   * 
   * @example
   * const handleExport = async () => {
   *   try {
   *     await itemsApi.exportCsv();
   *     toast.success('Export downloaded');
   *   } catch (error) {
   *     toast.error('Export failed');
   *   }
   * };
   */
  exportCsv: async (): Promise<void> => {
    const timestamp = new Date().toISOString().slice(0, 10);
    await downloadFile('/items/export/csv', `G4Lite-inventory-${timestamp}.csv`);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES API
// ═══════════════════════════════════════════════════════════════════════════════
// Category management for organizing inventory items into hierarchical groups.
// Supports parent-child relationships for nested categorization.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Categories API singleton object.
 * 
 * @description
 * Provides methods for managing inventory categories including:
 * - Flat and hierarchical category listings
 * - Parent-child relationship structures
 * - Category CRUD operations (admin-only for mutations)
 * 
 * Categories support a two-level hierarchy:
 * - Parent categories (top-level)
 * - Child categories (nested under parents)
 * 
 * @exports categoriesApi
 */
export const categoriesApi = {

  /**
   * Retrieves a flat list of all categories with item counts.
   * 
   * @async
   * @function list
   * @returns {Promise<CategoryResponse[]>} Array of all categories (parents and children)
   * 
   * @description
   * Fetches all categories in a flat array format, including both
   * parent and child categories. Each category includes a count of
   * items assigned to it.
   * 
   * **CategoryResponse Fields:**
   * - `id`: Unique category identifier
   * - `name`: Display name
   * - `code`: Category code prefix for item_code generation
   * - `description`: Category description
   * - `parent_id`: Parent category ID (null for top-level)
   * - `item_count`: Number of items in this category
   * - `is_active`: Soft-delete status
   * 
   * **Use Cases:**
   * - Dropdown selectors for item forms
   * - Category management listings
   * - Filter options
   * 
   * @example
   * const categories = await categoriesApi.list();
   * const parentCategories = categories.filter(c => c.parent_id === null);
   */
  list: async (): Promise<CategoryResponse[]> => {
    const { data } = await client.get<CategoryResponse[]>('/categories');
    return data;
  },

  /**
   * Retrieves the hierarchical category tree structure.
   * 
   * @async
   * @function getTree
   * @returns {Promise<CategoryTreeNode[]>} Array of parent categories with nested children
   * 
   * @description
   * Fetches categories in a tree structure with parent categories
   * containing their children in a nested array. Optimized for
   * rendering hierarchical navigation components.
   * 
   * **Tree Structure:**
   * ```typescript
   * [
   *   {
   *     id: 1,
   *     name: 'Communications',
   *     children: [
   *       { id: 5, name: 'Radios', children: [] },
   *       { id: 6, name: 'Antennas', children: [] }
   *     ]
   *   },
   *   // ... more parent categories
   * ]
   * ```
   * 
   * **Use Cases:**
   * - Sidebar category filter tree
   * - Category management with drag-drop
   * - Hierarchical breadcrumb navigation
   * 
   * @example
   * const tree = await categoriesApi.getTree();
   * // Render nested category menu
   * tree.forEach(parent => {
   *   console.log(parent.name);
   *   parent.children.forEach(child => {
   *     console.log(`  - ${child.name}`);
   *   });
   * });
   */
  getTree: async (): Promise<CategoryTreeNode[]> => {
    const { data } = await client.get<CategoryTreeNode[]>('/categories/tree');
    return data;
  },

  /**
   * Retrieves a single category by ID.
   * 
   * @async
   * @function get
   * @param {number} id - The unique identifier of the category
   * @returns {Promise<CategoryResponse>} Full category detail
   * 
   * @description
   * Fetches complete details for a specific category, including
   * item count and parent relationship information.
   * 
   * @throws {AxiosError} 404 - Category not found
   * 
   * @example
   * const category = await categoriesApi.get(5);
   * console.log(`${category.name}: ${category.item_count} items`);
   */
  get: async (id: number): Promise<CategoryResponse> => {
    const { data } = await client.get<CategoryResponse>(`/categories/${id}`);
    return data;
  },

  /**
   * Creates a new category.
   * 
   * @async
   * @function create
   * @param {CreateCategoryRequest} payload - Category creation data
   * @returns {Promise<CategoryResponse>} The newly created category
   * 
   * @description
   * Creates a new category in the system. Set `parent_id` to create
   * a subcategory under an existing parent.
   * 
   * **Required Fields:**
   * - `name`: Display name for the category
   * - `code`: Code prefix for item_code generation (e.g., 'RAD' for radios)
   * 
   * **Optional Fields:**
   * - `description`: Category description
   * - `parent_id`: Parent category ID (null for top-level category)
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 422 - Validation error (duplicate code, missing fields)
   * 
   * @example
   * // Create a parent category
   * const parent = await categoriesApi.create({
   *   name: 'Communications',
   *   code: 'COM',
   *   description: 'Communication equipment and accessories'
   * });
   * 
   * @example
   * // Create a subcategory
   * const child = await categoriesApi.create({
   *   name: 'Tactical Radios',
   *   code: 'RAD',
   *   parent_id: parent.id,
   *   description: 'Handheld and manpack radios'
   * });
   */
  create: async (payload: CreateCategoryRequest): Promise<CategoryResponse> => {
    const { data } = await client.post<CategoryResponse>('/categories', payload);
    return data;
  },

  /**
   * Updates an existing category.
   * 
   * @async
   * @function update
   * @param {number} id - The ID of the category to update
   * @param {UpdateCategoryRequest} payload - Fields to update (partial update supported)
   * @returns {Promise<CategoryResponse>} The updated category
   * 
   * @description
   * Modifies an existing category's attributes. Supports partial updates —
   * only include the fields that need to change.
   * 
   * **Note:** Changing a category's `code` will NOT update existing item
   * codes — only new items will use the updated code.
   * 
   * **Changeable Fields:**
   * - `name`: Display name
   * - `code`: Code prefix (affects new items only)
   * - `description`: Category description
   * - `parent_id`: Move category to different parent
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Category not found
   * @throws {AxiosError} 422 - Validation error
   * 
   * @example
   * const updated = await categoriesApi.update(5, {
   *   name: 'Tactical Communications',
   *   description: 'Updated description for tactical comms'
   * });
   */
  update: async (id: number, payload: UpdateCategoryRequest): Promise<CategoryResponse> => {
    const { data } = await client.put<CategoryResponse>(`/categories/${id}`, payload);
    return data;
  },

  /**
   * Soft-deletes a category.
   * 
   * @async
   * @function delete
   * @param {number} id - The ID of the category to delete
   * @returns {Promise<MessageResponse>} Confirmation message
   * 
   * @description
   * Performs a soft-delete by setting `is_active = false`. The category
   * will no longer appear in listings or be selectable for new items.
   * 
   * **Item Handling:**
   * Items already assigned to this category are NOT affected —
   * they retain their category assignment. However, no new items
   * can be assigned to a deleted category.
   * 
   * **Child Categories:**
   * If deleting a parent category, consider reassigning or deleting
   * child categories first to maintain data organization.
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 404 - Category not found
   * 
   * @example
   * await categoriesApi.delete(5);
   * toast.success('Category archived');
   */
  delete: async (id: number): Promise<MessageResponse> => {
    const { data } = await client.delete<MessageResponse>(`/categories/${id}`);
    return data;
  },
};