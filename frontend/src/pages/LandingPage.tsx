/**
 * G4Light — LandingPage
 * Dashboard overview — first page after login.
 * Shows stat cards, recent activity, and quick actions.
 * Phase 3E: expand with Recharts, activity feed, low-stock alerts.
 */

import { Box, Typography, Button, Card } from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '../tokens';
import { useAuth } from '../hooks/useAuth';
import { itemsApi } from '../api/items';
import StatCard from '../components/common/StatCard';
import { StatGridSkeleton } from '../components/common/LoadingSkeleton';

const LandingPage = () => {
  const { displayName, isAdmin } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['items', 'stats'],
    queryFn: itemsApi.getStats,
  });

  return (
    <Box className="flex flex-col gap-6">
      {/* Header */}
      <Box>
        <Typography variant="h2">
          Welcome back, {displayName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Equipment logistics overview
        </Typography>
      </Box>

      {/* Stat cards */}
      {isLoading ? (
        <StatGridSkeleton count={4} />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 3 }}>
          <StatCard
            label="Total Items"
            value={stats?.total_items ?? 0}
            icon={<Inventory2OutlinedIcon />}
          />
          <StatCard
            label="Available"
            value={stats?.total_available ?? 0}
            subtitle={`of ${stats?.total_quantity ?? 0}`}
            icon={<Inventory2OutlinedIcon />}
          />
          <StatCard
            label="Checked Out"
            value={stats?.total_checked_out ?? 0}
            icon={<AssignmentOutlinedIcon />}
          />
          <StatCard
            label="Low Stock"
            value={stats?.low_stock_count ?? 0}
            icon={<WarningAmberOutlinedIcon />}
          />
        </Box>
      )}

      {/* Placeholder for charts and activity feed */}
      <Card sx={{ p: 4 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>Recent Activity</Typography>
        <Typography variant="body2" color="text.secondary">
          Activity feed and charts will be expanded in the next iteration.
        </Typography>
      </Card>
    </Box>
  );
};

export default LandingPage;