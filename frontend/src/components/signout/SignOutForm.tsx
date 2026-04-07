import { Dialog, DialogTitle, DialogContent, DialogActions, Box, Button, TextField, CircularProgress } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { tokens } from '../../tokens';
import { signoutsApi } from '../../api/signouts';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { ItemBrief } from '../../types';

const schema = z.object({
  full_name: z.string().min(1, 'Required'),
  rank: z.string().default(''),
  quantity: z.number().min(1, 'Min 1'),
  task_reference: z.string().min(1, 'Required'),
  expected_return_date: z.string().min(1, 'Required'),
  notes: z.string().default(''),
});

type FormData = z.infer<typeof schema>;

interface SignOutFormProps {
  item: ItemBrief | null;
  open: boolean;
  onClose: () => void;
}

const SignOutForm = ({ item, open, onClose }: SignOutFormProps) => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: user?.full_name ?? '',
      rank: user?.rank ?? '',
      quantity: 1,
      task_reference: '',
      expected_return_date: '',
      notes: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      signoutsApi.create({
        item_id: item?.id ?? 0,
        quantity: data.quantity,
        full_name: data.full_name,
        rank: data.rank,
        task_reference: data.task_reference,
        expected_return_date: data.expected_return_date,
        notes: data.notes,
      }),
    onSuccess: () => {
      enqueueSnackbar('Equipment signed out successfully', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['signouts'] });
      reset();
      onClose();
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
  });

  if (!item) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ borderBottom: `1px solid ${tokens.surface.border}` }}>
        Sign Out: {item.name}
      </DialogTitle>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 3 }}>
          <Box className="grid grid-cols-2 gap-4">
            <TextField label="Full Name" {...register('full_name')} error={!!errors.full_name} helperText={errors.full_name?.message} fullWidth size="small" />
            <TextField label="Rank" {...register('rank')} fullWidth size="small" />
          </Box>
          <TextField
            label="Quantity"
            type="number"
            {...register('quantity', { valueAsNumber: true })}
            error={!!errors.quantity}
            helperText={errors.quantity?.message ?? `Available: ${item.available_quantity}`}
            inputProps={{ min: 1, max: item.available_quantity }}
            fullWidth
            size="small"
          />
          <TextField label="Task / Exercise Reference" {...register('task_reference')} error={!!errors.task_reference} helperText={errors.task_reference?.message} fullWidth size="small" />
          <TextField
            label="Expected Return Date"
            type="date"
            {...register('expected_return_date')}
            error={!!errors.expected_return_date}
            helperText={errors.expected_return_date?.message}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />
          <TextField label="Notes (optional)" {...register('notes')} multiline rows={2} fullWidth size="small" />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.surface.border}` }}>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button variant="contained" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Confirm Sign Out'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default SignOutForm;