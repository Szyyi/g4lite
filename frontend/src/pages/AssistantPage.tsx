/**
 * G4Light — AssistantPage
 * AI chat interface with SSE streaming.
 * Phase 3E: expand with conversation sidebar, streaming UI, model selector.
 */

import { Box, Typography, Card, TextField, Button, Alert } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useQuery } from '@tanstack/react-query';
import { tokens } from '../tokens';
import { assistantApi } from '../api/assistant';
import EmptyState from '../components/common/EmptyState';

const AssistantPage = () => {
  const { data: health, isLoading } = useQuery<{ status: string }>({
    queryKey: ['assistant', 'health'],
    queryFn: assistantApi.getHealth,
    retry: false,
  });

  const isAvailable = health?.status === 'healthy';

  return (
    <Box className="flex flex-col gap-6">
      <Box>
        <Typography variant="h2">AI Assistant</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Context-aware equipment logistics assistant
        </Typography>
      </Box>

      {!isLoading && !isAvailable && (
        <Alert severity="warning">
          The AI assistant is currently unavailable. Ollama may not be running — start it with{' '}
          <Typography component="code" sx={{ fontFamily: tokens.font.mono, fontSize: tokens.fontSize.sm }}>
            docker compose --profile ai up -d
          </Typography>
        </Alert>
      )}

      <Card sx={{ p: 4, flex: 1, minHeight: 400 }}>
        <EmptyState
          icon={<SmartToyOutlinedIcon />}
          title="Assistant chat"
          description="Full streaming chat interface will be built in a dedicated session."
          variant="compact"
        />
      </Card>
    </Box>
  );
};

export default AssistantPage;