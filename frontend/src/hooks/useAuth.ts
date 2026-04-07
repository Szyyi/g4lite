/**
 * G4Light — useAuth Hook
 * ========================
 *
 * Composes the auth store (Zustand) with API calls (TanStack Query)
 * to provide a single interface for all authentication concerns.
 *
 * Responsibilities:
 *  - Hydration: validates stored JWT on app mount via GET /api/auth/me
 *  - Login: POST /api/auth/login → store token + user → navigate
 *  - Logout: POST /api/auth/logout → clear store → navigate to /login
 *  - Password change: POST /api/auth/change-password
 *  - Profile update: PUT /api/auth/profile → update store
 *  - Role checks: derived from store (isAdmin, canWrite, etc.)
 *
 * Usage:
 *  ```tsx
 *  const { user, isAdmin, login, logout, isLoggingIn } = useAuth();
 *  ```
 *
 * The hydration query runs once on mount. If the token is invalid,
 * the store is cleared and the user sees the login page. If the user
 * has must_change_password = true, the router redirects to /change-password.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api/auth';
import { getApiErrorMessage, getApiErrorStatus } from '../api/client';
import type {
  UserResponse,
  ChangePasswordRequest,
  UpdateProfileRequest,
  NotificationPreferences,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const AUTH_QUERY_KEYS = {
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
  notificationPrefs: ['auth', 'notification-preferences'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export const useAuth = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // ─── Store state ──────────────────────────────────────────────────
  const {
    token,
    user,
    isHydrated,
    isHydrating,
    setAuth,
    setUser,
    updateUser,
    clearAuth,
    setHydrating,
    setHydrated,
    isAuthenticated,
    isAdmin,
    isUser,
    isViewer,
    hasRole,
    canWrite,
    mustChangePassword,
    isLocked,
    displayName,
    initials,
    roleLabel,
  } = useAuthStore();

  // ─── Hydration query ──────────────────────────────────────────────
  // Runs once on mount if a token exists. Validates the JWT by
  // fetching the current user profile. On failure, clears auth.

  const hydrationQuery = useQuery({
    queryKey: AUTH_QUERY_KEYS.me,
    queryFn: async (): Promise<UserResponse> => {
      setHydrating();
      const userData = await authApi.getMe();
      setUser(userData);
      return userData;
    },
    enabled: !!token && !isHydrated,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: {
      onSettled: () => setHydrated(),
    },
  });

  // If there's no token, mark hydration complete immediately so the
  // AppShell doesn't get stuck on the "Establishing session" loader.
  if (!token && !isHydrated) {
    setHydrated();
  }

  // Handle hydration failure — clear auth if token is invalid
  if (hydrationQuery.isError && token && !user) {
    clearAuth();
  }

  // ─── Login mutation ───────────────────────────────────────────────

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      return authApi.login(credentials);
    },
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      queryClient.setQueryData(AUTH_QUERY_KEYS.me, data.user);

      if (data.user.must_change_password) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    },
    onError: (error: unknown) => {
      const status = getApiErrorStatus(error);
      const message = getApiErrorMessage(error);

      if (status === 423) {
        // Account locked
        enqueueSnackbar(message, { variant: 'error', autoHideDuration: 8000 });
      } else if (status === 401) {
        enqueueSnackbar('Invalid username or password', { variant: 'error' });
      } else {
        enqueueSnackbar(message, { variant: 'error' });
      }
    },
  });

  // ─── Logout ───────────────────────────────────────────────────────

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Attempt server-side logout — don't block on failure
      try {
        await authApi.logout();
      } catch {
        // Server logout is best-effort — client-side clear always happens
      }
    },
    onSettled: () => {
      clearAuth();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  // ─── Password change mutation ─────────────────────────────────────

  const changePasswordMutation = useMutation({
    mutationFn: async (payload: ChangePasswordRequest) => {
      return authApi.changePassword(payload);
    },
    onSuccess: () => {
      // Clear the must_change_password flag in store
      updateUser({ must_change_password: false });
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
      enqueueSnackbar('Password changed successfully', { variant: 'success' });
      navigate('/', { replace: true });
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
  });

  // ─── Profile update mutation ──────────────────────────────────────

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdateProfileRequest) => {
      return authApi.updateProfile(payload);
    },
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      queryClient.setQueryData(AUTH_QUERY_KEYS.me, updatedUser);
      enqueueSnackbar('Profile updated', { variant: 'success' });
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
  });

  // ─── Notification preferences mutation ────────────────────────────

  const updateNotificationPrefsMutation = useMutation({
    mutationFn: async (payload: Partial<NotificationPreferences>) => {
      return authApi.updateNotificationPreferences(payload);
    },
    onSuccess: (updatedPrefs) => {
      updateUser(updatedPrefs);
      enqueueSnackbar('Notification preferences updated', { variant: 'success' });
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
  });

  // ─── Return value ─────────────────────────────────────────────────

  return {
    // State
    token,
    user,
    isHydrated,
    isHydrating,

    // Role checks (evaluated, not functions)
    isAuthenticated: isAuthenticated(),
    isAdmin: isAdmin(),
    isUser: isUser(),
    isViewer: isViewer(),
    canWrite: canWrite(),
    mustChangePassword: mustChangePassword(),
    isLocked: isLocked(),

    // Role check function (for dynamic role lists)
    hasRole,

    // Display helpers
    displayName: displayName(),
    initials: initials(),
    roleLabel: roleLabel(),

    // Login
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,

    // Logout
    logout,
    isLoggingOut: logoutMutation.isPending,

    // Password change
    changePassword: changePasswordMutation.mutate,
    isChangingPassword: changePasswordMutation.isPending,

    // Profile update
    updateProfile: updateProfileMutation.mutate,
    isUpdatingProfile: updateProfileMutation.isPending,

    // Notification preferences
    updateNotificationPrefs: updateNotificationPrefsMutation.mutate,
    isUpdatingNotificationPrefs: updateNotificationPrefsMutation.isPending,

    // Refresh user data (e.g. after admin changes your role)
    refreshUser: () => queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me }),
  };
};