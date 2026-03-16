"""
Storage Service Package — Multi-provider storage operations.

Public API re-exports for backward compatibility.
"""

from app.services.storage.base import StorageAdapter
from app.services.storage.cache import get_cached_size, set_cached_size
from app.services.storage.factory import get_storage_adapter

__all__ = [
    "StorageAdapter",
    "get_cached_size",
    "set_cached_size",
    "get_storage_adapter",
]
