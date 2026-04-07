/**
 * G4Lite — AppShell
 * ====================
 *
 * Root layout component wrapping all authenticated routes.
 * Renders the sidebar, topbar, and main content area.
 *
 * Responsibilities:
 *  - Auth guard: redirects to /login if not authenticated
 *  - Hydration gate: shows loading skeleton while /me validates the JWT
 *  - Must-change-password redirect: forces password change before any route
 *  - Sidebar width transition: CSS-driven, no JS reflow
 *  - Page transition animation on route change
 *  - Keyboard shortcuts (Cmd+B to toggle sidebar)
 *  - Noise texture overlay for surface depth
 *  - Scroll-to-top on route change
 *
 * Layout:
 *  ┌───────────────────────────────────────────────────────┐
 *  │ TopBar (64px, sticky)  [Breadcrumb]  [Bell] [Avatar] │
 *  ├──────────┬────────────────────────────────────────────┤
 *  │          │                                            │
 *  │ Sidebar  │  Main Content Area                         │
 *  │ 240px /  │  max-width: 1440px, padding: 32px          │
 *  │  64px    │  centered                                  │
 *  │          │                                            │
 *  └──────────┴────────────────────────────────────────────┘
 */

import { useEffect, useRef } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { tokens } from '../../tokens';
import { useAuth } from '../../hooks/useAuth';
import { useThemeStore, useSidebarCollapsed } from '../../store/themeStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants (from tokens)
// ─────────────────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = tokens.layout.sidebarWidth;
const SIDEBAR_COLLAPSED = tokens.layout.sidebarCollapsed;
const TOPBAR_HEIGHT = tokens.layout.topbarHeight;
const CONTENT_MAX_WIDTH = tokens.layout.contentMaxWidth;
const CONTENT_PADDING = tokens.layout.contentPadding;

// ─────────────────────────────────────────────────────────────────────────────
// Page transition variants (framer-motion)
// ─────────────────────────────────────────────────────────────────────────────

const pageVariants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.15,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.1,
      ease: [0.4, 0, 1, 1],
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hydration loading screen
// ─────────────────────────────────────────────────────────────────────────────

const HydrationLoader = () => (
  <Box
    className="flex items-center justify-center"
    sx={{
      position: 'fixed',
      inset: 0,
      background: tokens.surface.base,
      zIndex: tokens.zIndex.overlay,
    }}
  >
    <Box className="flex flex-col items-center gap-4">
      {/* Logo mark */}
      <Box className="flex items-center gap-3">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: tokens.radius.lg,
            background: tokens.accent.muted,
            border: `${tokens.borderWidth.thin} solid ${tokens.accent.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography
            variant="h5"
            sx={{
              fontFamily: tokens.font.mono,
              fontWeight: tokens.fontWeight.bold,
              color: tokens.accent.text,
              fontSize: tokens.fontSize.md,
              letterSpacing: tokens.letterSpacing.wider,
            }}
          >
            G4
          </Typography>
        </Box>
        <Typography
          variant="h4"
          sx={{
            fontWeight: tokens.fontWeight.bold,
            letterSpacing: tokens.letterSpacing.tight,
            color: tokens.text.primary,
          }}
        >
          G4LIGHT
        </Typography>
      </Box>

      <CircularProgress
        size={20}
        thickness={4}
        sx={{ color: tokens.accent.text, mt: 1 }}
      />

      <Typography
        variant="caption"
        sx={{
          color: tokens.text.tertiary,
          letterSpacing: tokens.letterSpacing.wider,
          mt: 0.5,
        }}
      >
        Establishing session…
      </Typography>
    </Box>
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────
// AppShell
// ─────────────────────────────────────────────────────────────────────────────

const AppShell = () => {
  const location = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, isHydrated, isHydrating, mustChangePassword } = useAuth();
  const isCollapsed = useSidebarCollapsed();
  const toggleSidebar = useThemeStore((s) => s.toggleSidebar);

  // ─── Keyboard shortcuts ───────────────────────────────────────────
  // Cmd+B / Ctrl+B: toggle sidebar
  useHotkeys('mod+b', (e) => {
    e.preventDefault();
    toggleSidebar();
  }, { enableOnFormTags: false });

  // ─── Scroll to top on route change ────────────────────────────────
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [location.pathname]);

  // ─── Auth gates ───────────────────────────────────────────────────

  // Still validating the JWT — show branded loading screen
  if (!isHydrated || isHydrating) {
    return <HydrationLoader />;
  }

  // Not authenticated — redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Must change password — redirect to password change
  // (except if already on that route)
  if (mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // ─── Computed layout values ───────────────────────────────────────
  const currentSidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        background: tokens.surface.base,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Noise texture overlay ─────────────────────────────────── */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: tokens.zIndex.critical + 1,
          opacity: 0.015,
          mixBlendMode: 'overlay',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <Box
        component="aside"
        aria-label="sidebar"
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: currentSidebarWidth,
          zIndex: tokens.zIndex.sidebar,
          transition: `width ${tokens.duration.normal} ${tokens.easing.default}`,
          willChange: 'width',
        }}
      >
        <Sidebar />
      </Box>

      {/* ── Main column (topbar + content) ────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          marginLeft: currentSidebarWidth,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          transition: `margin-left ${tokens.duration.normal} ${tokens.easing.default}`,
          willChange: 'margin-left',
          position: 'relative',
        }}
      >
        {/* ── TopBar (sticky) ──────────────────────────────────────── */}
        <Box
          component="header"
          aria-label="topbar"
          sx={{
            position: 'sticky',
            top: 0,
            height: TOPBAR_HEIGHT,
            minHeight: TOPBAR_HEIGHT,
            zIndex: tokens.zIndex.topbar,
            background: tokens.surface.base,
            // Subtle bottom border that's visible on scroll
            borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            // Backdrop blur for when content scrolls behind
            backdropFilter: 'blur(12px)',
            backgroundColor: `${tokens.surface.base}E6`, // 90% opacity
          }}
        >
          <TopBar />
        </Box>

        {/* ── Content area ─────────────────────────────────────────── */}
        <Box
          ref={mainRef}
          component="main"
          role="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Inner container: max-width, centered, padded */}
          <Box
            sx={{
              width: '100%',
              maxWidth: CONTENT_MAX_WIDTH,
              mx: 'auto',
              px: CONTENT_PADDING,
              py: CONTENT_PADDING,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </Box>

          {/* ── Footer accent line ──────────────────────────────────── */}
          <Box
            aria-hidden="true"
            sx={{
              height: '1px',
              mx: CONTENT_PADDING,
              background: `linear-gradient(to right, transparent, ${tokens.surface.border}, transparent)`,
              mt: 'auto',
            }}
          />

          {/* ── Footer ──────────────────────────────────────────────── */}
          <Box
            component="footer"
            className="flex items-center justify-between"
            sx={{
              px: CONTENT_PADDING,
              py: tokens.space[4],
              maxWidth: CONTENT_MAX_WIDTH,
              mx: 'auto',
              width: '100%',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: tokens.text.quartery,
                fontFamily: tokens.font.mono,
                fontSize: tokens.fontSize['2xs'],
                letterSpacing: tokens.letterSpacing.wider,
              }}
            >
              G4LITE v2.0
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: tokens.text.quartery,
                fontSize: tokens.fontSize['2xs'],
              }}
            >
              Equipment Logistics Platform
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default AppShell;