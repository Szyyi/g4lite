/**
 * G4Lite — MUI Theme Configuration
 * ===================================
 *
 * Single source of truth for all visual styling. No component file may contain
 * hardcoded hex strings or inline colours that bypass this theme.
 *
 * Architecture:
 *  - `createAppTheme(accentColour)` returns a full MUI theme
 *  - Accent colour is configurable at runtime via themeStore
 *  - All values derived from tokens.ts — zero magic numbers
 *  - Component overrides are exhaustive — every MUI component used in G4Lite
 *    has explicit default props and style overrides
 *
 * Usage:
 *  ```tsx
 *  const { accentColour } = useThemeStore();
 *  const theme = useMemo(() => createAppTheme(accentColour), [accentColour]);
 *  <ThemeProvider theme={theme}>...</ThemeProvider>
 *  ```
 */

import { createTheme, alpha, type ThemeOptions, type Theme } from '@mui/material/styles';
import { tokens } from './tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Augment MUI types for custom theme properties
// ─────────────────────────────────────────────────────────────────────────────

declare module '@mui/material/styles' {
  interface TypeBackground {
    sunken: string;
    overlay: string;
    elevated: string;
  }

  interface TypeText {
    tertiary: string;
    quartery: string;
    inverse: string;
    link: string;
  }

  interface Palette {
    surface: {
      border: string;
      borderHi: string;
      borderMax: string;
    };
  }

  interface PaletteOptions {
    surface?: {
      border?: string;
      borderHi?: string;
      borderMax?: string;
    };
  }
}

