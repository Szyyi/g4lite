import { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Skeleton, Alert, Tabs, Tab,
} from '@mui/material';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import { useQuery } from '@tanstack/react-query';
import { format, isPast, parseISO } from 'date-fns';
import { tokens } from '../tokens';
import { signoutsApi } from '../api/signouts';
import type { SignOutBrief } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import ReturnForm from '../components/signout/ReturnForm';

const MySignoutsPage = () => {
  const [tab, setTab] = useState(0);
  const [returnTarget, setReturnTarget] = useState<SignOutBrief | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['signouts', 'mine'],
    queryFn: () => signoutsApi.listMine(),
  });

  const allSignouts = data ?? [];
  const active = allSignouts.filter((s: SignOutBrief) => s.status === 'active' || s.status === 'overdue');
  const history = allSignouts.filter((s: SignOutBrief) => s.status === 'returned');
  const displayed = tab === 0 ? active : history;

  return (
    <Box className="flex flex-col gap-5">
      <Box>
        <Typography sx={{ fontSize: '0.625rem', fontFamily: tokens.font.mono, color: tokens.text.tertiary, letterSpacing: '0.1em', mb: 0.5 }}>
          PERSONAL EQUIPMENT LOG
        </Typography>
        <Typography variant="h2" sx={{ fontSize: '1.375rem' }}>My Sign-outs</Typography>
      </Box>

      <Box className="flex items-center justify-between">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={`Active (${active.length})`} />
          <Tab label={`History (${history.length})`} />
        </Tabs>
        {active.length > 0 && (
          <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.625rem', color: tokens.text.tertiary }}>
            {active.length} ITEM{active.length !== 1 ? 'S' : ''} HELD
          </Typography>
        )}
      </Box>

      {isError && <Alert severity="error">Failed to load sign-outs.</Alert>}

      {isLoading ? (
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              {['Item', 'Qty', 'Task Ref', 'Out', 'Due', 'Status', ''].map((h) => (
                <TableCell key={h}>{h}</TableCell>
              ))}
            </TableRow></TableHead>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton width={j === 0 ? '70%' : '50%'} height={14} /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={<AssignmentOutlinedIcon sx={{ fontSize: 40 }} />}
          title={tab === 0 ? 'No active sign-outs' : 'No return history'}
          description={tab === 0 ? 'Sign out equipment from the Inventory page' : undefined}
        />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Qty</TableCell>
              <TableCell>Task Ref</TableCell>
              <TableCell>Out</TableCell>
              <TableCell>Due</TableCell>
              <TableCell>Status</TableCell>
              {tab === 0 && <TableCell />}
            </TableRow></TableHead>
            <TableBody>
              {displayed.map((so: SignOutBrief) => {
                const overdue = so.status !== 'returned' && isPast(parseISO(so.expected_return_date));
                return (
                  <TableRow key={so.id}>
                    <TableCell sx={{ fontWeight: 500 }}>{so.item_name_snapshot}</TableCell>
                    <TableCell sx={{ fontFamily: tokens.font.mono }}>{so.quantity}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>{so.task_reference}</TableCell>
                    <TableCell sx={{ fontFamily: tokens.font.mono, fontSize: '0.75rem' }}>
                      {format(new Date(so.signed_out_at), 'dd MMM yy')}
                    </TableCell>
                    <TableCell sx={{ fontFamily: tokens.font.mono, fontSize: '0.75rem', color: overdue ? tokens.status.danger : tokens.text.secondary }}>
                      {format(parseISO(so.expected_return_date), 'dd MMM yy')}
                    </TableCell>
                    <TableCell><StatusBadge status={overdue ? 'overdue' : so.status} /></TableCell>
                    {tab === 0 && (
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => setReturnTarget(so)} sx={{ fontSize: '0.6875rem' }}>
                          Return
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ReturnForm signout={returnTarget} open={!!returnTarget} onClose={() => setReturnTarget(null)} />
    </Box>
  );
};

export default MySignoutsPage;