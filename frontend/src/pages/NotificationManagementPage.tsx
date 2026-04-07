/**
 * G4Light — NotificationManagementPage
 * System-wide notification management — admin view.
 * Phase 3E: expand with full list, broadcast form, stats, expired cleanup.
 */

import { Box, Typography, Button, Card } from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications';
import StatCard from '../components/common/StatCard';
import { EmptyNotifications } from '../components/common/EmptyState';
import { StatGridSkeleton } from '../components/common/LoadingSkeleton';

const NotificationManagementPage = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['notifications', 'admin', 'stats'],
    queryFn: notificationsApi.adminGetStats,
  });

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex items-start justify-between">
        <Box>
          <Typography variant="h2">Notifications</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            System-wide notification management and broadcasting
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<CampaignOutlinedIcon />} size="small">
          Broadcast
        </Button>
      </Box>

      {isLoading ? (
        <StatGridSkeleton count={4} />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 3 }}>
          <StatCard label="Total" value={stats?.total_notifications ?? 0} />
          <StatCard label="Unread" value={stats?.unread_count ?? 0} />
          <StatCard label="Acknowledged" value={stats?.acknowledged_count ?? 0} />
          <StatCard label="Expired" value={stats?.expired_count ?? 0} />
        </Box>
      )}

      <EmptyNotifications variant="compact" />
    </Box>
  );
};

export default NotificationManagementPage;