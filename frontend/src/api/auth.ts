/**
 * @fileoverview Authentication API Module for G4Lite Application
 * 
 * This module provides a comprehensive API layer for all authentication-related
 * operations within the G4Lite inventory management system. It encapsulates
 * HTTP requests to the backend authentication endpoints and provides type-safe
 * interfaces for frontend consumption.
 * 
 * @module api/auth
 * @version 1.0.0
 * 
 * @description
 * The Auth API handles the following core functionalities:
 * 
 * **Authentication Flow:**
 * - User login with credential validation
 * - JWT token refresh for session persistence
 * - Secure logout with server-side session invalidation
 * 
 * **User Management:**
 * - Current user profile retrieval
 * - Session metadata and activity tracking
 * - Profile updates for personal information
 * 
 * **Security Features:**
 * - Password change with complexity validation
 * - Administrative password reset capabilities
 * - Account unlock for locked users (admin only)
 * 
 * **Notification System:**
 * - Retrieve user notification preferences
 * - Update notification category subscriptions
 * 
 * @example
 * // Import and use the auth API
 * import { authApi } from './api/auth';
 * 
 * // Authenticate a user
 * const response = await authApi.login({ username: 'user', password: 'pass' });
 * 
 * // Retrieve current user profile
 * const user = await authApi.getMe();
 * 
 * @see {@link ../types/index.ts} for type definitions
 * @see {@link ./client.ts} for HTTP client configuration
 * 
 * Backend Endpoint Mapping:
 * - POST   /api/auth/login                    → login()
 * - POST   /api/auth/refresh                  → refresh()
 * - POST   /api/auth/logout                   → logout()
 * - GET    /api/auth/me                       → getMe()
 * - GET    /api/auth/sessions                 → getSessions()
 * - POST   /api/auth/change-password          → changePassword()
 * - POST   /api/auth/reset-password/{id}      → resetPassword()
 * - POST   /api/auth/unlock/{id}              → unlockAccount()
 * - PUT    /api/auth/profile                  → updateProfile()
 * - GET    /api/auth/notification-preferences → getNotificationPreferences()
 * - PUT    /api/auth/notification-preferences → updateNotificationPreferences()
 * 
 * Total: 11 endpoints
 */

