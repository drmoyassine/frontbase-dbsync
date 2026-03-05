"""
GPU Provider Adapters — Provider-agnostic interface for AI inference.

Each adapter implements the same interface (catalog, test, infer) but targets
a different GPU provider. The router calls the adapter factory to get the
right adapter for each EdgeGPUModel's provider field.

Providers:
  - workers_ai  (MVP)   → Cloudflare Workers AI
  - huggingface (Phase 2) → HF Inference API
  - ollama      (Phase 2) → Self-hosted Ollama
  - modal       (Phase 2) → Modal GPU containers
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Optional

import httpx
from fastapi import HTTPException

from .cloudflare_api import CF_API, headers as cf_headers, get_provider_credentials


# =============================================================================
# Model type → I/O schema mapping (shared across all adapters)
# =============================================================================

IO_SCHEMAS: dict[str, dict] = {
    "text-generation": {
        "model_type": "llm",
        "input": {"prompt": "string", "max_tokens": "number?", "temperature": "number?"},
        "output": {"response": "string"},
    },
    "text-embeddings": {
        "model_type": "embedder",
        "input": {"text": "string[]"},
        "output": {"vectors": "number[][]"},
    },
    "speech-recognition": {
        "model_type": "stt",
        "input": {"audio": "base64"},
        "output": {"text": "string"},
    },
    "text-to-image": {
        "model_type": "image_gen",
        "input": {"prompt": "string", "width": "number?", "height": "number?"},
        "output": {"image": "base64"},
    },
    "image-classification": {
        "model_type": "classifier",
        "input": {"image": "base64"},
        "output": {"label": "string", "score": "number"},
    },
    "translation": {
        "model_type": "translator",
        "input": {"text": "string", "source_lang": "string", "target_lang": "string"},
        "output": {"translated_text": "string"},
    },
    "summarization": {
        "model_type": "summarizer",
        "input": {"text": "string", "max_length": "number?"},
        "output": {"summary": "string"},
    },
    "object-detection": {
        "model_type": "vision",
        "input": {"image": "base64"},
        "output": {"objects": "array"},
    },
    "text-classification": {
        "model_type": "classifier",
        "input": {"text": "string"},
        "output": {"label": "string", "score": "number"},
    },
}

# Reverse map: model_type → task_type
MODEL_TYPE_TO_TASK = {v["model_type"]: k for k, v in IO_SCHEMAS.items()}


def get_schema_for_task(task_type: str) -> dict | None:
    """Return I/O schema for a CF Workers AI task type."""
    return IO_SCHEMAS.get(task_type)


def get_schema_for_model_type(model_type: str) -> dict | None:
    """Return I/O schema for our internal model type."""
    task = MODEL_TYPE_TO_TASK.get(model_type)
    return IO_SCHEMAS.get(task) if task else None


# =============================================================================
# Abstract GPU Adapter — the contract all providers implement
# =============================================================================

class GPUAdapter(ABC):
    """Provider-agnostic GPU inference adapter."""

    provider_name: str

    @abstractmethod
    async def fetch_catalog(self, credentials: dict) -> list[dict]:
        """Fetch available models from the provider.

        Returns list of dicts with: name, model_id, task_type, description.
        """
        ...

    @abstractmethod
    async def test_connection(self, credentials: dict) -> dict:
        """Test provider connectivity. Returns {success, message, latency_ms}."""
        ...

    @abstractmethod
    async def test_inference(self, model_id: str, model_type: str,
                             engine_url: str, slug: str) -> dict:
        """Run a sample inference against a deployed model.

        Returns {success, message, latency_ms, sample_output}.
        """
        ...


# =============================================================================
# Workers AI Adapter (MVP)
# =============================================================================

class WorkersAIAdapter(GPUAdapter):
    """Cloudflare Workers AI adapter — fetches catalog and tests via CF API."""

    provider_name = "workers_ai"

    async def fetch_catalog(self, credentials: dict) -> list[dict]:
        """Fetch model catalog from Cloudflare Workers AI API."""
        api_token = credentials["api_token"]
        account_id = credentials["account_id"]

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CF_API}/accounts/{account_id}/ai/models/search",
                headers=cf_headers(api_token),
                timeout=15.0,
            )
            if resp.status_code != 200:
                raise HTTPException(
                    400,
                    f"Failed to fetch CF AI catalog: {resp.text[:300]}"
                )

        data = resp.json()
        models = data.get("result", [])

        catalog = []
        for m in models:
            task_type = m.get("task", {}).get("name", "") if isinstance(m.get("task"), dict) else str(m.get("task", ""))
            schema = get_schema_for_task(task_type)

            catalog.append({
                "name": m.get("name", ""),
                "model_id": m.get("name", ""),  # CF uses name as model_id
                "task_type": task_type,
                "model_type": schema["model_type"] if schema else task_type,
                "description": m.get("description", ""),
                "properties": m.get("properties", []),
                "schema": schema,
            })

        return catalog

    async def test_connection(self, credentials: dict) -> dict:
        """Test CF Workers AI access by fetching a single model."""
        import time
        api_token = credentials["api_token"]
        account_id = credentials["account_id"]

        start = time.time()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CF_API}/accounts/{account_id}/ai/models/search",
                headers=cf_headers(api_token),
                params={"per_page": 1},
                timeout=10.0,
            )
        latency = round((time.time() - start) * 1000, 1)

        if resp.status_code == 200:
            count = len(resp.json().get("result", []))
            return {"success": True, "message": f"Connected. {count}+ models available.", "latency_ms": latency}
        return {"success": False, "message": f"CF API returned {resp.status_code}", "latency_ms": latency}

    async def test_inference(self, model_id: str, model_type: str,
                             engine_url: str, slug: str) -> dict:
        """Test inference by calling the engine's /api/ai/:slug endpoint."""
        import time

        # Build sample payload by model type
        sample_payloads: dict[str, dict] = {
            "llm": {"prompt": "Say hello in one word.", "max_tokens": 10},
            "embedder": {"text": ["hello world"]},
            "stt": {"prompt": "Test"},  # Needs audio, but we'll just check connectivity
            "classifier": {"text": "This is a great product!"},
            "image_gen": {"prompt": "A blue circle on white background"},
            "vision": {"prompt": "What is this?"},
            "translator": {"text": "Hello", "source_lang": "en", "target_lang": "es"},
            "summarizer": {"text": "The quick brown fox jumps over the lazy dog."},
        }

        payload = sample_payloads.get(model_type, {"prompt": "test"})

        start = time.time()
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{engine_url.rstrip('/')}/api/ai/{slug}",
                    json=payload,
                    timeout=30.0,
                )
            latency = round((time.time() - start) * 1000, 1)

            if resp.status_code == 200:
                result = resp.json()
                return {
                    "success": True,
                    "message": "Inference successful",
                    "latency_ms": latency,
                    "sample_output": result.get("result", result),
                }
            return {
                "success": False,
                "message": f"Engine returned {resp.status_code}: {resp.text[:200]}",
                "latency_ms": latency,
            }
        except Exception as e:
            return {"success": False, "message": str(e), "latency_ms": 0}


# =============================================================================
# Adapter Factory — plug & play
# =============================================================================

_ADAPTERS: dict[str, type[GPUAdapter]] = {
    "workers_ai": WorkersAIAdapter,
    # Phase 2:
    # "huggingface": HuggingFaceAdapter,
    # "ollama": OllamaAdapter,
    # "modal": ModalAdapter,
}


def get_adapter(provider: str) -> GPUAdapter:
    """Factory: return the correct adapter for a provider string."""
    cls = _ADAPTERS.get(provider)
    if not cls:
        raise HTTPException(400, f"Unknown GPU provider: {provider}. Available: {list(_ADAPTERS.keys())}")
    return cls()


def available_providers() -> list[str]:
    """Return list of supported GPU provider names."""
    return list(_ADAPTERS.keys())
