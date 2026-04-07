/**
 * G4Lite — AI Assistant API
 * ============================
 *
 * 12 endpoints for the Ollama-powered AI assistant:
 *
 * Chat:
 *   POST   /assistant/chat                    — Context-aware chat (SSE streaming)
 *
 * Conversations:
 *   GET    /assistant/conversations            — List user's conversations
 *   GET    /assistant/conversations/{id}       — Get conversation with messages
 *   PUT    /assistant/conversations/{id}/rename — Rename conversation
 *   DELETE /assistant/conversations/{id}       — Delete conversation
 *   DELETE /assistant/conversations/{id}/clear — Clear messages (keep conversation)
 *
 * Models [admin]:
 *   GET    /assistant/models                   — List available Ollama models
 *   GET    /assistant/models/{name}            — Model detail
 *   POST   /assistant/models/pull              — Pull a new model
 *
 * System:
 *   GET    /assistant/health                   — Ollama health status
 *   GET    /assistant/usage                    — Usage statistics [admin]
 *
 * Quick queries (bypass LLM — direct database lookups):
 *   GET    /assistant/quick/inventory-summary  — Inventory summary
 *   GET    /assistant/quick/search-items       — Item search
 *
 * The assistant is only available when Ollama is running (activated via
 * `--profile ai` in Docker Compose). The health endpoint should be checked
 * before rendering the chat widget.
 */

