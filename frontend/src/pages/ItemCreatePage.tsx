/**
 * G4Light — ItemCreatePage
 * Admin form for creating new inventory items.
 * Phase 3E: expand with full 30+ field form, category picker, tag input, validation.
 */

import { Box, Typography, Button, Card } from '@mui/material';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';

const ItemCreatePage = () => {
  const navigate = useNavigate();

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex items-center gap-3">
        <Button startIcon={<ArrowBackOutlinedIcon />} variant="text" onClick={() => navigate(-1)}>
          Back
        </Button>
        <Box>
          <Typography variant="h2">Create Item</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Add a new item to the inventory
          </Typography>
        </Box>
      </Box>

      <Card sx={{ p: 4 }}>
        <EmptyState
          icon={<AddCircleOutlineOutlinedIcon />}
          title="Item creation form"
          description="Full item creation form with all 30+ fields will be built in a dedicated session."
          variant="compact"
        />
      </Card>
    </Box>
  );
};

export default ItemCreatePage;