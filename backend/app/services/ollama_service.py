"""
G4Lite — Ollama Service
===========================

Integration with a local Ollama LLM instance.
Designed for air-gapped deployment with zero cloud dependencies.

Features:
- Connection pooling with configurable timeouts
- Streaming chat via async generators (for SSE endpoints)
- Non-streaming chat with token/timing metrics
- Model management: list, info, pull, delete
- Generation parameters: temperature, top_p, top_k, context length,
  repeat penalty, stop sequences
- Circuit breaker: auto-disable after consecutive failures, auto-recover
- Retry logic with exponential backoff on transient errors
- Token usage tracking per request
- Embedding generation (for future RAG / semantic search)
- Structured error hierarchy: OllamaError → OllamaConnectionError,
  OllamaTimeoutError, OllamaModelError, OllamaGenerationError
- Health monitoring with GPU detection and memory reporting

Configuration:
All settings come from app.config (environment variables):
  OLLAMA_BASE_URL   — Ollama API endpoint (default: http://ollama:11434)
  OLLAMA_MODEL      — Default model name (default: mistral)

The service is instantiated as a module-level singleton and provides
both a functional API (for simple use) and the OllamaClient class
(for advanced configuration).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncGenerator, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger("G4Lite.ollama")
settings = get_settings()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  EXCEPTIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class OllamaError(Exception):
    """Base exception for all Ollama service errors."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class OllamaConnectionError(OllamaError):
    """Cannot reach the Ollama service."""
    pass


class OllamaTimeoutError(OllamaError):
    """Request to Ollama timed out."""
    pass


class OllamaModelError(OllamaError):
    """Model not found, not loaded, or failed to load."""
    pass


class OllamaGenerationError(OllamaError):
    """Error during text generation."""
    pass


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DATA CLASSES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@dataclass
class GenerationParams:
    """Parameters controlling LLM text generation.

    Sensible defaults for a logistics assistant: slightly lower
    temperature for factual accuracy, moderate context window.
    """

    temperature: float = 0.4
    top_p: float = 0.9
    top_k: int = 40
    repeat_penalty: float = 1.1
    num_ctx: int = 4096
    num_predict: int = 1024
    stop: list[str] = field(default_factory=list)
    seed: int | None = None

    def to_ollama_options(self) -> dict[str, Any]:
        """Convert to Ollama API options dict."""
        opts: dict[str, Any] = {
            "temperature": self.temperature,
            "top_p": self.top_p,
            "top_k": self.top_k,
            "repeat_penalty": self.repeat_penalty,
            "num_ctx": self.num_ctx,
            "num_predict": self.num_predict,
        }
        if self.stop:
            opts["stop"] = self.stop
        if self.seed is not None:
            opts["seed"] = self.seed
        return opts


@dataclass
class ChatResult:
    """Structured result from a non-streaming chat completion."""

    content: str
    model: str
    tokens_used: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    duration_ms: int = 0
    finish_reason: str = "stop"

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "model": self.model,
            "tokens_used": self.tokens_used,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "duration_ms": self.duration_ms,
            "finish_reason": self.finish_reason,
        }


@dataclass
class ModelInfo:
    """Ollama model metadata."""

    name: str
    size: int = 0
    size_display: str = ""
    modified_at: str = ""
    family: str = ""
    parameter_size: str = ""
    quantization: str = ""
    digest: str = ""

    @classmethod
    def from_ollama(cls, data: dict) -> ModelInfo:
        details = data.get("details", {})
        size_bytes = data.get("size", 0)
        size_gb = round(size_bytes / (1024**3), 1) if size_bytes else 0
        return cls(
            name=data.get("name", "unknown"),
            size=size_bytes,
            size_display=f"{size_gb}GB",
            modified_at=data.get("modified_at", ""),
            family=details.get("family", ""),
            parameter_size=details.get("parameter_size", ""),
            quantization=details.get("quantization_level", ""),
            digest=data.get("digest", "")[:12],
        )


@dataclass
class HealthStatus:
    """Ollama service health report."""

    ok: bool = False
    message: str = ""
    model: str | None = None
    available_models: list[str] = field(default_factory=list)
    gpu: bool = False
    version: str = ""
    memory_total: int = 0
    memory_free: int = 0
    circuit_breaker_open: bool = False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GENERATION PRESETS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class GenerationPreset(str, Enum):
    """Named parameter presets for different assistant modes."""

    precise = "precise"
    balanced = "balanced"
    creative = "creative"


