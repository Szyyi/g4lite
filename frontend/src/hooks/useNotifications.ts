/**
 * G4Lite — useNotifications Hook
 * =================================
 *
 * Comprehensive notification management composing TanStack Query with
 * the notifications API. Provides:
 *
 *  - Unread counts polling (dedicated lightweight endpoint, not client-side filtering)
 *  - Paginated notification list with category/priority/type filters
 *  - Read / acknowledge / dismiss actions with optimistic cache updates
 *  - Mark all read (with critical notification protection awareness)
 *  - Bulk dismiss
 *  - Admin broadcast
 *  - Critical notification detection
 *
 * Architecture:
 *  - Unread counts are polled every 30s via a lightweight GET endpoint
 *  - The full notification list is fetched on-demand (when popover opens)
 *  - Mutations optimistically update the cache for instant UI feedback
 *  - All mutations invalidate both counts and list queries on settlement
 *
 * Usage:
 *  ```tsx
 *  // Bell badge — only subscribes to counts (lightweight)
 *  const { unreadCounts } = useNotificationCounts();
 *
 *  // Popover / full page — fetches the list
 *  const { notifications, markRead, acknowledge } = useNotificationList();
 *
 *  // Combined — when you need everything
 *  const { unreadCounts, notifications, markRead, ... } = useNotifications();
 *  ```
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { notificationsApi } from '../api/notifications';
import { getApiErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import type {
  NotificationFilterParams,
  NotificationBrief,
  UnreadCounts,
  BroadcastRequest,
  PaginatedNotifications,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const NOTIFICATION_QUERY_KEYS = {
  all: ['notifications'] as const,
  counts: ['notifications', 'counts'] as const,
  list: (filters: NotificationFilterParams) =>
    ['notifications', 'list', filters] as const,
  types: ['notifications', 'types'] as const,
  adminStats: ['notifications', 'admin', 'stats'] as const,
  adminList: (filters: NotificationFilterParams) =>
    ['notifications', 'admin', 'list', filters] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Polling interval
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ─────────────────────────────────────────────────────────────────────────────
// Default empty counts (prevents undefined checks in components)
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_COUNTS: UnreadCounts = {
  total: 0,
  by_category: { inventory: 0, signout: 0, resupply: 0, system: 0 },
  by_priority: { low: 0, normal: 0, high: 0, critical: 0 },
  critical_unacknowledged: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// useNotificationCounts — lightweight hook for the bell badge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polls unread counts every 30 seconds. This is the only polling query
 * in the app — it hits a lightweight endpoint that returns ~100 bytes.
 *
 * Use this in the TopBar bell component. Do NOT use useNotifications()
 * just for the badge count — that would fetch the full list unnecessarily.
 */