import client from './client';
import { streamChat, buildQueryParams } from './client';
import type { SSECallbacks } from './client';
import type {
  ConversationResponse,
  ConversationDetailResponse,
  RenameConversationRequest,
  OllamaModel,
  PullModelRequest,
  AssistantHealth,
  AssistantUsage,
  InventorySummary,
  QuickSearchParams,
  ItemBrief,
  MessageResponse,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Assistant API
// ─────────────────────────────────────────────────────────────────────────────

export const assistantApi = {

  // ─── Chat ────────────────────────────────────────────────────────────

  /**
   * POST /api/assistant/chat (SSE streaming)
   * Sends a message and streams the response token-by-token.
   *
   * Uses the streamChat helper from client.ts which handles:
   *  - POST with JSON body + JWT header
   *  - ReadableStream parsing of SSE `data:` lines
   *  - Token-by-token callback for real-time UI updates
   *  - Completion callback with usage stats
   *  - Error callback for connection/API failures
   *  - AbortController for cancellation
   *
   * @param message - User's message text
   * @param conversationId - Existing conversation ID, or null for new conversation
   * @param callbacks - { onToken, onDone, onError }
   * @returns AbortController — call .abort() to cancel the stream
   *
   * Usage in a component:
   * ```ts
   * const controller = assistantApi.chat(
   *   'How many RPi boards are available?',
   *   conversationId,
   *   {
   *     onToken: (token) => setResponse(prev => prev + token),
   *     onDone: (usage) => { setIsStreaming(false); refetchConversation(); },
   *     onError: (error) => { setIsStreaming(false); showError(error); },
   *   }
   * );
   * // To cancel: controller.abort();
   * ```
   */
  chat: (
    message: string,
    conversationId: number | null,
    callbacks: SSECallbacks,
  ): AbortController => {
    return streamChat(message, conversationId, callbacks);
  },

  // ─── Conversations ───────────────────────────────────────────────────

  /**
   * GET /api/assistant/conversations
   * List the current user's conversations.
   * Ordered by updated_at descending (most recent first).
   * Returns title, message_count, and timestamps — not full messages.
   */
  listConversations: async (): Promise<ConversationResponse[]> => {
    const { data } = await client.get<ConversationResponse[]>(
      '/assistant/conversations',
    );
    return data;
  },

  /**
   * GET /api/assistant/conversations/{id}
   * Get a conversation with all its messages.
   * Messages are ordered chronologically.
   * Each message has: role ('user' | 'assistant'), content, created_at.
   */
  getConversation: async (id: number): Promise<ConversationDetailResponse> => {
    const { data } = await client.get<ConversationDetailResponse>(
      `/assistant/conversations/${id}`,
    );
    return data;
  },

  /**
   * PUT /api/assistant/conversations/{id}/rename
   * Rename a conversation.
   * The title is displayed in the conversation sidebar list.
   */
  renameConversation: async (
    id: number,
    payload: RenameConversationRequest,
  ): Promise<ConversationResponse> => {
    const { data } = await client.put<ConversationResponse>(
      `/assistant/conversations/${id}/rename`,
      payload,
    );
    return data;
  },

  /**
   * DELETE /api/assistant/conversations/{id}
   * Delete a conversation and all its messages.
   * This action is permanent and cannot be undone.
   */
  deleteConversation: async (id: number): Promise<MessageResponse> => {
    const { data } = await client.delete<MessageResponse>(
      `/assistant/conversations/${id}`,
    );
    return data;
  },

  /**
   * DELETE /api/assistant/conversations/{id}/clear
   * Clear all messages from a conversation but keep the conversation itself.
   * Useful for starting fresh within the same context.
   */
  clearConversation: async (id: number): Promise<MessageResponse> => {
    const { data } = await client.delete<MessageResponse>(
      `/assistant/conversations/${id}/clear`,
    );
    return data;
  },

  // ─── Models [admin] ──────────────────────────────────────────────────

  /**
   * GET /api/assistant/models
   * List all Ollama models available on the server.
   * Returns model name, size, digest, and details.
   */
  listModels: async (): Promise<OllamaModel[]> => {
    const { data } = await client.get<OllamaModel[]>('/assistant/models');
    return data;
  },

  /**
   * GET /api/assistant/models/{name}
   * Get detail for a specific model by name.
   */
  getModel: async (name: string): Promise<OllamaModel> => {
    const { data } = await client.get<OllamaModel>(
      `/assistant/models/${encodeURIComponent(name)}`,
    );
    return data;
  },

  /**
   * POST /api/assistant/models/pull
   * Pull (download) a new model from the Ollama registry.
   * This is a long-running operation — the backend streams progress
   * but this endpoint returns once the pull is initiated.
   */
  pullModel: async (payload: PullModelRequest): Promise<MessageResponse> => {
    const { data } = await client.post<MessageResponse>(
      '/assistant/models/pull',
      payload,
    );
    return data;
  },

  // ─── Health & Usage ──────────────────────────────────────────────────

  /**
   * GET /api/assistant/health
   * Check Ollama connectivity and model status.
   *
   * Returns:
   *   status: 'healthy' | 'degraded' | 'unavailable'
   *   ollama_reachable: boolean
   *   model_loaded: boolean
   *   model_name: string | null
   *   response_time_ms: number | null
   *
   * The chat widget should check this before rendering.
   * If status is 'unavailable', show a disabled state with a message
   * instead of the chat input.
   */
  getHealth: async (): Promise<AssistantHealth> => {
    const { data } = await client.get<AssistantHealth>('/assistant/health');
    return data;
  },

  /**
   * GET /api/assistant/usage
   * Usage statistics [admin]:
   *   total_conversations, total_messages,
   *   messages_today, messages_this_week,
   *   top_users (user_id, username, message_count)
   */
  getUsage: async (): Promise<AssistantUsage> => {
    const { data } = await client.get<AssistantUsage>('/assistant/usage');
    return data;
  },

  // ─── Quick Queries (bypass LLM) ─────────────────────────────────────

  /**
   * GET /api/assistant/quick/inventory-summary
   * Returns a pre-computed inventory summary without invoking the LLM.
   * Used for quick dashboard data and as fallback when Ollama is unavailable.
   */
  getInventorySummary: async (): Promise<InventorySummary> => {
    const { data } = await client.get<InventorySummary>(
      '/assistant/quick/inventory-summary',
    );
    return data;
  },

  /**
   * GET /api/assistant/quick/search-items
   * Direct database item search without LLM processing.
   * Faster than routing through the AI for simple item lookups.
   *
   * @param q - Search query string
   * @param limit - Max results (default 10)
   */
  quickSearchItems: async (params: QuickSearchParams): Promise<ItemBrief[]> => {
    const queryString = buildQueryParams(params as unknown as Record<string, unknown>);
    const { data } = await client.get<ItemBrief[]>(
      `/assistant/quick/search-items${queryString}`,
    );
    return data;
  },
};