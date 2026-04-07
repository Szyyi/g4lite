import { Box, Typography, TextField, Button, Alert, CircularProgress } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { tokens } from '../tokens';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { getApiErrorMessage } from '../api/client';

const schema = z.object({
  username: z.string().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
});

type FormData = z.infer<typeof schema>;

const LoginPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => authApi.login(data),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      navigate('/inventory', { replace: true });
    },
  });

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: tokens.surface.base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Grid background */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(${alpha(tokens.surface.border, 0.3)} 1px, transparent 1px),
            linear-gradient(90deg, ${alpha(tokens.surface.border, 0.3)} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          opacity: 0.4,
        }}
      />

      <Box
        sx={{
          width: '100%',
          maxWidth: 380,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo block */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: tokens.radius.md,
              background: alpha(tokens.accent.default, 0.1),
              border: `1px solid ${alpha(tokens.accent.default, 0.2)}`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
            }}
          >
            <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '1rem', fontWeight: 700, color: tokens.accent.text }}>
              G4
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', color: tokens.text.primary }}>
            G4Lite
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', fontFamily: tokens.font.mono, color: tokens.text.tertiary, letterSpacing: '0.08em', mt: 0.5 }}>
            EQUIPMENT LOGISTICS PLATFORM
          </Typography>
        </Box>

        {/* Form card */}
        <Box
          sx={{
            p: 4,
            background: tokens.surface.raised,
            border: `1px solid ${tokens.surface.border}`,
            borderRadius: tokens.radius.lg,
          }}
        >
          {/* Header */}
          <Typography sx={{ fontSize: '0.625rem', fontFamily: tokens.font.mono, color: tokens.text.tertiary, letterSpacing: '0.1em', mb: 3 }}>
            AUTHENTICATE
          </Typography>

          {mutation.isError && (
            <Alert severity="error" sx={{ mb: 2.5 }}>
              {getApiErrorMessage(mutation.error)}
            </Alert>
          )}

          <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
            <Box className="flex flex-col gap-4">
              <TextField
                label="Username"
                {...register('username')}
                error={!!errors.username}
                helperText={errors.username?.message}
                fullWidth
                size="small"
                autoFocus
                autoComplete="username"
              />
              <TextField
                label="Password"
                type="password"
                {...register('password')}
                error={!!errors.password}
                helperText={errors.password?.message}
                fullWidth
                size="small"
                autoComplete="current-password"
              />
              <Button
                variant="contained"
                type="submit"
                fullWidth
                disabled={mutation.isPending}
                sx={{ mt: 1, py: 1.2 }}
              >
                {mutation.isPending ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Sign In'}
              </Button>
            </Box>
          </form>
        </Box>

        <Typography sx={{ fontSize: '0.625rem', color: tokens.text.tertiary, textAlign: 'center', mt: 3, fontFamily: tokens.font.mono, letterSpacing: '0.04em' }}>
          AUTHORISED PERSONNEL ONLY
        </Typography>
      </Box>
    </Box>
  );
};

export default LoginPage;