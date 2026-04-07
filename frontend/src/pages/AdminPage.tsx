import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Skeleton, Alert,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import InventoryOutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useQuery } from '@tanstack/react-query';
import { format, isPast, parseISO } from 'date-fns';
import { tokens } from '../tokens';
import { signoutsApi } from '../api/signouts';
import { itemsApi } from '../api/items';
import { resupplyApi } from '../api/resupply';
import type { SignOutBrief, ResupplyBrief } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  alert?: boolean;
}

const StatCard = ({ label, value, icon, alert }: StatCardProps) => (
  <Box
    sx={{
      p: 2.5,
      background: tokens.surface.raised,
      border: `1px solid ${alert ? alpha(tokens.status.danger, 0.3) : tokens.surface.border}`,
      borderRadius: tokens.radius.lg,
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {alert && value !== 0 && (
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: tokens.status.danger }} />
    )}
    <Box className="flex items-start justify-between">
      <Box>
        <Typography sx={{ fontSize: '0.5625rem', fontFamily: tokens.font.mono, fontWeight: 600, letterSpacing: '0.1em', color: tokens.text.tertiary, textTransform: 'uppercase', mb: 1 }}>
          {label}
        </Typography>
        <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '2rem', fontWeight: 700, color: alert && value !== 0 ? tokens.status.danger : tokens.text.primary, lineHeight: 1 }}>
          {value}
        </Typography>
      </Box>
      <Box sx={{ color: tokens.text.tertiary, opacity: 0.15, mt: -0.5 }}>{icon}</Box>
    </Box>
  </Box>
);

const AdminPage = () => {
  const { data: signoutsData, isLoading: soLoading, isError: soError } = useQuery({
    queryKey: ['signouts', 'all'],
    queryFn: () => signoutsApi.list({ status: 'active' as const }),
  });

  const { data: itemsData } = useQuery({
    queryKey: ['items', 'stats'],
    queryFn: () => itemsApi.list({ page_size: 1 }),
  });

  const { data: resupplyData } = useQuery({
    queryKey: ['resupply'],
    queryFn: () => resupplyApi.list(),
  });

  const signouts = signoutsData?.items ?? [];
  const resupplyItems = resupplyData?.items ?? [];
  const overdueCount = signouts.filter((s: SignOutBrief) => isPast(parseISO(s.expected_return_date))).length;
  const pendingResupply = resupplyItems.filter((r: ResupplyBrief) => r.status === 'pending').length;

  return (
    <Box className="flex flex-col gap-5">
      <Box>
        <Typography sx={{ fontSize: '0.625rem', fontFamily: tokens.font.mono, color: tokens.text.tertiary, letterSpacing: '0.1em', mb: 0.5 }}>
          OPERATIONAL OVERVIEW
        </Typography>
        <Typography variant="h2" sx={{ fontSize: '1.375rem' }}>Dashboard</Typography>
      </Box>

      {/* Stats grid */}
      <Box className="grid grid-cols-4 gap-3">
        <StatCard label="Total Items" value={itemsData?.total ?? '—'} icon={<InventoryOutlinedIcon sx={{ fontSize: 32 }} />} />
        <StatCard label="Active Sign-outs" value={signouts.length} icon={<AssignmentOutlinedIcon sx={{ fontSize: 32 }} />} />
        <StatCard label="Overdue" value={overdueCount} icon={<WarningAmberOutlinedIcon sx={{ fontSize: 32 }} />} alert />
        <StatCard label="Pending Resupply" value={pendingResupply} icon={<LocalShippingOutlinedIcon sx={{ fontSize: 32 }} />} />
      </Box>

      {/* Active Sign-outs Table */}
      <Box>
        <Box className="flex items-center justify-between" sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>Active Sign-outs</Typography>
          <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.625rem', color: tokens.text.tertiary }}>
            {signouts.length} RECORDS
          </Typography>
        </Box>

        {soError && <Alert severity="error">Failed to load sign-outs.</Alert>}

        {soLoading ? (
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow>
                {['Name', 'Rank', 'Item', 'Qty', 'Task Ref', 'Out', 'Due', 'Status'].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow></TableHead>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton width={j === 0 ? '70%' : '50%'} height={14} /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : signouts.length === 0 ? (
          <EmptyState icon={<AssignmentOutlinedIcon sx={{ fontSize: 40 }} />} title="No active sign-outs" description="All equipment is in the store" />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Rank</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Qty</TableCell>
                <TableCell>Task Ref</TableCell>
                <TableCell>Out</TableCell>
                <TableCell>Due</TableCell>
                <TableCell>Status</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {signouts.map((so: SignOutBrief) => {
                  const overdue = isPast(parseISO(so.expected_return_date));
                  return (
                    <TableRow key={so.id}>
                      <TableCell sx={{ fontWeight: 500 }}>{so.full_name}</TableCell>
                      <TableCell sx={{ fontFamily: tokens.font.mono, fontSize: '0.75rem' }}>{so.rank}</TableCell>
                      <TableCell>{so.item_name_snapshot}</TableCell>
                      <TableCell sx={{ fontFamily: tokens.font.mono }}>{so.quantity}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{so.task_reference}</TableCell>
                      <TableCell sx={{ fontFamily: tokens.font.mono, fontSize: '0.75rem' }}>
                        {format(new Date(so.signed_out_at), 'dd MMM yy')}
                      </TableCell>
                      <TableCell sx={{ fontFamily: tokens.font.mono, fontSize: '0.75rem', color: overdue ? tokens.status.danger : tokens.text.secondary }}>
                        {format(parseISO(so.expected_return_date), 'dd MMM yy')}
                      </TableCell>
                      <TableCell><StatusBadge status={overdue ? 'overdue' : so.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
};

export default AdminPage;