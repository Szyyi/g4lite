/**
 * G4Lite — Sidebar
 * ===================
 *
 * Collapsible navigation sidebar with two states:
 *  - Expanded (240px): full labels, section headers, user panel
 *  - Collapsed (64px): icon-only rail with tooltips
 *
 * Features:
 *  - Role-based navigation sections (operations, admin)
 *  - Badge counts on nav items (active signouts, pending resupply)
 *  - Active route indicator (accent left bar + muted background)
 *  - System operational status dot
 *  - User info panel at bottom
 *  - Collapse toggle with keyboard shortcut hint
 *  - All transitions CSS-driven (no JS reflow)
 *  - Custom scrollbar on nav overflow
 *
 * Route structure:
 *  Operations (all roles):
 *    /              — Dashboard/Landing
 *    /inventory     — Inventory browser
 *    /signouts      — My Sign-outs
 *    /resupply      — Resupply requests
 *
 *  Admin only:
 *    /admin         — Admin dashboard
 *    /admin/signouts    — All sign-outs
 *    /admin/resupply    — Resupply management
 *    /admin/users       — User management
 *    /admin/notifications — Notification management
 *
 *  All roles:
 *    /assistant     — AI chat (if Ollama available)
 *    /settings      — Profile & preferences
 */

import { type ReactNode } from 'react';
import { Box, Typography, Avatar, Tooltip, IconButton, Badge } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link, useLocation } from 'react-router-dom';

// Icons — all Outlined variant per design system (line-weight, never filled)
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import AssignmentReturnOutlinedIcon from '@mui/icons-material/AssignmentReturnOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

import { tokens } from '../../tokens';
import { useAuth } from '../../hooks/useAuth';
import { useThemeStore, useSidebarCollapsed } from '../../store/themeStore';
import { useUserInitials } from '../../store/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ICON_SIZE = 20;
const TRANSITION_PROPS = `opacity ${tokens.duration.normal} ${tokens.easing.default}, width ${tokens.duration.normal} ${tokens.easing.default}`;

// ─────────────────────────────────────────────────────────────────────────────
// NavItem
// ─────────────────────────────────────────────────────────────────────────────

interface NavItemProps {
  label: string;
  icon: ReactNode;
  href: string;
  badge?: number;
  collapsed: boolean;
  /** Exact match only (for root "/") */
  exact?: boolean;
}

const NavItem = ({ label, icon, href, badge, collapsed, exact = false }: NavItemProps) => {
  const { pathname } = useLocation();
  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/');

  const content = (
    <Box
      component={Link}
      to={href}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: collapsed ? 0 : 2,
        py: 1,
        mx: collapsed ? 0.75 : 1.5,
        borderRadius: tokens.radius.md,
        textDecoration: 'none',
        position: 'relative',
        justifyContent: collapsed ? 'center' : 'flex-start',
        minHeight: 36,
        transition: `background ${tokens.transition.fast}, color ${tokens.transition.fast}`,

        // Active state
        ...(isActive
          ? {
              background: alpha(tokens.accent.default, 0.08),
              color: tokens.text.primary,
              // Accent bar on the left
              '&::before': {
                content: '""',
                position: 'absolute',
                left: collapsed ? -6 : -12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 3,
                height: 20,
                borderRadius: '0 2px 2px 0',
                background: tokens.accent.default,
                transition: `height ${tokens.transition.fast}`,
              },
            }
          : {
              color: tokens.text.tertiary,
              '&:hover': {
                background: alpha(tokens.text.primary, 0.04),
                color: tokens.text.secondary,
              },
            }),
      }}
    >
      {/* Icon */}
      <Box
        sx={{
          fontSize: ICON_SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: isActive ? 1 : 0.6,
          transition: `opacity ${tokens.transition.fast}`,
          color: isActive ? tokens.accent.text : 'inherit',
        }}
      >
        {icon}
      </Box>

      {/* Label — hidden when collapsed */}
      {!collapsed && (
        <Typography
          variant="body2"
          sx={{
            fontWeight: isActive ? 600 : 400,
            fontSize: tokens.fontSize.base,
            letterSpacing: isActive ? tokens.letterSpacing.normal : tokens.letterSpacing.wide,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}
        >
          {label}
        </Typography>
      )}

      {/* Badge */}
      {badge != null && badge > 0 && (
        <Badge
          badgeContent={badge}
          color="primary"
          sx={{
            '& .MuiBadge-badge': {
              position: collapsed ? 'absolute' : 'relative',
              transform: collapsed ? 'translate(50%, -50%)' : 'none',
              top: collapsed ? 4 : 'auto',
              right: collapsed ? 4 : 'auto',
              fontSize: tokens.fontSize['2xs'],
              minWidth: 16,
              height: 16,
            },
          }}
        />
      )}
    </Box>
  );

  // When collapsed, wrap in tooltip to show the label
  if (collapsed) {
    return (
      <Tooltip title={label} placement="right" arrow>
        {content}
      </Tooltip>
    );
  }

  return content;
};

