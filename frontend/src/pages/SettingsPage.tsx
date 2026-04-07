/**
 * G4Light — SettingsPage
 * Profile, preferences, accent colour picker, notification preferences.
 * Phase 3E: expand with full profile form, session info, preference toggles.
 */

import { Box, Typography, Card, Avatar } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { tokens } from '../tokens';
import { useAuth } from '../hooks/useAuth';
import { useThemeStore, ACCENT_OPTIONS } from '../store/themeStore';
import { useUserInitials } from '../store/authStore';

const SettingsPage = () => {
  const { user, roleLabel } = useAuth();
  const initials = useUserInitials();
  const { accentColour, setAccent } = useThemeStore();

  return (
    <Box className="flex flex-col gap-6">
      <Box>
        <Typography variant="h2">Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Profile and preferences
        </Typography>
      </Box>

      {/* Profile card */}
      <Card sx={{ p: 4 }}>
        <Box className="flex items-center gap-4" sx={{ mb: 3 }}>
          <Avatar sx={{
            width: 56, height: 56,
            fontSize: tokens.fontSize.xl,
            fontWeight: tokens.fontWeight.bold,
            background: tokens.accent.subtle,
            color: tokens.accent.text,
            border: `${tokens.borderWidth.thin} solid ${tokens.accent.border}`,
          }}>
            {initials}
          </Avatar>
          <Box>
            <Typography variant="h4">{user?.full_name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: tokens.font.mono }}>
              {user?.rank} · {roleLabel}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Profile editing will be expanded in the next iteration.
        </Typography>
      </Card>

      {/* Accent colour picker */}
      <Card sx={{ p: 4 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Accent Colour</Typography>
        <Box className="flex items-center gap-2">
          {ACCENT_OPTIONS.map((opt) => (
            <Box
              key={opt.value}
              onClick={() => setAccent(opt.value)}
              sx={{
                width: 32,
                height: 32,
                borderRadius: tokens.radius.full,
                background: opt.value,
                cursor: 'pointer',
                border: accentColour === opt.value
                  ? `2px solid ${tokens.text.primary}`
                  : `2px solid transparent`,
                outline: accentColour === opt.value
                  ? `2px solid ${opt.value}`
                  : 'none',
                outlineOffset: '2px',
                transition: `border-color ${tokens.transition.fast}, outline ${tokens.transition.fast}`,
                '&:hover': {
                  transform: 'scale(1.1)',
                },
              }}
              title={opt.label}
            />
          ))}
        </Box>
      </Card>
    </Box>
  );
};

export default SettingsPage;