// Allow custom colour props on Typography, Chip, etc.
declare module '@mui/material/Typography' {
  interface TypographyPropsColorOverrides {
    tertiary: true;
    quartery: true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme factory
// ─────────────────────────────────────────────────────────────────────────────

export const createAppTheme = (accentColour: string = tokens.accent.default): Theme => {
  const options: ThemeOptions = {

    // ─── Palette ──────────────────────────────────────────────────────────
    palette: {
      mode: 'dark',

      background: {
        default: tokens.surface.base,
        paper:   tokens.surface.raised,
        sunken:  tokens.surface.sunken,
        overlay: tokens.surface.overlay,
        elevated: tokens.surface.elevated,
      },

      primary: {
        main:         accentColour,
        light:        tokens.accent.text,
        dark:         tokens.accent.hover,
        contrastText: tokens.text.inverse,
      },

      secondary: {
        main:         tokens.text.secondary,
        light:        tokens.text.primary,
        dark:         tokens.text.tertiary,
        contrastText: tokens.text.inverse,
      },

      text: {
        primary:   tokens.text.primary,
        secondary: tokens.text.secondary,
        disabled:  tokens.text.tertiary,
        tertiary:  tokens.text.tertiary,
        quartery:  tokens.text.quartery,
        inverse:   tokens.text.inverse,
        link:      tokens.text.link,
      },

      divider: tokens.surface.border,

      surface: {
        border:    tokens.surface.border,
        borderHi:  tokens.surface.borderHi,
        borderMax: tokens.surface.borderMax,
      },

      error:   { main: tokens.status.danger,  dark: tokens.status.dangerMuted  },
      warning: { main: tokens.status.warning, dark: tokens.status.warningMuted },
      success: { main: tokens.status.success, dark: tokens.status.successMuted },
      info:    { main: tokens.status.info,    dark: tokens.status.infoMuted    },

      action: {
        active:            alpha(tokens.text.primary, 0.56),
        hover:             alpha(tokens.text.primary, 0.04),
        selected:          alpha(accentColour, 0.10),
        disabled:          alpha(tokens.text.primary, 0.26),
        disabledBackground: alpha(tokens.text.primary, 0.08),
        focus:             alpha(accentColour, 0.12),
      },
    },

    // ─── Typography ───────────────────────────────────────────────────────
    typography: {
      fontFamily: tokens.font.sans,

      // Display / headings
      h1: {
        fontSize:      tokens.fontSize['4xl'],
        fontWeight:    tokens.fontWeight.bold,
        letterSpacing: tokens.letterSpacing.tighter,
        lineHeight:    tokens.lineHeight.tight,
      },
      h2: {
        fontSize:      tokens.fontSize['3xl'],
        fontWeight:    tokens.fontWeight.bold,
        letterSpacing: tokens.letterSpacing.tight,
        lineHeight:    tokens.lineHeight.snug,
      },
      h3: {
        fontSize:      tokens.fontSize['2xl'],
        fontWeight:    tokens.fontWeight.semibold,
        letterSpacing: tokens.letterSpacing.tight,
        lineHeight:    tokens.lineHeight.snug,
      },
      h4: {
        fontSize:      tokens.fontSize.xl,
        fontWeight:    tokens.fontWeight.semibold,
        letterSpacing: tokens.letterSpacing.snug,
        lineHeight:    tokens.lineHeight.normal,
      },
      h5: {
        fontSize:      tokens.fontSize.lg,
        fontWeight:    tokens.fontWeight.semibold,
        letterSpacing: tokens.letterSpacing.snug,
        lineHeight:    tokens.lineHeight.normal,
      },
      h6: {
        fontSize:      tokens.fontSize.md,
        fontWeight:    tokens.fontWeight.semibold,
        letterSpacing: tokens.letterSpacing.normal,
        lineHeight:    tokens.lineHeight.normal,
      },

      // Body
      body1: {
        fontSize:   tokens.fontSize.md,
        fontWeight: tokens.fontWeight.normal,
        lineHeight: tokens.lineHeight.loose,
      },
      body2: {
        fontSize:   tokens.fontSize.base,
        fontWeight: tokens.fontWeight.normal,
        lineHeight: tokens.lineHeight.relaxed,
      },

      // UI labels
      subtitle1: {
        fontSize:      tokens.fontSize.md,
        fontWeight:    tokens.fontWeight.medium,
        letterSpacing: tokens.letterSpacing.wide,
        lineHeight:    tokens.lineHeight.normal,
      },
      subtitle2: {
        fontSize:      tokens.fontSize.base,
        fontWeight:    tokens.fontWeight.medium,
        letterSpacing: tokens.letterSpacing.wide,
        lineHeight:    tokens.lineHeight.normal,
        color:         tokens.text.secondary,
      },

      // Small text
      caption: {
        fontSize:      tokens.fontSize.sm,
        fontWeight:    tokens.fontWeight.normal,
        letterSpacing: tokens.letterSpacing.wider,
        lineHeight:    tokens.lineHeight.normal,
        color:         tokens.text.tertiary,
      },

      // Navigation / section labels
      overline: {
        fontSize:      tokens.fontSize.xs,
        fontWeight:    tokens.fontWeight.semibold,
        letterSpacing: tokens.letterSpacing.caps,
        lineHeight:    tokens.lineHeight.normal,
        textTransform: 'uppercase' as const,
      },

      // Buttons
      button: {
        fontSize:      tokens.fontSize.base,
        fontWeight:    tokens.fontWeight.semibold,
        letterSpacing: tokens.letterSpacing.wider,
        textTransform: 'none' as const,
      },
    },

    // ─── Shape ────────────────────────────────────────────────────────────
    shape: {
      borderRadius: 6,
    },

    // ─── Transitions ──────────────────────────────────────────────────────
    transitions: {
      duration: {
        shortest:      120,
        shorter:        150,
        short:          200,
        standard:       250,
        complex:        300,
        enteringScreen: 200,
        leavingScreen:  150,
      },
      easing: {
        easeInOut: tokens.easing.inOut,
        easeOut:   tokens.easing.out,
        easeIn:    tokens.easing.in,
        sharp:     tokens.easing.sharp,
      },
    },

    // ─── Z-Index ──────────────────────────────────────────────────────────
    zIndex: {
      mobileStepper: tokens.zIndex.base,
      fab:           tokens.zIndex.sticky,
      speedDial:     tokens.zIndex.sticky,
      appBar:        tokens.zIndex.topbar,
      drawer:        tokens.zIndex.drawer,
      modal:         tokens.zIndex.modal,
      snackbar:      tokens.zIndex.toast,
      tooltip:       tokens.zIndex.popover,
    },

    // ─── Component Overrides ──────────────────────────────────────────────
    components: {

      // ─── CssBaseline ─────────────────────────────────────────────────
      MuiCssBaseline: {
        styleOverrides: {
          '*': {
            margin: 0,
            padding: 0,
            boxSizing: 'border-box',
          },
          'html, body, #root': {
            height: '100%',
            width: '100%',
            background: tokens.surface.base,
            color: tokens.text.primary,
            fontFamily: tokens.font.sans,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
          },
          // Custom scrollbar — thin, unobtrusive
          '*::-webkit-scrollbar': {
            width: tokens.scrollbar.width,
            height: tokens.scrollbar.width,
          },
          '*::-webkit-scrollbar-track': {
            background: tokens.scrollbar.track,
          },
          '*::-webkit-scrollbar-thumb': {
            background: tokens.scrollbar.thumb,
            borderRadius: tokens.scrollbar.radius,
            '&:hover': {
              background: tokens.scrollbar.thumbHover,
            },
          },
          // Focus visible — keyboard navigation only
          '*:focus-visible': {
            outline: tokens.focus.ring,
            outlineOffset: tokens.focus.ringOffset,
          },
          // Selection colour
          '::selection': {
            background: alpha(accentColour, 0.30),
            color: tokens.text.primary,
          },
          // Monospace utility class — used in sx via className
          '.font-mono': {
            fontFamily: `${tokens.font.mono} !important`,
          },
        },
      },

      // ─── Button ──────────────────────────────────────────────────────
      MuiButton: {
        defaultProps: {
          disableElevation: true,
          disableRipple: false,
        },
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            padding: '7px 16px',
            fontSize: tokens.fontSize.base,
            fontWeight: tokens.fontWeight.semibold,
            letterSpacing: tokens.letterSpacing.wider,
            lineHeight: tokens.lineHeight.normal,
            transition: `background ${tokens.transition.fast}, color ${tokens.transition.fast}, border-color ${tokens.transition.fast}, transform ${tokens.transition.fast}, box-shadow ${tokens.transition.fast}`,
            '&:focus-visible': {
              outline: tokens.focus.ring,
              outlineOffset: tokens.focus.ringOffset,
            },
          },
          containedPrimary: {
            background: accentColour,
            color: tokens.text.inverse,
            '&:hover': {
              background: tokens.accent.hover,
              transform: 'translateY(-1px)',
            },
            '&:active': {
              background: tokens.accent.active,
              transform: 'translateY(0)',
            },
            '&.Mui-disabled': {
              background: alpha(accentColour, 0.30),
              color: alpha(tokens.text.inverse, 0.50),
            },
          },
          containedError: {
            background: tokens.status.danger,
            color: tokens.text.inverse,
            '&:hover': {
              background: alpha(tokens.status.danger, 0.85),
              transform: 'translateY(-1px)',
            },
          },
          outlined: {
            borderColor: tokens.surface.borderHi,
            color: tokens.text.primary,
            borderWidth: tokens.borderWidth.thin,
            '&:hover': {
              borderColor: accentColour,
              background: alpha(accentColour, 0.06),
              borderWidth: tokens.borderWidth.thin,
            },
            '&.Mui-disabled': {
              borderColor: tokens.surface.border,
              color: tokens.text.tertiary,
            },
          },
          outlinedError: {
            borderColor: alpha(tokens.status.danger, 0.5),
            color: tokens.status.danger,
            '&:hover': {
              borderColor: tokens.status.danger,
              background: alpha(tokens.status.danger, 0.06),
            },
          },
          text: {
            color: tokens.text.secondary,
            '&:hover': {
              background: alpha(tokens.text.primary, 0.06),
              color: tokens.text.primary,
            },
          },
          textPrimary: {
            color: tokens.accent.text,
            '&:hover': {
              background: alpha(accentColour, 0.08),
              color: accentColour,
            },
          },
          sizeSmall: {
            padding: '5px 12px',
            fontSize: tokens.fontSize.sm,
          },
          sizeLarge: {
            padding: '11px 24px',
            fontSize: tokens.fontSize.md,
          },
          startIcon: {
            marginRight: tokens.space[1.5],
            '& > *:nth-of-type(1)': { fontSize: tokens.icon.sm },
          },
          endIcon: {
            marginLeft: tokens.space[1.5],
            '& > *:nth-of-type(1)': { fontSize: tokens.icon.sm },
          },
        },
      },

      // ─── IconButton ──────────────────────────────────────────────────
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: tokens.text.secondary,
            borderRadius: tokens.radius.md,
            transition: `background ${tokens.transition.fast}, color ${tokens.transition.fast}`,
            '&:hover': {
              background: alpha(tokens.text.primary, 0.06),
              color: tokens.text.primary,
            },
            '&:focus-visible': {
              outline: tokens.focus.ring,
              outlineOffset: tokens.focus.ringOffset,
            },
          },
          sizeSmall: {
            padding: tokens.space[1],
          },
          sizeMedium: {
            padding: tokens.space[2],
          },
        },
      },

      // ─── Card ────────────────────────────────────────────────────────
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            background: tokens.surface.raised,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            borderRadius: tokens.radius.lg,
            transition: `border-color ${tokens.transition.normal}, transform ${tokens.transition.normal}`,
            overflow: 'hidden',
            '&:hover': {
              borderColor: tokens.surface.borderHi,
            },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: tokens.space[5],
            '&:last-child': {
              paddingBottom: tokens.space[5],
            },
          },
        },
      },
      MuiCardActions: {
        styleOverrides: {
          root: {
            padding: `${tokens.space[3]} ${tokens.space[5]}`,
            borderTop: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
          },
        },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: {
            padding: `${tokens.space[4]} ${tokens.space[5]}`,
          },
          title: {
            fontSize: tokens.fontSize.lg,
            fontWeight: tokens.fontWeight.semibold,
          },
          subheader: {
            fontSize: tokens.fontSize.base,
            color: tokens.text.secondary,
          },
        },
      },

      // ─── Paper ───────────────────────────────────────────────────────
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            background: tokens.surface.raised,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
          },
          outlined: {
            borderColor: tokens.surface.borderHi,
          },
        },
      },

      // ─── Table ───────────────────────────────────────────────────────
      MuiTableContainer: {
        styleOverrides: {
          root: {
            background: 'transparent',
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            borderRadius: tokens.radius.lg,
            overflow: 'auto',
          },
        },
      },
      MuiTable: {
        styleOverrides: {
          root: {
            borderCollapse: 'separate',
            borderSpacing: 0,
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-root': {
              background: tokens.surface.overlay,
              borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
              whiteSpace: 'nowrap',
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            fontSize: tokens.fontSize.base,
            padding: `${tokens.space[2.5]} ${tokens.space[4]}`,
            color: tokens.text.primary,
          },
          head: {
            fontSize: tokens.fontSize.xs,
            fontWeight: tokens.fontWeight.semibold,
            letterSpacing: tokens.letterSpacing.tracked,
            textTransform: 'uppercase' as const,
            color: tokens.text.tertiary,
            padding: `${tokens.space[3]} ${tokens.space[4]}`,
          },
          sizeSmall: {
            padding: `${tokens.space[1.5]} ${tokens.space[3]}`,
            fontSize: tokens.fontSize.sm,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: `background ${tokens.transition.fast}`,
            '&:hover': {
              background: alpha(tokens.text.primary, 0.025),
            },
            '&:last-child td, &:last-child th': {
              border: 0,
            },
            '&.Mui-selected': {
              background: alpha(accentColour, 0.06),
              '&:hover': {
                background: alpha(accentColour, 0.10),
              },
            },
          },
        },
      },
      MuiTableSortLabel: {
        styleOverrides: {
          root: {
            color: tokens.text.tertiary,
            '&:hover': {
              color: tokens.text.secondary,
            },
            '&.Mui-active': {
              color: tokens.text.primary,
              '& .MuiTableSortLabel-icon': {
                color: accentColour,
              },
            },
          },
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          root: {
            borderTop: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            color: tokens.text.secondary,
            fontSize: tokens.fontSize.sm,
          },
          selectLabel: {
            fontSize: tokens.fontSize.sm,
            color: tokens.text.tertiary,
          },
          displayedRows: {
            fontSize: tokens.fontSize.sm,
            fontFamily: tokens.font.mono,
            color: tokens.text.secondary,
          },
          select: {
            fontSize: tokens.fontSize.sm,
          },
        },
      },

      // ─── Inputs ──────────────────────────────────────────────────────
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: tokens.surface.sunken,
            borderRadius: tokens.radius.md,
            fontSize: tokens.fontSize.md,
            transition: `border-color ${tokens.transition.fast}`,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.surface.borderHi,
              borderWidth: tokens.borderWidth.thin,
              transition: `border-color ${tokens.transition.fast}`,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.surface.borderMax,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: accentColour,
              borderWidth: tokens.borderWidth.thin,
            },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.status.danger,
            },
            '&.Mui-disabled': {
              background: alpha(tokens.surface.sunken, 0.5),
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: tokens.surface.border,
              },
            },
          },
          input: {
            padding: `${tokens.space[2.5]} ${tokens.space[3]}`,
            '&::placeholder': {
              color: tokens.text.tertiary,
              opacity: 1,
            },
          },
          inputSizeSmall: {
            padding: `${tokens.space[2]} ${tokens.space[3]}`,
            fontSize: tokens.fontSize.base,
          },
          multiline: {
            padding: 0,
          },
          inputMultiline: {
            padding: `${tokens.space[2.5]} ${tokens.space[3]}`,
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.base,
            color: tokens.text.tertiary,
            '&.Mui-focused': {
              color: accentColour,
            },
            '&.Mui-error': {
              color: tokens.status.danger,
            },
          },
        },
      },
      MuiInputAdornment: {
        styleOverrides: {
          root: {
            color: tokens.text.tertiary,
            '& .MuiSvgIcon-root': {
              fontSize: tokens.icon.md,
            },
          },
        },
      },
      MuiFormHelperText: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.sm,
            marginTop: tokens.space[1],
            marginLeft: tokens.space[0.5],
            '&.Mui-error': {
              color: tokens.status.danger,
            },
          },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          asterisk: {
            color: tokens.text.tertiary,  // Never red asterisk — per design system
          },
        },
      },

      // ─── Select ──────────────────────────────────────────────────────
      MuiSelect: {
        styleOverrides: {
          icon: {
            color: tokens.text.tertiary,
            transition: `transform ${tokens.transition.fast}`,
          },
        },
      },

      // ─── Autocomplete ────────────────────────────────────────────────
      MuiAutocomplete: {
        styleOverrides: {
          paper: {
            background: tokens.surface.elevated,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            borderRadius: tokens.radius.lg,
            boxShadow: tokens.shadow.dropdown,
            marginTop: tokens.space[1],
          },
          option: {
            fontSize: tokens.fontSize.base,
            padding: `${tokens.space[2]} ${tokens.space[3]}`,
            borderRadius: tokens.radius.sm,
            margin: `${tokens.space.px} ${tokens.space[1.5]}`,
            '&[aria-selected="true"]': {
              background: alpha(accentColour, 0.12),
            },
            '&.Mui-focused': {
              background: alpha(tokens.text.primary, 0.06),
            },
          },
          noOptions: {
            fontSize: tokens.fontSize.base,
            color: tokens.text.tertiary,
          },
          listbox: {
            padding: tokens.space[1],
          },
        },
      },

      // ─── Chip ────────────────────────────────────────────────────────
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.sm,
            fontSize: tokens.fontSize.xs,
            fontWeight: tokens.fontWeight.semibold,
            letterSpacing: tokens.letterSpacing.widest,
            height: '22px',
            border: `${tokens.borderWidth.thin} solid transparent`,
            transition: `background ${tokens.transition.fast}, border-color ${tokens.transition.fast}`,
          },
          sizeSmall: {
            fontSize: tokens.fontSize['2xs'],
            height: '18px',
            '& .MuiChip-label': {
              paddingLeft: tokens.space[1.5],
              paddingRight: tokens.space[1.5],
            },
          },
          label: {
            paddingLeft: tokens.space[2],
            paddingRight: tokens.space[2],
          },
          filled: {
            '&.MuiChip-colorDefault': {
              background: tokens.surface.border,
              color: tokens.text.secondary,
            },
          },
          outlined: {
            borderColor: tokens.surface.borderHi,
          },
          deleteIcon: {
            color: tokens.text.tertiary,
            fontSize: tokens.icon.xs,
            '&:hover': {
              color: tokens.text.secondary,
            },
          },
          icon: {
            fontSize: tokens.icon.xs,
            marginLeft: tokens.space[1.5],
          },
        },
      },

      // ─── Badge ───────────────────────────────────────────────────────
      MuiBadge: {
        styleOverrides: {
          badge: {
            fontSize: tokens.fontSize['2xs'],
            fontWeight: tokens.fontWeight.bold,
            fontFamily: tokens.font.mono,
            minWidth: '16px',
            height: '16px',
            padding: `0 ${tokens.space[1]}`,
            borderRadius: tokens.radius.full,
          },
          colorPrimary: {
            background: accentColour,
            color: tokens.text.inverse,
          },
          colorError: {
            background: tokens.status.danger,
            color: tokens.text.inverse,
          },
        },
      },

      // ─── Avatar ──────────────────────────────────────────────────────
      MuiAvatar: {
        styleOverrides: {
          root: {
            background: tokens.surface.border,
            color: tokens.text.secondary,
            fontSize: tokens.fontSize.base,
            fontWeight: tokens.fontWeight.semibold,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
          },
          colorDefault: {
            background: alpha(accentColour, 0.15),
            color: tokens.accent.text,
          },
        },
      },

      // ─── Dialog / Modal ──────────────────────────────────────────────
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: tokens.surface.overlay,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            borderRadius: tokens.radius.xl,
            boxShadow: tokens.shadow.xl,
            maxWidth: tokens.layout.modalMaxWidth,
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.xl,
            fontWeight: tokens.fontWeight.semibold,
            padding: `${tokens.space[5]} ${tokens.space[6]} ${tokens.space[2]}`,
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: `${tokens.space[4]} ${tokens.space[6]}`,
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: `${tokens.space[3]} ${tokens.space[6]} ${tokens.space[5]}`,
            gap: tokens.space[2],
          },
        },
      },

      // ─── Drawer ──────────────────────────────────────────────────────
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: tokens.surface.overlay,
            borderLeft: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            boxShadow: tokens.shadow.drawer,
          },
        },
      },

      // ─── Tooltip ─────────────────────────────────────────────────────
      MuiTooltip: {
        defaultProps: {
          arrow: true,
          enterDelay: 400,
          enterNextDelay: 200,
        },
        styleOverrides: {
          tooltip: {
            background: tokens.surface.elevated,
            color: tokens.text.primary,
            fontSize: tokens.fontSize.sm,
            fontWeight: tokens.fontWeight.normal,
            borderRadius: tokens.radius.sm,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            boxShadow: tokens.shadow.sm,
            padding: `${tokens.space[1.5]} ${tokens.space[2.5]}`,
            maxWidth: '280px',
          },
          arrow: {
            color: tokens.surface.elevated,
            '&::before': {
              border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            },
          },
        },
      },

      // ─── Menu ────────────────────────────────────────────────────────
      MuiMenu: {
        styleOverrides: {
          paper: {
            background: tokens.surface.elevated,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            borderRadius: tokens.radius.lg,
            boxShadow: tokens.shadow.dropdown,
            minWidth: '200px',
            marginTop: tokens.space[1],
          },
          list: {
            padding: tokens.space[1],
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.base,
            padding: `${tokens.space[2]} ${tokens.space[3]}`,
            borderRadius: tokens.radius.sm,
            margin: `${tokens.space.px} ${tokens.space[1.5]}`,
            gap: tokens.space[2],
            transition: `background ${tokens.transition.fast}`,
            '&:hover': {
              background: alpha(tokens.text.primary, 0.06),
            },
            '&.Mui-selected': {
              background: alpha(accentColour, 0.10),
              '&:hover': {
                background: alpha(accentColour, 0.15),
              },
            },
            '&.Mui-disabled': {
              opacity: 0.4,
            },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: {
            minWidth: '32px',
            color: tokens.text.tertiary,
            '& .MuiSvgIcon-root': {
              fontSize: tokens.icon.md,
            },
          },
        },
      },
      MuiListItemText: {
        styleOverrides: {
          primary: {
            fontSize: tokens.fontSize.base,
          },
          secondary: {
            fontSize: tokens.fontSize.sm,
            color: tokens.text.tertiary,
          },
        },
      },

      // ─── Popover ─────────────────────────────────────────────────────
      MuiPopover: {
        styleOverrides: {
          paper: {
            background: tokens.surface.elevated,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            borderRadius: tokens.radius.lg,
            boxShadow: tokens.shadow.dropdown,
          },
        },
      },

      // ─── Tabs ────────────────────────────────────────────────────────
      MuiTabs: {
        styleOverrides: {
          root: {
            borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            minHeight: '40px',
          },
          indicator: {
            height: '2px',
            borderRadius: `${tokens.radius.full} ${tokens.radius.full} 0 0`,
            background: accentColour,
          },
          flexContainer: {
            gap: tokens.space[1],
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.base,
            fontWeight: tokens.fontWeight.medium,
            minHeight: '40px',
            padding: `0 ${tokens.space[4]}`,
            textTransform: 'none' as const,
            letterSpacing: tokens.letterSpacing.normal,
            color: tokens.text.secondary,
            transition: `color ${tokens.transition.fast}`,
            '&.Mui-selected': {
              color: tokens.text.primary,
              fontWeight: tokens.fontWeight.semibold,
            },
            '&:hover': {
              color: tokens.text.primary,
              background: alpha(tokens.text.primary, 0.03),
            },
          },
        },
      },

      // ─── Divider ─────────────────────────────────────────────────────
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: tokens.surface.border,
          },
          light: {
            borderColor: alpha(tokens.surface.border, 0.5),
          },
        },
      },

      // ─── Skeleton ────────────────────────────────────────────────────
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: {
          root: {
            background: alpha(tokens.text.primary, 0.06),
            borderRadius: tokens.radius.md,
          },
          wave: {
            '&::after': {
              background: `linear-gradient(90deg, transparent, ${alpha(tokens.text.primary, 0.04)}, transparent)`,
            },
          },
          rectangular: {
            borderRadius: tokens.radius.md,
          },
          circular: {
            borderRadius: tokens.radius.full,
          },
        },
      },

      // ─── Alert ───────────────────────────────────────────────────────
      MuiAlert: {
        defaultProps: {
          variant: 'standard',
        },
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            fontSize: tokens.fontSize.base,
            border: `${tokens.borderWidth.thin} solid`,
            padding: `${tokens.space[3]} ${tokens.space[4]}`,
            alignItems: 'center',
          },
          icon: {
            opacity: 1,
            padding: `${tokens.space[0.5]} 0`,
            marginRight: tokens.space[3],
          },
          message: {
            padding: `${tokens.space[0.5]} 0`,
          },
          standardSuccess: {
            background: tokens.status.successSubtle,
            borderColor: tokens.status.successBorder,
            color: tokens.status.success,
            '& .MuiAlert-icon': { color: tokens.status.success },
          },
          standardWarning: {
            background: tokens.status.warningSubtle,
            borderColor: tokens.status.warningBorder,
            color: tokens.status.warning,
            '& .MuiAlert-icon': { color: tokens.status.warning },
          },
          standardError: {
            background: tokens.status.dangerSubtle,
            borderColor: tokens.status.dangerBorder,
            color: tokens.status.danger,
            '& .MuiAlert-icon': { color: tokens.status.danger },
          },
          standardInfo: {
            background: tokens.status.infoSubtle,
            borderColor: tokens.status.infoBorder,
            color: tokens.status.info,
            '& .MuiAlert-icon': { color: tokens.status.info },
          },
        },
      },
      MuiAlertTitle: {
        styleOverrides: {
          root: {
            fontWeight: tokens.fontWeight.semibold,
            fontSize: tokens.fontSize.base,
            marginBottom: tokens.space[0.5],
          },
        },
      },

      // ─── Backdrop ────────────────────────────────────────────────────
      MuiBackdrop: {
        styleOverrides: {
          root: {
            background: `rgba(8, 10, 15, 0.80)`,
            backdropFilter: 'blur(4px)',
          },
          invisible: {
            background: 'transparent',
            backdropFilter: 'none',
          },
        },
      },

      // ─── Snackbar (notistack) ────────────────────────────────────────
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            background: tokens.surface.elevated,
            color: tokens.text.primary,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            borderRadius: tokens.radius.lg,
            boxShadow: tokens.shadow.toast,
            fontSize: tokens.fontSize.base,
          },
        },
      },

      // ─── Linear Progress ─────────────────────────────────────────────
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.full,
            height: '4px',
            background: tokens.surface.border,
          },
          barColorPrimary: {
            background: accentColour,
            borderRadius: tokens.radius.full,
          },
        },
      },

      // ─── Circular Progress ───────────────────────────────────────────
      MuiCircularProgress: {
        defaultProps: {
          size: 20,
          thickness: 4,
        },
      },

      // ─── Switch ──────────────────────────────────────────────────────
      MuiSwitch: {
        styleOverrides: {
          root: {
            width: 40,
            height: 22,
            padding: 0,
          },
          switchBase: {
            padding: 2,
            '&.Mui-checked': {
              transform: 'translateX(18px)',
              color: tokens.text.inverse,
              '& + .MuiSwitch-track': {
                background: accentColour,
                opacity: 1,
              },
            },
          },
          thumb: {
            width: 18,
            height: 18,
            boxShadow: 'none',
          },
          track: {
            borderRadius: tokens.radius.full,
            background: tokens.surface.borderHi,
            opacity: 1,
            transition: `background ${tokens.transition.fast}`,
          },
        },
      },

      // ─── Checkbox ────────────────────────────────────────────────────
      MuiCheckbox: {
        styleOverrides: {
          root: {
            color: tokens.surface.borderHi,
            padding: tokens.space[2],
            '&.Mui-checked': {
              color: accentColour,
            },
            '& .MuiSvgIcon-root': {
              fontSize: tokens.icon.md,
            },
          },
        },
      },

      // ─── Radio ───────────────────────────────────────────────────────
      MuiRadio: {
        styleOverrides: {
          root: {
            color: tokens.surface.borderHi,
            padding: tokens.space[2],
            '&.Mui-checked': {
              color: accentColour,
            },
          },
        },
      },

      // ─── Stepper ─────────────────────────────────────────────────────
      MuiStepIcon: {
        styleOverrides: {
          root: {
            color: tokens.surface.border,
            '&.Mui-active': {
              color: accentColour,
            },
            '&.Mui-completed': {
              color: tokens.status.success,
            },
          },
          text: {
            fontFamily: tokens.font.mono,
            fontSize: tokens.fontSize.sm,
            fontWeight: tokens.fontWeight.semibold,
          },
        },
      },
      MuiStepLabel: {
        styleOverrides: {
          label: {
            fontSize: tokens.fontSize.base,
            color: tokens.text.tertiary,
            '&.Mui-active': {
              color: tokens.text.primary,
              fontWeight: tokens.fontWeight.semibold,
            },
            '&.Mui-completed': {
              color: tokens.text.secondary,
            },
          },
        },
      },
      MuiStepConnector: {
        styleOverrides: {
          line: {
            borderColor: tokens.surface.border,
          },
        },
      },

      // ─── Breadcrumbs ─────────────────────────────────────────────────
      MuiBreadcrumbs: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.base,
          },
          separator: {
            color: tokens.text.quartery,
            marginLeft: tokens.space[1.5],
            marginRight: tokens.space[1.5],
          },
          li: {
            '& a': {
              color: tokens.text.tertiary,
              textDecoration: 'none',
              transition: `color ${tokens.transition.fast}`,
              '&:hover': {
                color: tokens.text.secondary,
              },
            },
            '&:last-child': {
              color: tokens.text.primary,
              fontWeight: tokens.fontWeight.medium,
            },
          },
        },
      },

      // ─── Pagination ──────────────────────────────────────────────────
      MuiPaginationItem: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.base,
            fontFamily: tokens.font.mono,
            color: tokens.text.secondary,
            borderRadius: tokens.radius.md,
            minWidth: '32px',
            height: '32px',
            transition: `background ${tokens.transition.fast}, color ${tokens.transition.fast}`,
            '&:hover': {
              background: alpha(tokens.text.primary, 0.06),
            },
            '&.Mui-selected': {
              background: alpha(accentColour, 0.15),
              color: tokens.accent.text,
              '&:hover': {
                background: alpha(accentColour, 0.20),
              },
            },
          },
        },
      },

      // ─── Accordion ───────────────────────────────────────────────────
      MuiAccordion: {
        defaultProps: { elevation: 0, disableGutters: true },
        styleOverrides: {
          root: {
            background: tokens.surface.raised,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            borderRadius: `${tokens.radius.lg} !important`,
            '&::before': { display: 'none' },
            '&.Mui-expanded': {
              margin: 0,
            },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            padding: `0 ${tokens.space[5]}`,
            minHeight: '48px',
            '&.Mui-expanded': {
              minHeight: '48px',
              borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            },
          },
          content: {
            margin: `${tokens.space[3]} 0`,
            '&.Mui-expanded': {
              margin: `${tokens.space[3]} 0`,
            },
          },
          expandIconWrapper: {
            color: tokens.text.tertiary,
          },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: {
            padding: tokens.space[5],
          },
        },
      },

      // ─── Toggle Button ───────────────────────────────────────────────
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            background: tokens.surface.sunken,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
            borderRadius: tokens.radius.md,
            gap: tokens.space.px,
            padding: tokens.space.px,
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            fontSize: tokens.fontSize.base,
            fontWeight: tokens.fontWeight.medium,
            color: tokens.text.tertiary,
            border: 'none',
            borderRadius: `${tokens.radius.sm} !important`,
            padding: `${tokens.space[1.5]} ${tokens.space[3]}`,
            textTransform: 'none' as const,
            transition: `background ${tokens.transition.fast}, color ${tokens.transition.fast}`,
            '&:hover': {
              background: alpha(tokens.text.primary, 0.06),
              color: tokens.text.secondary,
            },
            '&.Mui-selected': {
              background: alpha(accentColour, 0.15),
              color: tokens.accent.text,
              '&:hover': {
                background: alpha(accentColour, 0.20),
              },
            },
          },
          sizeSmall: {
            padding: `${tokens.space[1]} ${tokens.space[2]}`,
            fontSize: tokens.fontSize.sm,
          },
        },
      },

      // ─── List ────────────────────────────────────────────────────────
      MuiList: {
        styleOverrides: {
          root: {
            padding: tokens.space[1],
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            padding: `${tokens.space[1.5]} ${tokens.space[3]}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.md,
            padding: `${tokens.space[2]} ${tokens.space[3]}`,
            gap: tokens.space[2],
            transition: `background ${tokens.transition.fast}`,
            '&:hover': {
              background: alpha(tokens.text.primary, 0.04),
            },
            '&.Mui-selected': {
              background: alpha(accentColour, 0.10),
              '&:hover': {
                background: alpha(accentColour, 0.14),
              },
            },
          },
        },
      },

      // ─── Link ────────────────────────────────────────────────────────
      MuiLink: {
        styleOverrides: {
          root: {
            color: tokens.text.link,
            textDecorationColor: alpha(tokens.text.link, 0.3),
            transition: `color ${tokens.transition.fast}`,
            '&:hover': {
              color: accentColour,
              textDecorationColor: accentColour,
            },
          },
        },
      },

      // ─── Slider ──────────────────────────────────────────────────────
      MuiSlider: {
        styleOverrides: {
          root: {
            color: accentColour,
            height: 4,
          },
          track: {
            borderRadius: tokens.radius.full,
          },
          rail: {
            background: tokens.surface.border,
            opacity: 1,
          },
          thumb: {
            width: 16,
            height: 16,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0 0 0 6px ${alpha(accentColour, 0.16)}`,
            },
          },
          valueLabel: {
            background: tokens.surface.elevated,
            color: tokens.text.primary,
            border: `${tokens.borderWidth.thin} solid ${tokens.surface.borderHi}`,
            borderRadius: tokens.radius.sm,
            fontSize: tokens.fontSize.sm,
            fontFamily: tokens.font.mono,
          },
        },
      },
    },
  };

  return createTheme(options);
};