export const useNotificationCounts = () => {
  const isAuthenticated = useAuthStore((s) => !!s.token && !!s.user);

  const query = useQuery({
    queryKey: NOTIFICATION_QUERY_KEYS.counts,
    queryFn: notificationsApi.getUnreadCounts,
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
    staleTime: 10_000, // Consider fresh for 10s (prevents refetch on popover open)
  });

  return {
    unreadCounts: query.data ?? EMPTY_COUNTS,
    totalUnread: query.data?.total ?? 0,
    criticalUnacknowledged: query.data?.critical_unacknowledged ?? 0,
    hasCritical: (query.data?.critical_unacknowledged ?? 0) > 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// useNotificationList — paginated list with filters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the notification list with optional filters.
 * NOT polled — fetched on-demand when the popover/page opens.
 *
 * @param filters - category, priority, type, is_read, page, page_size
 * @param enabled - set to false to defer fetching (e.g. until popover opens)
 */
export const useNotificationList = (
  filters: NotificationFilterParams = {},
  enabled: boolean = true,
) => {
  const isAuthenticated = useAuthStore((s) => !!s.token && !!s.user);

  const query = useQuery({
    queryKey: NOTIFICATION_QUERY_KEYS.list(filters),
    queryFn: () => notificationsApi.list(filters),
    enabled: isAuthenticated && enabled,
    staleTime: 15_000, // 15s — fresh enough for a popover
  });

  const emptyPage: PaginatedNotifications = {
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
    filters_applied: {},
  };

  return {
    notifications: query.data?.items ?? [],
    pagination: query.data ?? emptyPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// useNotifications — full combined hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full notification management hook. Use when you need both counts
 * and list access plus mutation actions.
 *
 * For the bell badge alone, prefer useNotificationCounts().
 */
export const useNotifications = (
  filters: NotificationFilterParams = {},
  listEnabled: boolean = true,
) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // ─── Counts (polled) ──────────────────────────────────────────────
  const counts = useNotificationCounts();

  // ─── List (on-demand) ─────────────────────────────────────────────
  const list = useNotificationList(filters, listEnabled);

  // ─── Invalidation helper ──────────────────────────────────────────
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEYS.all });
  }, [queryClient]);

  // ─── Mark Read ────────────────────────────────────────────────────

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      // Optimistic update — mark as read in the cached list
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_QUERY_KEYS.all });

      queryClient.setQueriesData<PaginatedNotifications>(
        { queryKey: ['notifications', 'list'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((n: NotificationBrief) =>
              n.id === id ? { ...n, is_read: true } : n,
            ),
          };
        },
      );

      // Optimistic count decrement
      queryClient.setQueryData<UnreadCounts>(
        NOTIFICATION_QUERY_KEYS.counts,
        (old) => {
          if (!old || old.total <= 0) return old;
          return { ...old, total: old.total - 1 };
        },
      );
    },
    onSettled: invalidateAll,
  });

  // ─── Mark All Read ────────────────────────────────────────────────

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      enqueueSnackbar('All notifications marked as read', { variant: 'info' });
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
    onSettled: invalidateAll,
  });

  // ─── Acknowledge (critical only) ─────────────────────────────────

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.acknowledge(id),
    onMutate: async (id) => {
      queryClient.setQueriesData<PaginatedNotifications>(
        { queryKey: ['notifications', 'list'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((n: NotificationBrief) =>
              n.id === id ? { ...n, is_acknowledged: true } : n,
            ),
          };
        },
      );
    },
    onSuccess: () => {
      enqueueSnackbar('Critical notification acknowledged', { variant: 'success' });
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
    onSettled: invalidateAll,
  });

  // ─── Dismiss ──────────────────────────────────────────────────────

  const dismissMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.dismiss(id),
    onMutate: async (id) => {
      // Optimistic removal from list
      queryClient.setQueriesData<PaginatedNotifications>(
        { queryKey: ['notifications', 'list'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((n: NotificationBrief) => n.id !== id),
            total: old.total - 1,
          };
        },
      );
    },
    onSettled: invalidateAll,
  });

  // ─── Bulk Dismiss ─────────────────────────────────────────────────

  const bulkDismissMutation = useMutation({
    mutationFn: (ids: number[]) =>
      notificationsApi.bulkDismiss({ notification_ids: ids }),
    onSuccess: () => {
      enqueueSnackbar('Notifications dismissed', { variant: 'info' });
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
    onSettled: invalidateAll,
  });

  // ─── Admin: Broadcast ─────────────────────────────────────────────

  const broadcastMutation = useMutation({
    mutationFn: (payload: BroadcastRequest) =>
      notificationsApi.adminBroadcast(payload),
    onSuccess: () => {
      enqueueSnackbar('Notification broadcast sent', { variant: 'success' });
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
    onSettled: invalidateAll,
  });

  // ─── Return value ─────────────────────────────────────────────────

  return {
    // Counts (polled)
    unreadCounts: counts.unreadCounts,
    totalUnread: counts.totalUnread,
    criticalUnacknowledged: counts.criticalUnacknowledged,
    hasCritical: counts.hasCritical,
    isLoadingCounts: counts.isLoading,

    // List (on-demand)
    notifications: list.notifications,
    pagination: list.pagination,
    isLoadingList: list.isLoading,
    isListError: list.isError,
    listError: list.error,
    refetchList: list.refetch,

    // Actions
    markRead: markReadMutation.mutate,
    isMarkingRead: markReadMutation.isPending,

    markAllRead: markAllReadMutation.mutate,
    isMarkingAllRead: markAllReadMutation.isPending,

    acknowledge: acknowledgeMutation.mutate,
    isAcknowledging: acknowledgeMutation.isPending,

    dismiss: dismissMutation.mutate,
    isDismissing: dismissMutation.isPending,

    bulkDismiss: bulkDismissMutation.mutate,
    isBulkDismissing: bulkDismissMutation.isPending,

    broadcast: broadcastMutation.mutate,
    isBroadcasting: broadcastMutation.isPending,

    // Utilities
    refetchCounts: counts.refetch,
    invalidateAll,
  };
};