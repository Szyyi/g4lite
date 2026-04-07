import { Box, Drawer, Typography, Button, IconButton } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { tokens } from '../../tokens';
import type { ItemBrief } from '../../types';
import StatusBadge from '../common/StatusBadge';

const DataRow = ({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <Box className="flex items-center justify-between py-1.5" sx={{ borderBottom: `1px solid ${alpha(tokens.surface.border, 0.5)}` }}>
    <Typography sx={{ fontSize: '0.6875rem', color: tokens.text.tertiary, letterSpacing: '0.02em' }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: '0.8125rem', textAlign: 'right', color: tokens.text.primary, ...(mono && { fontFamily: tokens.font.mono, fontSize: '0.75rem' }) }}>
      {value}
    </Typography>
  </Box>
);

const SectionHeader = ({ children }: { children: string }) => (
  <Typography
    sx={{
      fontSize: '0.5625rem',
      fontFamily: tokens.font.mono,
      fontWeight: 600,
      letterSpacing: '0.12em',
      color: tokens.text.tertiary,
      textTransform: 'uppercase',
      mt: 3,
      mb: 1,
      opacity: 0.7,
    }}
  >
    {children}
  </Typography>
);

interface ItemDetailDrawerProps {
  item: ItemBrief | null;
  open: boolean;
  onClose: () => void;
  onSignOut: (item: ItemBrief) => void;
}

const ItemDetailDrawer = ({ item, open, onClose, onSignOut }: ItemDetailDrawerProps) => {
  if (!item) return null;

  const condition = item.damaged_count > 0 ? 'damaged' : item.unserviceable_count > 0 ? 'unserviceable' : 'serviceable';
  const utilizationPct = item.total_quantity > 0 ? Math.round((item.checked_out_count / item.total_quantity) * 100) : 0;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 400, p: 0 } }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${tokens.surface.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.625rem', color: tokens.text.tertiary, letterSpacing: '0.06em' }}>
            ITEM DETAIL — {item.item_code}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ color: tokens.text.tertiary }}>
          <CloseOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ px: 3, py: 2.5, flex: 1, overflowY: 'auto' }}>
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: tokens.text.primary, mb: 0.5, letterSpacing: '-0.02em' }}>
          {item.name}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: tokens.text.tertiary, lineHeight: 1.5, mb: 2 }}>
          {item.short_description}
        </Typography>

        {/* Utilization bar large */}
        <Box sx={{ p: 2, background: tokens.surface.overlay, borderRadius: tokens.radius.md, border: `1px solid ${tokens.surface.border}`, mb: 1 }}>
          <Box className="flex items-center justify-between" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: '0.625rem', fontFamily: tokens.font.mono, color: tokens.text.tertiary, letterSpacing: '0.08em' }}>
              UTILIZATION
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', fontFamily: tokens.font.mono, fontWeight: 700, color: tokens.text.primary }}>
              {utilizationPct}%
            </Typography>
          </Box>
          <Box sx={{ width: '100%', height: 4, background: tokens.surface.border, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ width: `${utilizationPct}%`, height: '100%', background: tokens.accent.default, borderRadius: 2, transition: 'width 500ms ease' }} />
          </Box>
        </Box>

        <SectionHeader>Stock Information</SectionHeader>
        <DataRow label="Category" value={item.category_name} />
        <DataRow label="Total Quantity" value={item.total_quantity} mono />
        <DataRow label="Available" value={item.available_quantity} mono />
        <DataRow label="Checked Out" value={item.checked_out_count} mono />

        <SectionHeader>Condition Breakdown</SectionHeader>
        <DataRow label="Serviceable" value={item.serviceable_count} mono />
        <DataRow label="Unserviceable" value={item.unserviceable_count} mono />
        <DataRow label="Damaged" value={item.damaged_count} mono />
        <DataRow label="Condemned" value={item.condemned_count} mono />
        <Box sx={{ mt: 1.5 }}><StatusBadge status={condition} /></Box>

        {item.storage_location && (
          <>
            <SectionHeader>Location</SectionHeader>
            <DataRow label="Storage" value={item.storage_location} />
          </>
        )}
      </Box>

      {/* Action footer */}
      <Box sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.surface.border}`, background: tokens.surface.overlay }}>
        <Button
          variant="contained"
          fullWidth
          disabled={item.available_quantity === 0}
          onClick={() => onSignOut(item)}
          sx={{ fontSize: '0.75rem', py: 1 }}
        >
          {item.available_quantity === 0 ? 'Out of Stock' : 'Sign Out Equipment'}
        </Button>
      </Box>
    </Drawer>
  );
};

export default ItemDetailDrawer;