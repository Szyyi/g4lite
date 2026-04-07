/**
 * G4Lite — NotificationBell
 * ============================
 *
 * TopBar notification widget with two performance layers:
 *  1. Badge: uses useNotificationCounts() — lightweight 100-byte poll every 30s
 *  2. Popover: uses useNotificationList() — fetches only when opened
 *
 * Popover features:
 *  - Category tabs (All, Sign-outs, Inventory, Resupply, System)
 *  - Priority visual indicators (critical = red accent, high = amber)
 *  - Critical notifications require explicit acknowledge before dismissal
 *  - Unread dot indicator on individual items
 *  - "Mark all read" with explanation that critical notifications are skipped
 *  - "View all" link to full notification management page
 *  - Loading skeletons, empty state, error state
 *  - Scrollable list with custom scrollbar
 *
 * The bell icon changes intensity based on unread state:
 *  - 0 unread: quartery colour (barely visible)
 *  - >0 unread: secondary colour + badge
 *  - Critical unacknowledged: danger colour + pulsing badge
 */

import { useState, useCallback, type MouseEvent } from 'react';
import {
  Box,
  Typography,
  Badge,
  IconButton,
  Popover,
  Button,
  Skeleton,
  Tabs,
  Tab,
  Tooltip,
  Chip,
  Alert,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

// Icons
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import PriorityHighOutlinedIcon from '@mui/icons-material/PriorityHighOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';

import { tokens } from '../../tokens';
import {
  useNotificationCounts,
  useNotificationList,
  useNotifications,
} from '../../hooks/useNotifications';
import type {
  NotificationBrief,
  NotificationCategory,
  NotificationTab,
} from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POPOVER_WIDTH = tokens.layout.notificationPopoverWidth;
const POPOVER_MAX_HEIGHT = tokens.layout.notificationPopoverMaxHeight;
const PAGE_SIZE = 20;

// Tab configuration
const CATEGORY_TABS: { value: NotificationTab; label: string; icon: React.ReactNode }[] = [
  { value: 'all',       label: 'All',       icon: null },
  { value: 'signout',   label: 'Sign-outs', icon: <AssignmentOutlinedIcon sx={{ fontSize: 14 }} /> },
  { value: 'inventory', label: 'Inventory',  icon: <Inventory2OutlinedIcon sx={{ fontSize: 14 }} /> },
  { value: 'resupply',  label: 'Resupply',   icon: <LocalShippingOutlinedIcon sx={{ fontSize: 14 }} /> },
  { value: 'system',    label: 'System',     icon: <SettingsOutlinedIcon sx={{ fontSize: 14 }} /> },
];

// Priority → visual config
const PRIORITY_CONFIG: Record<string, { color: string; icon: React.ReactNode | null }> = {
  critical: {
    color: tokens.status.danger,
    icon: <ErrorOutlineOutlinedIcon sx={{ fontSize: 14, color: tokens.status.danger }} />,
  },
  high: {
    color: tokens.status.warning,
    icon: <PriorityHighOutlinedIcon sx={{ fontSize: 14, color: tokens.status.warning }} />,
  },
  normal: { color: tokens.text.secondary, icon: null },
  low:    { color: tokens.text.tertiary, icon: null },
};

// ─────────────────────────────────────────────────────────────────────────────
// Notification row
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationRowProps {
  notification: NotificationBrief;
  onMarkRead: (id: number) => void;
  onAcknowledge: (id: number) => void;
  onDismiss: (id: number) => void;
}

const NotificationRow = ({
  notification: n,
  onMarkRead,
  onAcknowledge,
  onDismiss,
}: NotificationRowProps) => {
  const isCritical = n.priority === 'critical';
  const isHigh = n.priority === 'high';
  const needsAcknowledge = isCritical && !n.is_acknowledged;
  const priorityConfig = PRIORITY_CONFIG[n.priority] ?? PRIORITY_CONFIG.normal;

  return (
    <Box
      onClick={() => {
        if (!n.is_read) onMarkRead(n.id);
      }}
      sx={{
        px: 2.5,
        py: 1.5,
        cursor: n.is_read ? 'default' : 'pointer',
        borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
        transition: `background ${tokens.transition.fast}`,
        position: 'relative',
        // Critical: subtle danger tint background
        ...(isCritical && !n.is_acknowledged
          ? {
              background: tokens.status.dangerSubtle,
              borderLeft: `2px solid ${tokens.status.danger}`,
            }
          : {}),
        // High: subtle warning tint
        ...(isHigh && !n.is_read
          ? {
              borderLeft: `2px solid ${tokens.status.warning}`,
            }
          : {}),
        '&:hover': {
          background: n.is_read
            ? 'transparent'
            : isCritical
              ? alpha(tokens.status.danger, 0.06)
              : alpha(tokens.text.primary, 0.025),
        },
        '&:last-child': {
          borderBottom: 'none',
        },
      }}
    >
      {/* Header row: priority icon + title + unread dot */}
      <Box className="flex items-start gap-1.5">
        {/* Priority icon */}
        {priorityConfig.icon && (
          <Box sx={{ mt: '1px', flexShrink: 0 }}>
            {priorityConfig.icon}
          </Box>
        )}

        {/* Title */}
        <Typography
          sx={{
            fontSize: tokens.fontSize.sm,
            fontWeight: n.is_read ? tokens.fontWeight.normal : tokens.fontWeight.semibold,
            color: n.is_read ? tokens.text.secondary : tokens.text.primary,
            flex: 1,
            lineHeight: 1.3,
          }}
        >
          {n.title}
        </Typography>

        {/* Unread dot */}
        {!n.is_read && (
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: tokens.radius.full,
              background: isCritical ? tokens.status.danger : tokens.accent.default,
              flexShrink: 0,
              mt: '5px',
            }}
          />
        )}
      </Box>

      {/* Body */}
      <Typography
        sx={{
          fontSize: tokens.fontSize.xs,
          color: tokens.text.tertiary,
          mt: 0.375,
          lineHeight: 1.4,
          pl: priorityConfig.icon ? '20px' : 0,
        }}
      >
        {n.body}
      </Typography>

      {/* Footer: timestamp + actions */}
      <Box
        className="flex items-center justify-between"
        sx={{
          mt: 0.75,
          pl: priorityConfig.icon ? '20px' : 0,
        }}
      >
        <Typography
          sx={{
            fontSize: tokens.fontSize['2xs'],
            fontFamily: tokens.font.mono,
            color: tokens.text.quartery,
            letterSpacing: tokens.letterSpacing.wider,
          }}
        >
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </Typography>

        {/* Action buttons */}
        <Box className="flex items-center gap-1">
          {needsAcknowledge && (
            <Tooltip title="Acknowledge" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge(n.id);
                }}
                sx={{
                  color: tokens.status.danger,
                  p: 0.375,
                  '&:hover': { background: alpha(tokens.status.danger, 0.1) },
                }}
              >
                <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}

          {(!isCritical || n.is_acknowledged) && (
            <Tooltip title="Dismiss" arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(n.id);
                }}
                sx={{
                  color: tokens.text.quartery,
                  p: 0.375,
                  opacity: 0,
                  transition: `opacity ${tokens.transition.fast}`,
                  '.MuiBox-root:hover > .MuiBox-root &, &:focus-visible': {
                    opacity: 1,
                  },
                }}
              >
                <CloseOutlinedIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

