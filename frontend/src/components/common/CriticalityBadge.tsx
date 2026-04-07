/**
 * G4Light — CriticalityBadge
 * ============================
 *
 * Displays an item's criticality level with colour-coded styling
 * from the criticality token palette.
 *
 * Levels: routine → important → critical → essential
 *
 * Used on: item cards, item detail drawers, low-stock alerts,
 * inventory table rows, and admin dashboard.
 *
 * Usage:
 *  ```tsx
 *  <CriticalityBadge level="essential" />
 *  <CriticalityBadge level="critical" size="sm" />
 *  <CriticalityBadge level={item.criticality_level} showIcon />
 *  ```
 */

import { Box, Typography, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { tokens, getCriticalityConfig, type CriticalityToken } from '../../tokens';
import type { CriticalityLevel } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type BadgeSize = 'sm' | 'md';

interface CriticalityBadgeProps {
  /** Criticality level string from API */
  level: CriticalityLevel | string;
  /** Size variant */
  size?: BadgeSize;
  /** Show shield icon beside the label */
  showIcon?: boolean;
  /** Show tooltip with description */
  showTooltip?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Descriptions for tooltips
// ─────────────────────────────────────────────────────────────────────────────

const DESCRIPTIONS: Record<string, string> = {
  routine:   'Standard equipment — no special handling required',
  important: 'Important equipment — maintain minimum stock levels',
  critical:  'Mission-critical — immediate resupply on shortage',
  essential: 'Essential — operations cannot continue without this item',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const CriticalityBadge = ({
  level,
  size = 'md',
  showIcon = false,
  showTooltip = true,
}: CriticalityBadgeProps) => {
  const config = getCriticalityConfig(level);
  const isSmall = size === 'sm';
  const description = DESCRIPTIONS[level] ?? '';

  const badge = (
    <Box
      className="flex items-center"
      sx={{
        gap: isSmall ? 0.5 : 0.75,
        px: isSmall ? 0.75 : 1,
        py: isSmall ? 0.125 : 0.25,
        borderRadius: '3px',
        background: alpha(config.color, 0.10),
        border: `${tokens.borderWidth.thin} solid ${config.border}`,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {showIcon ? (
        <ShieldOutlinedIcon
          sx={{
            fontSize: isSmall ? 11 : 13,
            color: config.color,
          }}
        />
      ) : (
        <FiberManualRecordIcon
          sx={{
            fontSize: isSmall ? 5 : 6,
            color: config.color,
          }}
        />
      )}

      <Typography
        sx={{
          fontSize: isSmall ? tokens.fontSize['2xs'] : '0.5625rem',
          fontFamily: tokens.font.mono,
          fontWeight: tokens.fontWeight.semibold,
          letterSpacing: tokens.letterSpacing.tracked,
          color: config.color,
          lineHeight: 1,
          textTransform: 'uppercase',
        }}
      >
        {config.label}
      </Typography>
    </Box>
  );

  if (showTooltip && description) {
    return (
      <Tooltip title={description} arrow placement="top">
        {badge}
      </Tooltip>
    );
  }

  return badge;
};

export default CriticalityBadge;