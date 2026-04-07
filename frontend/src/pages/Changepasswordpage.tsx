/**
 * G4Light — ChangePasswordPage
 * Forced password change screen — shown when must_change_password is true.
 */

import { useState } from 'react';
import { Box, Typography, TextField, Button, Card, CircularProgress, Alert } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { tokens } from '../tokens';
import { useAuth } from '../hooks/useAuth';

const schema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'Minimum 8 characters'),
  confirm_password: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

type FormValues = z.infer<typeof schema>;

const ChangePasswordPage = () => {
  const { changePassword, isChangingPassword } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormValues) => {
    changePassword(data);
  };

  return (
    <Box className="flex items-center justify-center" sx={{ minHeight: '80vh' }}>
      <Card sx={{ p: 5, maxWidth: 440, width: '100%' }}>
        <Typography variant="h3" sx={{ mb: 1 }}>Change Password</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          You must change your password before continuing.
        </Typography>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <TextField
            label="Current Password"
            type="password"
            fullWidth
            error={!!errors.current_password}
            helperText={errors.current_password?.message}
            {...register('current_password')}
          />
          <TextField
            label="New Password"
            type="password"
            fullWidth
            error={!!errors.new_password}
            helperText={errors.new_password?.message}
            {...register('new_password')}
          />
          <TextField
            label="Confirm New Password"
            type="password"
            fullWidth
            error={!!errors.confirm_password}
            helperText={errors.confirm_password?.message}
            {...register('confirm_password')}
          />

          <Alert severity="info" sx={{ fontSize: tokens.fontSize.xs }}>
            Password must be at least 8 characters with uppercase, lowercase, digit, and special character.
          </Alert>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={isChangingPassword}
            sx={{ mt: 1 }}
          >
            {isChangingPassword ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Change Password'}
          </Button>
        </form>
      </Card>
    </Box>
  );
};

export default ChangePasswordPage;