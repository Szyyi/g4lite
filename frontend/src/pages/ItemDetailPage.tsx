/**
 * G4Light — ItemDetailPage
 * Full item detail view accessed via /inventory/:id
 * Phase 3E: expand with 40+ fields, condition breakdown chart, stock actions, sign-out history.
 */

import { Box, Typography, Button, Card } from '@mui/material';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '../tokens';
import { itemsApi } from '../api/items';
import { DetailSkeleton } from '../components/common/LoadingSkeleton';
import DataRow, { DataSection } from '../components/common/DataRow';
import StatusBadge from '../components/common/StatusBadge';
import CriticalityBadge from '../components/common/CriticalityBadge';

const ItemDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const itemId = Number(id);

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['items', itemId],
    queryFn: () => itemsApi.get(itemId),
    enabled: !isNaN(itemId),
  });

  if (isLoading) {
    return (
      <Box className="flex flex-col gap-6">
        <Button startIcon={<ArrowBackOutlinedIcon />} variant="text" onClick={() => navigate(-1)}>
          Back
        </Button>
        <DetailSkeleton rows={12} />
      </Box>
    );
  }

  if (isError || !item) {
    return (
      <Box className="flex flex-col gap-4">
        <Button startIcon={<ArrowBackOutlinedIcon />} variant="text" onClick={() => navigate(-1)}>
          Back
        </Button>
        <Typography color="error">Item not found or failed to load.</Typography>
      </Box>
    );
  }

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex items-center justify-between">
        <Box className="flex items-center gap-3">
          <Button startIcon={<ArrowBackOutlinedIcon />} variant="text" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Box>
            <Typography variant="h2">{item.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: tokens.font.mono }}>
              {item.item_code}
            </Typography>
          </Box>
        </Box>
        <CriticalityBadge level={item.criticality_level} showIcon />
      </Box>

      <Card sx={{ p: 4 }}>
        <DataSection>General</DataSection>
        <DataRow label="Name" value={item.name} />
        <DataRow label="Item Code" value={item.item_code} mono copyable />
        <DataRow label="Category" value={item.category_name} />
        <DataRow label="Manufacturer" value={item.manufacturer || '—'} />
        <DataRow label="Model" value={item.model_number || '—'} />
        <DataRow label="Description" value={item.description || '—'} />

        <DataSection>Stock</DataSection>
        <DataRow label="Total Quantity" value={item.total_quantity} mono />
        <DataRow label="Available" value={item.available_quantity} mono />
        <DataRow label="Checked Out" value={item.checked_out_count} mono />
        <DataRow label="Serviceable" value={item.serviceable_count} mono />
        <DataRow label="Unserviceable" value={item.unserviceable_count} mono />
        <DataRow label="Damaged" value={item.damaged_count} mono />
        <DataRow label="Condemned" value={item.condemned_count} mono />

        <DataSection>Location</DataSection>
        <DataRow label="Storage" value={item.storage_location || '—'} />
        <DataRow label="Shelf" value={item.shelf || '—'} />
        <DataRow label="Bin" value={item.bin_location || '—'} noBorder />
      </Card>
    </Box>
  );
};

export default ItemDetailPage;