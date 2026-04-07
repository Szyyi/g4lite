/**
 * G4Light — StatCard
 * ====================
 *
 * Dashboard metric card. Border-only container (no background fill),
 * stat value always in monospace. Optional delta shows change with
 * colour-coded positive/negative indicator.
 *
 * Usage:
 *  ```tsx
 *  <StatCard
 *    label="Total Items"
 *    value={248}
 *    delta={{ value: '+12', positive: true }}
 *    icon={<Inventory2OutlinedIcon />}
 *  />
 *  ```
 */

import { type ReactNode } from 'react';
import { Box, Card, Typography, Skeleton } from '@mui/material';
import { tokens } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StatDelta {
  /** Display string (e.g. "+12", "-3", "+5.2%") */
  value: string;
  /** True = success colour, false = danger colour */
  positive: boolean;
}

interface StatCardProps {
  /** Metric label (e.g. "Total Items", "Overdue") */
  label: string;
  /** Metric value — displayed in monospace */
  value: string | number;
  /** Change indicator */
  delta?: StatDelta;
  /** Icon displayed top-right */
  icon?: ReactNode;
  /** Optional subtitle below the value */
  subtitle?: string;
  /** Loading state — renders skeleton */
  isLoading?: boolean;
  /** Click handler — makes the card interactive */
  onClick?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const StatCard = ({
  label,
  value,
  delta,
  icon,
  subtitle,
  isLoading = false,
  onClick,
}: StatCardProps) => {
  if (isLoading) {
    return (
      <Card sx={{ p: 3 }}>
        <Skeleton width="45%" height={12} />
        <Skeleton width="60%" height={32} sx={{ mt: 1.5 }} />
        <Skeleton width="30%" height={12} sx={{ mt: 1 }} />
      </Card>
    );
  }

  return (
    <Card
      sx={{
        p: 3,
        ...(onClick && {
          cursor: 'pointer',
          '&:hover': {
            borderColor: tokens.surface.borderMax,
            transform: 'translateY(-1px)',
          },
          transition: `border-color ${tokens.transition.normal}, transform ${tokens.transition.normal}`,
        }),
      }}
      onClick={onClick}
    >
      <Box className="flex items-start justify-between">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Label */}
          <Typography
            variant="overline"
            sx={{
              color: tokens.text.tertiary,
              display: 'block',
              lineHeight: 1,
            }}
          >
            {label}
          </Typography>

          {/* Value */}
          <Typography
            variant="h2"
            sx={{
              fontFamily: tokens.font.mono,
              fontWeight: tokens.fontWeight.bold,
              mt: 1,
              lineHeight: 1,
              letterSpacing: tokens.letterSpacing.tight,
            }}
          >
            {value}
          </Typography>

          {/* Delta / subtitle row */}
          {(delta || subtitle) && (
            <Box className="flex items-center gap-2" sx={{ mt: 1 }}>
              {delta && (
                <Typography
                  sx={{
                    fontSize: tokens.fontSize.sm,
                    fontFamily: tokens.font.mono,
                    fontWeight: tokens.fontWeight.medium,
                    color: delta.positive
                      ? tokens.status.success
                      : tokens.status.danger,
                    lineHeight: 1,
                  }}
                >
                  {delta.value}
                </Typography>
              )}
              {subtitle && (
                <Typography
                  variant="caption"
                  sx={{
                    color: tokens.text.quartery,
                    lineHeight: 1,
                  }}
                >
                  {subtitle}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Icon */}
        {icon && (
          <Box
            sx={{
              color: tokens.text.tertiary,
              opacity: 0.35,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '& .MuiSvgIcon-root': {
                fontSize: tokens.icon.xl,
              },
            }}
          >
            {icon}
          </Box>
        )}
      </Box>
    </Card>
  );
};

export default StatCard;