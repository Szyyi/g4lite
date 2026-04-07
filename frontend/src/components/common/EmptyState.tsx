/**
 * G4Light — EmptyState
 * ======================
 *
 * Displayed whenever a list, table, or content area has no data.
 * Never leave a blank area — every empty state has at minimum an
 * icon and a title.
 *
 * Three size variants:
 *  - 'full'    — page-level empty (large icon, prominent text, py-20)
 *  - 'compact' — card/panel-level (medium icon, py-12)
 *  - 'inline'  — table/list-level (small icon, py-8, no border)
 *
 * Presets for common empty states are exported as named components
 * for consistency across the platform (EmptyInventory, EmptySignouts, etc.)
 *
 * Usage:
 *  ```tsx
 *  <EmptyState
 *    icon={<Inventory2OutlinedIcon />}
 *    title="No items found"
 *    description="Try adjusting your search or filters"
 *    action={<Button variant="outlined" onClick={clearFilters}>Clear filters</Button>}
 *  />
 *  ```
 */

import { type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EmptyStateVariant = 'full' | 'compact' | 'inline';

interface EmptyStateProps {
  /** Icon displayed above the title */
  icon: ReactNode;
  /** Primary message */
  title: string;
  /** Secondary descriptive text */
  description?: string;
  /** Action button or link (e.g. "Create item", "Clear filters") */
  action?: ReactNode;
  /** Size variant */
  variant?: EmptyStateVariant;
  /** Optional keyboard shortcut hint below the description */
  shortcutHint?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant config
// ─────────────────────────────────────────────────────────────────────────────

interface VariantConfig {
  py: number;
  iconSize: number;
  iconOpacity: number;
  titleSize: string;
  titleWeight: number;
  descMaxWidth: number;
  showBorder: boolean;
  gap: number;
}

const VARIANT_CONFIG: Record<EmptyStateVariant, VariantConfig> = {
  full: {
    py: 20,
    iconSize: 48,
    iconOpacity: 0.2,
    titleSize: tokens.fontSize.base,
    titleWeight: tokens.fontWeight.medium,
    descMaxWidth: 320,
    showBorder: true,
    gap: 2,
  },
  compact: {
    py: 12,
    iconSize: 36,
    iconOpacity: 0.2,
    titleSize: tokens.fontSize.base,
    titleWeight: tokens.fontWeight.medium,
    descMaxWidth: 280,
    showBorder: true,
    gap: 1.5,
  },
  inline: {
    py: 8,
    iconSize: 28,
    iconOpacity: 0.15,
    titleSize: tokens.fontSize.sm,
    titleWeight: tokens.fontWeight.normal,
    descMaxWidth: 240,
    showBorder: false,
    gap: 1,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const EmptyState = ({
  icon,
  title,
  description,
  action,
  variant = 'full',
  shortcutHint,
}: EmptyStateProps) => {
  const config = VARIANT_CONFIG[variant];

  return (
    <Box
      className="flex flex-col items-center justify-center animate-fade-in"
      sx={{
        py: config.py,
        gap: config.gap,
        ...(config.showBorder && {
          border: `${tokens.borderWidth.thin} dashed ${tokens.surface.border}`,
          borderRadius: tokens.radius.lg,
        }),
      }}
    >
      {/* Icon */}
      <Box
        sx={{
          color: tokens.text.tertiary,
          opacity: config.iconOpacity,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '& .MuiSvgIcon-root': {
            fontSize: config.iconSize,
          },
        }}
      >
        {icon}
      </Box>

      {/* Title */}
      <Typography
        sx={{
          fontSize: config.titleSize,
          fontWeight: config.titleWeight,
          color: tokens.text.secondary,
          textAlign: 'center',
        }}
      >
        {title}
      </Typography>

      {/* Description */}
      {description && (
        <Typography
          sx={{
            fontSize: tokens.fontSize.sm,
            color: tokens.text.tertiary,
            textAlign: 'center',
            maxWidth: config.descMaxWidth,
            lineHeight: tokens.lineHeight.relaxed,
            px: 2,
          }}
        >
          {description}
        </Typography>
      )}

      {/* Keyboard shortcut hint */}
      {shortcutHint && (
        <Typography
          sx={{
            fontSize: tokens.fontSize['2xs'],
            fontFamily: tokens.font.mono,
            color: tokens.text.quartery,
            letterSpacing: tokens.letterSpacing.wider,
            mt: 0.5,
          }}
        >
          {shortcutHint}
        </Typography>
      )}

      {/* Action */}
      {action && (
        <Box sx={{ mt: variant === 'inline' ? 0.5 : 1.5 }}>
          {action}
        </Box>
      )}
    </Box>
  );
};

export default EmptyState;

// ─────────────────────────────────────────────────────────────────────────────
// Presets — common empty states across the platform
// Import directly: `import { EmptyInventory } from '../common/EmptyState'`
// ─────────────────────────────────────────────────────────────────────────────

// Icons imported lazily in presets to avoid bundling when not used
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

interface PresetProps {
  action?: ReactNode;
  variant?: EmptyStateVariant;
}

export const EmptyInventory = ({ action, variant }: PresetProps) => (
  <EmptyState
    icon={<Inventory2OutlinedIcon />}
    title="No items found"
    description="Inventory is empty or no items match your current filters"
    action={action}
    variant={variant}
  />
);

export const EmptySignouts = ({ action, variant }: PresetProps) => (
  <EmptyState
    icon={<AssignmentOutlinedIcon />}
    title="No active sign-outs"
    description="Equipment you sign out will appear here"
    action={action}
    variant={variant}
  />
);

export const EmptySignoutHistory = ({ variant }: PresetProps) => (
  <EmptyState
    icon={<AssignmentOutlinedIcon />}
    title="No sign-out history"
    description="Returned and completed sign-outs will appear here"
    variant={variant ?? 'compact'}
  />
);

export const EmptyResupply = ({ action, variant }: PresetProps) => (
  <EmptyState
    icon={<LocalShippingOutlinedIcon />}
    title="No resupply requests"
    description="Submit a request when you need equipment replenished"
    action={action}
    variant={variant}
  />
);

export const EmptyNotifications = ({ variant }: PresetProps) => (
  <EmptyState
    icon={<NotificationsNoneOutlinedIcon />}
    title="No notifications"
    description="You're all caught up"
    variant={variant ?? 'compact'}
  />
);

export const EmptyUsers = ({ action, variant }: PresetProps) => (
  <EmptyState
    icon={<PeopleOutlinedIcon />}
    title="No users found"
    description="No users match your current search or filters"
    action={action}
    variant={variant}
  />
);

export const EmptySearchResults = ({ action, variant }: PresetProps) => (
  <EmptyState
    icon={<SearchOffOutlinedIcon />}
    title="No results found"
    description="Try adjusting your search terms or filters"
    action={action}
    variant={variant ?? 'compact'}
  />
);

export const EmptyConversations = ({ action, variant }: PresetProps) => (
  <EmptyState
    icon={<SmartToyOutlinedIcon />}
    title="No conversations yet"
    description="Start a conversation with the AI assistant"
    action={action}
    variant={variant}
  />
);