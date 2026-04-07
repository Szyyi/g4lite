/**
 * G4Lite — Design Tokens
 * ========================
 *
 * Single source of truth for every visual primitive in the platform.
 * Imported by: MUI theme (theme.ts), Tailwind config, and component sx props.
 *
 * Rules:
 *  - No component file may contain a hardcoded hex string — reference tokens
 *  - All numeric values use the spacing scale — no magic pixel numbers
 *  - Status/criticality/priority colours are semantic — never used decoratively
 *  - `as const` ensures literal types for TypeScript narrowing
 *
 * Token categories:
 *  1. Surface        — background elevation ladder
 *  2. Text           — foreground colour hierarchy
 *  3. Accent         — single configurable brand colour
 *  4. Status         — semantic state colours (success/warning/danger/info)
 *  5. Criticality    — item criticality levels (routine → essential)
 *  6. Priority       — resupply/notification priority (low → critical)
 *  7. Condition      — equipment condition states
 *  8. Typography     — font families, size scale, weight scale, line heights
 *  9. Spacing        — base-4 spacing scale
 * 10. Layout         — shell dimensions, breakpoints, max widths
 * 11. Borders        — radius, widths
 * 12. Elevation      — z-index layering scale
 * 13. Shadows        — dark-UI safe shadows (modals/dropdowns only)
 * 14. Motion         — transitions, easings, durations
 * 15. Opacity        — transparency scale
 * 16. Icons          — size scale
 * 17. Charts         — data visualisation palette
 * 18. Scrollbar      — custom scrollbar dimensions
 * 19. Focus          — accessibility focus ring
 */