import client from './client';
import type {
  TokenResponse,
  UserResponse,
  ChangePasswordRequest,
  UpdateProfileRequest,
  NotificationPreferences,
  SessionInfo,
  MessageResponse,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════
// These interfaces are specific to the authentication module and not shared
// across other API modules, hence defined locally rather than in global types.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Payload structure for user login requests.
 * 
 * @interface LoginPayload
 * @description Contains the credentials required for user authentication.
 * The username can be either the user's username or email address,
 * depending on backend configuration.
 * 
 * @property {string} username - The user's unique identifier (username or email)
 * @property {string} password - The user's plaintext password (transmitted over HTTPS)
 * 
 * @example
 * const credentials: LoginPayload = {
 *   username: 'john.doe',
 *   password: 'SecureP@ssw0rd!'
 * };
 */
interface LoginPayload {
  username: string;
  password: string;
}

/**
 * Payload structure for administrative password reset operations.
 * 
 * @interface ResetPasswordPayload
 * @description Used by administrators to forcibly reset a user's password.
 * Unlike self-service password change, this does not require the current password.
 * 
 * @property {string} new_password - The new password to set for the target user.
 *                                   Must meet the system's password complexity requirements.
 * 
 * @example
 * const resetPayload: ResetPasswordPayload = {
 *   new_password: 'TemporaryP@ss123!'
 * };
 */
interface ResetPasswordPayload {
  new_password: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION API OBJECT
// ═══════════════════════════════════════════════════════════════════════════════
// Exports a singleton object containing all authentication-related API methods.
// All methods are async and return Promises that resolve to typed responses.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Authentication API singleton object.
 * 
 * @description
 * Provides a unified interface for all authentication operations.
 * All methods utilize the configured Axios client instance which handles:
 * - Base URL configuration
 * - Request/response interceptors
 * - Automatic token attachment
 * - Error handling and retry logic
 * 
 * @exports authApi
 */
export const authApi = {

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Core authentication flow: login, token refresh, and logout operations.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Authenticates a user with username and password credentials.
   * 
   * @async
   * @function login
   * @param {LoginPayload} payload - Object containing username and password
   * @returns {Promise<TokenResponse>} JWT access token and complete user object
   * 
   * @description
   * Initiates the authentication flow by validating user credentials against
   * the backend. On successful authentication, returns a JWT token that should
   * be stored (typically in localStorage) for subsequent authenticated requests.
   * 
   * **Backend Processing:**
   * - Validates credentials against stored hashed password
   * - Tracks failed login attempts with progressive lockout escalation
   * - Records login metadata: timestamp, IP address, user agent
   * - Increments the user's total login count
   * - Generates and returns a signed JWT token
   * 
   * **Important Response Fields:**
   * - `access_token`: JWT for Authorization header
   * - `user.must_change_password`: If true, redirect to password change immediately
   * - `user.is_locked`: Account lockout status
   * 
   * @throws {AxiosError} 401 - Invalid credentials
   * @throws {AxiosError} 403 - Account locked due to too many failed attempts
   * @throws {AxiosError} 422 - Validation error (missing/invalid fields)
   * 
   * @example
   * try {
   *   const response = await authApi.login({
   *     username: 'john.doe',
   *     password: 'MySecurePassword123!'
   *   });
   *   localStorage.setItem('token', response.access_token);
   *   if (response.user.must_change_password) {
   *     navigate('/change-password');
   *   }
   * } catch (error) {
   *   handleAuthError(error);
   * }
   */
  login: async (payload: LoginPayload): Promise<TokenResponse> => {
    const { data } = await client.post<TokenResponse>('/auth/login', payload);
    return data;
  },

  /**
   * Refreshes the current JWT token to extend the session.
   * 
   * @async
   * @function refresh
   * @returns {Promise<TokenResponse>} New JWT access token and updated user object
   * 
   * @description
   * Requests a new JWT token using the current valid token. This endpoint
   * is primarily called automatically by the HTTP client interceptor when
   * a 401 response is detected, enabling seamless session renewal without
   * requiring the user to re-authenticate.
   * 
   * **Automatic Invocation:**
   * The client interceptor handles token refresh transparently:
   * 1. Original request receives 401 Unauthorized
   * 2. Interceptor calls refresh endpoint
   * 3. New token is stored and original request is retried
   * 
   * **Manual Use Cases:**
   * - Preemptive refresh before token expiration
   * - Forcing user data refresh after profile changes elsewhere
   * 
   * @throws {AxiosError} 401 - Current token is invalid or expired beyond refresh window
   * 
   * @example
   * // Manual refresh (rarely needed)
   * const newTokenData = await authApi.refresh();
   * localStorage.setItem('token', newTokenData.access_token);
   */
  refresh: async (): Promise<TokenResponse> => {
    const { data } = await client.post<TokenResponse>('/auth/refresh');
    return data;
  },

  /**
   * Terminates the current user session on the server.
   * 
   * @async
   * @function logout
   * @returns {Promise<MessageResponse>} Confirmation message of successful logout
   * 
   * @description
   * Performs server-side session termination including:
   * - Invalidating the current JWT token (if using token blacklisting)
   * - Clearing server-side session tracking data
   * - Updating last activity timestamp
   * 
   * **Client-Side Cleanup:**
   * The client application should also perform local cleanup:
   * - Remove token from localStorage/sessionStorage
   * - Clear auth store state
   * - Redirect to login page
   * 
   * @example
   * const handleLogout = async () => {
   *   await authApi.logout();
   *   localStorage.removeItem('token');
   *   authStore.clearUser();
   *   navigate('/login');
   * };
   */
  logout: async (): Promise<MessageResponse> => {
    const { data } = await client.post<MessageResponse>('/auth/logout');
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CURRENT USER METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for retrieving information about the currently authenticated user.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves the complete profile of the currently authenticated user.
   * 
   * @async
   * @function getMe
   * @returns {Promise<UserResponse>} Full user profile with all associated data
   * 
   * @description
   * Fetches comprehensive user information for the authenticated user.
   * This endpoint is typically called during application initialization
   * to validate the stored JWT and populate the client-side auth store.
   * 
   * **Response Includes:**
   * - Basic profile: id, username, email, full_name
   * - Role and permissions: role, is_active
   * - Security state: must_change_password, is_locked, locked_until
   * - Preferences: timezone, notification settings
   * - Metadata: created_at, last_login_at
   * 
   * **Common Use Cases:**
   * - App mount: Validate token and hydrate auth store
   * - After profile update: Refresh local user state
   * - Permission checks: Verify user role before protected actions
   * 
   * @throws {AxiosError} 401 - Token invalid or expired
   * 
   * @example
   * // On application mount
   * useEffect(() => {
   *   const initAuth = async () => {
   *     if (localStorage.getItem('token')) {
   *       const user = await authApi.getMe();
   *       authStore.setUser(user);
   *     }
   *   };
   *   initAuth();
   * }, []);
   */
  getMe: async (): Promise<UserResponse> => {
    const { data } = await client.get<UserResponse>('/auth/me');
    return data;
  },

  /**
   * Retrieves session activity metadata for the current user.
   * 
   * @async
   * @function getSessions
   * @returns {Promise<SessionInfo>} Session metadata and activity information
   * 
   * @description
   * Returns detailed session tracking information useful for security
   * monitoring and user activity dashboards.
   * 
   * **Returned Metadata:**
   * - `last_login_at`: Timestamp of most recent successful login
   * - `last_login_ip`: IP address from which the user last logged in
   * - `login_count`: Total number of successful logins for this account
   * - `last_active_at`: Most recent API activity timestamp
   * 
   * **Use Cases:**
   * - Security dashboard: Display login history
   * - Account settings: Show "Last active" information
   * - Anomaly detection: Identify unusual login patterns
   * 
   * @example
   * const sessionInfo = await authApi.getSessions();
   * console.log(`Last login: ${sessionInfo.last_login_at}`);
   * console.log(`From IP: ${sessionInfo.last_login_ip}`);
   */
  getSessions: async (): Promise<SessionInfo> => {
    const { data } = await client.get<SessionInfo>('/auth/sessions');
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSWORD MANAGEMENT METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Self-service and administrative password management operations.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Changes the password for the currently authenticated user.
   * 
   * @async
   * @function changePassword
   * @param {ChangePasswordRequest} payload - Current password, new password, and confirmation
   * @returns {Promise<MessageResponse>} Success confirmation message
   * 
   * @description
   * Self-service password change that requires knowledge of the current password.
   * Implements comprehensive server-side validation to ensure password security.
   * 
   * **Backend Validation Rules:**
   * - `current_password`: Must match the user's existing password
   * - `new_password`: Must meet complexity requirements:
   *   - Minimum length (typically 8-12 characters)
   *   - At least one uppercase letter (A-Z)
   *   - At least one lowercase letter (a-z)
   *   - At least one digit (0-9)
   *   - At least one special character (!@#$%^&*)
   *   - Cannot match common password patterns
   *   - Cannot be the same as current password
   * - `confirm_password`: Must exactly match new_password
   * 
   * **Post-Change Behavior:**
   * - Clears `must_change_password` flag if set
   * - May invalidate other active sessions (configurable)
   * 
   * @throws {AxiosError} 400 - Current password incorrect
   * @throws {AxiosError} 422 - New password fails complexity requirements
   * 
   * @example
   * await authApi.changePassword({
   *   current_password: 'OldPassword123!',
   *   new_password: 'NewSecureP@ss456!',
   *   confirm_password: 'NewSecureP@ss456!'
   * });
   */
  changePassword: async (payload: ChangePasswordRequest): Promise<MessageResponse> => {
    const { data } = await client.post<MessageResponse>('/auth/change-password', payload);
    return data;
  },

  /**
   * Administratively resets a user's password without requiring their current password.
   * 
   * @async
   * @function resetPassword
   * @param {number} userId - The ID of the user whose password will be reset
   * @param {string} newPassword - The new password to set for the user
   * @returns {Promise<MessageResponse>} Success confirmation message
   * 
   * @description
   * Administrative function allowing privileged users (admins) to force-reset
   * another user's password. Used for:
   * - Account recovery when user forgets password
   * - Security response to compromised accounts
   * - Initial password setup for new accounts
   * 
   * **Post-Reset Behavior:**
   * - Sets `must_change_password = true` on target user
   * - User will be forced to change password on next login
   * - Optionally invalidates all existing sessions for the user
   * 
   * **Authorization:**
   * Requires admin role. Attempting without proper authorization
   * returns 403 Forbidden.
   * 
   * @throws {AxiosError} 403 - Insufficient permissions (non-admin)
   * @throws {AxiosError} 404 - User with specified ID not found
   * @throws {AxiosError} 422 - New password fails complexity requirements
   * 
   * @example
   * // Admin resetting a user's password
   * await authApi.resetPassword(42, 'TemporaryP@ss123!');
   * // User 42 must now change password on next login
   */
  resetPassword: async (userId: number, newPassword: string): Promise<MessageResponse> => {
    const payload: ResetPasswordPayload = { new_password: newPassword };
    const { data } = await client.post<MessageResponse>(
      `/auth/reset-password/${userId}`,
      payload,
    );
    return data;
  },

  /**
   * Unlocks a user account that has been locked due to failed login attempts.
   * 
   * @async
   * @function unlockAccount
   * @param {number} userId - The ID of the locked user account to unlock
   * @returns {Promise<MessageResponse>} Success confirmation message
   * 
   * @description
   * Administrative function to restore access to accounts locked by the
   * progressive lockout security feature. Lockouts occur after multiple
   * consecutive failed login attempts.
   * 
   * **Unlock Actions:**
   * - Resets `failed_login_count` to 0
   * - Clears `locked_until` timestamp
   * - Restores normal login capability immediately
   * 
   * **Lockout Escalation (typical configuration):**
   * - 3 failures: 5-minute lockout
   * - 5 failures: 15-minute lockout
   * - 10 failures: 1-hour lockout
   * - 15+ failures: Indefinite lockout (admin unlock required)
   * 
   * **Authorization:**
   * Requires admin role. Non-admins receive 403 Forbidden.
   * 
   * @throws {AxiosError} 403 - Insufficient permissions (non-admin)
   * @throws {AxiosError} 404 - User with specified ID not found
   * 
   * @example
   * // Admin unlocking a user's account
   * await authApi.unlockAccount(42);
   * // User 42 can now attempt login again
   */
  unlockAccount: async (userId: number): Promise<MessageResponse> => {
    const { data } = await client.post<MessageResponse>(`/auth/unlock/${userId}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE MANAGEMENT METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for users to manage their own profile information.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Updates the profile information for the currently authenticated user.
   * 
   * @async
   * @function updateProfile
   * @param {UpdateProfileRequest} payload - Object containing fields to update
   * @returns {Promise<UserResponse>} Updated complete user profile
   * 
   * @description
   * Allows users to modify their own non-sensitive profile fields.
   * Returns the complete updated user object for immediate state refresh.
   * 
   * **Editable Fields:**
   * - `full_name`: User's display name
   * - `rank`: Military/organizational rank designation
   * - `service_number`: Service identification number
   * - `unit`: Organizational unit assignment
   * - `timezone`: User's preferred timezone for date/time display
   * 
   * **Restricted Fields (admin-only changes):**
   * - `username`: Cannot self-modify
   * - `email`: Cannot self-modify
   * - `role`: Cannot self-modify
   * - `is_active`: Cannot self-modify
   * 
   * **Partial Updates:**
   * Only include fields that need to change. Omitted fields retain
   * their current values.
   * 
   * @throws {AxiosError} 422 - Validation error on provided fields
   * 
   * @example
   * const updatedUser = await authApi.updateProfile({
   *   full_name: 'John D. Smith',
   *   rank: 'Captain',
   *   timezone: 'America/New_York'
   * });
   */
  updateProfile: async (payload: UpdateProfileRequest): Promise<UserResponse> => {
    const { data } = await client.put<UserResponse>('/auth/profile', payload);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATION PREFERENCES METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  // Methods for managing user notification subscription preferences.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves the notification preferences for the currently authenticated user.
   * 
   * @async
   * @function getNotificationPreferences
   * @returns {Promise<NotificationPreferences>} Object containing all notification boolean flags
   * 
   * @description
   * Fetches the user's current notification subscription settings.
   * These preferences control which categories of system notifications
   * the user will receive.
   * 
   * **Available Notification Categories:**
   * - `notify_signout`: Equipment sign-out events
   * - `notify_return`: Equipment return confirmations
   * - `notify_overdue`: Overdue item alerts and reminders
   * - `notify_resupply`: Resupply request updates
   * - `notify_low_stock`: Low inventory threshold alerts
   * - `notify_system`: General system announcements and maintenance notices
   * 
   * **Default Behavior:**
   * New users typically have all notifications enabled by default.
   * Users can selectively disable categories based on their role
   * and information needs.
   * 
   * @example
   * const prefs = await authApi.getNotificationPreferences();
   * console.log(`Overdue alerts enabled: ${prefs.notify_overdue}`);
   */
  getNotificationPreferences: async (): Promise<NotificationPreferences> => {
    const { data } = await client.get<NotificationPreferences>(
      '/auth/notification-preferences',
    );
    return data;
  },

  /**
   * Updates notification preferences for the currently authenticated user.
   * 
   * @async
   * @function updateNotificationPreferences
   * @param {Partial<NotificationPreferences>} payload - Preference flags to update
   * @returns {Promise<NotificationPreferences>} Complete updated preferences object
   * 
   * @description
   * Modifies the user's notification subscription settings. Supports
   * partial updates — only include the preferences you want to change.
   * Returns the complete updated preferences for state synchronization.
   * 
   * **Partial Update Example:**
   * To disable only overdue notifications while keeping others unchanged,
   * send only `{ notify_overdue: false }`.
   * 
   * **Notification Delivery:**
   * Preferences affect:
   * - In-app notification bell/drawer
   * - Email notifications (if configured)
   * - Push notifications (if mobile app enabled)
   * 
   * @example
   * // Disable low stock and system notifications
   * const updated = await authApi.updateNotificationPreferences({
   *   notify_low_stock: false,
   *   notify_system: false
   * });
   * 
   * @example
   * // Enable all notifications
   * await authApi.updateNotificationPreferences({
   *   notify_signout: true,
   *   notify_return: true,
   *   notify_overdue: true,
   *   notify_resupply: true,
   *   notify_low_stock: true,
   *   notify_system: true
   * });
   */
  updateNotificationPreferences: async (
    payload: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> => {
    const { data } = await client.put<NotificationPreferences>(
      '/auth/notification-preferences',
      payload,
    );
    return data;
  },
};