/**
 * G4Lite — App Root
 * ====================
 *
 * Top-level component that wires together all providers and routes.
 *
 * Provider stack (outermost → innermost):
 *  1. QueryClientProvider — TanStack Query cache
 *  2. ThemeProvider — MUI theme with runtime accent colour
 *  3. CssBaseline — global resets
 *  4. SnackbarProvider — notistack toast notifications
 *  5. BrowserRouter — React Router
 *
 * Route structure:
 *  /login                 — public
 *  /change-password       — authenticated, forced if must_change_password
 *  /                      — LandingPage (dashboard overview)
 *  /inventory             — InventoryPage (all roles)
 *  /inventory/:id         — ItemDetailPage (all roles)
 *  /signouts              — MySignoutsPage (write roles)
 *  /resupply              — ResupplyPage (write roles)
 *  /settings              — SettingsPage (all roles)
 *  /assistant             — AssistantPage (all roles, if Ollama available)
 *  /admin                 — AdminPage (admin only)
 *  /admin/signouts        — admin sign-out management
 *  /admin/resupply        — admin resupply management
 *  /admin/users           — UserManagementPage
 *  /admin/notifications   — NotificationManagementPage
 *  /admin/items/new       — ItemCreatePage
 *  /admin/items/:id/edit  — ItemEditPage
 *  /*                     — NotFoundPage
 *
 * Route guards:
 *  - AppShell handles auth + hydration + must_change_password
 *  - AdminRoute wraps admin-only routes
 *  - WriteRoute wraps routes that require write access (admin + user, not viewer)
 */

import { useMemo, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SnackbarProvider } from 'notistack';
import { createAppTheme } from './theme';
import { useThemeStore } from './store/themeStore';
import { useAuthStore } from './store/authStore';

// Layout — not lazy (always needed immediately)
import AppShell from './components/layout/AppShell';

// Loading fallback for lazy routes
import { PageSkeleton } from './components/common/LoadingSkeleton';

// ─────────────────────────────────────────────────────────────────────────────
// Lazy-loaded pages
// Code-split on route boundaries for faster initial load.
// Each page + its dependencies are bundled into separate chunks.
// ─────────────────────────────────────────────────────────────────────────────

const LoginPage = lazy(() => import('./pages/LoginPage.tsx'));
const ChangePasswordPage = lazy(() => import('./pages/Changepasswordpage.tsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.tsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.tsx'));
const ItemDetailPage = lazy(() => import('./pages/ItemDetailPage.tsx'));
const MySignoutsPage = lazy(() => import('./pages/MySignoutsPage.tsx'));
const ResupplyPage = lazy(() => import('./pages/ResupplyPage.tsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx'));
const AssistantPage = lazy(() => import('./pages/AssistantPage.tsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.tsx'));
const AdminSignoutsPage = lazy(() => import('./pages/AdminSignoutsPage.tsx'));
const AdminResupplyPage = lazy(() => import('./pages/AdminResupplyPage.tsx'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage.tsx'));
const NotificationManagementPage = lazy(() => import('./pages/NotificationManagementPage.tsx'));
const ItemCreatePage = lazy(() => import('./pages/ItemCreatePage.tsx'));
const ItemEditPage = lazy(() => import('./pages/ItemEditPage.tsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx'));

// ─────────────────────────────────────────────────────────────────────────────
// QueryClient configuration
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,            // 30s — data is considered fresh
      gcTime: 5 * 60 * 1000,        // 5min — cache garbage collection
      refetchOnReconnect: true,      // Refetch when network reconnects
    },
    mutations: {
      retry: 0,                      // Mutations never auto-retry
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Route guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin-only route guard.
 * Redirects non-admin users to the home page.
 * Auth check is handled by AppShell — this only checks role.
 */
const AdminRoute = ({ children }: { children: ReactNode }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

/**
 * Write-access route guard.
 * Allows admin + user roles, blocks viewer role.
 * Viewers can browse inventory but cannot sign out or request resupply.
 */
const WriteRoute = ({ children }: { children: ReactNode }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'viewer') {
    return <Navigate to="/inventory" replace />;
  }
  return <>{children}</>;
};

/**
 * Suspense wrapper for lazy-loaded pages.
 * Shows PageSkeleton during chunk download.
 */
const LazyPage = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<PageSkeleton />}>
    {children}
  </Suspense>
);

