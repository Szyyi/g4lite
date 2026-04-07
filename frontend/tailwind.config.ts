/**
 * G4Lite — Tailwind CSS Configuration
 * ======================================
 *
 * Tailwind is used ONLY for layout utilities: flex, grid, gap, padding,
 * margin, width, height, positioning, and display. It must never override
 * MUI component colours or typography — those come exclusively from theme.ts.
 *
 * Colour tokens are exposed here so that one-off layout backgrounds
 * (e.g. a full-bleed section divider) can reference the design system
 * without hardcoded hex. But component-level colours always go through MUI sx.
 *
 * Rules:
 *  - Never use Tailwind colour classes on MUI components — use sx + theme
 *  - Never use Tailwind text-size classes — typography is MUI's domain
 *  - Layout classes (flex, grid, gap, p-*, m-*, w-*, h-*) are encouraged
 *  - The `important: '#root'` selector ensures Tailwind utilities win
 *    specificity battles when applied alongside MUI classes
 */

import type { Config } from 'tailwindcss';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tokens } = require('./src/tokens');

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  important: '#root',

  theme: {
    extend: {

      // ─── Fonts ────────────────────────────────────────────────────────
      // Reference only — MUI handles all typography rendering.
      // These exist so Tailwind's font-sans / font-mono classes resolve
      // correctly if used in rare non-MUI contexts (e.g. raw HTML overlays).
      fontFamily: {
        sans: ['Montserrat', 'Helvetica Neue', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },

      // ─── Colours ──────────────────────────────────────────────────────
      // Full token palette. Use sparingly — prefer MUI sx for components.
      // Useful for: bg-surface-base on wrapper divs, border-surface-border
      // on custom layout elements not wrapped in MUI Paper/Card.
      colors: {
        surface: {
          base:      tokens.surface.base,
          sunken:    tokens.surface.sunken,
          raised:    tokens.surface.raised,
          overlay:   tokens.surface.overlay,
          elevated:  tokens.surface.elevated,
          border:    tokens.surface.border,
          borderHi:  tokens.surface.borderHi,
          borderMax: tokens.surface.borderMax,
        },
        text: {
          primary:   tokens.text.primary,
          secondary: tokens.text.secondary,
          tertiary:  tokens.text.tertiary,
          quartery:  tokens.text.quartery,
          inverse:   tokens.text.inverse,
          link:      tokens.text.link,
        },
        accent: {
          DEFAULT:  tokens.accent.default,
          hover:    tokens.accent.hover,
          active:   tokens.accent.active,
          muted:    tokens.accent.muted,
          subtle:   tokens.accent.subtle,
          text:     tokens.accent.text,
        },
        status: {
          success:       tokens.status.success,
          successMuted:  tokens.status.successMuted,
          successSubtle: tokens.status.successSubtle,
          warning:       tokens.status.warning,
          warningMuted:  tokens.status.warningMuted,
          warningSubtle: tokens.status.warningSubtle,
          danger:        tokens.status.danger,
          dangerMuted:   tokens.status.dangerMuted,
          dangerSubtle:  tokens.status.dangerSubtle,
          info:          tokens.status.info,
          infoMuted:     tokens.status.infoMuted,
          infoSubtle:    tokens.status.infoSubtle,
        },
      },

      // ─── Spacing ──────────────────────────────────────────────────────
      // Extends Tailwind's default scale with G4Lite-specific values.
      // These fill gaps in the default scale and add larger values for
      // page-level layout (content padding, section spacing).
      spacing: {
        '0.5':  '2px',
        '1.5':  '6px',
        '2.5':  '10px',
        '4.5':  '18px',
        '5.5':  '22px',
        '7':    '28px',
        '9':    '36px',
        '13':   '52px',
        '15':   '60px',
        '17':   '68px',
        '18':   '72px',
        '22':   '88px',
        '26':   '104px',
        '30':   '120px',
        '34':   '136px',
        '38':   '152px',
        // Layout-specific named sizes
        'sidebar':          tokens.layout.sidebarWidth,
        'sidebar-collapsed': tokens.layout.sidebarCollapsed,
        'topbar':           tokens.layout.topbarHeight,
        'drawer':           tokens.layout.drawerWidth,
        'drawer-wide':      tokens.layout.drawerWidthWide,
      },

      // ─── Width / Max-Width ────────────────────────────────────────────
      width: {
        'sidebar':          tokens.layout.sidebarWidth,
        'sidebar-collapsed': tokens.layout.sidebarCollapsed,
        'drawer':           tokens.layout.drawerWidth,
        'drawer-wide':      tokens.layout.drawerWidthWide,
        'modal':            tokens.layout.modalMaxWidth,
        'cmd-palette':      tokens.layout.commandPaletteWidth,
        'notif-popover':    tokens.layout.notificationPopoverWidth,
      },
      maxWidth: {
        'content':     tokens.layout.contentMaxWidth,
        'form':        tokens.layout.formMaxWidth,
        'modal':       tokens.layout.modalMaxWidth,
        'cmd-palette': tokens.layout.commandPaletteWidth,
        'prose':       '65ch',
      },
      maxHeight: {
        'notif-popover': tokens.layout.notificationPopoverMaxHeight,
      },
      minWidth: {
        'card':  tokens.layout.cardMinWidth,
        'menu':  '200px',
      },
      minHeight: {
        'row':   tokens.layout.tableRowHeight,
        'topbar': tokens.layout.topbarHeight,
      },

      // ─── Breakpoints ─────────────────────────────────────────────────
      screens: {
        'xs':  tokens.breakpoint.xs,
        'sm':  tokens.breakpoint.sm,
        'md':  tokens.breakpoint.md,
        'lg':  tokens.breakpoint.lg,
        'xl':  tokens.breakpoint.xl,
        'xxl': tokens.breakpoint.xxl,
      },

      // ─── Border Radius ────────────────────────────────────────────────
      borderRadius: {
        'none': tokens.radius.none,
        'sm':   tokens.radius.sm,
        'md':   tokens.radius.md,
        'lg':   tokens.radius.lg,
        'xl':   tokens.radius.xl,
        'full': tokens.radius.full,
      },

      // ─── Box Shadow ───────────────────────────────────────────────────
      // Dark-UI safe shadows — only for floating elements.
      boxShadow: {
        'none':     tokens.shadow.none,
        'sm':       tokens.shadow.sm,
        'md':       tokens.shadow.md,
        'lg':       tokens.shadow.lg,
        'xl':       tokens.shadow.xl,
        'dropdown': tokens.shadow.dropdown,
        'drawer':   tokens.shadow.drawer,
        'toast':    tokens.shadow.toast,
        'glow':     tokens.shadow.glow,
      },

      // ─── Z-Index ──────────────────────────────────────────────────────
      zIndex: {
        'dropdown':       String(tokens.zIndex.dropdown),
        'sticky':         String(tokens.zIndex.sticky),
        'sidebar':        String(tokens.zIndex.sidebar),
        'topbar':         String(tokens.zIndex.topbar),
        'drawer':         String(tokens.zIndex.drawer),
        'modal':          String(tokens.zIndex.modal),
        'popover':        String(tokens.zIndex.popover),
        'cmd-palette':    String(tokens.zIndex.commandPalette),
        'toast':          String(tokens.zIndex.toast),
        'overlay':        String(tokens.zIndex.overlay),
        'critical':       String(tokens.zIndex.critical),
      },

      // ─── Opacity ──────────────────────────────────────────────────────
      opacity: {
        '5':  '0.05',
        '10': '0.10',
        '15': '0.15',
        '20': '0.20',
        '25': '0.25',
        '30': '0.30',
        '35': '0.35',
        '40': '0.40',
        '60': '0.60',
        '70': '0.70',
        '80': '0.80',
        '90': '0.90',
      },

      // ─── Transitions ─────────────────────────────────────────────────
      transitionDuration: {
        'fast':   tokens.duration.fast,
        'normal': tokens.duration.normal,
        'slow':   tokens.duration.slow,
        'page':   tokens.duration.page,
      },
      transitionTimingFunction: {
        'default': tokens.easing.default,
        'in':      tokens.easing.in,
        'out':     tokens.easing.out,
        'in-out':  tokens.easing.inOut,
        'spring':  tokens.easing.spring,
        'sharp':   tokens.easing.sharp,
      },

      // ─── Animations ──────────────────────────────────────────────────
      // Purposeful, fast, never decorative.
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%':   { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.7' },
        },
      },
      animation: {
        'fade-in':        'fade-in 150ms ease forwards',
        'fade-in-up':     'fade-in-up 200ms ease forwards',
        'fade-in-down':   'fade-in-down 200ms ease forwards',
        'scale-in':       'scale-in 200ms ease forwards',
        'slide-in-right': 'slide-in-right 250ms ease forwards',
        'slide-in-left':  'slide-in-left 250ms ease forwards',
        'pulse-subtle':   'pulse-subtle 2s ease-in-out infinite',
      },

      // ─── Grid ─────────────────────────────────────────────────────────
      gridTemplateColumns: {
        'inventory': 'repeat(auto-fill, minmax(280px, 1fr))',
        'stats':     'repeat(auto-fill, minmax(220px, 1fr))',
        'form-2col': 'repeat(2, 1fr)',
      },

      // ─── Aspect Ratio ─────────────────────────────────────────────────
      aspectRatio: {
        'card': '4 / 3',
      },
    },
  },

  // ─── Plugins ──────────────────────────────────────────────────────────
  plugins: [],

  // ─── Safelist ─────────────────────────────────────────────────────────
  // Classes generated dynamically (e.g. from status/criticality lookups)
  // must be safelisted or they'll be purged in production.
  safelist: [
    // Status backgrounds used in dynamic badge rendering
    'bg-status-success',
    'bg-status-successMuted',
    'bg-status-warning',
    'bg-status-warningMuted',
    'bg-status-danger',
    'bg-status-dangerMuted',
    'bg-status-info',
    'bg-status-infoMuted',
    // Animations applied conditionally
    'animate-fade-in',
    'animate-fade-in-up',
    'animate-scale-in',
  ],

} satisfies Config;