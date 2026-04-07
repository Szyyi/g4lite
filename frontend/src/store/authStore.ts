/**
 * G4Lite — Auth Store
 * =====================
 *
 * Central authentication state managed by Zustand.
 * Persists token to localStorage via client.ts helpers.
 * User object is NOT persisted — it's hydrated from GET /api/auth/me
 * on every app mount to ensure freshness.
 *
 * Responsibilities:
 *  - Token storage (via client.ts helpers — single source of truth)
 *  - Current user state (role, preferences, lockout, must_change_password)
 *  - Role-based access checks (isAdmin, isUser, isViewer, hasRole)
 *  - Login / logout actions
 *  - Hydration status tracking (for app mount loading state)
 *  - Auth-dependent derived state (display name, initials, etc.)
 *
 * The store does NOT call API endpoints directly — that's handled by
 * useAuth hook which composes this store with TanStack Query mutations.
 *
 * Flow:
 *  1. App mounts → useAuth calls authApi.getMe()
 *  2. Success → setUser(response) populates the store
 *  3. Failure → clearAuth() removes token, redirects to login
 *  4. Login → setAuth(token, user) persists token + populates user
 *  5. Logout → clearAuth() clears everything
 */

import { create } from 'zustand';
import {
  getStoredToken,
  setStoredToken,
  removeStoredToken,
} from '../api/client';
import type { UserResponse, UserRole } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  // Core state
  token: string | null;
  user: UserResponse | null;

  // Hydration tracking — true after the initial /me call resolves or fails
  isHydrated: boolean;

  // Whether the initial /me call is in progress
  isHydrating: boolean;
}

interface AuthActions {
  /**
   * Called after successful login.
   * Persists token to localStorage and sets user in state.
   */
  setAuth: (token: string, user: UserResponse) => void;

  /**
   * Called after successful GET /api/auth/me hydration.
   * Sets user without changing the token (already in localStorage).
   */
  setUser: (user: UserResponse) => void;

  /**
   * Updates specific user fields in state (e.g. after profile update
   * or preference change). Does not call the API.
   */
  updateUser: (partial: Partial<UserResponse>) => void;

  /**
   * Clears all auth state and removes token from localStorage.
   * Does NOT redirect — the caller (useAuth) handles navigation.
   */
  clearAuth: () => void;

  /**
   * Marks hydration as in-progress.
   */
  setHydrating: () => void;

  /**
   * Marks hydration as complete (success or failure).
   */
  setHydrated: () => void;

  // ─── Role Checks ────────────────────────────────────────────────────

  /** True if authenticated (token + user present) */
  isAuthenticated: () => boolean;

  /** True if user.role === 'admin' */
  isAdmin: () => boolean;

  /** True if user.role === 'user' */
  isUser: () => boolean;

  /** True if user.role === 'viewer' */
  isViewer: () => boolean;

  /** True if user has any of the specified roles */
  hasRole: (...roles: UserRole[]) => boolean;

  /** True if user can perform write operations (admin or user, not viewer) */
  canWrite: () => boolean;

  // ─── Derived State ──────────────────────────────────────────────────

  /** True if user must change password before accessing the app */
  mustChangePassword: () => boolean;

  /** True if the user account is currently locked */
  isLocked: () => boolean;

  /** User's display name (full_name or username fallback) */
  displayName: () => string;

  /** User's initials for avatar display (2 chars max) */
  initials: () => string;

  /** User's role label for UI display */
  roleLabel: () => string;
}

type AuthStore = AuthState & AuthActions;

// ─────────────────────────────────────────────────────────────────────────────
// Role labels
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  user: 'Standard User',
  viewer: 'Read-Only',
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>((set, get) => ({

  // ─── Initial State ──────────────────────────────────────────────────
  // Token from localStorage (may be stale — validated by /me on mount).
  // User is null until hydration completes — never read from localStorage
  // to avoid stale role/preference data.

  token: getStoredToken(),
  user: null,
  isHydrated: false,
  isHydrating: false,

  // ─── Actions ────────────────────────────────────────────────────────

  setAuth: (token, user) => {
    setStoredToken(token);
    set({ token, user, isHydrated: true, isHydrating: false });
  },

  setUser: (user) => {
    set({ user, isHydrated: true, isHydrating: false });
  },

  updateUser: (partial) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, ...partial } });
    }
  },

  clearAuth: () => {
    removeStoredToken();
    set({ token: null, user: null, isHydrated: true, isHydrating: false });
  },

  setHydrating: () => {
    set({ isHydrating: true });
  },

  setHydrated: () => {
    set({ isHydrated: true, isHydrating: false });
  },

  // ─── Role Checks ────────────────────────────────────────────────────

  isAuthenticated: () => {
    const { token, user } = get();
    return token !== null && user !== null;
  },

  isAdmin: () => get().user?.role === 'admin',

  isUser: () => get().user?.role === 'user',

  isViewer: () => get().user?.role === 'viewer',

  hasRole: (...roles) => {
    const userRole = get().user?.role;
    return userRole !== undefined && roles.includes(userRole);
  },

  canWrite: () => {
    const role = get().user?.role;
    return role === 'admin' || role === 'user';
  },

  // ─── Derived State ──────────────────────────────────────────────────

  mustChangePassword: () => get().user?.must_change_password === true,

  isLocked: () => get().user?.is_locked === true,

  displayName: () => {
    const user = get().user;
    if (!user) return '';
    return user.full_name || user.username;
  },

  initials: () => {
    const user = get().user;
    if (!user) return '';

    const name = user.full_name || user.username;
    const parts = name.trim().split(/\s+/);

    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  },

  roleLabel: () => {
    const role = get().user?.role;
    return role ? ROLE_LABELS[role] : '';
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Selector hooks — for components that only need a slice of auth state
// Prevents unnecessary re-renders when unrelated auth state changes.
// ─────────────────────────────────────────────────────────────────────────────

/** Current user object (or null) */
export const useCurrentUser = () => useAuthStore((s) => s.user);

/** Whether initial hydration is complete */
export const useAuthHydrated = () => useAuthStore((s) => s.isHydrated);

/** Whether hydration is in progress */
export const useAuthHydrating = () => useAuthStore((s) => s.isHydrating);

/** Current user's role (or undefined if not authenticated) */
export const useUserRole = () => useAuthStore((s) => s.user?.role);

/** Whether current user is admin */
export const useIsAdmin = () => useAuthStore((s) => s.user?.role === 'admin');

/** Whether current user can perform write operations */
export const useCanWrite = () => {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'admin' || role === 'user';
};

/** Whether current user must change password */
export const useMustChangePassword = () =>
  useAuthStore((s) => s.user?.must_change_password === true);

/** User display name */
export const useDisplayName = () =>
  useAuthStore((s) => s.user?.full_name || s.user?.username || '');

/** User initials for avatar */
export const useUserInitials = () =>
  useAuthStore((s) => {
    const name = s.user?.full_name || s.user?.username || '';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  });