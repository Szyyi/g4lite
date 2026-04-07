/**
 * G4Lite — TopBar
 * ==================
 *
 * Sticky header bar spanning the top of the content area.
 * Height: 64px (matching sidebar header for alignment).
 *
 * Left side:  Breadcrumbs derived from current route
 * Right side: Live clock → Command palette trigger → Notification bell → User menu
 *
 * The TopBar does NOT contain the sidebar toggle — that lives in the
 * sidebar itself. The TopBar is purely informational and navigational.
 */

import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  Avatar,
  Breadcrumbs,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

// Icons
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardCommandKeyIcon from '@mui/icons-material/KeyboardCommandKey';

import { tokens } from '../../tokens';
import { useAuth } from '../../hooks/useAuth';
import { useUserInitials } from '../../store/authStore';
import NotificationBell from './NotificationBell';
import type { BreadcrumbItem } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Route → Breadcrumb mapping
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '/':                     'Home',
  '/inventory':            'Inventory',
  '/signouts':             'My Sign-outs',
  '/resupply':             'Resupply',
  '/assistant':            'Assistant',
  '/settings':             'Settings',
  '/change-password':      'Change Password',
  '/admin':                'Admin Dashboard',
  '/admin/signouts':       'All Sign-outs',
  '/admin/resupply':       'Resupply Management',
  '/admin/users':          'User Management',
  '/admin/notifications':  'Notifications',
  '/admin/items/new':      'New Item',
};

/**
 * Derives breadcrumbs from the current pathname.
 *
 * Examples:
 *   /inventory          → [Home, Inventory]
 *   /admin/users        → [Home, Admin Dashboard, User Management]
 *   /admin/items/new    → [Home, Admin Dashboard, New Item]
 *   /inventory/42       → [Home, Inventory, Item #42]
 */
const deriveBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
  const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];

  if (pathname === '/') return crumbs;

  const segments = pathname.split('/').filter(Boolean);
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    // Check for exact route label
    const label = ROUTE_LABELS[currentPath];

    if (label) {
      const isLast = i === segments.length - 1;
      crumbs.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    } else if (/^\d+$/.test(segment)) {
      // Numeric ID segment — show as "Detail" or "#{id}"
      crumbs.push({ label: `#${segment}` });
    } else if (segment === 'edit') {
      crumbs.push({ label: 'Edit' });
    } else {
      // Unknown segment — capitalize
      crumbs.push({
        label: segment.charAt(0).toUpperCase() + segment.slice(1),
        href: undefined,
      });
    }
  }

  return crumbs;
};

// ─────────────────────────────────────────────────────────────────────────────
// Live clock (updates every minute)
// ─────────────────────────────────────────────────────────────────────────────

const useLiveClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Sync to the start of the next minute for consistent updates
    const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000;

    const timeout = setTimeout(() => {
      setTime(new Date());
      // After initial sync, update every 60 seconds
      const interval = setInterval(() => setTime(new Date()), 60_000);
      return () => clearInterval(interval);
    }, msUntilNextMinute);

    return () => clearTimeout(timeout);
  }, []);

  return time;
};

// ─────────────────────────────────────────────────────────────────────────────
// Vertical divider
// ─────────────────────────────────────────────────────────────────────────────

