/**
 * G4Light — AdminSignoutsPage
 * All sign-outs management — admin view with approval workflow.
 * Phase 3E: expand with full table, status filters, approval/reject actions, CSV export.
 */

import { Box, Typography, Button } from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '../tokens';
import { signoutsApi } from '../api/signouts';
import StatCard from '../components/common/StatCard';
import { EmptySignouts } from '../components/common/EmptyState';
import { StatGridSkeleton } from '../components/common/LoadingSkeleton';

const AdminSignoutsPage = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['signouts', 'stats'],
    queryFn: signoutsApi.getStats,
  });

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex items-start justify-between">
        <Box>
          <Typography variant="h2">All Sign-outs</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage equipment sign-outs across all users
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={() => signoutsApi.exportCsv()}
          size="small"
        >
          Export CSV
        </Button>
      </Box>

      {isLoading ? (
        <StatGridSkeleton count={4} />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 3 }}>
          <StatCard label="Active" value={stats?.active_count ?? 0} />
          <StatCard label="Pending Approval" value={stats?.pending_approval_count ?? 0} />
          <StatCard label="Overdue" value={stats?.overdue_count ?? 0} />
          <StatCard label="Total" value={stats?.total_signouts ?? 0} />
        </Box>
      )}

      <EmptySignouts variant="compact" />
    </Box>
  );
};

export default AdminSignoutsPage;