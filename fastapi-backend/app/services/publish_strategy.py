"""
Publish Strategy — Abstraction for how the backend delivers compiled pages.

Strategies:
- LocalPublishStrategy: HTTP POST to Edge Engine /api/import (default)
- TursoPublishStrategy: Direct SQL write to user's Turso DB (Phase 2 stub)

Factory: get_publish_strategy() reads PUBLISH_STRATEGY env var.

AGENTS.md §4.3: Both strategies are called AFTER the DB connection is released
(Release-Before-IO pattern).
"""

import os
import httpx
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BasePublishStrategy(ABC):
    """Abstract publish strategy."""

    @abstractmethod
    async def publish_page(self, payload: dict, *, force: bool = True) -> dict:
        """
        Publish a compiled page bundle.

        Args:
            payload: The ImportPagePayload as a dict (serialized Pydantic model)
            force: Whether to overwrite existing version

        Returns:
            dict with 'success', 'previewUrl', 'version', etc.
        """
        ...

    @abstractmethod
    async def unpublish_page(self, slug: str) -> dict:
        """Remove a page from the edge."""
        ...

    @abstractmethod
    async def sync_settings(self, settings: dict) -> None:
        """Sync project settings (favicon, branding) to the edge."""
        ...


class LocalPublishStrategy(BasePublishStrategy):
    """
    Publishes via HTTP POST to the Edge Engine's /api/import endpoint.
    This is the current (and default) behavior.
    """

    def __init__(self):
        self.edge_url = os.getenv("EDGE_URL", os.getenv("EDGE_ENGINE_URL", "http://localhost:3002"))

    async def publish_page(self, payload: dict, *, force: bool = True) -> dict:
        import_url = f"{self.edge_url}/api/import"
        print(f"[PublishStrategy:local] Sending to: {import_url}")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                import_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10.0,
            )

            print(f"[PublishStrategy:local] Response status: {response.status_code}")

            if response.status_code == 200:
                return response.json()
            else:
                print(f"[PublishStrategy:local] Edge import FAILED: {response.status_code}, body={response.text[:500]}")
                return {
                    "success": False,
                    "error": f"Edge import failed: {response.status_code}",
                    "details": response.text,
                }

    async def unpublish_page(self, slug: str) -> dict:
        url = f"{self.edge_url}/api/import/{slug}"
        async with httpx.AsyncClient() as client:
            response = await client.delete(url, timeout=5.0)
            return response.json() if response.status_code == 200 else {
                "success": False,
                "error": f"Unpublish failed: {response.status_code}",
            }

    async def sync_settings(self, settings: dict) -> None:
        url = f"{self.edge_url}/api/import/settings"
        try:
            async with httpx.AsyncClient() as client:
                await client.post(url, json=settings, timeout=5.0)
                print("[PublishStrategy:local] Synced project settings to Edge")
        except Exception as e:
            print(f"[PublishStrategy:local] Settings sync failed (non-fatal): {e}")


