"""
Storage Service — Backward-compatible re-export shim.

The actual implementation has been split into app.services.storage/ package:
  - base.py              → StorageAdapter ABC
  - cache.py             → L1/L2 size cache helpers
  - factory.py           → get_storage_adapter()
  - supabase_adapter.py  → SupabaseStorageAdapter
  - cloudflare_adapter.py → CloudflareR2Adapter
  - vercel_adapter.py    → VercelBlobAdapter
  - netlify_adapter.py   → NetlifyBlobsAdapter

This file re-exports the public API so existing imports continue to work.
"""

# Re-export public API
from app.services.storage.base import StorageAdapter  # noqa: F401
from app.services.storage.cache import get_cached_size, set_cached_size  # noqa: F401
from app.services.storage.factory import get_storage_adapter  # noqa: F401

# Re-export adapter classes for any direct imports
from app.services.storage.supabase_adapter import SupabaseStorageAdapter  # noqa: F401
from app.services.storage.cloudflare_adapter import CloudflareR2Adapter  # noqa: F401
from app.services.storage.vercel_adapter import VercelBlobAdapter  # noqa: F401
from app.services.storage.netlify_adapter import NetlifyBlobsAdapter  # noqa: F401