// ─────────────────────────────────────────────────────────────────────────────
// Section Label — hidden when collapsed
// ─────────────────────────────────────────────────────────────────────────────

const SectionLabel = ({
  children,
  collapsed,
}: {
  children: string;
  collapsed: boolean;
}) => {
  if (collapsed) {
    // Compact divider instead of text label
    return (
      <Box
        sx={{
          mx: 1.5,
          my: 1,
          height: '1px',
          background: tokens.surface.border,
        }}
      />
    );
  }

  return (
    <Typography
      variant="overline"
      sx={{
        color: tokens.text.quartery,
        px: 3,
        pt: 2.5,
        pb: 1,
        display: 'block',
        fontSize: tokens.fontSize['2xs'],
        fontWeight: tokens.fontWeight.semibold,
        letterSpacing: '0.14em',
      }}
    >
      {children}
    </Typography>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

const Sidebar = () => {
  const { user, isAdmin, canWrite } = useAuth();
  const isCollapsed = useSidebarCollapsed();
  const toggleSidebar = useThemeStore((s) => s.toggleSidebar);
  const initials = useUserInitials();

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        background: tokens.surface.raised,
        borderRight: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Logo header ────────────────────────────────────────────── */}
      <Box
        sx={{
          height: tokens.layout.topbarHeight,
          minHeight: tokens.layout.topbarHeight,
          display: 'flex',
          alignItems: 'center',
          px: isCollapsed ? 0 : 2.5,
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: 1.5,
          borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
          transition: `padding ${tokens.transition.normal}`,
        }}
      >
        {/* Logo mark — always visible */}
        <Box
          sx={{
            width: 32,
            height: 32,
            minWidth: 32,
            borderRadius: tokens.radius.md,
            background: tokens.accent.muted,
            border: `${tokens.borderWidth.thin} solid ${tokens.accent.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              fontFamily: tokens.font.mono,
              fontSize: tokens.fontSize.xs,
              fontWeight: tokens.fontWeight.bold,
              color: tokens.accent.text,
              letterSpacing: tokens.letterSpacing.wider,
              lineHeight: 1,
            }}
          >
            G4
          </Typography>
        </Box>

        {/* Logo text — hidden when collapsed */}
        {!isCollapsed && (
          <Box sx={{ overflow: 'hidden' }}>
            <Typography
              sx={{
                fontSize: tokens.fontSize.md,
                fontWeight: tokens.fontWeight.bold,
                letterSpacing: tokens.letterSpacing.tight,
                color: tokens.text.primary,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              G4LIGHT
            </Typography>
            <Typography
              sx={{
                fontSize: tokens.fontSize['2xs'],
                fontWeight: tokens.fontWeight.medium,
                letterSpacing: '0.12em',
                color: tokens.text.quartery,
                textTransform: 'uppercase',
                lineHeight: 1,
                mt: 0.375,
              }}
            >
              LOGISTICS
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <Box
        className="scrollbar-hidden"
        sx={{
          flex: 1,
          py: 0.5,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Operations — all roles */}
        <SectionLabel collapsed={isCollapsed}>Operations</SectionLabel>
        <Box className="flex flex-col gap-0.5">
          <NavItem
            label="Home"
            icon={<HomeOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
            href="/"
            collapsed={isCollapsed}
            exact
          />
          <NavItem
            label="Inventory"
            icon={<Inventory2OutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
            href="/inventory"
            collapsed={isCollapsed}
          />
          {canWrite && (
            <NavItem
              label="My Sign-outs"
              icon={<AssignmentOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
              href="/signouts"
              collapsed={isCollapsed}
            />
          )}
          {canWrite && (
            <NavItem
              label="Resupply"
              icon={<LocalShippingOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
              href="/resupply"
              collapsed={isCollapsed}
            />
          )}
        </Box>

        {/* Admin — admin role only */}
        {isAdmin && (
          <>
            <SectionLabel collapsed={isCollapsed}>Administration</SectionLabel>
            <Box className="flex flex-col gap-0.5">
              <NavItem
                label="Dashboard"
                icon={<DashboardOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
                href="/admin"
                collapsed={isCollapsed}
                exact
              />
              <NavItem
                label="All Sign-outs"
                icon={<AssignmentReturnOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
                href="/admin/signouts"
                collapsed={isCollapsed}
              />
              <NavItem
                label="Resupply Mgmt"
                icon={<ReceiptLongOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
                href="/admin/resupply"
                collapsed={isCollapsed}
              />
              <NavItem
                label="Users"
                icon={<PeopleOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
                href="/admin/users"
                collapsed={isCollapsed}
              />
              <NavItem
                label="Notifications"
                icon={<NotificationsOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
                href="/admin/notifications"
                collapsed={isCollapsed}
              />
            </Box>
          </>
        )}

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Bottom section — tools */}
        <SectionLabel collapsed={isCollapsed}>Tools</SectionLabel>
        <Box className="flex flex-col gap-0.5">
          <NavItem
            label="Assistant"
            icon={<SmartToyOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
            href="/assistant"
            collapsed={isCollapsed}
          />
          <NavItem
            label="Settings"
            icon={<SettingsOutlinedIcon sx={{ fontSize: ICON_SIZE }} />}
            href="/settings"
            collapsed={isCollapsed}
          />
        </Box>
      </Box>

      {/* ── System status + User panel ──────────────────────────────── */}
      <Box
        sx={{
          borderTop: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
          px: isCollapsed ? 0 : 2,
          py: 1.5,
          transition: `padding ${tokens.transition.normal}`,
        }}
      >
        {/* System status indicator */}
        <Box
          className="flex items-center"
          sx={{
            gap: 1,
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            px: isCollapsed ? 0 : 0.5,
            mb: 1.5,
          }}
        >
          <FiberManualRecordIcon
            sx={{
              fontSize: 6,
              color: tokens.status.success,
              flexShrink: 0,
            }}
          />
          {!isCollapsed && (
            <Typography
              sx={{
                fontSize: tokens.fontSize['2xs'],
                fontWeight: tokens.fontWeight.medium,
                letterSpacing: '0.08em',
                color: tokens.text.quartery,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              OPERATIONAL
            </Typography>
          )}
        </Box>

        {/* User info */}
        <Box
          className="flex items-center"
          sx={{
            gap: 1.5,
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            px: isCollapsed ? 0 : 0.5,
          }}
        >
          <Tooltip
            title={isCollapsed ? `${user?.full_name ?? ''} — ${user?.role?.toUpperCase() ?? ''}` : ''}
            placement="right"
            arrow
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: tokens.fontSize.xs,
                fontWeight: tokens.fontWeight.bold,
                background: tokens.accent.subtle,
                color: tokens.accent.text,
                border: `${tokens.borderWidth.thin} solid ${tokens.accent.border}`,
                flexShrink: 0,
              }}
            >
              {initials}
            </Avatar>
          </Tooltip>

          {!isCollapsed && (
            <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: tokens.fontSize.sm,
                  fontWeight: tokens.fontWeight.semibold,
                  color: tokens.text.primary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.2,
                }}
              >
                {user?.full_name}
              </Typography>
              <Typography
                sx={{
                  fontSize: tokens.fontSize['2xs'],
                  fontFamily: tokens.font.mono,
                  color: tokens.text.tertiary,
                  letterSpacing: tokens.letterSpacing.widest,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.rank} · {user?.role?.toUpperCase()}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Collapse toggle ──────────────────────────────────────────── */}
      <Box
        sx={{
          borderTop: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
          display: 'flex',
          justifyContent: isCollapsed ? 'center' : 'flex-end',
          px: isCollapsed ? 0 : 1,
          py: 0.75,
        }}
      >
        <Tooltip
          title={isCollapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
          placement="right"
          arrow
        >
          <IconButton
            onClick={toggleSidebar}
            size="small"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            sx={{
              color: tokens.text.quartery,
              borderRadius: tokens.radius.sm,
              '&:hover': {
                color: tokens.text.tertiary,
                background: alpha(tokens.text.primary, 0.04),
              },
            }}
          >
            {isCollapsed ? (
              <ChevronRightIcon sx={{ fontSize: 18 }} />
            ) : (
              <ChevronLeftIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default Sidebar;