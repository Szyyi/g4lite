/**
 * G4Light — ItemEditPage
 * Admin form for editing existing inventory items.
 * Phase 3E: expand with pre-populated 30+ field form, stock actions, condition transfer.
 */

import { Box, Typography, Button, Card } from '@mui/material';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '../tokens';
import { itemsApi } from '../api/items';
import { DetailSkeleton } from '../components/common/LoadingSkeleton';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EmptyState from '../components/common/EmptyState';

const ItemEditPage = () => {
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
        <DetailSkeleton rows={8} />
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
      <Box className="flex items-center gap-3">
        <Button startIcon={<ArrowBackOutlinedIcon />} variant="text" onClick={() => navigate(-1)}>
          Back
        </Button>
        <Box>
          <Typography variant="h2">Edit: {item.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: tokens.font.mono }}>
            {item.item_code}
          </Typography>
        </Box>
      </Box>

      <Card sx={{ p: 4 }}>
        <EmptyState
          icon={<EditOutlinedIcon />}
          title="Item edit form"
          description="Full item editing form will be built in a dedicated session."
          variant="compact"
        />
      </Card>
    </Box>
  );
};

export default ItemEditPage;