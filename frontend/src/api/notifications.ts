/**
 * @fileoverview Notifications API Module for G4Lite Application
 * 
 * This module provides the API layer for the notification system within the
 * G4Lite inventory management application. It handles user-facing notifications,
 * administrative broadcast capabilities, and notification lifecycle management.
 * 
 * @module api/notifications
 * @version 1.0.0
 * 
 * @description
 * The Notifications API provides comprehensive notification management including:
 * 
 * **User Notification Operations:**
 * - Paginated listing with category, priority, type, and read status filters
 * - Unread count aggregation for notification bell badge
 * - Read/unread status management
 * - Critical notification acknowledgement workflow
 * - Individual and bulk dismissal operations
 * 
 * **Administrative Operations:**
 * - System-wide notification visibility
 * - Notification statistics and analytics
 * - Broadcast messaging to users/roles
 * - Expired notification cleanup
 * 
 * **Notification Categories (4):**
 * - `signout`: Equipment sign-out, return, and overdue events
 * - `inventory`: Stock levels and condition changes
 * - `resupply`: Resupply requests and status updates
 * - `system`: Access control, security, and system alerts
 * 
 * **Notification Types (14):**
 * - Signout: signout, return_ok, return_damaged, return_unserviceable, overdue, overdue_escalation
 * - Inventory: low_stock, item_condition_change
 * - Resupply: resupply_request, resupply_status_change
 * - System: access_granted, access_denied, pin_expired, user_account_event, system_alert
 * 
 * **Priority Levels (4):**
 * - `low`: Informational, no action required
 * - `normal`: Standard notifications
 * - `high`: Important, should be addressed soon
 * - `critical`: Requires explicit acknowledgement before dismissal
 * 
 * @example
 * // Import and use the notifications API
 * import { notificationsApi } from './api/notifications';
 * 
 * // Get unread counts for notification bell
 * const counts = await notificationsApi.getUnreadCounts();
 * 
 * // List notifications with filters
 * const notifications = await notificationsApi.list({ 
 *   category: 'signout', 
 *   is_read: false 
 * });
 * 
 * @see {@link ../types/index.ts} for type definitions
 * @see {@link ./client.ts} for HTTP client configuration
 * @see {@link ../hooks/useNotifications.ts} for React hook integration
 * 
 * Backend Endpoint Mapping — User:
 * - GET    /api/notifications              → list()
 * - GET    /api/notifications/unread-counts → getUnreadCounts()
 * - PUT    /api/notifications/{id}/read    → markRead()
 * - PUT    /api/notifications/read-all     → markAllRead()
 * - PUT    /api/notifications/{id}/acknowledge → acknowledge()
 * - PUT    /api/notifications/{id}/dismiss → dismiss()
 * - POST   /api/notifications/bulk-dismiss → bulkDismiss()
 * - GET    /api/notifications/types        → getTypes()
 * - GET    /api/notifications/preferences  → getPreferences()
 * 
 * Backend Endpoint Mapping — Admin:
 * - GET    /api/notifications/admin/all    → adminList()
 * - GET    /api/notifications/admin/stats  → adminGetStats()
 * - POST   /api/notifications/admin/broadcast → adminBroadcast()
 * - DELETE /api/notifications/admin/expired → adminClearExpired()
 * 
 * Total: 13 endpoints
 */