class TursoPublishStrategy(BasePublishStrategy):
    """
    Publishes directly to the user's Turso DB via HTTP API.

    The backend writes compiled page bundles directly to Turso,
    and the edge reads from the same Turso DB via @libsql/client.
    
    Env vars:
    - TURSO_DB_URL: Turso database URL (e.g., libsql://your-db.turso.io)
    - TURSO_DB_TOKEN: Turso auth token
    - UPSTASH_REDIS_URL: (optional) for cache invalidation after publish
    - UPSTASH_REDIS_TOKEN: (optional) for cache invalidation
    """

    def __init__(self):
        self.turso_url = os.getenv("TURSO_DB_URL", "")
        self.turso_token = os.getenv("TURSO_DB_TOKEN", "")
        self.upstash_url = os.getenv("UPSTASH_REDIS_URL", "")
        self.upstash_token = os.getenv("UPSTASH_REDIS_TOKEN", "")

        if not self.turso_url:
            raise ValueError(
                "[TursoPublishStrategy] TURSO_DB_URL is required when PUBLISH_STRATEGY=turso. "
                "Set this to your Turso database URL."
            )
        
        # Convert libsql:// to https:// for the HTTP API
        self.http_url = self.turso_url.replace("libsql://", "https://")
        if not self.http_url.startswith("https://"):
            self.http_url = f"https://{self.http_url}"
        
        print(f"[PublishStrategy:turso] Initialized → {self.http_url[:40]}...")

    async def _execute_sql(self, statements: list[dict]) -> dict:
        """Execute SQL statements via Turso HTTP API (v2 pipeline)."""
        url = f"{self.http_url}/v2/pipeline"
        headers = {"Authorization": f"Bearer {self.turso_token}"}
        
        body = {
            "requests": [
                {"type": "execute", "stmt": stmt}
                for stmt in statements
            ] + [{"type": "close"}]
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=body, headers=headers, timeout=10.0)
            if response.status_code != 200:
                raise Exception(f"Turso HTTP API error {response.status_code}: {response.text[:300]}")
            return response.json()

    async def publish_page(self, payload: dict, *, force: bool = True) -> dict:
        import json
        from datetime import datetime

        page = payload.get("page", payload)
        now = datetime.utcnow().isoformat() + "Z"

        # Build INSERT OR REPLACE statement
        stmt = {
            "sql": """INSERT OR REPLACE INTO published_pages 
                      (id, slug, name, title, description, layout_data, seo_data, 
                       datasources, css_bundle, version, published_at, is_public, 
                       is_homepage, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            "args": [
                {"type": "text", "value": str(page.get("id", ""))},
                {"type": "text", "value": str(page.get("slug", ""))},
                {"type": "text", "value": str(page.get("name", ""))},
                {"type": "text", "value": str(page.get("title") or "")},
                {"type": "text", "value": str(page.get("description") or "")},
                {"type": "text", "value": json.dumps(page.get("layoutData", {}))},
                {"type": "text", "value": json.dumps(page.get("seoData")) if page.get("seoData") else ""},
                {"type": "text", "value": json.dumps(page.get("datasources")) if page.get("datasources") else ""},
                {"type": "text", "value": str(page.get("cssBundle") or "")},
                {"type": "integer", "value": str(page.get("version", 1))},
                {"type": "text", "value": str(page.get("publishedAt", now))},
                {"type": "integer", "value": "1" if page.get("isPublic", True) else "0"},
                {"type": "integer", "value": "1" if page.get("isHomepage", False) else "0"},
                {"type": "text", "value": now},
                {"type": "text", "value": now},
            ]
        }

        try:
            await self._execute_sql([stmt])
            slug = page.get("slug", "unknown")
            print(f"[PublishStrategy:turso] ✅ Published page: {slug}")

            # Invalidate Upstash cache if configured
            await self._invalidate_cache(slug)

            return {
                "success": True,
                "version": page.get("version", 1),
                "previewUrl": f"/p/{slug}",
            }
        except Exception as e:
            print(f"[PublishStrategy:turso] ❌ Publish failed: {e}")
            return {"success": False, "error": str(e)}

    async def unpublish_page(self, slug: str) -> dict:
        stmt = {
            "sql": "DELETE FROM published_pages WHERE slug = ?",
            "args": [{"type": "text", "value": slug}]
        }
        try:
            await self._execute_sql([stmt])
            await self._invalidate_cache(slug)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def sync_settings(self, settings: dict) -> None:
        import json
        from datetime import datetime

        now = datetime.utcnow().isoformat() + "Z"
        stmt = {
            "sql": """INSERT OR REPLACE INTO project_settings 
                      (id, favicon_url, logo_url, site_name, site_description, app_url, updated_at)
                      VALUES ('default', ?, ?, ?, ?, ?, ?)""",
            "args": [
                {"type": "text", "value": str(settings.get("faviconUrl") or "")},
                {"type": "text", "value": str(settings.get("logoUrl") or "")},
                {"type": "text", "value": str(settings.get("siteName") or "")},
                {"type": "text", "value": str(settings.get("siteDescription") or "")},
                {"type": "text", "value": str(settings.get("appUrl") or "")},
                {"type": "text", "value": now},
            ]
        }
        try:
            await self._execute_sql([stmt])
            print("[PublishStrategy:turso] ✅ Synced project settings")
        except Exception as e:
            print(f"[PublishStrategy:turso] Settings sync failed (non-fatal): {e}")

    async def _invalidate_cache(self, slug: str) -> None:
        """Invalidate Upstash Redis cache for the published page."""
        if not self.upstash_url or not self.upstash_token:
            return

        try:
            # Delete the page cache key
            cache_key = f"page:{slug}"
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"{self.upstash_url}/del/{cache_key}",
                    headers={"Authorization": f"Bearer {self.upstash_token}"},
                    timeout=3.0,
                )
                print(f"[PublishStrategy:turso] Cache invalidated: {cache_key}")
        except Exception as e:
            print(f"[PublishStrategy:turso] Cache invalidation failed (non-fatal): {e}")


# =============================================================================
# Factory
# =============================================================================

_strategy: Optional[BasePublishStrategy] = None


def get_publish_strategy() -> BasePublishStrategy:
    """
    Get the singleton publish strategy based on PUBLISH_STRATEGY env var.

    Returns:
        BasePublishStrategy: The publish strategy instance.
    """
    global _strategy
    if _strategy is None:
        strategy_name = os.getenv("PUBLISH_STRATEGY", "local")
        if strategy_name == "turso":
            _strategy = TursoPublishStrategy()
        else:
            _strategy = LocalPublishStrategy()
        print(f"[PublishStrategy] Using: {strategy_name}")
    return _strategy
