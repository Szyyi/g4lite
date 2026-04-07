/**
 * G4Light — AdminResupplyPage
 * Resupply workflow management — admin view.
 * Phase 3E: expand with full workflow stepper, cost tracking, supplier management.
 */

import { Box, Typography, Button } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useQuery } from '@tanstack/react-query';
import { resupplyApi } from '../api/resupply';
import StatCard from '../components/common/StatCard';
import { EmptyResupply } from '../components/common/EmptyState';
import { StatGridSkeleton } from '../components/common/LoadingSkeleton';

const AdminResupplyPage = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['resupply', 'stats'],
    queryFn: resupplyApi.getStats,
  });

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex items-start justify-between">
        <Box>
          <Typography variant="h2">Resupply Management</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Review, approve, and track resupply requests
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={() => resupplyApi.exportCsv()}
          size="small"
        >
          Export CSV
        </Button>
      </Box>

      {isLoading ? (
        <StatGridSkeleton count={4} />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 3 }}>
          <StatCard label="Pending" value={stats?.pending_count ?? 0} />
          <StatCard label="Under Review" value={stats?.under_review_count ?? 0} />
          <StatCard label="Ordered" value={stats?.ordered_count ?? 0} />
          <StatCard label="Fulfilled" value={stats?.fulfilled_count ?? 0} />
        </Box>
      )}

      <EmptyResupply variant="compact" />
    </Box>
  );
};

export default AdminResupplyPage;