/**
 * G4Light — LoadingSkeleton
 * ===========================
 *
 * Preset skeleton patterns matching the exact layout of loaded components.
 * Using pattern-matched skeletons (instead of generic spinners) prevents
 * layout shift when data arrives and makes the loading state feel intentional.
 *
 * Presets:
 *  - TableSkeleton    — table body rows
 *  - CardGridSkeleton — inventory card grid
 *  - DetailSkeleton   — drawer/detail panel key-value rows
 *  - StatGridSkeleton — dashboard stat cards
 *  - FormSkeleton     — form fields
 *  - PageSkeleton     — full page (header + content)
 *  - ListSkeleton     — vertical list items
 *
 * Usage:
 *  ```tsx
 *  {isLoading ? <TableSkeleton rows={8} cols={6} /> : <DataTable ... />}
 *  ```
 */

import { Box, Skeleton, Card, TableBody, TableRow, TableCell } from '@mui/material';
import { tokens } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Table skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export const TableSkeleton = ({ rows = 8, cols = 5 }: TableSkeletonProps) => (
  <TableBody>
    {Array.from({ length: rows }).map((_, i) => (
      <TableRow key={i}>
        {Array.from({ length: cols }).map((_, j) => (
          <TableCell key={j}>
            <Skeleton
              height={16}
              width={j === 0 ? '65%' : j === cols - 1 ? '40%' : '50%'}
              sx={{ borderRadius: tokens.radius.sm }}
            />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </TableBody>
);

// ─────────────────────────────────────────────────────────────────────────────
// Card grid skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface CardGridSkeletonProps {
  count?: number;
}

export const CardGridSkeleton = ({ count = 8 }: CardGridSkeletonProps) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${tokens.layout.cardMinWidth}, 1fr))`,
      gap: tokens.space[4],
    }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} sx={{ p: 3 }}>
        <Skeleton width="35%" height={14} sx={{ mb: 2, borderRadius: tokens.radius.sm }} />
        <Skeleton width="70%" height={18} sx={{ mb: 0.75 }} />
        <Skeleton width="90%" height={14} sx={{ mb: 2.5 }} />
        <Box sx={{ borderTop: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`, pt: 2, mt: 1 }}>
          <Box className="flex justify-between">
            <Box>
              <Skeleton width={50} height={12} sx={{ mb: 0.5 }} />
              <Skeleton width={35} height={24} />
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Skeleton width={50} height={12} sx={{ mb: 0.5 }} />
              <Skeleton width={35} height={24} />
            </Box>
          </Box>
        </Box>
        <Box className="flex justify-between items-center" sx={{ mt: 2 }}>
          <Skeleton width={70} height={20} sx={{ borderRadius: tokens.radius.sm }} />
          <Skeleton width={28} height={28} variant="circular" />
        </Box>
      </Card>
    ))}
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────
// Detail panel skeleton (for drawers)
// ─────────────────────────────────────────────────────────────────────────────

interface DetailSkeletonProps {
  rows?: number;
}

export const DetailSkeleton = ({ rows = 10 }: DetailSkeletonProps) => (
  <Box className="flex flex-col">
    {/* Header */}
    <Box sx={{ mb: 3 }}>
      <Skeleton width="60%" height={24} sx={{ mb: 1 }} />
      <Skeleton width="40%" height={14} />
    </Box>

    {/* Key-value rows */}
    {Array.from({ length: rows }).map((_, i) => (
      <Box
        key={i}
        className="flex justify-between items-center"
        sx={{
          py: 1.75,
          borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
        }}
      >
        <Skeleton width={80 + Math.random() * 40} height={12} />
        <Skeleton width={60 + Math.random() * 60} height={14} />
      </Box>
    ))}
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────
// Stat grid skeleton (dashboard)
// ─────────────────────────────────────────────────────────────────────────────

interface StatGridSkeletonProps {
  count?: number;
}

export const StatGridSkeleton = ({ count = 4 }: StatGridSkeletonProps) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: tokens.space[4],
    }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <Card key={i} sx={{ p: 3 }}>
        <Box className="flex justify-between">
          <Box sx={{ flex: 1 }}>
            <Skeleton width="50%" height={10} sx={{ mb: 1.5 }} />
            <Skeleton width="45%" height={28} sx={{ mb: 1 }} />
            <Skeleton width="30%" height={12} />
          </Box>
          <Skeleton width={32} height={32} variant="circular" sx={{ opacity: 0.3 }} />
        </Box>
      </Card>
    ))}
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────
// Form skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface FormSkeletonProps {
  fields?: number;
  twoColumn?: boolean;
}

export const FormSkeleton = ({ fields = 6, twoColumn = false }: FormSkeletonProps) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: twoColumn ? '1fr 1fr' : '1fr',
      gap: tokens.space[5],
      maxWidth: tokens.layout.formMaxWidth,
    }}
  >
    {Array.from({ length: fields }).map((_, i) => (
      <Box key={i}>
        <Skeleton width={80 + Math.random() * 50} height={12} sx={{ mb: 1 }} />
        <Skeleton height={40} sx={{ borderRadius: tokens.radius.md }} />
      </Box>
    ))}
    {/* Action row */}
    <Box
      className="flex justify-end gap-2"
      sx={{
        gridColumn: twoColumn ? '1 / -1' : undefined,
        pt: 2,
        borderTop: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
      }}
    >
      <Skeleton width={80} height={36} sx={{ borderRadius: tokens.radius.md }} />
      <Skeleton width={100} height={36} sx={{ borderRadius: tokens.radius.md }} />
    </Box>
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────
// Page skeleton (header + content placeholder)
// ─────────────────────────────────────────────────────────────────────────────

export const PageSkeleton = () => (
  <Box className="flex flex-col gap-6">
    {/* Page header */}
    <Box className="flex justify-between items-start">
      <Box>
        <Skeleton width={200} height={28} sx={{ mb: 0.75 }} />
        <Skeleton width={300} height={14} />
      </Box>
      <Skeleton width={120} height={36} sx={{ borderRadius: tokens.radius.md }} />
    </Box>

    {/* Filter bar */}
    <Box className="flex gap-3">
      <Skeleton width={280} height={40} sx={{ borderRadius: tokens.radius.md }} />
      <Skeleton width={140} height={40} sx={{ borderRadius: tokens.radius.md }} />
      <Skeleton width={140} height={40} sx={{ borderRadius: tokens.radius.md }} />
    </Box>

    {/* Content placeholder */}
    <CardGridSkeleton count={6} />
  </Box>
);

// ─────────────────────────────────────────────────────────────────────────────
// List skeleton
// ─────────────────────────────────────────────────────────────────────────────

interface ListSkeletonProps {
  count?: number;
}

export const ListSkeleton = ({ count = 6 }: ListSkeletonProps) => (
  <Box className="flex flex-col">
    {Array.from({ length: count }).map((_, i) => (
      <Box
        key={i}
        className="flex items-center gap-3"
        sx={{
          py: 1.5,
          px: 2,
          borderBottom: `${tokens.borderWidth.thin} solid ${tokens.surface.border}`,
        }}
      >
        <Skeleton variant="circular" width={32} height={32} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="55%" height={14} sx={{ mb: 0.5 }} />
          <Skeleton width="35%" height={12} />
        </Box>
        <Skeleton width={60} height={20} sx={{ borderRadius: tokens.radius.sm }} />
      </Box>
    ))}
  </Box>
);