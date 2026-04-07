/**
 * G4Light — StatusBadge
 * =======================
 *
 * Universal status indicator used across the entire platform.
 * Every status, condition, role, and priority enum in the backend
 * has a corresponding visual configuration here.
 *
 * Variants:
 *  - 'default'  — dot + abbreviated label (most common)
 *  - 'full'     — dot + full label text
 *  - 'dot'      — coloured dot only (for compact table cells)
 *  - 'chip'     — MUI Chip style (for filter displays)
 *
 * Sizes:
 *  - 'sm' — smaller text, tighter padding (table rows)
 *  - 'md' — standard (default)
 *
 * All colours reference tokens — zero hardcoded hex.
 * The status string is looked up case-insensitively with a safe fallback.
 *
 * Usage:
 *  ```tsx
 *  <StatusBadge status="active" />
 *  <StatusBadge status="pending_approval" variant="full" />
 *  <StatusBadge status="serviceable" variant="dot" />
 *  <StatusBadge status="critical" variant="chip" />
 *  ```
 */

import { Box, Typography, Chip, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { tokens } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Status config registry
// ─────────────────────────────────────────────────────────────────────────────

interface StatusConfig {
  /** Abbreviated label for compact display */
  abbr: string;
  /** Full readable label */
  label: string;
  /** Primary colour for dot, text, and border */
  color: string;
}

const STATUS_REGISTRY: Record<string, StatusConfig> = {
  // ── Sign-out statuses (8) ───────────────────────────────────────────
  pending_approval:    { abbr: 'PENDING',     label: 'Pending Approval',    color: tokens.status.warning },
  approved:            { abbr: 'APPROVED',    label: 'Approved',            color: tokens.status.info },
  rejected:            { abbr: 'REJECTED',    label: 'Rejected',            color: tokens.status.danger },
  active:              { abbr: 'ACTIVE',      label: 'Active',              color: tokens.accent.default },
  partially_returned:  { abbr: 'PARTIAL',     label: 'Partially Returned',  color: tokens.status.warning },
  overdue:             { abbr: 'OVERDUE',     label: 'Overdue',             color: tokens.status.danger },
  returned:            { abbr: 'RETURNED',    label: 'Returned',            color: tokens.status.success },
  lost:                { abbr: 'LOST',        label: 'Lost',                color: tokens.status.danger },

  // ── Resupply statuses (9) ───────────────────────────────────────────
  draft:               { abbr: 'DRAFT',       label: 'Draft',               color: tokens.text.tertiary },
  pending:             { abbr: 'PENDING',     label: 'Pending',             color: tokens.status.warning },
  under_review:        { abbr: 'REVIEW',      label: 'Under Review',        color: tokens.status.info },
  // approved — shared with sign-out
  // rejected — shared with sign-out
  ordered:             { abbr: 'ORDERED',     label: 'Ordered',             color: tokens.accent.default },
  partially_fulfilled: { abbr: 'PARTIAL',     label: 'Partially Fulfilled', color: tokens.status.warning },
  fulfilled:           { abbr: 'FULFILLED',   label: 'Fulfilled',           color: tokens.status.success },
  cancelled:           { abbr: 'CANCELLED',   label: 'Cancelled',           color: tokens.text.tertiary },

  // ── Condition states (4) ────────────────────────────────────────────
  serviceable:         { abbr: 'SVC',         label: 'Serviceable',         color: tokens.condition.serviceable.color },
  unserviceable:       { abbr: 'UNSVC',       label: 'Unserviceable',       color: tokens.condition.unserviceable.color },
  damaged:             { abbr: 'DMG',         label: 'Damaged',             color: tokens.condition.damaged.color },
  condemned:           { abbr: 'COND',        label: 'Condemned',           color: tokens.condition.condemned.color },

  // ── User roles (3) ─────────────────────────────────────────────────
  admin:               { abbr: 'ADMIN',       label: 'Administrator',       color: tokens.accent.text },
  user:                { abbr: 'USER',        label: 'Standard User',       color: tokens.text.secondary },
  viewer:              { abbr: 'VIEWER',      label: 'Read-Only',           color: tokens.text.tertiary },

  // ── Notification priorities (4) ─────────────────────────────────────
  low:                 { abbr: 'LOW',         label: 'Low',                 color: tokens.text.tertiary },
  normal:              { abbr: 'NORMAL',      label: 'Normal',              color: tokens.text.secondary },
  high:                { abbr: 'HIGH',        label: 'High',                color: tokens.status.warning },
  critical:            { abbr: 'CRITICAL',    label: 'Critical',            color: tokens.status.danger },

  // ── Criticality levels (4) ──────────────────────────────────────────
  routine:             { abbr: 'ROUTINE',     label: 'Routine',             color: tokens.criticality.routine.color },
  important:           { abbr: 'IMPORTANT',   label: 'Important',           color: tokens.criticality.important.color },
  // critical — shared with notification priority
  essential:           { abbr: 'ESSENTIAL',   label: 'Essential',           color: tokens.criticality.essential.color },

  // ── Item flags ──────────────────────────────────────────────────────
  consumable:          { abbr: 'CONSUMABLE',  label: 'Consumable',          color: tokens.text.secondary },
  hazmat:              { abbr: 'HAZMAT',      label: 'Hazmat',              color: tokens.status.danger },
  requires_approval:   { abbr: 'APPROVAL',    label: 'Requires Approval',   color: tokens.status.warning },
  low_stock:           { abbr: 'LOW STOCK',   label: 'Low Stock',           color: tokens.status.danger },
  serialised:          { abbr: 'SERIAL',      label: 'Serialised',          color: tokens.text.secondary },
  is_active:           { abbr: 'ACTIVE',      label: 'Active',              color: tokens.status.success },
  inactive:            { abbr: 'INACTIVE',    label: 'Inactive',            color: tokens.text.tertiary },
  locked:              { abbr: 'LOCKED',      label: 'Locked',              color: tokens.status.danger },
};

/**
 * Look up status config case-insensitively with safe fallback.
 */
const getStatusConfig = (status: string): StatusConfig => {
  const normalised = status.toLowerCase().replace(/[\s-]/g, '_');
  return STATUS_REGISTRY[normalised] ?? {
    abbr: status.toUpperCase().slice(0, 10),
    label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '),
    color: tokens.text.tertiary,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'full' | 'dot' | 'chip';
type BadgeSize = 'sm' | 'md';

interface StatusBadgeProps {
  /** Status string — looked up case-insensitively in the registry */
  status: string;
  /** Display variant */
  variant?: BadgeVariant;
  /** Size */
  size?: BadgeSize;
  /** Override the display label */
  label?: string;
  /** Show tooltip with full label on hover (useful for abbreviated variants) */
  showTooltip?: boolean;
}

const StatusBadge = ({
  status,
  variant = 'default',
  size = 'md',
  label: labelOverride,
  showTooltip = true,
}: StatusBadgeProps) => {
  const config = getStatusConfig(status);
  const displayLabel = labelOverride ?? (variant === 'full' ? config.label : config.abbr);

  const isSmall = size === 'sm';
  const dotSize = isSmall ? 4 : 5;
  const fontSize = isSmall ? tokens.fontSize['2xs'] : '0.5625rem';
  const px = isSmall ? 0.75 : 1;
  const py = isSmall ? 0.125 : 0.25;

  // ─── Dot variant ──────────────────────────────────────────────────
  if (variant === 'dot') {
    const dot = (
      <Box
        sx={{
          width: dotSize + 1,
          height: dotSize + 1,
          borderRadius: tokens.radius.full,
          background: config.color,
          boxShadow: `0 0 4px ${alpha(config.color, 0.35)}`,
          flexShrink: 0,
        }}
      />
    );

    if (showTooltip) {
      return (
        <Tooltip title={config.label} arrow placement="top">
          {dot}
        </Tooltip>
      );
    }

    return dot;
  }

  // ─── Chip variant ─────────────────────────────────────────────────
  if (variant === 'chip') {
    return (
      <Chip
        label={displayLabel}
        size="small"
        sx={{
          height: isSmall ? 18 : 22,
          fontSize,
          fontFamily: tokens.font.mono,
          fontWeight: tokens.fontWeight.semibold,
          letterSpacing: tokens.letterSpacing.tracked,
          background: alpha(config.color, 0.10),
          color: config.color,
          border: `${tokens.borderWidth.thin} solid ${alpha(config.color, 0.20)}`,
          borderRadius: tokens.radius.sm,
          '& .MuiChip-label': {
            px: isSmall ? 1 : 1.25,
          },
        }}
      />
    );
  }

  // ─── Default / Full variant ───────────────────────────────────────
  const badge = (
    <Box
      className="flex items-center"
      sx={{
        gap: isSmall ? 0.75 : 1,
        px,
        py,
        borderRadius: '3px',
        background: alpha(config.color, 0.08),
        border: `${tokens.borderWidth.thin} solid ${alpha(config.color, 0.15)}`,
        display: 'inline-flex',
        alignItems: 'center',
        transition: `background ${tokens.transition.fast}`,
      }}
    >
      {/* Status dot with glow */}
      <Box
        sx={{
          width: dotSize,
          height: dotSize,
          borderRadius: tokens.radius.full,
          background: config.color,
          boxShadow: `0 0 4px ${alpha(config.color, 0.4)}`,
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <Typography
        sx={{
          fontSize,
          fontFamily: tokens.font.mono,
          fontWeight: tokens.fontWeight.semibold,
          letterSpacing: tokens.letterSpacing.tracked,
          color: config.color,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {displayLabel}
      </Typography>
    </Box>
  );

  // Wrap in tooltip for abbreviated labels
  if (showTooltip && variant === 'default' && displayLabel !== config.label) {
    return (
      <Tooltip title={config.label} arrow placement="top">
        {badge}
      </Tooltip>
    );
  }

  return badge;
};

export default StatusBadge;

// ─────────────────────────────────────────────────────────────────────────────
// Utility: get raw config for custom rendering (e.g. charts, legends)
// ─────────────────────────────────────────────────────────────────────────────

export { getStatusConfig, STATUS_REGISTRY };
export type { StatusConfig, BadgeVariant, BadgeSize };