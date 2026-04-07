import { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, Skeleton, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, CircularProgress,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { tokens } from '../tokens';
import { usersApi } from '../api/users';
import { getApiErrorMessage } from '../api/client';
import type { UserResponse } from '../types';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';

const schema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  rank: z.string().default(''),
  role: z.enum(['admin', 'user']),
});

type FormData = z.infer<typeof schema>;

const UserManagementPage = () => {
  const [formOpen, setFormOpen] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'user' },
  });

  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      enqueueSnackbar('User created', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      reset();
      setFormOpen(false);
    },
    onError: (error: unknown) => enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => usersApi.deactivate(id, { reason: 'Deactivated by admin' }),
    onSuccess: () => {
      enqueueSnackbar('User deactivated', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' }),
  });

  const users = data?.items ?? [];

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex items-start justify-between">
        <Box>
          <Typography variant="h2">User Management</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Create and manage platform users
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddOutlinedIcon />} onClick={() => setFormOpen(true)}>
          Create User
        </Button>
      </Box>

      {isError && <Alert severity="error">Failed to load users.</Alert>}

      {isLoading ? (
        <TableContainer>
          <Table><TableHead><TableRow>
            {['Name', 'Username', 'Email', 'Rank', 'Role', 'Status', 'Created', ''].map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
          </TableRow></TableHead><TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => (
                <TableCell key={j}><Skeleton width="60%" height={18} /></TableCell>
              ))}</TableRow>
            ))}
          </TableBody></Table>
        </TableContainer>
      ) : users.length === 0 ? (
        <EmptyState icon={<PeopleOutlinedIcon sx={{ fontSize: 48 }} />} title="No users" />
      ) : (
        <TableContainer>
          <Table>
            <TableHead><TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Rank</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell />
            </TableRow></TableHead>
            <TableBody>
              {users.map((u: UserResponse) => (
                <TableRow key={u.id}>
                  <TableCell>{u.full_name}</TableCell>
                  <TableCell sx={{ fontFamily: tokens.font.mono }}>{u.username}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.rank}</TableCell>
                  <TableCell><StatusBadge status={u.role} /></TableCell>
                  <TableCell><StatusBadge status={u.is_active ? 'active' : 'rejected'} /></TableCell>
                  <TableCell sx={{ fontFamily: tokens.font.mono }}>{format(new Date(u.created_at), 'dd MMM yyyy')}</TableCell>
                  <TableCell>
                    {u.is_active && (
                      <Button size="small" variant="text" color="error" onClick={() => deactivateMutation.mutate(u.id)}>
                        Deactivate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create User Dialog */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ borderBottom: `1px solid ${tokens.surface.border}` }}>Create New User</DialogTitle>
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))}>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 3 }}>
            <Box className="grid grid-cols-2 gap-4">
              <TextField label="Full Name" {...register('full_name')} error={!!errors.full_name} helperText={errors.full_name?.message} size="small" />
              <TextField label="Rank" {...register('rank')} size="small" />
            </Box>
            <TextField label="Username" {...register('username')} error={!!errors.username} helperText={errors.username?.message} fullWidth size="small" />
            <TextField label="Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} fullWidth size="small" />
            <TextField label="Password" type="password" {...register('password')} error={!!errors.password} helperText={errors.password?.message} fullWidth size="small" />
            <TextField select label="Role" defaultValue="user" {...register('role')} fullWidth size="small">
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.surface.border}` }}>
            <Button variant="text" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="contained" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Create User'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default UserManagementPage;