export const tokens = {

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Surface — background elevation ladder
  //    Each step is a perceptible lightness increment on near-black.
  //    Used for visual layering without box shadows.
  // ─────────────────────────────────────────────────────────────────────────
  surface: {
    base:      '#080A0F',   // Page background — deepest
    sunken:    '#060809',   // Inset areas: input fields, code blocks, wells
    raised:    '#0E1118',   // Cards, panels, table containers
    overlay:   '#141720',   // Modals, drawers, command palette
    elevated:  '#1A1E2E',   // Dropdown menus, popovers, tooltips
    border:    '#1E2230',   // Default structural borders
    borderHi:  '#2D3347',   // Hover/focus borders, active separators
    borderMax: '#3D4460',   // High-emphasis borders (selected card, drag handle)
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Text — foreground colour hierarchy
  //    Four levels. Never use pure #FFFFFF for body text on dark surfaces.
  // ─────────────────────────────────────────────────────────────────────────
  text: {
    primary:   '#E8EAF0',   // Headings, labels, primary content — 92% white
    secondary: '#8B91A8',   // Descriptions, metadata, supporting text
    tertiary:  '#555C75',   // Placeholders, disabled states, hints, timestamps
    quartery:  '#3A4058',   // Ghost text, watermarks, barely-visible labels
    inverse:   '#080A0F',   // Text on accent/status backgrounds
    link:      '#60A5FA',   // Inline hyperlinks (matches accent.text)
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Accent — single configurable brand colour
  //    Default: blue. Overridden at runtime via themeStore.
  //    Used ONLY for: interactive elements, active states, CTAs, focus rings.
  // ─────────────────────────────────────────────────────────────────────────
  accent: {
    default:   '#3B82F6',   // Buttons, links, active nav indicator
    hover:     '#2563EB',   // Hovered interactive elements
    active:    '#1D4ED8',   // Pressed/active state
    muted:     '#1D3461',   // 15-20% accent for subtle backgrounds
    subtle:    '#0F1D35',   // 8% accent for large-area tints
    text:      '#60A5FA',   // Accent colour safe for text (AA contrast on dark)
    border:    '#2563EB80', // Accent border with 50% opacity
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Status — semantic state colours
  //    Each has a full variant (for text, icons, badges) and a muted variant
  //    (for chip/alert backgrounds). Plus a subtle variant for row highlights.
  // ─────────────────────────────────────────────────────────────────────────
  status: {
    success:       '#22C55E',
    successMuted:  '#14532D',
    successSubtle: '#0A2E18',
    successBorder: '#22C55E40',

    warning:       '#F59E0B',
    warningMuted:  '#451A03',
    warningSubtle: '#261002',
    warningBorder: '#F59E0B40',

    danger:        '#EF4444',
    dangerMuted:   '#4C0519',
    dangerSubtle:  '#2A030E',
    dangerBorder:  '#EF444440',

    info:          '#3B82F6',
    infoMuted:     '#1D3461',
    infoSubtle:    '#0F1D35',
    infoBorder:    '#3B82F640',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Criticality — item criticality levels
  //    Maps to CriticalityLevel enum. Used for badges, sort priority, and
  //    low-stock alert severity.
  // ─────────────────────────────────────────────────────────────────────────
  criticality: {
    routine: {
      color:  '#8B91A8',
      bg:     '#1E2230',
      border: '#8B91A830',
      label:  'Routine',
    },
    important: {
      color:  '#3B82F6',
      bg:     '#1D3461',
      border: '#3B82F630',
      label:  'Important',
    },
    critical: {
      color:  '#F59E0B',
      bg:     '#451A03',
      border: '#F59E0B30',
      label:  'Critical',
    },
    essential: {
      color:  '#EF4444',
      bg:     '#4C0519',
      border: '#EF444430',
      label:  'Essential',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Priority — resupply and notification priority levels
  //    Maps to ResupplyPriority and NotificationPriority enums.
  // ─────────────────────────────────────────────────────────────────────────
  priority: {
    low: {
      color:  '#555C75',
      bg:     '#1E2230',
      border: '#555C7530',
      label:  'Low',
    },
    normal: {
      color:  '#8B91A8',
      bg:     '#1E2230',
      border: '#8B91A830',
      label:  'Normal',
    },
    routine: {
      color:  '#8B91A8',
      bg:     '#1E2230',
      border: '#8B91A830',
      label:  'Routine',
    },
    high: {
      color:  '#F59E0B',
      bg:     '#451A03',
      border: '#F59E0B30',
      label:  'High',
    },
    urgent: {
      color:  '#F59E0B',
      bg:     '#451A03',
      border: '#F59E0B30',
      label:  'Urgent',
    },
    critical: {
      color:  '#EF4444',
      bg:     '#4C0519',
      border: '#EF444430',
      label:  'Critical',
    },
    emergency: {
      color:  '#FF2D55',
      bg:     '#5C0A1A',
      border: '#FF2D5540',
      label:  'Emergency',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Condition — equipment condition states
  //    Maps to ConditionState enum. Used on item detail, return forms,
  //    and condition breakdown charts.
  // ─────────────────────────────────────────────────────────────────────────
  condition: {
    serviceable: {
      color:  '#22C55E',
      bg:     '#14532D',
      border: '#22C55E30',
      label:  'Serviceable',
    },
    unserviceable: {
      color:  '#F59E0B',
      bg:     '#451A03',
      border: '#F59E0B30',
      label:  'Unserviceable',
    },
    damaged: {
      color:  '#EF4444',
      bg:     '#4C0519',
      border: '#EF444430',
      label:  'Damaged',
    },
    condemned: {
      color:  '#8B5CF6',
      bg:     '#2E1065',
      border: '#8B5CF630',
      label:  'Condemned',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Typography — fonts, sizes, weights, line heights, letter spacing
  // ─────────────────────────────────────────────────────────────────────────
  font: {
    sans:  "'Montserrat', 'Helvetica Neue', sans-serif",
    mono:  "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  },

  fontSize: {
    '2xs':  '0.625rem',    // 10px — badge counts, micro labels
    xs:     '0.6875rem',   // 11px — overline, table headers, chip text
    sm:     '0.75rem',     // 12px — captions, timestamps, small labels
    base:   '0.8125rem',   // 13px — body2, buttons, nav items, inputs
    md:     '0.875rem',    // 14px — body1, form labels, descriptions
    lg:     '1rem',        // 16px — h5, card titles
    xl:     '1.125rem',    // 18px — h4, section headings
    '2xl':  '1.25rem',     // 20px — h3
    '3xl':  '1.5rem',      // 24px — h2, page titles
    '4xl':  '2rem',        // 32px — h1, hero numbers
    '5xl':  '2.5rem',      // 40px — large stat values
    '6xl':  '3rem',        // 48px — error page codes
  },

  fontWeight: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
    extrabold: 800,
  },

  lineHeight: {
    none:    1,
    tight:   1.1,
    snug:    1.2,
    normal:  1.4,
    relaxed: 1.5,
    loose:   1.6,
  },

  letterSpacing: {
    tighter: '-0.03em',
    tight:   '-0.02em',
    snug:    '-0.01em',
    normal:  '0',
    wide:    '0.01em',
    wider:   '0.02em',
    widest:  '0.04em',
    tracked: '0.08em',   // Table headers, overline
    caps:    '0.1em',    // All-caps navigation labels
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Spacing — base-4 scale
  //    Every margin, padding, and gap must use this scale.
  //    Named keys for readability; numeric keys for compatibility.
  // ─────────────────────────────────────────────────────────────────────────
  space: {
    0:    '0px',
    px:   '1px',
    0.5:  '2px',
    1:    '4px',
    1.5:  '6px',
    2:    '8px',
    2.5:  '10px',
    3:    '12px',
    4:    '16px',
    5:    '20px',
    6:    '24px',
    7:    '28px',
    8:    '32px',
    9:    '36px',
    10:   '40px',
    12:   '48px',
    14:   '56px',
    16:   '64px',
    20:   '80px',
    24:   '96px',
    32:   '128px',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Layout — shell dimensions, content constraints
  // ─────────────────────────────────────────────────────────────────────────
  layout: {
    sidebarWidth:      '240px',
    sidebarCollapsed:  '64px',
    topbarHeight:      '64px',
    contentMaxWidth:   '1440px',
    contentPadding:    '32px',
    formMaxWidth:      '600px',
    drawerWidth:       '480px',
    drawerWidthWide:   '640px',
    modalMaxWidth:     '560px',
    commandPaletteWidth: '640px',
    notificationPopoverWidth: '380px',
    notificationPopoverMaxHeight: '480px',
    tableRowHeight:    '48px',
    cardMinWidth:      '280px',
  },

  breakpoint: {
    xs:  '480px',
    sm:  '640px',
    md:  '768px',
    lg:  '1024px',
    xl:  '1280px',
    xxl: '1536px',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Borders — radius + widths
  // ─────────────────────────────────────────────────────────────────────────
  radius: {
    none: '0px',
    sm:   '4px',    // Chips, badges, small elements
    md:   '6px',    // Inputs, buttons, menu items
    lg:   '8px',    // Cards, panels, table containers
    xl:   '12px',   // Modals, drawers, command palette
    full: '9999px', // Circular elements (avatar, colour swatch)
  },

  borderWidth: {
    none:   '0px',
    thin:   '1px',    // Default structural borders
    medium: '1.5px',  // Emphasis borders (selected state)
    thick:  '2px',    // Focus rings, active indicators
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Elevation — z-index layering scale
  //    Strict ladder prevents z-fighting. Components reference by name.
  // ─────────────────────────────────────────────────────────────────────────
  zIndex: {
    base:           0,
    dropdown:       100,
    sticky:         200,     // Sticky table headers, filter bars
    sidebar:        300,
    topbar:         400,
    drawer:         500,
    modal:          600,
    popover:        700,     // Notification bell, tooltips
    commandPalette: 800,
    toast:          900,
    overlay:        1000,    // Full-screen backdrop
    critical:       1100,    // Critical notification banner
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 13. Shadows — used sparingly on dark UI
  //    Only for floating elements that MUST separate from the surface:
  //    modals, dropdowns, popovers. Never on inline cards.
  // ─────────────────────────────────────────────────────────────────────────
  shadow: {
    none:     'none',
    sm:       '0 2px 8px rgba(0, 0, 0, 0.3)',
    md:       '0 8px 24px rgba(0, 0, 0, 0.4)',
    lg:       '0 16px 48px rgba(0, 0, 0, 0.5)',
    xl:       '0 24px 80px rgba(0, 0, 0, 0.6)',
    dropdown: '0 4px 16px rgba(0, 0, 0, 0.5)',
    drawer:   '-4px 0 24px rgba(0, 0, 0, 0.5)',
    toast:    '0 4px 12px rgba(0, 0, 0, 0.4)',
    glow:     '0 0 20px rgba(59, 130, 246, 0.15)', // Accent glow for focused elements
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 14. Motion — transitions, durations, easings
  //    All animations must be purposeful. No decorative motion.
  // ─────────────────────────────────────────────────────────────────────────
  transition: {
    fast:   '120ms ease',
    normal: '200ms ease',
    slow:   '300ms ease',
    spring: '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',  // Bouncy micro-interactions
  },

  duration: {
    instant:  '0ms',
    fast:     '120ms',
    normal:   '200ms',
    slow:     '300ms',
    slower:   '500ms',
    page:     '150ms',   // Page transition fade
  },

  easing: {
    default:    'cubic-bezier(0.4, 0, 0.2, 1)',
    in:         'cubic-bezier(0.4, 0, 1, 1)',
    out:        'cubic-bezier(0, 0, 0.2, 1)',
    inOut:      'cubic-bezier(0.4, 0, 0.2, 1)',
    spring:     'cubic-bezier(0.34, 1.56, 0.64, 1)',
    sharp:      'cubic-bezier(0.4, 0, 0.6, 1)',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 15. Opacity — transparency scale
  // ─────────────────────────────────────────────────────────────────────────
  opacity: {
    0:    0,
    5:    0.05,
    10:   0.10,
    15:   0.15,
    20:   0.20,
    25:   0.25,
    30:   0.30,
    40:   0.40,
    50:   0.50,
    60:   0.60,
    70:   0.70,
    80:   0.80,
    90:   0.90,
    100:  1,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 16. Icons — size scale
  //    All icons are line-weight (Outlined variant). Never filled.
  // ─────────────────────────────────────────────────────────────────────────
  icon: {
    xs:   12,   // Inline indicators, badge icons
    sm:   16,   // Compact mode, chip icons, table row actions
    md:   20,   // Default — nav items, buttons, form field icons
    lg:   24,   // Section icons, card headers
    xl:   32,   // Page headers, stat cards
    xxl:  48,   // Empty states, error pages
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 17. Charts — data visualisation colour palette
  //    Desaturated, high-contrast on dark backgrounds. Ordered for
  //    categorical distinction. Never used outside of Recharts/chart context.
  // ─────────────────────────────────────────────────────────────────────────
  chart: {
    palette: [
      '#3B82F6',  // Blue — primary series
      '#22C55E',  // Green
      '#F59E0B',  // Amber
      '#EF4444',  // Red
      '#8B5CF6',  // Purple
      '#06B6D4',  // Cyan
      '#F97316',  // Orange
      '#EC4899',  // Pink
      '#64748B',  // Slate — neutral series
      '#A78BFA',  // Light purple
    ],
    grid:       '#1E2230',    // Chart grid lines
    axis:       '#555C75',    // Axis labels and tick marks
    cursor:     '#2D3347',    // Crosshair / hover line
    tooltip: {
      bg:       '#141720',
      border:   '#2D3347',
      text:     '#E8EAF0',
      label:    '#8B91A8',
    },
    area: {
      fillOpacity:  0.08,     // Area chart fill
      strokeWidth:  2,
    },
    bar: {
      radius:       4,        // Bar corner radius
      gap:          4,        // Gap between grouped bars
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 18. Scrollbar — custom styling dimensions
  // ─────────────────────────────────────────────────────────────────────────
  scrollbar: {
    width:      '6px',
    track:      'transparent',
    thumb:      '#2D3347',
    thumbHover: '#3D4460',
    radius:     '3px',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 19. Focus — accessibility focus ring
  //    Applied via MUI theme + custom :focus-visible styles.
  // ─────────────────────────────────────────────────────────────────────────
  focus: {
    ring:       '2px solid #3B82F6',
    ringOffset: '2px',
    outline:    '#3B82F680',    // 50% opacity accent for outer glow
  },

} as const;


// ─────────────────────────────────────────────────────────────────────────────
// Type Exports — for components that need to reference token paths
// ─────────────────────────────────────────────────────────────────────────────

export type SurfaceToken = keyof typeof tokens.surface;
export type TextToken = keyof typeof tokens.text;
export type StatusToken = 'success' | 'warning' | 'danger' | 'info';
export type CriticalityToken = keyof typeof tokens.criticality;
export type PriorityToken = keyof typeof tokens.priority;
export type ConditionToken = keyof typeof tokens.condition;
export type SpaceToken = keyof typeof tokens.space;
export type RadiusToken = keyof typeof tokens.radius;
export type IconSizeToken = keyof typeof tokens.icon;
export type ZIndexToken = keyof typeof tokens.zIndex;
export type ShadowToken = keyof typeof tokens.shadow;
export type FontSizeToken = keyof typeof tokens.fontSize;
export type FontWeightToken = keyof typeof tokens.fontWeight;


// ─────────────────────────────────────────────────────────────────────────────
// Semantic Colour Map Helpers
// For components that need to look up colour configs by enum string value
// ─────────────────────────────────────────────────────────────────────────────

export type SemanticColourConfig = {
  readonly color: string;
  readonly bg: string;
  readonly border: string;
  readonly label: string;
};

/**
 * Resolve a criticality level string to its colour config.
 * Safe for dynamic lookups from API response values.
 */
export const getCriticalityConfig = (level: string): SemanticColourConfig =>
  tokens.criticality[level as CriticalityToken] ?? tokens.criticality.routine;

/**
 * Resolve a priority level string to its colour config.
 * Handles both resupply priorities (routine/urgent/critical/emergency)
 * and notification priorities (low/normal/high/critical).
 */
export const getPriorityConfig = (level: string): SemanticColourConfig =>
  tokens.priority[level as PriorityToken] ?? tokens.priority.normal;

/**
 * Resolve a condition state string to its colour config.
 */
export const getConditionConfig = (state: string): SemanticColourConfig =>
  tokens.condition[state as ConditionToken] ?? tokens.condition.serviceable;