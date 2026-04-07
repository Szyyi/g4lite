/**
 * G4Light — ConfirmDialog
 * =========================
 *
 * Reusable confirmation modal for destructive or significant actions.
 * Three visual variants matching the action severity:
 *  - 'danger'  — red confirm button (delete, deactivate, declare lost)
 *  - 'warning' — amber confirm button (reject, cancel)
 *  - 'info'    — accent confirm button (approve, acknowledge)
 *
 * Features:
 *  - Async onConfirm support (shows loading spinner until promise resolves)
 *  - Keyboard: Enter to confirm, Escape to cancel
 *  - Prevents close during loading (no backdrop click, no escape)
 *  - Optional description text below the title
 *
 * Usage:
 *  ```tsx
 *  <ConfirmDialog
 *    open={showConfirm}
 *    title="Deactivate user?"
 *    message="This user will lose access immediately. Active sign-outs will not be returned."
 *    confirmLabel="Deactivate"
 *    variant="danger"
 *    onConfirm={async () => { await deactivateUser(userId); }}
 *    onCancel={() => setShowConfirm(false)}
 *  />
 *  ```
 */

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  CircularProgress,
  Box,
} from '@mui/material';
import { tokens } from '../../tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Dialog title */
  title: string;
  /** Descriptive message explaining the consequences */
  message?: string;
  /** Confirm button label (default: "Confirm") */
  confirmLabel?: string;
  /** Cancel button label (default: "Cancel") */
  cancelLabel?: string;
  /** Visual severity variant */
  variant?: ConfirmVariant;
  /** Called on confirm — can be async (dialog stays open until resolved) */
  onConfirm: () => void | Promise<void>;
  /** Called on cancel or close */
  onCancel: () => void;
  /** Optional icon displayed beside the title */
  icon?: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant config
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<ConfirmVariant, { buttonColor: 'error' | 'warning' | 'primary'; buttonVariant: 'contained' }> = {
  danger:  { buttonColor: 'error',   buttonVariant: 'contained' },
  warning: { buttonColor: 'warning', buttonVariant: 'contained' },
  info:    { buttonColor: 'primary', buttonVariant: 'contained' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'info',
  onConfirm,
  onCancel,
  icon,
}: ConfirmDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const config = VARIANT_CONFIG[variant];

  const handleConfirm = useCallback(async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  }, [onConfirm]);

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
      disableEscapeKeyDown={isLoading}
      slotProps={{
        backdrop: {
          onClick: isLoading ? (e: React.MouseEvent) => e.stopPropagation() : undefined,
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box className="flex items-center gap-2">
          {icon && (
            <Box sx={{ color: tokens.text.tertiary, display: 'flex' }}>
              {icon}
            </Box>
          )}
          {title}
        </Box>
      </DialogTitle>

      {message && (
        <DialogContent sx={{ pt: 0 }}>
          <Typography
            variant="body2"
            sx={{
              color: tokens.text.secondary,
              lineHeight: tokens.lineHeight.relaxed,
            }}
          >
            {message}
          </Typography>
        </DialogContent>
      )}

      <DialogActions>
        <Button
          variant="text"
          onClick={onCancel}
          disabled={isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={config.buttonVariant}
          color={config.buttonColor}
          onClick={handleConfirm}
          disabled={isLoading}
          sx={{ minWidth: 100 }}
        >
          {isLoading ? (
            <CircularProgress size={16} sx={{ color: 'inherit' }} />
          ) : (
            confirmLabel
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;