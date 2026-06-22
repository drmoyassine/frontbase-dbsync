"""
Embedding service (Sprint 4C).

Frontbase does NOT bundle an embedding model. Vectors are generated through a
user-configured OpenAI-compatible embeddings endpoint (OpenAI, Ollama, vLLM,
LiteLLM, …). The operator supplies a base URL + API key + model name; this module
calls `POST {base}/embeddings` and returns the float vectors.

Keeping the embedding provider pluggable avoids hard-coding a vendor and lets
self-hosters use local models (e.g. Ollama with nomic-embed-text) at no cost.
"""

from __future__ import annotations

import logging
from typing import Optional, Sequence

import httpx

logger = logging.getLogger(__name__)


class EmbeddingConfig:
    """Resolved from project settings / env at call time."""

    def __init__(self, *, base_url: str, api_key: str, model: str, dimensions: Optional[int] = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.dimensions = dimensions


async def embed(texts: Sequence[str], cfg: EmbeddingConfig) -> list[list[float]]:
    """Embed one or more texts via an OpenAI-compatible /embeddings endpoint.

    Returns a list of float vectors (one per input text). Raises on HTTP error
    or dimension mismatch (caught by callers and surfaced to the user).
    """
    if not texts:
        return []
    payload: dict = {"input": list(texts), "model": cfg.model}
    if cfg.dimensions:
        payload["dimensions"] = cfg.dimensions

    headers = {"Content-Type": "application/json"}
    if cfg.api_key:
        headers["Authorization"] = f"Bearer {cfg.api_key}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{cfg.base_url}/embeddings", json=payload, headers=headers)
    if resp.status_code >= 400:
        raise RuntimeError(f"embedding request failed ({resp.status_code}): {resp.text[:300]}")

    data = resp.json().get("data") or []
    vectors = [item["embedding"] for item in data]
    return vectors


def assert_dimensions(vectors: list[list[float]], expected: Optional[int]) -> None:
    """Validate that every vector matches the index's expected dimensionality."""
    if not expected:
        return
    for i, v in enumerate(vectors):
        if len(v) != expected:
            raise ValueError(
                f"embedding dimension mismatch at index {i}: got {len(v)}, expected {expected}. "
                f"Ensure the embedding model matches the index config."
            )
