/**
 * G4Light — DataRow
 * ===================
 *
 * Key/value pair for detail panels, drawers, and info sections.
 * Consistent spacing between label and value with bottom border.
 *
 * Features:
 *  - Mono mode for numeric/ID/date values
 *  - Accepts ReactNode as value (for StatusBadge, links, etc.)
 *  - Optional copy-to-clipboard action on hover
 *  - Compact variant for dense layouts
 *
 * Usage:
 *  ```tsx
 *  <DataRow label="Item Code" value="G4L-SBC-001" mono />
 *  <DataRow label="Status" value={<StatusBadge status="active" />} />
 *  <DataRow label="Signed Out" value={format(date, 'dd MMM yyyy')} mono copyable />
 *  ```
 */

import { useState, useCallback, type ReactNode } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import { tokens } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DataRowProps {
  /** Field label (left side) */
  label: string;
  /** Field value (right side) — string or ReactNode */
  value: ReactNode;
  /** Render value in monospace font */
  mono?: boolean;
  /** Show copy button on hover */
  copyable?: boolean;
  /** Compact padding (for dense layouts) */
  compact?: boolean;
  /** Hide the bottom border (for last item in a group) */
  noBorder?: boolean;
  /** Secondary/muted value styling */
  muted?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const DataRow = ({
  label,
  value,
  mono = false,
  copyable = false,
  compact = false,
  noBorder = false,
  muted = false,
}: DataRowProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (typeof value !== 'string' && typeof value !== 'number') return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available — fail silently
    }
  }, [value]);

  const canCopy = copyable && (typeof value === 'string' || typeof value === 'number');

  return (
    <Box
      className="flex items-start justify-between group"
      sx={{
        py: compact ? 1.25 : 1.75,
        gap: 3,
        ...(!noBorder && {
          borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
        }),
        '&:hover .copy-btn': {
          opacity: 1,
        },
      }}
    >
      {/* Label */}
      <Typography
        variant="caption"
        sx={{
          color: tokens.text.tertiary,
          flexShrink: 0,
          mt: '2px',
          minWidth: compact ? 80 : 100,
          fontSize: compact ? tokens.fontSize['2xs'] : tokens.fontSize.sm,
          letterSpacing: tokens.letterSpacing.wider,
        }}
      >
        {label}
      </Typography>

      {/* Value + copy button */}
      <Box className="flex items-center gap-1.5" sx={{ minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Typography
            variant="body2"
            sx={{
              textAlign: 'right',
              wordBreak: 'break-word',
              color: muted ? tokens.text.tertiary : tokens.text.primary,
              ...(mono && {
                fontFamily: tokens.font.mono,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: tokens.letterSpacing.wider,
              }),
            }}
          >
            {value}
          </Typography>
        ) : (
          value
        )}

        {/* Copy button */}
        {canCopy && (
          <Tooltip title={copied ? 'Copied' : 'Copy'} arrow>
            <IconButton
              className="copy-btn"
              size="small"
              onClick={handleCopy}
              sx={{
                p: 0.375,
                opacity: 0,
                transition: `opacity ${tokens.transition.fast}`,
                color: copied ? tokens.status.success : tokens.text.quartery,
                '&:hover': {
                  color: copied ? tokens.status.success : tokens.text.tertiary,
                  background: alpha(tokens.text.primary, 0.04),
                },
              }}
            >
              {copied ? (
                <CheckOutlinedIcon sx={{ fontSize: 13 }} />
              ) : (
                <ContentCopyOutlinedIcon sx={{ fontSize: 13 }} />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

export default DataRow;

// ─────────────────────────────────────────────────────────────────────────────
// Section divider for grouping DataRows
// ─────────────────────────────────────────────────────────────────────────────

export const DataSection = ({ children }: { children: string }) => (
  <Typography
    variant="overline"
    sx={{
      color: tokens.text.quartery,
      display: 'block',
      mt: 3,
      mb: 1,
      fontSize: tokens.fontSize['2xs'],
      letterSpacing: '0.14em',
    }}
  >
    {children}
  </Typography>
);