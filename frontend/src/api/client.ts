/**
 * @fileoverview Centralized HTTP Client Module for G4Lite Application
 * 
 * This module provides the core HTTP infrastructure for all API communications
 * within the G4Lite inventory management system. It encapsulates Axios configuration,
 * authentication handling, error normalization, and specialized helpers for
 * streaming and file operations.
 * 
 * @module api/client
 * @version 1.0.0
 * 
 * @description
 * The API Client serves as the single source of truth for HTTP communications,
 * implementing the following critical functionalities:
 * 
 * **Authentication Management:**
 * - Automatic JWT token injection into request headers
 * - Transparent 401 handling with token refresh
 * - Request queuing during refresh to prevent token stampede
 * - Forced logout on authentication failure
 * 
 * **Request Enhancement:**
 * - Unique X-Request-ID headers for backend log correlation
 * - Configurable timeouts for standard and upload requests
 * - Content-Type headers for JSON and multipart requests
 * 
 * **Error Handling:**
 * - Structured error normalization for consistent UI messaging
 * - HTTP status extraction for conditional behavior
 * - Network and timeout error detection
 * 
 * **Specialized Operations:**
 * - Server-Sent Events (SSE) streaming for AI assistant chat
 * - Binary file downloads with browser save dialog
 * - Multipart file uploads with progress tracking
 * - Polling intervals for real-time data updates
 * 
 * @example
 * // Standard API call using the client
 * import client from './api/client';
 * const { data } = await client.get('/items');
 * 
 * // Using helper functions
 * import { downloadFile, uploadFile, getApiErrorMessage } from './api/client';
 * 
 * @see {@link ../types/index.ts} for type definitions
 * 
 * Architecture Rules:
 * - All API calls MUST go through this client or exported helpers
 * - No component should import axios directly
 * - Token storage uses localStorage with key 'G4Lite_token'
 * - Refresh endpoint: POST /api/auth/refresh
 * - Double 401 (refresh fails) triggers forced logout to /login
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError, TokenResponse } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
// Environment-driven and static configuration values for the HTTP client.
// These values should not be modified at runtime.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base URL for all API requests.
 * Sourced from VITE_API_URL environment variable, defaults to empty string
 * (same-origin requests) if not specified.
 * @constant {string}
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * LocalStorage key for storing the JWT access token.
 * Used by token helper functions for persistence across sessions.
 * @constant {string}
 */
const TOKEN_KEY = 'G4Lite_token';

/**
 * LocalStorage key for storing the refresh token.
 * Used for obtaining new access tokens when the current one expires.
 * @constant {string}
 */
const REFRESH_TOKEN_KEY = 'G4Lite_refresh_token';

/**
 * Default timeout for standard API requests in milliseconds.
 * Requests exceeding this duration will be aborted.
 * @constant {number}
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Extended timeout for file upload operations in milliseconds.
 * Uploads are allowed more time due to variable file sizes and network conditions.
 * @constant {number}
 */
const UPLOAD_TIMEOUT_MS = 120_000;

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
// Functions for reading, writing, and clearing authentication tokens from
// localStorage. These provide a consistent interface for token operations
// throughout the application.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieves the stored JWT access token from localStorage.
 * 
 * @function getStoredToken
 * @returns {string | null} The stored JWT token, or null if not present
 * 
 * @description
 * Used by request interceptors to attach authentication headers and
 * by components to check authentication state.
 * 
 * @example
 * const token = getStoredToken();
 * if (token) {
 *   // User is authenticated
 * }
 */
export const getStoredToken = (): string | null =>
  localStorage.getItem(TOKEN_KEY);

/**
 * Stores a JWT access token in localStorage.
 * 
 * @function setStoredToken
 * @param {string} token - The JWT access token to store
 * @returns {void}
 * 
 * @description
 * Called after successful login or token refresh to persist
 * the new token for subsequent requests.
 * 
 * @example
 * const response = await authApi.login(credentials);
 * setStoredToken(response.access_token);
 */