GENERATION_PRESETS: dict[GenerationPreset, GenerationParams] = {
    GenerationPreset.precise: GenerationParams(
        temperature=0.1,
        top_p=0.85,
        top_k=20,
        repeat_penalty=1.2,
        num_predict=800,
    ),
    GenerationPreset.balanced: GenerationParams(
        temperature=0.4,
        top_p=0.9,
        top_k=40,
        repeat_penalty=1.1,
        num_predict=1024,
    ),
    GenerationPreset.creative: GenerationParams(
        temperature=0.8,
        top_p=0.95,
        top_k=60,
        repeat_penalty=1.05,
        num_predict=2048,
    ),
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  OLLAMA CLIENT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class OllamaClient:
    """Production-grade Ollama REST API client.

    Features:
    - Reusable httpx.AsyncClient with connection pooling
    - Circuit breaker: after N consecutive failures, stops attempting
      requests for a cooldown period to avoid cascading timeouts
    - Retry with exponential backoff on transient errors
    - Structured error hierarchy
    - Token and timing metrics on every response
    """

    def __init__(
        self,
        base_url: str = "",
        default_model: str = "",
        connect_timeout: float = 5.0,
        read_timeout: float = 120.0,
        max_retries: int = 2,
        circuit_breaker_threshold: int = 5,
        circuit_breaker_cooldown: int = 60,
    ):
        self._base_url = base_url or settings.OLLAMA_BASE_URL
        self._default_model = default_model or settings.OLLAMA_MODEL
        self._connect_timeout = connect_timeout
        self._read_timeout = read_timeout
        self._max_retries = max_retries

        # Circuit breaker state
        self._cb_threshold = circuit_breaker_threshold
        self._cb_cooldown = circuit_breaker_cooldown
        self._cb_failure_count = 0
        self._cb_last_failure: float = 0
        self._cb_open = False

        # Shared client (lazy init)
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazy-initialise the shared HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=httpx.Timeout(
                    connect=self._connect_timeout,
                    read=self._read_timeout,
                    write=30.0,
                    pool=10.0,
                ),
                limits=httpx.Limits(
                    max_connections=10,
                    max_keepalive_connections=5,
                ),
            )
        return self._client

    async def close(self) -> None:
        """Close the shared HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ── Circuit breaker ───────────────────────────────────────────

    def _check_circuit_breaker(self) -> None:
        """Raise if the circuit breaker is open (too many recent failures)."""
        if not self._cb_open:
            return

        elapsed = time.monotonic() - self._cb_last_failure
        if elapsed >= self._cb_cooldown:
            # Cooldown expired — allow a probe request
            self._cb_open = False
            self._cb_failure_count = 0
            logger.info("Ollama circuit breaker closed — attempting recovery")
            return

        remaining = int(self._cb_cooldown - elapsed)
        raise OllamaConnectionError(
            f"Ollama service temporarily disabled after {self._cb_threshold} "
            f"consecutive failures. Retry in {remaining}s.",
        )

    def _record_success(self) -> None:
        """Reset failure counter on success."""
        if self._cb_failure_count > 0:
            logger.info("Ollama request succeeded — resetting circuit breaker")
        self._cb_failure_count = 0
        self._cb_open = False

    def _record_failure(self, error: Exception) -> None:
        """Increment failure counter and potentially open circuit breaker."""
        self._cb_failure_count += 1
        self._cb_last_failure = time.monotonic()
        logger.warning(
            "Ollama request failed (%d/%d): %s",
            self._cb_failure_count,
            self._cb_threshold,
            str(error),
        )
        if self._cb_failure_count >= self._cb_threshold:
            self._cb_open = True
            logger.error(
                "Ollama circuit breaker OPEN — disabling requests for %ds",
                self._cb_cooldown,
            )

    # ── Retry logic ───────────────────────────────────────────────

    async def _request_with_retry(
        self,
        method: str,
        path: str,
        **kwargs,
    ) -> httpx.Response:
        """Execute an HTTP request with retry and circuit breaker."""
        self._check_circuit_breaker()

        client = await self._get_client()
        last_error: Exception | None = None

        for attempt in range(1, self._max_retries + 1):
            try:
                response = await getattr(client, method)(path, **kwargs)
                self._record_success()
                return response
            except httpx.ConnectError as e:
                last_error = OllamaConnectionError(
                    f"Cannot connect to Ollama at {self._base_url}: {e}"
                )
                self._record_failure(e)
            except httpx.TimeoutException as e:
                last_error = OllamaTimeoutError(
                    f"Ollama request timed out after {self._read_timeout}s"
                )
                self._record_failure(e)
            except httpx.HTTPError as e:
                last_error = OllamaError(f"HTTP error: {e}")
                self._record_failure(e)

            # Exponential backoff before retry
            if attempt < self._max_retries:
                wait = min(2 ** attempt, 10)
                logger.info("Retrying Ollama request in %ds (attempt %d)", wait, attempt + 1)
                await asyncio.sleep(wait)

        raise last_error or OllamaError("Unknown error")

    # ── Health ────────────────────────────────────────────────────

    async def health(self) -> HealthStatus:
        """Comprehensive health check of the Ollama service."""
        status = HealthStatus(circuit_breaker_open=self._cb_open)

        if self._cb_open:
            status.message = "Circuit breaker open — service temporarily disabled"
            return status

        try:
            client = await self._get_client()

            # Version check
            try:
                version_resp = await client.get("/api/version", timeout=5.0)
                if version_resp.status_code == 200:
                    status.version = version_resp.json().get("version", "")
            except Exception:
                pass

            # Model list
            resp = await client.get("/api/tags", timeout=5.0)
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                status.available_models = [m.get("name", "") for m in models]
                status.ok = True
                status.message = "Operational"

                # Check if default model is available
                if any(self._default_model in m.get("name", "") for m in models):
                    status.model = self._default_model
                elif models:
                    status.model = models[0].get("name")
                    status.message = (
                        f"Default model '{self._default_model}' not found. "
                        f"Using '{status.model}' instead."
                    )
                else:
                    status.message = "Ollama running but no models installed"
            else:
                status.message = f"Ollama returned HTTP {resp.status_code}"

            # GPU detection via running models
            try:
                ps_resp = await client.get("/api/ps", timeout=5.0)
                if ps_resp.status_code == 200:
                    running = ps_resp.json().get("models", [])
                    for m in running:
                        if "gpu" in str(m.get("details", {})).lower():
                            status.gpu = True
                            break
            except Exception:
                pass

            self._record_success()

        except (httpx.ConnectError, httpx.TimeoutException) as e:
            status.ok = False
            status.message = f"Cannot reach Ollama at {self._base_url}"
            self._record_failure(e)
        except Exception as e:
            status.ok = False
            status.message = f"Health check failed: {str(e)}"

        return status

    # ── Model management ──────────────────────────────────────────

    async def list_models(self) -> list[ModelInfo]:
        """List all locally available models with metadata."""
        try:
            resp = await self._request_with_retry("get", "/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                return [ModelInfo.from_ollama(m) for m in models]
        except OllamaError:
            pass
        return []

    async def model_info(self, model_name: str | None = None) -> dict:
        """Get detailed info about a specific model."""
        name = model_name or self._default_model
        try:
            resp = await self._request_with_retry(
                "post", "/api/show", json={"name": name}
            )
            if resp.status_code == 200:
                return resp.json()
            raise OllamaModelError(
                f"Model '{name}' not found",
                status_code=resp.status_code,
            )
        except OllamaError:
            raise
        except Exception as e:
            raise OllamaModelError(f"Failed to get model info: {e}")

    async def pull_model(self, model_name: str) -> AsyncGenerator[str, None]:
        """Pull (download) a model with streaming progress updates."""
        client = await self._get_client()
        try:
            async with client.stream(
                "POST",
                "/api/pull",
                json={"name": model_name},
                timeout=httpx.Timeout(connect=10.0, read=600.0, write=30.0, pool=10.0),
            ) as response:
                async for line in response.aiter_lines():
                    if line.strip():
                        yield line
        except Exception as e:
            raise OllamaError(f"Failed to pull model '{model_name}': {e}")

    async def delete_model(self, model_name: str) -> bool:
        """Delete a locally stored model."""
        try:
            resp = await self._request_with_retry(
                "delete", "/api/delete", json={"name": model_name}
            )
            return resp.status_code == 200
        except OllamaError:
            return False

    # ── Chat completion ───────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        params: GenerationParams | None = None,
        preset: GenerationPreset | None = None,
    ) -> ChatResult:
        """Non-streaming chat completion with metrics.

        Args:
            messages: Full conversation history [{role, content}, ...]
            model: Model override (default: configured model)
            params: Generation parameters (default: balanced preset)
            preset: Named preset shortcut (overrides params if both given)

        Returns:
            ChatResult with content, model, token counts, and timing.
        """
        model_name = model or self._default_model

        if preset:
            gen_params = GENERATION_PRESETS[preset]
        elif params:
            gen_params = params
        else:
            gen_params = GENERATION_PRESETS[GenerationPreset.balanced]

        start = time.monotonic()

        try:
            resp = await self._request_with_retry(
                "post",
                "/api/chat",
                json={
                    "model": model_name,
                    "messages": messages,
                    "stream": False,
                    "options": gen_params.to_ollama_options(),
                },
            )

            duration_ms = int((time.monotonic() - start) * 1000)

            if resp.status_code != 200:
                error_body = resp.text[:500]
                if resp.status_code == 404:
                    raise OllamaModelError(
                        f"Model '{model_name}' not found. "
                        f"Run: ollama pull {model_name}",
                        status_code=404,
                    )
                raise OllamaGenerationError(
                    f"Generation failed (HTTP {resp.status_code}): {error_body}",
                    status_code=resp.status_code,
                )

            data = resp.json()
            content = data.get("message", {}).get("content", "")

            # Extract token metrics
            prompt_tokens = data.get("prompt_eval_count")
            completion_tokens = data.get("eval_count")
            total_tokens = None
            if prompt_tokens is not None and completion_tokens is not None:
                total_tokens = prompt_tokens + completion_tokens

            return ChatResult(
                content=content,
                model=data.get("model", model_name),
                tokens_used=total_tokens,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                duration_ms=duration_ms,
                finish_reason=data.get("done_reason", "stop"),
            )

        except OllamaError:
            raise
        except Exception as e:
            raise OllamaGenerationError(f"Chat completion failed: {e}")

    # ── Streaming chat ────────────────────────────────────────────

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str | None = None,
        params: GenerationParams | None = None,
        preset: GenerationPreset | None = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming chat completion — yields content chunks.

        Each yield is a text fragment suitable for direct SSE delivery.
        The caller is responsible for formatting as `data: {chunk}\\n\\n`.

        Usage:
            async for chunk in client.chat_stream(messages):
                yield f"data: {chunk}\\n\\n"
        """
        self._check_circuit_breaker()

        model_name = model or self._default_model

        if preset:
            gen_params = GENERATION_PRESETS[preset]
        elif params:
            gen_params = params
        else:
            gen_params = GENERATION_PRESETS[GenerationPreset.balanced]

        client = await self._get_client()

        try:
            async with client.stream(
                "POST",
                "/api/chat",
                json={
                    "model": model_name,
                    "messages": messages,
                    "stream": True,
                    "options": gen_params.to_ollama_options(),
                },
                timeout=httpx.Timeout(
                    connect=self._connect_timeout,
                    read=self._read_timeout,
                    write=30.0,
                    pool=10.0,
                ),
            ) as response:
                if response.status_code != 200:
                    raise OllamaGenerationError(
                        f"Stream failed (HTTP {response.status_code})",
                        status_code=response.status_code,
                    )

                import json as json_lib
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json_lib.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if data.get("done", False):
                            break
                    except json_lib.JSONDecodeError:
                        continue

                self._record_success()

        except OllamaError:
            raise
        except httpx.TimeoutException:
            self._record_failure(Exception("stream timeout"))
            raise OllamaTimeoutError("Streaming response timed out")
        except Exception as e:
            self._record_failure(e)
            raise OllamaGenerationError(f"Streaming failed: {e}")

    # ── Embeddings ────────────────────────────────────────────────

    async def embed(
        self,
        text: str,
        model: str | None = None,
    ) -> list[float]:
        """Generate an embedding vector for the given text.

        Used for future RAG (Retrieval-Augmented Generation) where
        inventory descriptions and sign-out notes can be semantically
        searched by the assistant.

        Returns a float vector (dimension depends on model).
        """
        model_name = model or self._default_model

        try:
            resp = await self._request_with_retry(
                "post",
                "/api/embeddings",
                json={
                    "model": model_name,
                    "prompt": text,
                },
            )

            if resp.status_code != 200:
                raise OllamaError(
                    f"Embedding failed (HTTP {resp.status_code})",
                    status_code=resp.status_code,
                )

            data = resp.json()
            embedding = data.get("embedding", [])
            if not embedding:
                raise OllamaError("Empty embedding returned")

            return embedding

        except OllamaError:
            raise
        except Exception as e:
            raise OllamaError(f"Embedding generation failed: {e}")

    async def embed_batch(
        self,
        texts: list[str],
        model: str | None = None,
    ) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Processes sequentially to avoid overwhelming the Ollama instance.
        For large batches (100+), consider chunking with delays.
        """
        results = []
        for text in texts:
            embedding = await self.embed(text, model=model)
            results.append(embedding)
        return results

    # ── Simple generation (non-chat) ──────────────────────────────

    async def generate(
        self,
        prompt: str,
        model: str | None = None,
        params: GenerationParams | None = None,
        system: str | None = None,
    ) -> ChatResult:
        """Simple text generation (non-chat). Useful for one-shot tasks
        like summarisation, classification, or data extraction.

        Unlike chat(), this uses the /api/generate endpoint which
        takes a single prompt string instead of a message history.
        """
        model_name = model or self._default_model
        gen_params = params or GENERATION_PRESETS[GenerationPreset.balanced]

        start = time.monotonic()

        body: dict[str, Any] = {
            "model": model_name,
            "prompt": prompt,
            "stream": False,
            "options": gen_params.to_ollama_options(),
        }
        if system:
            body["system"] = system

        try:
            resp = await self._request_with_retry("post", "/api/generate", json=body)
            duration_ms = int((time.monotonic() - start) * 1000)

            if resp.status_code != 200:
                raise OllamaGenerationError(
                    f"Generation failed (HTTP {resp.status_code})",
                    status_code=resp.status_code,
                )

            data = resp.json()
            return ChatResult(
                content=data.get("response", ""),
                model=data.get("model", model_name),
                tokens_used=data.get("eval_count"),
                prompt_tokens=data.get("prompt_eval_count"),
                completion_tokens=data.get("eval_count"),
                duration_ms=duration_ms,
                finish_reason="stop" if data.get("done") else "length",
            )

        except OllamaError:
            raise
        except Exception as e:
            raise OllamaGenerationError(f"Generation failed: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  MODULE-LEVEL SINGLETON + FUNCTIONAL API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_client = OllamaClient()


async def check_ollama_health() -> dict:
    """Check Ollama service health. Returns a dict for the health endpoint."""
    status = await _client.health()
    return {
        "ok": status.ok,
        "status": "healthy" if status.ok else "unavailable",
        "message": status.message,
        "model": status.model,
        "models": status.available_models,
        "gpu": status.gpu,
        "version": status.version,
        "circuit_breaker_open": status.circuit_breaker_open,
    }


async def list_ollama_models() -> list[dict]:
    """List available models as dicts for the API response."""
    models = await _client.list_models()
    return [
        {
            "name": m.name,
            "size": m.size_display,
            "modified_at": m.modified_at,
            "family": m.family,
            "parameter_size": m.parameter_size,
            "quantization": m.quantization,
            "details": {
                "family": m.family,
                "parameter_size": m.parameter_size,
            },
        }
        for m in models
    ]


async def chat_with_ollama(
    messages: list[dict[str, str]],
    model: str | None = None,
    preset: GenerationPreset | None = None,
) -> ChatResult:
    """Non-streaming chat completion via the singleton client.

    Args:
        messages: Full message list [{role, content}, ...]
        model: Optional model override
        preset: Optional generation preset (precise/balanced/creative)

    Returns:
        ChatResult with content, model, tokens, and timing.
    """
    return await _client.chat(messages, model=model, preset=preset)


async def chat_with_ollama_stream(
    messages: list[dict[str, str]],
    model: str | None = None,
    preset: GenerationPreset | None = None,
) -> AsyncGenerator[str, None]:
    """Streaming chat via the singleton client. Yields content chunks."""
    async for chunk in _client.chat_stream(messages, model=model, preset=preset):
        yield chunk


async def generate_text(
    prompt: str,
    model: str | None = None,
    system: str | None = None,
) -> ChatResult:
    """One-shot text generation via the singleton client."""
    return await _client.generate(prompt, model=model, system=system)


async def generate_embedding(
    text: str,
    model: str | None = None,
) -> list[float]:
    """Generate an embedding vector via the singleton client."""
    return await _client.embed(text, model=model)


def get_ollama_client() -> OllamaClient:
    """Access the singleton client for advanced configuration."""
    return _client