const NotificationSkeleton = () => (
  <>
    {Array.from({ length: 4 }).map((_, i) => (
      <Box
        key={i}
        sx={{
          px: 2.5,
          py: 1.5,
          borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
        }}
      >
        <Skeleton width="50%" height={14} />
        <Skeleton width="80%" height={12} sx={{ mt: 0.75 }} />
        <Skeleton width="30%" height={10} sx={{ mt: 0.75 }} />
      </Box>
    ))}
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

const EmptyNotifications = ({ category }: { category: NotificationTab }) => (
  <Box className="flex flex-col items-center justify-center gap-1.5" sx={{ py: 8 }}>
    <NotificationsNoneOutlinedIcon
      sx={{
        fontSize: 32,
        color: tokens.text.tertiary,
        opacity: 0.25,
      }}
    />
    <Typography
      sx={{
        fontSize: tokens.fontSize.sm,
        color: tokens.text.tertiary,
        fontWeight: tokens.fontWeight.medium,
      }}
    >
      {category === 'all' ? 'No notifications' : `No ${category} notifications`}
    </Typography>
    <Typography
      sx={{
        fontSize: tokens.fontSize.xs,
        color: tokens.text.quartery,
      }}
    >
      You're all caught up
    </Typography>
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────
// NotificationBell
// ─────────────────────────────────────────────────────────────────────────────

const NotificationBell = () => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const isOpen = Boolean(anchorEl);

  // Counts — always polling (lightweight)
  const { totalUnread, criticalUnacknowledged, hasCritical, unreadCounts } =
    useNotificationCounts();

  // List — only fetches when popover is open
  const categoryFilter = activeTab === 'all' ? {} : { category: activeTab as NotificationCategory };
  const { notifications, isLoading, isError } = useNotificationList(
    { page_size: PAGE_SIZE, ...categoryFilter },
    isOpen,
  );

  // Actions
  const { markRead, markAllRead, acknowledge, dismiss } = useNotifications(
    {},
    false, // Don't duplicate the list fetch
  );

  // Handlers
  const handleOpen = (e: MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    // Reset tab on close so it opens fresh next time
    setTimeout(() => setActiveTab('all'), 200);
  };

  const handleViewAll = useCallback(() => {
    handleClose();
    navigate('/admin/notifications');
  }, [navigate]);

  // Bell icon colour based on state
  const bellColour = hasCritical
    ? tokens.status.danger
    : totalUnread > 0
      ? tokens.text.secondary
      : tokens.text.quartery;

  // Badge colour
  const badgeColour = hasCritical ? 'error' : 'primary';

  return (
    <>
      {/* ── Bell button ──────────────────────────────────────────── */}
      <Tooltip title={`${totalUnread} unread notification${totalUnread !== 1 ? 's' : ''}`} arrow>
        <IconButton
          aria-label={`${totalUnread} unread notifications`}
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={handleOpen}
          size="small"
          sx={{
            color: bellColour,
            borderRadius: tokens.radius.md,
            transition: `color ${tokens.transition.fast}`,
            '&:hover': {
              color: tokens.text.primary,
              background: alpha(tokens.text.primary, 0.04),
            },
          }}
        >
          <Badge
            badgeContent={totalUnread}
            color={badgeColour}
            max={99}
            invisible={totalUnread === 0}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: tokens.fontSize['2xs'],
                fontFamily: tokens.font.mono,
                height: 16,
                minWidth: 16,
              },
            }}
          >
            <NotificationsOutlinedIcon sx={{ fontSize: 18 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      {/* ── Popover ──────────────────────────────────────────────── */}
      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: POPOVER_WIDTH,
              maxHeight: POPOVER_MAX_HEIGHT,
              background: tokens.surface.overlay,
              border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
              borderRadius: tokens.radius.lg,
              boxShadow: tokens.shadow.dropdown,
              mt: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            },
          },
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <Box
          className="flex items-center justify-between"
          sx={{
            px: 2.5,
            pt: 2,
            pb: 0,
            flexShrink: 0,
          }}
        >
          <Box className="flex items-center gap-2">
            <Typography
              sx={{
                fontSize: tokens.fontSize.base,
                fontWeight: tokens.fontWeight.semibold,
                color: tokens.text.primary,
              }}
            >
              Notifications
            </Typography>
            {totalUnread > 0 && (
              <Chip
                label={totalUnread}
                size="small"
                sx={{
                  height: 18,
                  fontSize: tokens.fontSize['2xs'],
                  fontFamily: tokens.font.mono,
                  fontWeight: tokens.fontWeight.bold,
                  background: hasCritical ? tokens.status.dangerMuted : tokens.accent.muted,
                  color: hasCritical ? tokens.status.danger : tokens.accent.text,
                  border: `${tokens.borderWidth.thin} solid ${hasCritical ? tokens.status.dangerBorder : tokens.accent.border}`,
                }}
              />
            )}
          </Box>

          {totalUnread > 0 && (
            <Button
              size="small"
              variant="text"
              onClick={() => markAllRead()}
              sx={{
                fontSize: tokens.fontSize.xs,
                color: tokens.accent.text,
                px: 1,
                py: 0.25,
                minWidth: 'auto',
                '&:hover': {
                  background: alpha(tokens.accent.default, 0.08),
                },
              }}
            >
              Mark all read
            </Button>
          )}
        </Box>

        {/* Critical warning banner */}
        {hasCritical && (
          <Box sx={{ px: 2, pt: 1.5 }}>
            <Alert
              severity="error"
              variant="standard"
              sx={{
                py: 0.25,
                '& .MuiAlert-message': {
                  fontSize: tokens.fontSize.xs,
                  py: 0.25,
                },
                '& .MuiAlert-icon': {
                  py: 0.5,
                  mr: 1,
                  '& .MuiSvgIcon-root': { fontSize: 16 },
                },
              }}
            >
              {criticalUnacknowledged} critical notification{criticalUnacknowledged !== 1 ? 's' : ''} require acknowledgement
            </Alert>
          </Box>
        )}

        {/* ── Category tabs ───────────────────────────────────────── */}
        <Tabs
          value={activeTab}
          onChange={(_, val: NotificationTab) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons={false}
          sx={{
            minHeight: 36,
            px: 1,
            mt: 1,
            '& .MuiTabs-indicator': {
              height: 2,
            },
          }}
        >
          {CATEGORY_TABS.map((tab) => {
            const count = tab.value === 'all'
              ? totalUnread
              : unreadCounts.by_category[tab.value as NotificationCategory] ?? 0;

            return (
              <Tab
                key={tab.value}
                value={tab.value}
                label={
                  <Box className="flex items-center gap-1">
                    <Typography sx={{ fontSize: tokens.fontSize.xs }}>{tab.label}</Typography>
                    {count > 0 && (
                      <Typography
                        sx={{
                          fontSize: tokens.fontSize['2xs'],
                          fontFamily: tokens.font.mono,
                          color: tokens.accent.text,
                          fontWeight: tokens.fontWeight.bold,
                          minWidth: 14,
                          textAlign: 'center',
                        }}
                      >
                        {count}
                      </Typography>
                    )}
                  </Box>
                }
                sx={{
                  minHeight: 36,
                  px: 1.5,
                  py: 0,
                  minWidth: 'auto',
                  fontSize: tokens.fontSize.xs,
                }}
              />
            );
          })}
        </Tabs>

        {/* ── Notification list ────────────────────────────────────── */}
        <Box
          className="scrollbar-hidden"
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {isLoading ? (
            <NotificationSkeleton />
          ) : isError ? (
            <Box className="flex flex-col items-center justify-center gap-1" sx={{ py: 6 }}>
              <Typography sx={{ fontSize: tokens.fontSize.sm, color: tokens.status.danger }}>
                Failed to load notifications
              </Typography>
              <Typography sx={{ fontSize: tokens.fontSize.xs, color: tokens.text.quartery }}>
                Pull down to retry
              </Typography>
            </Box>
          ) : notifications.length === 0 ? (
            <EmptyNotifications category={activeTab} />
          ) : (
            notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onMarkRead={markRead}
                onAcknowledge={acknowledge}
                onDismiss={dismiss}
              />
            ))
          )}
        </Box>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <Box
          sx={{
            borderTop: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            flexShrink: 0,
          }}
        >
          <Button
            fullWidth
            variant="text"
            onClick={handleViewAll}
            endIcon={<OpenInNewOutlinedIcon sx={{ fontSize: 14 }} />}
            sx={{
              py: 1.25,
              fontSize: tokens.fontSize.xs,
              color: tokens.text.tertiary,
              fontWeight: tokens.fontWeight.medium,
              borderRadius: 0,
              '&:hover': {
                background: alpha(tokens.text.primary, 0.03),
                color: tokens.text.secondary,
              },
            }}
          >
            View all notifications
          </Button>
        </Box>
      </Popover>
    </>
  );
};

export default NotificationBell;