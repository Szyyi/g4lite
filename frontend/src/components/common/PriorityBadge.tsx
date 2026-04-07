/**
 * G4Light — PriorityBadge
 * =========================
 *
 * Displays a resupply or notification priority level with colour-coded
 * styling from the priority token palette.
 *
 * Resupply priorities: routine → urgent → critical → emergency
 * Notification priorities: low → normal → high → critical
 *
 * The badge automatically resolves the correct colour config from either
 * priority scale since both are registered in the token palette.
 *
 * Used on: resupply request cards/tables, notification list items,
 * admin resupply management, and priority filter displays.
 *
 * Usage:
 *  ```tsx
 *  <PriorityBadge priority="urgent" />
 *  <PriorityBadge priority="emergency" size="sm" />
 *  <PriorityBadge priority={request.priority} showIcon />
 *  ```
 */

import { Box, Typography, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import PriorityHighOutlinedIcon from '@mui/icons-material/PriorityHighOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { tokens, getPriorityConfig } from '../../tokens';
import type { ResupplyPriority, NotificationPriority } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type BadgeSize = 'sm' | 'md';

interface PriorityBadgeProps {
  /** Priority level string from API */
  priority: ResupplyPriority | NotificationPriority | string;
  /** Size variant */
  size?: BadgeSize;
  /** Show urgency icon beside the label */
  showIcon?: boolean;
  /** Show tooltip with description */
  showTooltip?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon mapping — escalating visual urgency
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_ICONS: Record<string, React.ReactNode | null> = {
  low:       null,
  normal:    null,
  routine:   null,
  high:      <PriorityHighOutlinedIcon />,
  urgent:    <WarningAmberOutlinedIcon />,
  critical:  <ErrorOutlineOutlinedIcon />,
  emergency: <ErrorOutlineOutlinedIcon />,
};

// ─────────────────────────────────────────────────────────────────────────────
// Descriptions for tooltips
// ─────────────────────────────────────────────────────────────────────────────

const DESCRIPTIONS: Record<string, string> = {
  low:       'Low priority — process during normal workflow',
  normal:    'Normal priority — standard processing time',
  routine:   'Routine — process during normal resupply cycle',
  high:      'High priority — expedite processing',
  urgent:    'Urgent — requires immediate attention',
  critical:  'Critical — mission-impacting, escalate immediately',
  emergency: 'Emergency — operations halted, immediate action required',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const PriorityBadge = ({
  priority,
  size = 'md',
  showIcon = false,
  showTooltip = true,
}: PriorityBadgeProps) => {
  const config = getPriorityConfig(priority);
  const isSmall = size === 'sm';
  const description = DESCRIPTIONS[priority] ?? '';
  const icon = showIcon ? PRIORITY_ICONS[priority] ?? null : null;

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
      {icon ? (
        <Box
          sx={{
            display: 'flex',
            '& .MuiSvgIcon-root': {
              fontSize: isSmall ? 11 : 13,
              color: config.color,
            },
          }}
        >
          {icon}
        </Box>
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

export default PriorityBadge;