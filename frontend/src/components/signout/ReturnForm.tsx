import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Button, TextField,
  CircularProgress, MenuItem, Typography,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { tokens } from '../../tokens';
import { signoutsApi } from '../../api/signouts';
import { getApiErrorMessage } from '../../api/client';
import type { SignOutBrief } from '../../types';

const schema = z.object({
  condition: z.enum(['serviceable', 'unserviceable', 'damaged']),
  return_notes: z.string().default(''),
  damage_description: z.string().default(''),
});

type FormData = z.infer<typeof schema>;

interface ReturnFormProps {
  signout: SignOutBrief | null;
  open: boolean;
  onClose: () => void;
}

const ReturnForm = ({ signout, open, onClose }: ReturnFormProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { condition: 'serviceable', return_notes: '', damage_description: '' },
  });

  const condition = watch('condition');

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const qty = signout?.quantity ?? 0;
      return signoutsApi.returnItem(signout?.id ?? 0, {
        returned_serviceable_qty: data.condition === 'serviceable' ? qty : 0,
        returned_unserviceable_qty: data.condition === 'unserviceable' ? qty : 0,
        returned_damaged_qty: data.condition === 'damaged' ? qty : 0,
        damage_description: data.condition === 'damaged' ? data.damage_description : undefined,
        return_notes: data.return_notes || undefined,
      });
    },
    onSuccess: () => {
      enqueueSnackbar('Equipment returned successfully', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['signouts'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      reset();
      onClose();
    },
    onError: (error: unknown) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
  });

  if (!signout) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ borderBottom: `1px solid ${tokens.surface.border}` }}>
        Return: {signout.item_name_snapshot}
      </DialogTitle>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Returning {signout.quantity} unit{signout.quantity !== 1 ? 's' : ''} — signed out by {signout.full_name}
          </Typography>

          <TextField
            select
            label="Condition on Return"
            defaultValue="serviceable"
            {...register('condition')}
            error={!!errors.condition}
            helperText={errors.condition?.message}
            fullWidth
            size="small"
          >
            <MenuItem value="serviceable">Serviceable</MenuItem>
            <MenuItem value="unserviceable">Unserviceable</MenuItem>
            <MenuItem value="damaged">Damaged</MenuItem>
          </TextField>

          {condition === 'damaged' && (
            <TextField
              label="Damage Description"
              {...register('damage_description')}
              multiline
              rows={2}
              fullWidth
              size="small"
              placeholder="Describe the damage..."
            />
          )}

          <TextField
            label="Return Notes (optional)"
            {...register('return_notes')}
            multiline
            rows={2}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.surface.border}` }}>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button variant="contained" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Confirm Return'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ReturnForm;