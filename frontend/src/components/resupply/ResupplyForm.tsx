import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, CircularProgress } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { tokens } from '../../tokens';
import { resupplyApi } from '../../api/resupply';
import { itemsApi } from '../../api/items';
import { getApiErrorMessage } from '../../api/client';

const schema = z.object({
  item_id: z.number().nullable().default(null),
  item_name_freetext: z.string().default(''),
  quantity_requested: z.number().min(1, 'Min 1'),
  justification: z.string().min(1, 'Required'),
});

type FormData = z.infer<typeof schema>;

interface ResupplyFormProps {
  open: boolean;
  onClose: () => void;
}

const ResupplyForm = ({ open, onClose }: ResupplyFormProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { data: itemsData } = useQuery({
    queryKey: ['items', 'all'],
    queryFn: () => itemsApi.list({ page_size: 100 }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { item_id: null, item_name_freetext: '', quantity_requested: 1, justification: '' },
  });

  const mutation = useMutation({
    mutationFn: resupplyApi.create,
    onSuccess: () => {
      enqueueSnackbar('Resupply request submitted', { variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['resupply'] });
      reset();
      onClose();
    },
    onError: (error) => {
      enqueueSnackbar(getApiErrorMessage(error), { variant: 'error' });
    },
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ borderBottom: `1px solid ${tokens.surface.border}` }}>New Resupply Request</DialogTitle>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 3 }}>
          <TextField
            select
            label="Existing Item (optional)"
            defaultValue=""
            {...register('item_id', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
            fullWidth
            size="small"
          >
            <MenuItem value="">-- New item (enter name below) --</MenuItem>
            {itemsData?.items.map((item) => (
              <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="Item Name (for new items)" {...register('item_name_freetext')} fullWidth size="small" />
          <TextField
            label="Quantity Requested"
            type="number"
            {...register('quantity_requested', { valueAsNumber: true })}
            error={!!errors.quantity_requested}
            helperText={errors.quantity_requested?.message}
            inputProps={{ min: 1 }}
            fullWidth
            size="small"
          />
          <TextField
            label="Justification"
            {...register('justification')}
            error={!!errors.justification}
            helperText={errors.justification?.message}
            multiline
            rows={3}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${tokens.surface.border}` }}>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button variant="contained" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Submit Request'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ResupplyForm;
