import { Box, Card, Typography, IconButton, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import { tokens } from '../../tokens';
import type { ItemBrief } from '../../types';
import StatusBadge from '../common/StatusBadge';

interface ItemCardProps {
  item: ItemBrief;
  onSelect: (item: ItemBrief) => void;
}

const ItemCard = ({ item, onSelect }: ItemCardProps) => {
  const condition = item.damaged_count > 0
    ? 'damaged'
    : item.unserviceable_count > 0
      ? 'unserviceable'
      : 'serviceable';

  const utilizationPct = item.total_quantity > 0
    ? Math.round((item.checked_out_count / item.total_quantity) * 100)
    : 0;

  return (
    <Card
      sx={{
        p: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        transition: `border-color ${tokens.transition.normal}, transform 200ms ease`,
        '&:hover': {
          borderColor: tokens.surface.borderHi,
          transform: 'translateY(-1px)',
        },
      }}
      onClick={() => onSelect(item)}
    >
      {/* Top bar with category */}
      <Box
        sx={{
          px: 2,
          py: 0.75,
          background: tokens.surface.overlay,
          borderBottom: `1px solid ${tokens.surface.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography
          sx={{
            fontSize: '0.5625rem',
            fontFamily: tokens.font.mono,
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: tokens.text.tertiary,
            textTransform: 'uppercase',
          }}
        >
          {item.category_name}
        </Typography>
        <StatusBadge status={condition} />
      </Box>

      {/* Body */}
      <Box sx={{ px: 2, pt: 1.5, pb: 2 }}>
        <Typography
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: tokens.text.primary,
            lineHeight: 1.3,
            mb: 0.5,
          }}
        >
          {item.name}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.6875rem',
            color: tokens.text.tertiary,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 32,
          }}
        >
          {item.short_description}
        </Typography>
      </Box>

      {/* Data row */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: `1px solid ${tokens.surface.border}`,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 1,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: '0.5625rem', color: tokens.text.tertiary, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.25 }}>
            AVAIL
          </Typography>
          <Box className="flex items-baseline gap-0.5">
            <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '1.125rem', fontWeight: 600, color: tokens.text.primary, lineHeight: 1 }}>
              {item.available_quantity}
            </Typography>
            <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.625rem', color: tokens.text.tertiary }}>
              /{item.total_quantity}
            </Typography>
          </Box>
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.5625rem', color: tokens.text.tertiary, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.25 }}>
            OUT
          </Typography>
          <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '1.125rem', fontWeight: 600, color: item.checked_out_count > 0 ? tokens.accent.text : tokens.text.tertiary, lineHeight: 1 }}>
            {item.checked_out_count}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: '0.5625rem', color: tokens.text.tertiary, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.25 }}>
            UTIL
          </Typography>
          <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '1.125rem', fontWeight: 600, color: utilizationPct > 70 ? tokens.status.warning : tokens.text.secondary, lineHeight: 1 }}>
            {utilizationPct}%
          </Typography>
        </Box>
      </Box>

      {/* Utilization bar */}
      <Box sx={{ px: 2, pb: 1.5 }}>
        <Box sx={{ width: '100%', height: 2, background: tokens.surface.border, borderRadius: 1, overflow: 'hidden' }}>
          <Box
            sx={{
              width: `${utilizationPct}%`,
              height: '100%',
              background: utilizationPct > 70
                ? tokens.status.warning
                : utilizationPct > 40
                  ? tokens.accent.default
                  : alpha(tokens.text.primary, 0.2),
              borderRadius: 1,
              transition: 'width 500ms ease',
            }}
          />
        </Box>
      </Box>

      {/* Footer action */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: `1px solid ${tokens.surface.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: alpha(tokens.surface.overlay, 0.5),
        }}
      >
        <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.5625rem', color: tokens.text.tertiary, letterSpacing: '0.04em' }}>
          {item.item_code}
        </Typography>
        <Tooltip title="View details" arrow>
          <IconButton
            size="small"
            aria-label="View item details"
            onClick={(e) => { e.stopPropagation(); onSelect(item); }}
            sx={{ color: tokens.text.tertiary, '&:hover': { color: tokens.accent.text } }}
          >
            <ArrowForwardOutlinedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Card>
  );
};

export default ItemCard;