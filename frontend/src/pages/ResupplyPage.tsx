import { useState } from 'react';
import {
  Box, Typography, Button, Card, Skeleton, Alert, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, MenuItem, TextField,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { tokens } from '../tokens';
import { resupplyApi } from '../api/resupply';
import { getApiErrorMessage } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { ResupplyBrief } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import ResupplyForm from '../components/resupply/ResupplyForm';

const ResupplyPage = () => {
  const { isAdmin } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['resupply'],
    queryFn: () => resupplyApi.list(),
    enabled: isAdmin,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => resupplyApi.approve(id, {}),
    onSuccess: () => {
      enqueueSnackbar('Request approved', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['resupply'] });
    },
    onError: (error: unknown) => enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => resupplyApi.reject(id, { rejection_reason: 'Declined by admin' }),
    onSuccess: () => {
      enqueueSnackbar('Request rejected', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['resupply'] });
    },
    onError: (error: unknown) => enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' }),
  });

  const items = data?.items ?? [];

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex items-start justify-between">
        <Box>
          <Typography variant="h2">Resupply Requests</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {isAdmin ? 'Manage resupply requests from users' : 'Submit requests for new or additional equipment'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setFormOpen(true)}>
          New Request
        </Button>
      </Box>

      {isError && <Alert severity="error">Failed to load resupply requests.</Alert>}

      {!isAdmin ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Use the button above to submit a resupply request. Your admin will be notified.
          </Typography>
        </Card>
      ) : isLoading ? (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Item', 'Requester', 'Qty', 'Justification', 'Date', 'Status', 'Action'].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton width="60%" height={18} /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<LocalShippingOutlinedIcon sx={{ fontSize: 48 }} />}
          title="No resupply requests"
          description="Requests submitted by users will appear here"
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Requester</TableCell>
                <TableCell>Qty</TableCell>
                <TableCell>Justification</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((r: ResupplyBrief) => (
                <TableRow key={r.id}>
                  <TableCell>{r.item_name || r.item_name_freetext}</TableCell>
                  <TableCell>{r.requester_name}</TableCell>
                  <TableCell sx={{ fontFamily: tokens.font.mono }}>{r.quantity_requested}</TableCell>
                  <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    —
                  </TableCell>
                  <TableCell sx={{ fontFamily: tokens.font.mono }}>{format(new Date(r.created_at), 'dd MMM yyyy')}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    {r.status === 'pending' && (
                      <Box className="flex gap-1">
                        <Button size="small" variant="outlined" color="success" onClick={() => approveMutation.mutate({ id: r.id })}>
                          Approve
                        </Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => rejectMutation.mutate({ id: r.id })}>
                          Reject
                        </Button>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ResupplyForm open={formOpen} onClose={() => setFormOpen(false)} />
    </Box>
  );
};

export default ResupplyPage;