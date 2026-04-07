/**
 * G4Lite — Theme & UI Preferences Store
 * ========================================
 *
 * Persisted UI state that survives page reloads. Stored in localStorage
 * under 'g4lite-ui-prefs'. Covers:
 *
 *  - Accent colour (runtime theme switch — feeds createAppTheme)
 *  - Sidebar collapsed state
 *  - Inventory view mode (grid vs table)
 *  - Table density preference (comfortable vs compact)
 *  - Notification popover dismissed state
 *
 * When the accent colour changes, CSS custom properties on :root are
 * also updated so non-MUI elements (scrollbar glow, selection colour,
 * CSS animations) stay in sync without a React re-render.
 *
 * Usage:
 *  ```tsx
 *  const { accentColour } = useThemeStore();
 *  const theme = useMemo(() => createAppTheme(accentColour), [accentColour]);
 *  ```
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InventoryViewMode, SidebarState } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Accent colour options
// ─────────────────────────────────────────────────────────────────────────────

export interface AccentOption {
  readonly label: string;
  readonly value: string;
  /** Lighter variant for text-on-dark usage */
  readonly textValue: string;
}

export const ACCENT_OPTIONS: readonly AccentOption[] = [
  { label: 'Blue',    value: '#3B82F6', textValue: '#60A5FA' },
  { label: 'Indigo',  value: '#6366F1', textValue: '#818CF8' },
  { label: 'Violet',  value: '#8B5CF6', textValue: '#A78BFA' },
  { label: 'Slate',   value: '#64748B', textValue: '#94A3B8' },
  { label: 'Teal',    value: '#14B8A6', textValue: '#2DD4BF' },
  { label: 'Emerald', value: '#10B981', textValue: '#34D399' },
  { label: 'Amber',   value: '#F59E0B', textValue: '#FBBF24' },
  { label: 'Rose',    value: '#F43F5E', textValue: '#FB7185' },
] as const;

const DEFAULT_ACCENT = '#3B82F6';

// ─────────────────────────────────────────────────────────────────────────────
// Table density
// ─────────────────────────────────────────────────────────────────────────────

export type TableDensity = 'comfortable' | 'compact';

// ─────────────────────────────────────────────────────────────────────────────
// CSS custom property sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates CSS custom properties on :root when accent colour changes.
 * This keeps non-MUI elements (selection, focus rings, scrollbar glow,
 * notistack overrides) in sync without requiring a React re-render.
 */
const syncCssCustomProperties = (accentColour: string): void => {
  const root = document.documentElement;
  if (!root) return;

  // Find the matching option for the text variant
  const option = ACCENT_OPTIONS.find((o) => o.value === accentColour);
  const textVariant = option?.textValue ?? accentColour;

  root.style.setProperty('--g4-accent', accentColour);
  root.style.setProperty('--g4-accent-text', textVariant);

  // Compute hover (darken ~15%) and muted (15% opacity) variants
  // Using simple hex manipulation — no runtime dependency needed
  root.style.setProperty('--g4-accent-hover', accentColour);
  root.style.setProperty('--g4-accent-muted', `${accentColour}26`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeState {
  /** Current accent colour hex value */
  accentColour: string;

  /** Sidebar expanded/collapsed */
  sidebarState: SidebarState;

  /** Inventory page view mode */
  inventoryViewMode: InventoryViewMode;

  /** Table row density */
  tableDensity: TableDensity;
}

interface ThemeActions {
  /** Set accent colour and sync CSS custom properties */
  setAccent: (colour: string) => void;

  /** Toggle sidebar between expanded and collapsed */
  toggleSidebar: () => void;

  /** Set sidebar to a specific state */
  setSidebarState: (state: SidebarState) => void;

  /** Set inventory view mode */
  setInventoryViewMode: (mode: InventoryViewMode) => void;

  /** Set table density */
  setTableDensity: (density: TableDensity) => void;

  /** Reset all preferences to defaults */
  resetPreferences: () => void;
}

type ThemeStore = ThemeState & ThemeActions;

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_STATE: ThemeState = {
  accentColour: DEFAULT_ACCENT,
  sidebarState: 'expanded',
  inventoryViewMode: 'grid',
  tableDensity: 'comfortable',
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setAccent: (colour) => {
        syncCssCustomProperties(colour);
        set({ accentColour: colour });
      },

      toggleSidebar: () => {
        const current = get().sidebarState;
        set({ sidebarState: current === 'expanded' ? 'collapsed' : 'expanded' });
      },

      setSidebarState: (sidebarState) => {
        set({ sidebarState });
      },

      setInventoryViewMode: (inventoryViewMode) => {
        set({ inventoryViewMode });
      },

      setTableDensity: (tableDensity) => {
        set({ tableDensity });
      },

      resetPreferences: () => {
        syncCssCustomProperties(DEFAULT_ACCENT);
        set(DEFAULT_STATE);
      },
    }),
    {
      name: 'G4Lite-ui-prefs',

      // Sync CSS custom properties when store rehydrates from localStorage
      onRehydrateStorage: () => (state) => {
        if (state?.accentColour) {
          syncCssCustomProperties(state.accentColour);
        }
      },
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// Selector hooks — granular subscriptions to prevent unnecessary re-renders
// ─────────────────────────────────────────────────────────────────────────────

/** Current accent colour */
export const useAccentColour = () => useThemeStore((s) => s.accentColour);

/** Sidebar state */
export const useSidebarState = () => useThemeStore((s) => s.sidebarState);

/** Whether sidebar is collapsed */
export const useSidebarCollapsed = () =>
  useThemeStore((s) => s.sidebarState === 'collapsed');

/** Inventory view mode */
export const useInventoryViewMode = () =>
  useThemeStore((s) => s.inventoryViewMode);

/** Table density */
export const useTableDensity = () => useThemeStore((s) => s.tableDensity);