import client from './client';
import { buildQueryParams } from './client';
import type {
  NotificationResponse,
  NotificationBrief,
  UnreadCounts,
  NotificationFilterParams,
  BulkDismissRequest,
  BroadcastRequest,
  NotificationAdminStats,
  NotificationTypeInfo,
  NotificationPreferences,
  PaginatedNotifications,
  MessageResponse,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS API
// ═══════════════════════════════════════════════════════════════════════════════
// Comprehensive notification management including user-facing operations,
// critical notification handling, and administrative broadcast capabilities.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Notifications API singleton object.
 * 
 * @description
 * Provides methods for managing the notification system including:
 * - User notification listing and filtering
 * - Read status and acknowledgement management
 * - Bulk operations for efficiency
 * - Administrative oversight and broadcasting
 * 
 * **Critical Notification Workflow:**
 * Critical priority notifications have special handling:
 * 1. Cannot be marked as read until acknowledged
 * 2. Cannot be dismissed until acknowledged
 * 3. Require explicit user action to clear
 * 4. Create audit trail of acknowledgement
 * 
 * @exports notificationsApi
 */
export const notificationsApi = {

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST & COUNTS METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for retrieving notification lists and aggregated counts.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves a paginated list of notifications for the current user.
   * 
   * @async
   * @function list
   * @param {NotificationFilterParams} [filters={}] - Optional filter and pagination parameters
   * @returns {Promise<PaginatedNotifications>} Paginated response containing NotificationBrief array
   * 
   * @description
   * Fetches the current user's notifications with comprehensive filtering
   * capabilities. Returns abbreviated notification data (NotificationBrief)
   * optimized for list rendering performance.
   * 
   * **Available Filter Parameters:**
   * - `category`: Filter by category ('signout' | 'inventory' | 'resupply' | 'system')
   * - `priority`: Filter by priority ('low' | 'normal' | 'high' | 'critical')
   * - `type`: Filter by specific notification type (e.g., 'overdue', 'low_stock')
   * - `is_read`: Filter by read status (true | false)
   * - `page`: Page number (1-indexed, default: 1)
   * - `page_size`: Items per page (default: 20, max: 100)
   * 
   * **Default Exclusions:**
   * - Dismissed notifications (is_dismissed = true)
   * - Expired notifications (expires_at < now)
   * 
   * **Response Fields (NotificationBrief):**
   * - `id`, `type`, `category`, `priority`
   * - `title`, `body` (may be truncated)
   * - `is_read`, `is_acknowledged`, `is_dismissed`
   * - `created_at`, `expires_at`
   * - `related_entity_type`, `related_entity_id`
   * 
   * @example
   * // Get all unread notifications
   * const unread = await notificationsApi.list({ is_read: false });
   * 
   * @example
   * // Get critical signout notifications
   * const critical = await notificationsApi.list({
   *   category: 'signout',
   *   priority: 'critical'
   * });
   */
  list: async (filters: NotificationFilterParams = {}): Promise<PaginatedNotifications> => {
    const queryString = buildQueryParams(filters as Record<string, unknown>);
    const { data } = await client.get<PaginatedNotifications>(`/notifications${queryString}`);
    return data;
  },

  /**
   * Retrieves aggregated unread notification counts.
   * 
   * @async
   * @function getUnreadCounts
   * @returns {Promise<UnreadCounts>} Object containing count breakdowns
   * 
   * @description
   * Fetches unread notification counts aggregated by category and priority.
   * Primary data source for the notification bell badge and dropdown indicators.
   * 
   * **Response Structure:**
   * ```typescript
   * {
   *   total: number,                    // Total unread count (badge number)
   *   by_category: {
   *     inventory: number,
   *     signout: number,
   *     resupply: number,
   *     system: number
   *   },
   *   by_priority: {
   *     low: number,
   *     normal: number,
   *     high: number,
   *     critical: number
   *   },
   *   critical_unacknowledged: number   // Critical items needing attention
   * }
   * ```
   * 
   * **Polling Behavior:**
   * This endpoint is polled every 30-60 seconds by the useNotifications hook
   * to keep the notification bell updated without requiring page refresh.
   * 
   * **UI Indicators:**
   * - `total`: Displayed in notification bell badge
   * - `critical_unacknowledged`: May trigger distinct visual indicator (pulsing, color)
   * - `by_category`: Used for category tabs in notification dropdown
   * 
   * @example
   * const counts = await notificationsApi.getUnreadCounts();
   * setBadgeCount(counts.total);
   * if (counts.critical_unacknowledged > 0) {
   *   showCriticalAlert();
   * }
   */
  getUnreadCounts: async (): Promise<UnreadCounts> => {
    const { data } = await client.get<UnreadCounts>('/notifications/unread-counts');
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // READ / ACKNOWLEDGE / DISMISS METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for managing notification lifecycle states. Critical notifications
  // have special handling requiring explicit acknowledgement.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Marks a single notification as read.
   * 
   * @async
   * @function markRead
   * @param {number} id - The ID of the notification to mark as read
   * @returns {Promise<NotificationResponse>} The updated notification
   * 
   * @description
   * Sets `is_read = true` and records the `read_at` timestamp.
   * Typically called when a user views or clicks on a notification.
   * 
   * **Critical Notification Behavior:**
   * Critical notifications (priority = 'critical') must be acknowledged
   * before they can be marked as read. Attempting to mark an unacknowledged
   * critical notification as read will result in an error.
   * 
   * **Timestamp Recording:**
   * - `read_at`: Set to current server timestamp on first read
   * - Subsequent calls are idempotent (no error, no timestamp change)
   * 
   * @throws {AxiosError} 400 - Critical notification not yet acknowledged
   * @throws {AxiosError} 404 - Notification not found or not owned by user
   * 
   * @example
   * // Mark notification as read when clicked
   * const handleNotificationClick = async (notificationId: number) => {
   *   await notificationsApi.markRead(notificationId);
   *   // Navigate to related entity or show details
   * };
   */
  markRead: async (id: number): Promise<NotificationResponse> => {
    const { data } = await client.put<NotificationResponse>(`/notifications/${id}/read`);
    return data;
  },

  /**
   * Marks all notifications as read for the current user.
   * 
   * @async
   * @function markAllRead
   * @returns {Promise<MessageResponse>} Confirmation with count of notifications updated
   * 
   * @description
   * Bulk operation to mark all unread notifications as read.
   * Commonly used via a "Mark all as read" button in the notification dropdown.
   * 
   * **Important: Critical Notification Protection**
   * This operation intentionally SKIPS critical unacknowledged notifications.
   * Critical notifications must be individually acknowledged before they
   * can be marked as read. This safety feature prevents important alerts
   * from being silently dismissed in bulk operations.
   * 
   * **Affected Notifications:**
   * - All unread, non-critical notifications
   * - All unread, critical notifications that have been acknowledged
   * 
   * **Skipped Notifications:**
   * - Already read notifications
   * - Critical notifications with is_acknowledged = false
   * 
   * @example
   * // "Mark all read" button handler
   * const handleMarkAllRead = async () => {
   *   const result = await notificationsApi.markAllRead();
   *   toast.success(result.message);
   *   refetchNotifications();
   * };
   */
  markAllRead: async (): Promise<MessageResponse> => {
    const { data } = await client.put<MessageResponse>('/notifications/read-all');
    return data;
  },

  /**
   * Acknowledges a critical notification.
   * 
   * @async
   * @function acknowledge
   * @param {number} id - The ID of the critical notification to acknowledge
   * @returns {Promise<NotificationResponse>} The updated notification
   * 
   * @description
   * Explicitly acknowledges a critical priority notification, creating
   * an audit trail that the user has seen and accepted the alert.
   * 
   * **Critical Notification Workflow:**
   * 1. User receives critical notification (e.g., overdue equipment alert)
   * 2. Notification appears with special styling (red, pulsing, etc.)
   * 3. User clicks "Acknowledge" button
   * 4. This endpoint is called
   * 5. Notification can now be marked as read or dismissed
   * 
   * **Requirements:**
   * - Notification must have priority = 'critical'
   * - Notification must belong to the current user
   * 
   * **Recorded Data:**
   * - `is_acknowledged`: Set to true
   * - `acknowledged_at`: Server timestamp
   * - `acknowledged_by`: User ID (implicit from auth)
   * 
   * **Audit Purpose:**
   * The acknowledgement record proves the user was aware of the critical
   * situation, which is important for compliance and accountability.
   * 
   * @throws {AxiosError} 400 - Notification is not critical priority
   * @throws {AxiosError} 404 - Notification not found or not owned by user
   * 
   * @example
   * // Handle acknowledgement of critical notification
   * const handleAcknowledge = async (notificationId: number) => {
   *   await notificationsApi.acknowledge(notificationId);
   *   toast.info('Critical alert acknowledged');
   *   // Notification can now be dismissed or marked read
   * };
   */
  acknowledge: async (id: number): Promise<NotificationResponse> => {
    const { data } = await client.put<NotificationResponse>(
      `/notifications/${id}/acknowledge`,
    );
    return data;
  },

  /**
   * Dismisses a notification, hiding it from the list.
   * 
   * @async
   * @function dismiss
   * @param {number} id - The ID of the notification to dismiss
   * @returns {Promise<NotificationResponse>} The updated notification
   * 
   * @description
   * Dismisses a notification by setting `is_dismissed = true`. Dismissed
   * notifications are excluded from normal list queries but remain in
   * the database for audit purposes.
   * 
   * **Critical Notification Protection:**
   * Critical notifications with `is_acknowledged = false` cannot be
   * dismissed. They must be acknowledged first. This prevents users
   * from clearing important alerts without explicit confirmation.
   * 
   * **Recorded Data:**
   * - `is_dismissed`: Set to true
   * - `dismissed_at`: Server timestamp
   * 
   * **Recovery:**
   * Dismissed notifications are not permanently deleted and could be
   * restored via admin tools if needed.
   * 
   * @throws {AxiosError} 400 - Critical notification not yet acknowledged
   * @throws {AxiosError} 404 - Notification not found or not owned by user
   * 
   * @example
   * // Dismiss notification with swipe gesture
   * const handleSwipeDismiss = async (notificationId: number) => {
   *   try {
   *     await notificationsApi.dismiss(notificationId);
   *   } catch (error) {
   *     if (getApiErrorMessage(error).includes('acknowledge')) {
   *       toast.warning('Please acknowledge this critical alert first');
   *     }
   *   }
   * };
   */
  dismiss: async (id: number): Promise<NotificationResponse> => {
    const { data } = await client.put<NotificationResponse>(
      `/notifications/${id}/dismiss`,
    );
    return data;
  },

  /**
   * Dismisses multiple notifications in a single request.
   * 
   * @async
   * @function bulkDismiss
   * @param {BulkDismissRequest} payload - Object containing array of notification IDs
   * @returns {Promise<MessageResponse>} Confirmation with count of dismissed notifications
   * 
   * @description
   * Efficiently dismisses multiple notifications in one API call.
   * Useful for clearing notification backlog or implementing
   * "Clear all" functionality.
   * 
   * **Payload Structure:**
   * ```typescript
   * { notification_ids: number[] }  // Maximum 100 IDs per request
   * ```
   * 
   * **Critical Notification Handling:**
   * Critical unacknowledged notifications in the batch are silently
   * skipped — they remain visible and undismissed. No error is thrown
   * for these; the response indicates how many were actually dismissed.
   * 
   * **Batch Limits:**
   * - Maximum 100 notification IDs per request
   * - Exceeding limit returns 400 Bad Request
   * 
   * **Response:**
   * Returns message indicating count of successfully dismissed notifications,
   * which may be less than the request count if critical notifications
   * were skipped.
   * 
   * @throws {AxiosError} 400 - Batch size exceeds 100
   * 
   * @example
   * // Clear all visible notifications
   * const handleClearAll = async (notificationIds: number[]) => {
   *   const result = await notificationsApi.bulkDismiss({
   *     notification_ids: notificationIds
   *   });
   *   toast.success(result.message);
   *   // Note: critical unacknowledged may still remain
   * };
   */
  bulkDismiss: async (payload: BulkDismissRequest): Promise<MessageResponse> => {
    const { data } = await client.post<MessageResponse>(
      '/notifications/bulk-dismiss',
      payload,
    );
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // METADATA METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for retrieving notification system metadata and configuration.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves all notification types with their metadata.
   * 
   * @async
   * @function getTypes
   * @returns {Promise<NotificationTypeInfo[]>} Array of notification type definitions
   * 
   * @description
   * Fetches the complete list of notification types supported by the system,
   * including their categories, display labels, and descriptions.
   * 
   * **NotificationTypeInfo Fields:**
   * - `type`: Machine name (e.g., 'overdue', 'low_stock')
   * - `category`: Parent category ('signout' | 'inventory' | 'resupply' | 'system')
   * - `label`: Human-readable display name
   * - `description`: Detailed explanation of when this notification is triggered
   * - `default_priority`: Default priority level for this type
   * 
   * **Use Cases:**
   * - Notification preferences UI (checkboxes by type)
   * - Filter dropdown population
   * - Notification type icons/styling lookup
   * 
   * @example
   * const types = await notificationsApi.getTypes();
   * const signoutTypes = types.filter(t => t.category === 'signout');
   * // Render preference toggles for each type
   */
  getTypes: async (): Promise<NotificationTypeInfo[]> => {
    const { data } = await client.get<NotificationTypeInfo[]>('/notifications/types');
    return data;
  },

  /**
   * Retrieves the current user's notification preferences.
   * 
   * @async
   * @function getPreferences
   * @returns {Promise<NotificationPreferences>} User's notification subscription settings
   * 
   * @description
   * Fetches the current user's notification preference settings.
   * This is an alias for `authApi.getNotificationPreferences()` provided
   * for convenience when working within the notifications domain.
   * 
   * **Preference Flags:**
   * - `notify_signout`: Receive sign-out event notifications
   * - `notify_return`: Receive return confirmation notifications
   * - `notify_overdue`: Receive overdue item alerts
   * - `notify_resupply`: Receive resupply request updates
   * - `notify_low_stock`: Receive low inventory alerts
   * - `notify_system`: Receive system announcements
   * 
   * **Note:** To update preferences, use `authApi.updateNotificationPreferences()`.
   * 
   * @example
   * const prefs = await notificationsApi.getPreferences();
   * if (!prefs.notify_overdue) {
   *   console.log('User has disabled overdue notifications');
   * }
   */
  getPreferences: async (): Promise<NotificationPreferences> => {
    const { data } = await client.get<NotificationPreferences>(
      '/notifications/preferences',
    );
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Administrative operations for system-wide notification management.
  // All methods in this section require admin role authorization.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves system-wide notification list for administrative purposes.
   * 
   * @async
   * @function adminList
   * @param {NotificationFilterParams} [filters={}] - Optional filter parameters
   * @returns {Promise<PaginatedNotifications>} Paginated notifications across all users
   * 
   * @description
   * Administrative endpoint providing visibility into all notifications
   * across the entire system, including dismissed and expired notifications
   * that are normally hidden from users.
   * 
   * **Additional Visibility:**
   * Unlike the user-facing `list()` method, this endpoint includes:
   * - Notifications for all users (not just current user)
   * - Dismissed notifications (is_dismissed = true)
   * - Expired notifications (expires_at < now)
   * 
   * **Additional Filter Options:**
   * - `user_id`: Filter by specific user
   * - `include_dismissed`: Include dismissed notifications (default: true)
   * - `include_expired`: Include expired notifications (default: true)
   * 
   * **Use Cases:**
   * - Admin notification management dashboard
   * - User support investigation
   * - System notification audit
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * 
   * @example
   * // Get all notifications for a specific user (admin investigation)
   * const userNotifications = await notificationsApi.adminList({
   *   user_id: 42,
   *   include_dismissed: true
   * });
   */
  adminList: async (filters: NotificationFilterParams = {}): Promise<PaginatedNotifications> => {
    const queryString = buildQueryParams(filters as Record<string, unknown>);
    const { data } = await client.get<PaginatedNotifications>(
      `/notifications/admin/all${queryString}`,
    );
    return data;
  },

  /**
   * Retrieves comprehensive notification statistics for administrators.
   * 
   * @async
   * @function adminGetStats
   * @returns {Promise<NotificationAdminStats>} System-wide notification statistics
   * 
   * @description
   * Fetches aggregate statistics about the notification system for
   * administrative dashboards and reporting.
   * 
   * **Returned Statistics:**
   * 
   * *Overall Counts:*
   * - `total_notifications`: Total notifications in system
   * - `unread_count`: Notifications not yet read
   * - `read_count`: Notifications marked as read
   * - `acknowledged_count`: Critical notifications acknowledged
   * - `dismissed_count`: Notifications dismissed by users
   * - `expired_count`: Notifications past expiration date
   * 
   * *Breakdown by Type:*
   * - `by_type`: Record mapping each NotificationType to count
   *   ```typescript
   *   { overdue: 45, low_stock: 23, system_alert: 12, ... }
   *   ```
   * 
   * *Breakdown by Category:*
   * - `by_category`: Record mapping each category to count
   *   ```typescript
   *   { signout: 120, inventory: 45, resupply: 30, system: 15 }
   *   ```
   * 
   * *Breakdown by Priority:*
   * - `by_priority`: Record mapping each priority to count
   *   ```typescript
   *   { low: 50, normal: 100, high: 40, critical: 20 }
   *   ```
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * 
   * @example
   * const stats = await notificationsApi.adminGetStats();
   * console.log(`Critical unacknowledged: ${stats.by_priority.critical}`);
   * console.log(`Ready for cleanup: ${stats.expired_count}`);
   */
  adminGetStats: async (): Promise<NotificationAdminStats> => {
    const { data } = await client.get<NotificationAdminStats>(
      '/notifications/admin/stats',
    );
    return data;
  },

  /**
   * Broadcasts a notification to multiple users.
   * 
   * @async
   * @function adminBroadcast
   * @param {BroadcastRequest} payload - Broadcast message configuration
   * @returns {Promise<MessageResponse>} Confirmation with count of notifications sent
   * 
   * @description
   * Sends a notification to all users or to users with a specific role.
   * Used for system announcements, maintenance notices, and important
   * updates that need to reach multiple users.
   * 
   * **Payload Structure:**
   * ```typescript
   * {
   *   title: string,           // Notification title (required)
   *   body: string,            // Notification body text (required)
   *   priority?: string,       // 'low' | 'normal' | 'high' | 'critical' (default: 'normal')
   *   target_role?: string     // null for all users, or 'admin' | 'user' | 'viewer'
   * }
   * ```
   * 
   * **Targeting Options:**
   * - `target_role: null` — Send to ALL active users
   * - `target_role: 'admin'` — Send only to administrators
   * - `target_role: 'user'` — Send only to standard users
   * - `target_role: 'viewer'` — Send only to view-only users
   * 
   * **Best Practices:**
   * - Use 'critical' priority sparingly (requires user acknowledgement)
   * - Keep body text concise for notification readability
   * - Test with target_role first before broadcasting to all
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * @throws {AxiosError} 422 - Validation error (missing title/body)
   * 
   * @example
   * // Announce scheduled maintenance to all users
   * await notificationsApi.adminBroadcast({
   *   title: 'Scheduled Maintenance',
   *   body: 'System will be unavailable Saturday 2am-4am for upgrades.',
   *   priority: 'high'
   * });
   * 
   * @example
   * // Send critical alert to admins only
   * await notificationsApi.adminBroadcast({
   *   title: 'Security Alert',
   *   body: 'Unusual access pattern detected. Please review audit logs.',
   *   priority: 'critical',
   *   target_role: 'admin'
   * });
   */
  adminBroadcast: async (payload: BroadcastRequest): Promise<MessageResponse> => {
    const { data } = await client.post<MessageResponse>(
      '/notifications/admin/broadcast',
      payload,
    );
    return data;
  },

  /**
   * Permanently removes all expired notifications from the system.
   * 
   * @async
   * @function adminClearExpired
   * @returns {Promise<MessageResponse>} Confirmation with count of deleted notifications
   * 
   * @description
   * Database cleanup operation that permanently deletes notifications
   * where `expires_at < now`. This reduces database size and improves
   * query performance.
   * 
   * **Deletion Criteria:**
   * - Notification has an `expires_at` timestamp
   * - That timestamp is in the past
   * - Owner user and notification state are not considered
   * 
   * **Permanent Deletion:**
   * Unlike dismissal (soft-delete), this operation permanently removes
   * notifications from the database. They cannot be recovered.
   * 
   * **Recommended Schedule:**
   * Consider running this operation:
   * - Weekly during off-peak hours
   * - Monthly at minimum for system hygiene
   * - Via scheduled job or manual admin action
   * 
   * **Authorization:** Requires admin role
   * 
   * @throws {AxiosError} 403 - Insufficient permissions
   * 
   * @example
   * // Manual cleanup via admin dashboard
   * const handleCleanup = async () => {
   *   const result = await notificationsApi.adminClearExpired();
   *   toast.success(result.message); // "Deleted 147 expired notifications"
   * };
   */
  adminClearExpired: async (): Promise<MessageResponse> => {
    const { data } = await client.delete<MessageResponse>(
      '/notifications/admin/expired',
    );
    return data;
  },
};