export const setStoredToken = (token: string): void =>
  localStorage.setItem(TOKEN_KEY, token);

/**
 * Removes all stored authentication tokens from localStorage.
 * 
 * @function removeStoredToken
 * @returns {void}
 * 
 * @description
 * Called during logout or when authentication fails irrecoverably.
 * Clears both access and refresh tokens to fully de-authenticate the user.
 * 
 * @example
 * // During logout
 * removeStoredToken();
 * navigate('/login');
 */
export const removeStoredToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

/**
 * Retrieves the stored refresh token from localStorage.
 * 
 * @function getRefreshToken
 * @returns {string | null} The stored refresh token, or null if not present
 * 
 * @description
 * Used by the token refresh mechanism to obtain new access tokens
 * when the current one expires.
 */
export const getRefreshToken = (): string | null =>
  localStorage.getItem(REFRESH_TOKEN_KEY);

/**
 * Stores a refresh token in localStorage.
 * 
 * @function setRefreshToken
 * @param {string} token - The refresh token to store
 * @returns {void}
 * 
 * @description
 * Called after successful login to persist the refresh token
 * for future access token renewal.
 */
export const setRefreshToken = (token: string): void =>
  localStorage.setItem(REFRESH_TOKEN_KEY, token);

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════
// Generates unique identifiers for each HTTP request to enable correlation
// between frontend requests and backend logs for debugging purposes.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Counter for generating sequential request IDs.
 * Wraps around at 1,000,000 to prevent unbounded growth.
 * @private
 */
let requestCounter = 0;

/**
 * Generates a unique request identifier for log correlation.
 * 
 * @function generateRequestId
 * @returns {string} A unique request ID in format 'g4l-{timestamp}-{counter}'
 * 
 * @description
 * Each request receives a unique ID that is sent via the X-Request-ID header.
 * Backend logs can use this ID to trace specific requests, enabling:
 * - Debugging specific user-reported issues
 * - Correlating frontend actions with backend processing
 * - Performance analysis of individual requests
 * 
 * Format: `g4l-{base36_timestamp}-{base36_counter}`
 * Example: `g4l-lz1abc-0001`
 * 
 * @private
 */