const ToolbarDivider = () => (
  <Box
    aria-hidden="true"
    sx={{
      width: '1px',
      height: 20,
      background: tokens.surface.border,
      flexShrink: 0,
    }}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// TopBar
// ─────────────────────────────────────────────────────────────────────────────

const TopBar = () => {
  const { user, logout, isLoggingOut, roleLabel } = useAuth();
  const initials = useUserInitials();
  const location = useLocation();
  const navigate = useNavigate();
  const time = useLiveClock();

  // User menu anchor
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const isMenuOpen = Boolean(menuAnchor);

  const handleOpenMenu = (e: MouseEvent<HTMLElement>) => {
    setMenuAnchor(e.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
  };

  const handleNavigate = useCallback(
    (path: string) => {
      handleCloseMenu();
      navigate(path);
    },
    [navigate],
  );

  const handleLogout = useCallback(() => {
    handleCloseMenu();
    logout();
  }, [logout]);

  // Breadcrumbs
  const breadcrumbs = deriveBreadcrumbs(location.pathname);

  return (
    <Box
      className="flex items-center justify-between"
      sx={{
        height: '100%',
        px: tokens.space[6],
      }}
    >
      {/* ── Left: Breadcrumbs ───────────────────────────────────────── */}
      <Breadcrumbs
        separator={
          <ChevronRightIcon
            sx={{
              fontSize: 14,
              color: tokens.text.quartery,
            }}
          />
        }
        aria-label="Navigation breadcrumb"
        sx={{
          '& .MuiBreadcrumbs-ol': {
            flexWrap: 'nowrap',
          },
        }}
      >
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          if (isLast) {
            return (
              <Typography
                key={crumb.label}
                variant="body2"
                sx={{
                  fontWeight: tokens.fontWeight.semibold,
                  color: tokens.text.primary,
                  fontSize: tokens.fontSize.base,
                  whiteSpace: 'nowrap',
                }}
              >
                {crumb.label}
              </Typography>
            );
          }

          return (
            <Typography
              key={crumb.label}
              component={Link}
              to={crumb.href ?? '/'}
              variant="body2"
              sx={{
                color: tokens.text.tertiary,
                fontSize: tokens.fontSize.base,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: `color ${tokens.transition.fast}`,
                '&:hover': {
                  color: tokens.text.secondary,
                },
              }}
            >
              {crumb.label}
            </Typography>
          );
        })}
      </Breadcrumbs>

      {/* ── Right: Controls ─────────────────────────────────────────── */}
      <Box className="flex items-center gap-2" sx={{ flexShrink: 0 }}>
        {/* Live clock */}
        <Typography
          sx={{
            fontFamily: tokens.font.mono,
            fontSize: tokens.fontSize.xs,
            fontWeight: tokens.fontWeight.normal,
            color: tokens.text.quartery,
            letterSpacing: tokens.letterSpacing.widest,
            whiteSpace: 'nowrap',
            mr: 0.5,
          }}
        >
          {format(time, 'dd MMM yyyy — HH:mm')}
        </Typography>

        <ToolbarDivider />

        {/* Search / Command Palette trigger */}
        <Tooltip title="Search (⌘K)" arrow>
          <IconButton
            aria-label="Open search"
            size="small"
            sx={{
              color: tokens.text.quartery,
              borderRadius: tokens.radius.md,
              '&:hover': {
                color: tokens.text.tertiary,
                background: alpha(tokens.text.primary, 0.04),
              },
            }}
          >
            <SearchOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* Notification bell */}
        <NotificationBell />

        <ToolbarDivider />

        {/* User avatar + menu */}
        <Tooltip title="Account" arrow>
          <IconButton
            onClick={handleOpenMenu}
            aria-label="Account menu"
            aria-controls={isMenuOpen ? 'user-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            size="small"
            sx={{
              p: 0.5,
              borderRadius: tokens.radius.md,
              border: `${tokens.borderWidth.thin} solid transparent`,
              transition: `border-color ${tokens.transition.fast}`,
              '&:hover': {
                borderColor: tokens.surface.borderHi,
              },
              ...(isMenuOpen && {
                borderColor: tokens.accent.border,
                background: alpha(tokens.accent.default, 0.06),
              }),
            }}
          >
            <Avatar
              sx={{
                width: 30,
                height: 30,
                fontSize: tokens.fontSize.xs,
                fontWeight: tokens.fontWeight.bold,
                background: tokens.accent.subtle,
                color: tokens.accent.text,
                border: `${tokens.borderWidth.thin} solid ${tokens.accent.border}`,
              }}
            >
              {initials}
            </Avatar>
          </IconButton>
        </Tooltip>

        {/* User dropdown menu */}
        <Menu
          id="user-menu"
          anchorEl={menuAnchor}
          open={isMenuOpen}
          onClose={handleCloseMenu}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                minWidth: 220,
              },
            },
          }}
        >
          {/* User identity header */}
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography
              sx={{
                fontSize: tokens.fontSize.base,
                fontWeight: tokens.fontWeight.semibold,
                color: tokens.text.primary,
                lineHeight: 1.3,
              }}
            >
              {user?.full_name}
            </Typography>
            <Typography
              sx={{
                fontSize: tokens.fontSize.xs,
                fontFamily: tokens.font.mono,
                color: tokens.text.tertiary,
                letterSpacing: tokens.letterSpacing.widest,
                lineHeight: 1.3,
                mt: 0.25,
              }}
            >
              {user?.rank} · {roleLabel}
            </Typography>
            {user?.email && (
              <Typography
                sx={{
                  fontSize: tokens.fontSize.xs,
                  color: tokens.text.quartery,
                  mt: 0.5,
                  lineHeight: 1.3,
                }}
              >
                {user.email}
              </Typography>
            )}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <MenuItem onClick={() => handleNavigate('/settings')}>
            <PersonOutlinedIcon sx={{ fontSize: 18, mr: 1.5, color: tokens.text.tertiary }} />
            <Typography variant="body2">Profile</Typography>
          </MenuItem>

          <MenuItem onClick={() => handleNavigate('/settings')}>
            <SettingsOutlinedIcon sx={{ fontSize: 18, mr: 1.5, color: tokens.text.tertiary }} />
            <Typography variant="body2">Settings</Typography>
          </MenuItem>

          <Divider sx={{ my: 0.5 }} />

          <MenuItem
            onClick={handleLogout}
            disabled={isLoggingOut}
            sx={{
              color: tokens.status.danger,
              '&:hover': {
                background: tokens.status.dangerSubtle,
              },
            }}
          >
            <LogoutOutlinedIcon sx={{ fontSize: 18, mr: 1.5 }} />
            <Typography variant="body2" sx={{ fontWeight: tokens.fontWeight.medium }}>
              {isLoggingOut ? 'Signing out…' : 'Sign out'}
            </Typography>
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
};

export default TopBar;