// ─────────────────────────────────────────────────────────────────────────────
// Route definitions
// ─────────────────────────────────────────────────────────────────────────────

const AppRoutes = () => (
  <Routes>
    {/* ── Public routes ──────────────────────────────────────────── */}
    <Route
      path="/login"
      element={
        <LazyPage>
          <LoginPage />
        </LazyPage>
      }
    />

    {/* ── Authenticated routes (wrapped by AppShell) ─────────────── */}
    <Route element={<AppShell />}>

      {/* Password change — accessible when must_change_password is true */}
      <Route
        path="/change-password"
        element={
          <LazyPage>
            <ChangePasswordPage />
          </LazyPage>
        }
      />

      {/* Home / Landing — all roles */}
      <Route
        index
        element={
          <LazyPage>
            <LandingPage />
          </LazyPage>
        }
      />

      {/* ── Inventory — all roles ──────────────────────────────── */}
      <Route
        path="/inventory"
        element={
          <LazyPage>
            <InventoryPage />
          </LazyPage>
        }
      />
      <Route
        path="/inventory/:id"
        element={
          <LazyPage>
            <ItemDetailPage />
          </LazyPage>
        }
      />

      {/* ── Sign-outs — write roles only ───────────────────────── */}
      <Route
        path="/signouts"
        element={
          <WriteRoute>
            <LazyPage>
              <MySignoutsPage />
            </LazyPage>
          </WriteRoute>
        }
      />

      {/* ── Resupply — write roles only ────────────────────────── */}
      <Route
        path="/resupply"
        element={
          <WriteRoute>
            <LazyPage>
              <ResupplyPage />
            </LazyPage>
          </WriteRoute>
        }
      />

      {/* ── Settings — all roles ───────────────────────────────── */}
      <Route
        path="/settings"
        element={
          <LazyPage>
            <SettingsPage />
          </LazyPage>
        }
      />

      {/* ── Assistant — all roles ──────────────────────────────── */}
      <Route
        path="/assistant"
        element={
          <LazyPage>
            <AssistantPage />
          </LazyPage>
        }
      />

      {/* ── Admin routes — admin role only ─────────────────────── */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <LazyPage>
              <AdminPage />
            </LazyPage>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/signouts"
        element={
          <AdminRoute>
            <LazyPage>
              <AdminSignoutsPage />
            </LazyPage>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/resupply"
        element={
          <AdminRoute>
            <LazyPage>
              <AdminResupplyPage />
            </LazyPage>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <LazyPage>
              <UserManagementPage />
            </LazyPage>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/notifications"
        element={
          <AdminRoute>
            <LazyPage>
              <NotificationManagementPage />
            </LazyPage>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/items/new"
        element={
          <AdminRoute>
            <LazyPage>
              <ItemCreatePage />
            </LazyPage>
          </AdminRoute>
        }
      />
      <Route
        path="/admin/items/:id/edit"
        element={
          <AdminRoute>
            <LazyPage>
              <ItemEditPage />
            </LazyPage>
          </AdminRoute>
        }
      />

      {/* ── Catch-all within authenticated shell ───────────────── */}
      <Route
        path="*"
        element={
          <LazyPage>
            <NotFoundPage />
          </LazyPage>
        }
      />
    </Route>
  </Routes>
);

// ─────────────────────────────────────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────────────────────────────────────

const App = () => {
  const { accentColour } = useThemeStore();
  const theme = useMemo(() => createAppTheme(accentColour), [accentColour]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          autoHideDuration={4000}
          preventDuplicate
          dense
        >
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>

      {/* Dev tools — stripped in production build */}
      <ReactQueryDevtools
        initialIsOpen={false}
        buttonPosition="bottom-left"
      />
    </QueryClientProvider>
  );
};

export default App;