const generateRequestId = (): string => {
  requestCounter = (requestCounter + 1) % 1_000_000;
  const timestamp = Date.now().toString(36);
  const counter = requestCounter.toString(36).padStart(4, '0');
  return `g4l-${timestamp}-${counter}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// AXIOS INSTANCE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
// Creates and configures the central Axios instance used by all API modules.
// This instance includes base configuration that applies to all requests.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-configured Axios instance for all API communications.
 * 
 * @constant {AxiosInstance}
 * 
 * @description
 * Central HTTP client with the following configuration:
 * - Base URL: {API_BASE_URL}/api
 * - Timeout: 30 seconds for standard requests
 * - Content-Type: application/json (default)
 * - Accept: application/json
 * 
 * Request and response interceptors are attached separately to handle
 * authentication token injection and automatic refresh.
 * 
 * @example
 * // GET request
 * const { data } = await client.get('/items');
 * 
 * // POST request with body
 * const { data } = await client.post('/items', { name: 'Widget' });
 * 
 * // Request with custom config
 * const { data } = await client.get('/items', { timeout: 60000 });
 */
const client: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════════
// Intercepts outgoing requests to inject authentication headers and
// request tracking metadata before they are sent to the server.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request interceptor for authentication and tracking.
 * 
 * @description
 * Automatically modifies every outgoing request to include:
 * 
 * 1. **Authorization Header**: If a JWT token exists in localStorage,
 *    attaches it as a Bearer token for authenticated requests.
 * 
 * 2. **X-Request-ID Header**: Generates and attaches a unique identifier
 *    for backend log correlation and debugging.
 * 
 * This interceptor runs synchronously before each request is sent,
 * ensuring consistent authentication across all API calls.
 */
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Inject JWT authorization header from stored token
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Inject unique request ID for backend log correlation
    if (config.headers) {
      config.headers['X-Request-ID'] = generateRequestId();
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE INTERCEPTOR — TOKEN REFRESH WITH REQUEST QUEUING
// ═══════════════════════════════════════════════════════════════════════════════
// Intercepts 401 responses to transparently refresh expired tokens and retry
// failed requests. Implements request queuing to prevent token stampede when
// multiple concurrent requests fail simultaneously.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Token Refresh Flow Documentation
 * 
 * @description
 * When a request receives a 401 Unauthorized response, the following
 * sequence occurs:
 * 
 * 1. **First 401 Detection**: If no refresh is in progress, initiate
 *    token refresh via POST /api/auth/refresh
 * 
 * 2. **Concurrent Request Queuing**: While refreshing, any additional
 *    401 responses cause their requests to be queued rather than
 *    triggering duplicate refresh attempts (prevents token stampede)
 * 
 * 3. **Refresh Success**: New token is stored, all queued requests
 *    are retried with the fresh token
 * 
 * 4. **Refresh Failure**: All queued requests are rejected, tokens
 *    are cleared, and user is redirected to /login
 * 
 * Special Cases:
 * - Login endpoint (401): No refresh attempt (invalid credentials)
 * - Refresh endpoint (401): Immediate logout (token fully expired)
 * - Already retried request (401): No second retry (prevents loops)
 */

/**
 * Flag indicating whether a token refresh is currently in progress.
 * Used to prevent multiple simultaneous refresh attempts.
 * @private
 */
let isRefreshing = false;

/**
 * Queue of pending requests waiting for token refresh to complete.
 * Each entry contains resolve/reject callbacks to resume the request.
 * @private
 */
let refreshSubscribers: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

/**
 * Notifies all queued requests that token refresh succeeded.
 * 
 * @function onRefreshSuccess
 * @param {string} newToken - The newly obtained JWT access token
 * @returns {void}
 * 
 * @description
 * Resolves all pending promises with the new token, allowing
 * queued requests to retry with fresh authentication.
 * 
 * @private
 */
const onRefreshSuccess = (newToken: string): void => {
  refreshSubscribers.forEach(({ resolve }) => resolve(newToken));
  refreshSubscribers = [];
};

/**
 * Notifies all queued requests that token refresh failed.
 * 
 * @function onRefreshFailure
 * @param {unknown} error - The error that caused refresh to fail
 * @returns {void}
 * 
 * @description
 * Rejects all pending promises with the refresh error, causing
 * queued requests to fail with appropriate error handling.
 * 
 * @private
 */
const onRefreshFailure = (error: unknown): void => {
  refreshSubscribers.forEach(({ reject }) => reject(error));
  refreshSubscribers = [];
};

/**
 * Creates a promise that resolves when token refresh completes.
 * 
 * @function waitForRefresh
 * @returns {Promise<string>} Promise that resolves with new token or rejects on failure
 * 
 * @description
 * Used by concurrent 401'd requests to wait for an in-progress
 * refresh operation to complete before retrying.
 * 
 * @private
 */
const waitForRefresh = (): Promise<string> =>
  new Promise((resolve, reject) => {
    refreshSubscribers.push({ resolve, reject });
  });

/**
 * Forces user logout by clearing tokens and redirecting to login page.
 * 
 * @function forceLogout
 * @returns {void}
 * 
 * @description
 * Called when token refresh fails or authentication is irrecoverable.
 * Performs the following cleanup:
 * 1. Removes all stored tokens from localStorage
 * 2. Resets refresh state flags
 * 3. Clears any pending refresh subscribers
 * 4. Redirects to /login (unless already there)
 * 
 * @private
 */
const forceLogout = (): void => {
  removeStoredToken();
  isRefreshing = false;
  refreshSubscribers = [];

  // Only redirect if not already on login page — prevents redirect loops
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

/**
 * Response interceptor for handling 401 errors with automatic token refresh.
 * 
 * @description
 * Intercepts all HTTP responses and implements transparent token renewal:
 * 
 * **Success Path (non-401)**: Passes response through unchanged
 * 
 * **401 Handling**:
 * 1. Skip refresh for login/refresh endpoints (no infinite loops)
 * 2. Mark request as retried to prevent duplicate attempts
 * 3. If refresh already in progress, queue request to wait
 * 4. Otherwise, initiate refresh and retry on success
 * 5. On refresh failure, force logout and redirect
 */
client.interceptors.response.use(
  (response: AxiosResponse) => response,

  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    // Only attempt refresh on 401, and only once per request
    if (error.response?.status !== 401 || originalRequest._retried) {
      return Promise.reject(error);
    }

    // Don't try to refresh if the failing request IS the refresh endpoint
    // This prevents infinite loops when the refresh token itself is expired
    if (originalRequest.url?.includes('/auth/refresh')) {
      forceLogout();
      return Promise.reject(error);
    }

    // Don't try to refresh if the failing request is the login endpoint
    // Login failures are credential issues, not token expiration
    if (originalRequest.url?.includes('/auth/login')) {
      return Promise.reject(error);
    }

    // Mark this request as having attempted retry to prevent loops
    originalRequest._retried = true;

    // If a refresh is already in progress, queue this request to wait
    if (isRefreshing) {
      try {
        const newToken = await waitForRefresh();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return client(originalRequest);
      } catch {
        return Promise.reject(error);
      }
    }

    // Start the refresh process
    isRefreshing = true;

    try {
      // Verify we have a token to refresh with
      const currentToken = getStoredToken();
      if (!currentToken) {
        throw new Error('No token available for refresh');
      }

      // Call the refresh endpoint with the current token
      const refreshResponse = await axios.post<TokenResponse>(
        `${API_BASE_URL}/api/auth/refresh`,
        {},
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );

      // Store the new token
      const { access_token } = refreshResponse.data;
      setStoredToken(access_token);
      isRefreshing = false;

      // Notify all queued requests that refresh succeeded
      onRefreshSuccess(access_token);

      // Retry the original request with the new token
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
      }
      return client(originalRequest);

    } catch (refreshError) {
      // Refresh failed — notify queued requests and force logout
      isRefreshing = false;
      onRefreshFailure(refreshError);
      forceLogout();
      return Promise.reject(refreshError);
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR NORMALIZATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════
// Functions for extracting human-readable error messages from various error
// shapes returned by the backend or generated by network failures.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extracts a human-readable error message from any error type.
 * 
 * @function getApiErrorMessage
 * @param {unknown} error - Any error object (Axios, native Error, or unknown)
 * @returns {string} A user-friendly error message suitable for display
 * 
 * @description
 * Normalizes errors from various sources into consistent, user-friendly strings.
 * Use in TanStack Query `onError` callbacks, form submission catches, and
 * anywhere errors need to be displayed to users.
 * 
 * **Message Extraction Priority:**
 * 1. Backend `detail` string — Standard FastAPI error format: `{ detail: "..." }`
 * 2. Backend validation array — FastAPI validation: `{ detail: [{ msg, loc, type }] }`
 * 3. Backend `message` string — Alternative error format: `{ message: "..." }`
 * 4. Timeout error — Returns friendly timeout message
 * 5. Network error — Returns connection check message
 * 6. HTTP status text — `{status}: {statusText}`
 * 7. Axios error message — Raw error.message
 * 8. Native Error message — error.message
 * 9. Fallback — Generic "unexpected error" message
 * 
 * @example
 * // In a TanStack Query mutation
 * const mutation = useMutation({
 *   mutationFn: createItem,
 *   onError: (error) => {
 *     toast.error(getApiErrorMessage(error));
 *   },
 * });
 * 
 * @example
 * // In a try-catch block
 * try {
 *   await authApi.login(credentials);
 * } catch (error) {
 *   setErrorMessage(getApiErrorMessage(error));
 * }
 */
export const getApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const response = error.response;

    if (response?.data) {
      const data = response.data as Record<string, unknown>;

      // Standard FastAPI error format: { detail: "string" }
      if (typeof data.detail === 'string') {
        return data.detail;
      }

      // FastAPI validation error format: { detail: [{ msg, loc, type }] }
      // Returns first validation error with field name prefixed
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        const firstError = data.detail[0] as { msg?: string; loc?: string[] };
        const field = firstError.loc?.slice(-1)[0] ?? 'field';
        const message = firstError.msg ?? 'validation error';
        return `${field}: ${message}`;
      }

      // Alternative error format: { message: "string" }
      if (typeof data.message === 'string') {
        return data.message;
      }
    }

    // Handle Axios-specific error codes
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out — please try again';
    }

    if (error.code === 'ERR_NETWORK' || !error.response) {
      return 'Network error — please check your connection';
    }

    // Fallback to HTTP status information
    if (response?.statusText) {
      return `${response.status}: ${response.statusText}`;
    }

    return error.message;
  }

  // Handle native JavaScript Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Ultimate fallback for unknown error types
  return 'An unexpected error occurred';
};

/**
 * Extracts the HTTP status code from an error, if available.
 * 
 * @function getApiErrorStatus
 * @param {unknown} error - Any error object
 * @returns {number | null} HTTP status code, or null if not an HTTP error
 * 
 * @description
 * Useful for implementing status-specific UI behavior, such as:
 * - Showing a lockout message on 423 (Locked)
 * - Displaying permission denied on 403 (Forbidden)
 * - Triggering re-authentication on 401 (Unauthorized)
 * 
 * @example
 * const status = getApiErrorStatus(error);
 * if (status === 423) {
 *   showAccountLockedModal();
 * } else if (status === 403) {
 *   showAccessDeniedMessage();
 * }
 */
export const getApiErrorStatus = (error: unknown): number | null => {
  if (axios.isAxiosError(error) && error.response) {
    return error.response.status;
  }
  return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SENT EVENTS (SSE) STREAMING
// ═══════════════════════════════════════════════════════════════════════════════
// Helper function for establishing SSE connections to the AI assistant chat
// endpoint. Uses fetch with ReadableStream instead of EventSource due to
// the need for POST requests with JSON body and custom headers.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Callback interface for SSE stream event handlers.
 * 
 * @interface SSECallbacks
 * @description
 * Defines the event handlers that consumers must provide to process
 * streaming responses from the assistant chat endpoint.
 * 
 * @property {function} onToken - Called for each text token received
 * @property {function} onDone - Called when streaming completes successfully
 * @property {function} onError - Called when an error occurs during streaming
 */
export interface SSECallbacks {
  /** Handler for individual text tokens as they stream in */
  onToken: (token: string) => void;
  
  /** Handler for stream completion, includes token usage statistics */
  onDone: (usage: { prompt_tokens: number; completion_tokens: number }) => void;
  
  /** Handler for stream errors, receives error message string */
  onError: (error: string) => void;
}

/**
 * Opens a Server-Sent Events connection to the AI assistant chat endpoint.
 * 
 * @function streamChat
 * @param {string} message - The user's chat message to send
 * @param {number | null} conversationId - Existing conversation ID, or null for new conversation
 * @param {SSECallbacks} callbacks - Event handlers for stream events
 * @returns {AbortController} Controller to cancel the stream — call `.abort()` to stop
 * 
 * @description
 * Establishes a streaming connection to receive AI-generated responses in real-time.
 * Uses the Fetch API with ReadableStream instead of EventSource because:
 * - EventSource only supports GET requests (chat requires POST)
 * - Need to send JSON body with message and conversation context
 * - Need to attach JWT Authorization header
 * 
 * **Stream Protocol:**
 * The backend sends Server-Sent Events in the format:
 * ```
 * data: { "token": "Hello" }
 * data: { "token": " world" }
 * data: { "done": true, "usage": { "prompt_tokens": 10, "completion_tokens": 5 } }
 * ```
 * 
 * **Cancellation:**
 * The returned AbortController allows stopping the stream mid-response:
 * ```typescript
 * const controller = streamChat(message, null, callbacks);
 * // Later, to cancel:
 * controller.abort();
 * ```
 * 
 * @example
 * const controller = streamChat(
 *   "What items are low on stock?",
 *   conversationId,
 *   {
 *     onToken: (token) => setResponse(prev => prev + token),
 *     onDone: (usage) => console.log('Tokens used:', usage),
 *     onError: (error) => toast.error(error),
 *   }
 * );
 * 
 * // Store controller to allow user cancellation
 * setStreamController(controller);
 */
export const streamChat = (
  message: string,
  conversationId: number | null,
  callbacks: SSECallbacks,
): AbortController => {
  const controller = new AbortController();
  const token = getStoredToken();

  /**
   * Internal async function that manages the streaming connection.
   * Runs immediately and processes the stream until completion or error.
   * @private
   */
  const run = async () => {
    try {
      // Initiate the streaming request
      const response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
        }),
        signal: controller.signal,
      });

      // Handle non-success HTTP responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage =
          (errorData as ApiError | null)?.detail ??
          `HTTP ${response.status}: ${response.statusText}`;
        callbacks.onError(errorMessage);
        return;
      }

      // Verify streaming is supported
      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError('Streaming not supported');
        return;
      }

      // Process the stream chunk by chunk
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          
          // Skip empty lines and non-data lines
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          // Extract JSON payload after 'data: ' prefix
          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

            // Handle token event — individual text chunk
            if ('token' in parsed && typeof parsed.token === 'string') {
              callbacks.onToken(parsed.token);
            }

            // Handle completion event — stream finished successfully
            // Handle completion event — stream finished successfully
            if ('done' in parsed && parsed.done === true) {
              const usage = parsed.usage as {
                prompt_tokens: number;
                completion_tokens: number;
              } | undefined;
              callbacks.onDone(usage ?? { prompt_tokens: 0, completion_tokens: 0 });
            }

            // Handle error event — server-side error during generation
            if ('error' in parsed && typeof parsed.error === 'string') {
              callbacks.onError(parsed.error);
            }
          } catch {
            // Skip malformed JSON lines — resilient to parsing errors
          }
        }
      }
    } catch (err: unknown) {
      // Handle AbortError specifically — this is intentional cancellation, not an error
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Report actual errors to the callback
      callbacks.onError(
        err instanceof Error ? err.message : 'Stream connection failed',
      );
    }
  };

  // Start the streaming operation immediately
  run();
  
  // Return controller for external cancellation
  return controller;
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILE DOWNLOAD HELPER
// ═══════════════════════════════════════════════════════════════════════════════
// Utility function for downloading binary files (CSV, PDF) from the API
// and triggering browser save dialogs.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Downloads a file from the API and triggers a browser save dialog.
 * 
 * @async
 * @function downloadFile
 * @param {string} url - API path relative to /api (e.g., '/items/export/csv')
 * @param {string} filename - Suggested filename for the download (e.g., 'inventory-export.csv')
 * @returns {Promise<void>} Resolves when download is initiated
 * @throws {Error} If the download request fails
 * 
 * @description
 * Fetches a binary file from the API and triggers the browser's native
 * download dialog. Used for:
 * - CSV exports of inventory data
 * - PDF generation of demand forms
 * - Any other file downloads from the API
 * 
 * **Implementation Details:**
 * 1. Fetches the file as a blob with authentication
 * 2. Creates a temporary object URL for the blob
 * 3. Creates and clicks a hidden anchor element to trigger download
 * 4. Cleans up the object URL after a short delay
 * 
 * @example
 * // Download inventory as CSV
 * await downloadFile('/items/export/csv', 'inventory-2024.csv');
 * 
 * @example
 * // Download demand form PDF
 * await downloadFile(`/signouts/${signoutId}/demand-form`, 'demand-form.pdf');
 */
export const downloadFile = async (
  url: string,
  filename: string,
): Promise<void> => {
  const token = getStoredToken();

  // Fetch the file with authentication
  const response = await fetch(`${API_BASE_URL}/api${url}`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // Handle error responses
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      (errorData as ApiError | null)?.detail ??
      `Download failed: HTTP ${response.status}`,
    );
  }

  // Convert response to blob and create object URL
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  // Create temporary anchor element to trigger download
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the object URL after a short delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════
// Utility functions for common request patterns: timeouts, query parameters,
// and request cancellation.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates an AbortController with automatic timeout cancellation.
 * 
 * @function createTimeoutController
 * @param {number} [timeoutMs=REQUEST_TIMEOUT_MS] - Timeout duration in milliseconds
 * @returns {AbortController} Controller that will auto-abort after specified timeout
 * 
 * @description
 * Creates an AbortController that automatically aborts after a specified
 * duration. Useful for implementing stricter timeouts on specific requests
 * that shouldn't wait as long as the default 30-second timeout.
 * 
 * **Use Cases:**
 * - Health check endpoints that should respond quickly
 * - Time-sensitive operations that shouldn't block UI
 * - Requests with known maximum response times
 * 
 * @example
 * // Create a controller with 5-second timeout
 * const controller = createTimeoutController(5000);
 * 
 * const { data } = await client.get('/health', {
 *   signal: controller.signal,
 * });
 */
export const createTimeoutController = (
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): AbortController => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
};

/**
 * Builds URL query string from a filter object, omitting empty values.
 * 
 * @function buildQueryParams
 * @param {Record<string, unknown>} filters - Object containing filter key-value pairs
 * @returns {string} Query string including '?' prefix, or empty string if no valid params
 * 
 * @description
 * Converts a JavaScript object into a URL query string, automatically
 * filtering out undefined, null, and empty string values. Useful for
 * building dynamic query parameters for list/search endpoints.
 * 
 * **Filtering Rules:**
 * - `undefined` values are omitted
 * - `null` values are omitted
 * - Empty strings (`''`) are omitted
 * - All other values are converted to strings
 * 
 * @example
 * // Basic usage
 * const params = buildQueryParams({ page: 1, search: 'widget', category: null });
 * // Returns: '?page=1&search=widget'
 * 
 * @example
 * // Use with API endpoint
 * const filters = { status: 'active', limit: 10 };
 * const { data } = await client.get(`/items${buildQueryParams(filters)}`);
 * // Calls: GET /items?status=active&limit=10
 */
export const buildQueryParams = (
  filters: Record<string, unknown>,
): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    // Only include non-empty values
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILE UPLOAD HELPER
// ═══════════════════════════════════════════════════════════════════════════════
// Utility function for uploading files via multipart form data with
// optional progress tracking.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Uploads a file to the API using multipart form data.
 * 
 * @async
 * @function uploadFile
 * @param {string} url - API path relative to /api (e.g., '/items/import/csv')
 * @param {File} file - The File object to upload
 * @param {string} [fieldName='file'] - Form field name for the file (defaults to 'file')
 * @param {function} [onProgress] - Optional callback for upload progress updates
 * @returns {Promise<AxiosResponse>} The API response
 * 
 * @description
 * Uploads a file using multipart/form-data encoding, which is required
 * for file uploads. Includes:
 * - Extended timeout (120 seconds) for large files
 * - Optional progress callback for UI progress indicators
 * - Automatic Content-Type header handling
 * 
 * **Progress Callback:**
 * The `onProgress` callback receives percentage values (0-100) during upload,
 * enabling UI progress bars or indicators.
 * 
 * @example
 * // Basic file upload
 * const response = await uploadFile('/items/import/csv', csvFile);
 * 
 * @example
 * // Upload with progress tracking
 * await uploadFile(
 *   '/items/import/csv',
 *   csvFile,
 *   'file',
 *   (percent) => setProgress(percent)
 * );
 * 
 * @example
 * // Custom field name
 * await uploadFile('/documents/upload', pdfFile, 'document');
 */
export const uploadFile = async (
  url: string,
  file: File,
  fieldName: string = 'file',
  onProgress?: (percent: number) => void,
): Promise<AxiosResponse> => {
  // Build multipart form data
  const formData = new FormData();
  formData.append(fieldName, file);

  return client.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: UPLOAD_TIMEOUT_MS,
    // Track upload progress and report to callback
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    },
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// POLLING HELPER
// ═══════════════════════════════════════════════════════════════════════════════
// Utility function for creating polling intervals with automatic cleanup.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a polling interval that repeatedly calls an async callback.
 * 
 * @function createPollingInterval
 * @param {function} callback - Async function to call on each poll iteration
 * @param {number} intervalMs - Interval between polls in milliseconds
 * @returns {function} Cleanup function to stop polling
 * 
 * @description
 * Establishes a polling loop that:
 * - Calls the callback immediately on start
 * - Waits for callback completion before scheduling next poll
 * - Silently handles errors (polling continues despite failures)
 * - Returns a cleanup function to stop polling
 * 
 * **Use Cases:**
 * - Polling for new notifications
 * - Checking for unread message counts
 * - Monitoring background job status
 * 
 * **Error Handling:**
 * Errors in the callback are caught and ignored to prevent polling
 * interruption. This is intentional — transient network errors shouldn't
 * stop notification polling. Individual failures are silent.
 * 
 * **Important:**
 * Always call the returned cleanup function when the component unmounts
 * or when polling should stop to prevent memory leaks.
 * 
 * @example
 * // Start polling for unread count every 30 seconds
 * const stopPolling = createPollingInterval(
 *   async () => {
 *     const { data } = await client.get('/notifications/unread-count');
 *     setUnreadCount(data.count);
 *   },
 *   30_000
 * );
 * 
 * // In cleanup (e.g., useEffect return)
 * return () => stopPolling();
 */
export const createPollingInterval = (
  callback: () => Promise<void>,
  intervalMs: number,
): (() => void) => {
  /** Timeout ID for the next scheduled poll */
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  /** Flag indicating whether polling is still active */
  let isActive = true;

  /**
   * Internal polling function that executes callback and schedules next poll.
   * @private
   */
  const poll = async () => {
    // Exit if polling has been stopped
    if (!isActive) return;

    try {
      await callback();
    } catch {
      // Silently fail — polling errors shouldn't interrupt the user
      // Individual polling failures are expected during network issues
    }

    // Schedule next poll if still active
    if (isActive) {
      timeoutId = setTimeout(poll, intervalMs);
    }
  };

  // Start polling immediately (first call is synchronous)
  poll();

  // Return cleanup function to stop polling
  return () => {
    isActive = false;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
// Export the configured Axios instance as the default export for use by
// all API modules in the application.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default export: Pre-configured Axios client instance.
 * 
 * @description
 * Import this client in API modules to make HTTP requests:
 * ```typescript
 * import client from './client';
 * const { data } = await client.get('/items');
 * ```
 * 
 * The client includes:
 * - Base URL configuration
 * - JWT authentication headers
 * - Automatic token refresh on 401
 * - Request ID tracking
 * - Standard timeouts
 */
export default client;