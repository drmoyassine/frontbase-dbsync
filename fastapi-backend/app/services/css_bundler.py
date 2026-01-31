"""
CSS Bundler Service

Multi-tier cached CSS bundling for page publishing.
Follows the same L1 Memory → L2 Redis caching pattern as icon fetching.
"""

import asyncio
import hashlib
from typing import Dict, Optional, Set

from .css_registry import (
    GLOBAL_CSS,
    COMPONENT_CSS,
    bundle_css_for_components,
    get_component_css_requirements,
)
from ..services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings


# =============================================================================
# L1 In-Memory Cache
# =============================================================================

_CSS_BUNDLE_CACHE: Dict[str, str] = {}
_CSS_BUNDLE_CACHE_LOCK = asyncio.Lock()

# Cache TTL: 24 hours for Redis
CSS_CACHE_TTL = 86400


# =============================================================================
# Cache Key Generation
# =============================================================================

def generate_bundle_cache_key(components: list) -> str:
    """
    Generate a deterministic cache key based on component types and variants.
    
    Args:
        components: List of component dicts
        
    Returns:
        Cache key string (e.g., "css:bundle:a1b2c3d4")
    """
    # Collect all requirements
    requirements: Set[str] = set()
    for component in components:
        get_component_css_requirements(component, requirements)
    
    # Create deterministic hash from sorted requirements
    requirements_str = ','.join(sorted(requirements))
    hash_value = hashlib.md5(requirements_str.encode()).hexdigest()[:12]
    
    return f"css:bundle:{hash_value}"


# =============================================================================
# CSS Bundling with Multi-Tier Cache
# =============================================================================

async def bundle_css_for_page(components: list) -> str:
    """
    Bundle all required CSS for a page with tree-shaking and multi-tier caching.
    
    Cache layers:
    - L1: In-memory Python dict (fastest, per-process)
    - L2: Redis (shared across processes)
    - L3: Generate from registry (slowest, deterministic)
    
    Args:
        components: List of component dicts from page layout
        
    Returns:
        Complete CSS string ready for injection
    """
    cache_key = generate_bundle_cache_key(components)
    
    # L1: In-Memory Cache Check
    if cache_key in _CSS_BUNDLE_CACHE:
        print(f"[css_bundler] L1 cache hit: {cache_key}")
        return _CSS_BUNDLE_CACHE[cache_key]
    
    # L2: Redis Cache Check
    redis_settings = await get_configured_redis_settings()
    redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
    
    if redis_url:
        cached_css = await cache_get(redis_url, cache_key)
        if cached_css:
            print(f"[css_bundler] L2 Redis cache hit: {cache_key}")
            # Populate L1
            async with _CSS_BUNDLE_CACHE_LOCK:
                _CSS_BUNDLE_CACHE[cache_key] = cached_css
            return cached_css
    
    # L3: Generate from Registry
    print(f"[css_bundler] Generating CSS bundle for {len(components)} components...")
    css_bundle = bundle_css_for_components(components)
    
    # Populate L1 Cache
    async with _CSS_BUNDLE_CACHE_LOCK:
        _CSS_BUNDLE_CACHE[cache_key] = css_bundle
    
    # Populate L2 Redis Cache
    if redis_url:
        await cache_set(redis_url, cache_key, css_bundle, ttl=CSS_CACHE_TTL)
        print(f"[css_bundler] Cached in Redis: {cache_key} (TTL: {CSS_CACHE_TTL}s)")
    
    return css_bundle


async def get_css_for_component_type(component_type: str, variant: str = "base") -> str:
    """
    Get CSS for a specific component type with caching.
    
    Args:
        component_type: Component type name (e.g., "Button")
        variant: Variant name (e.g., "base", "marquee")
        
    Returns:
        CSS string for the component
    """
    requirement_key = f"{component_type}:{variant}"
    
    # Direct lookup from registry (no caching needed for single components)
    return COMPONENT_CSS.get(requirement_key, "")


def clear_css_cache() -> None:
    """Clear the L1 in-memory CSS cache. Used for hot-reloading in development."""
    global _CSS_BUNDLE_CACHE
    _CSS_BUNDLE_CACHE = {}
    print("[css_bundler] L1 cache cleared")


def get_cache_stats() -> dict:
    """Get L1 cache statistics for debugging."""
    return {
        "l1_entries": len(_CSS_BUNDLE_CACHE),
        "l1_keys": list(_CSS_BUNDLE_CACHE.keys()),
    }


# =============================================================================
# Minification (Simple)
# =============================================================================

def minify_css(css: str) -> str:
    """
    Simple CSS minification.
    For production, consider using cssmin or similar library.
    
    Args:
        css: Raw CSS string
        
    Returns:
        Minified CSS string
    """
    import re
    
    # Remove comments
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
    
    # Remove extra whitespace
    css = re.sub(r'\s+', ' ', css)
    
    # Remove whitespace around special characters
    css = re.sub(r'\s*([{};:,])\s*', r'\1', css)
    
    # Remove trailing semicolons before closing braces
    css = re.sub(r';}', '}', css)
    
    return css.strip()


async def bundle_css_for_page_minified(components: list) -> str:
    """
    Bundle CSS for a page with tree-shaking, caching, AND minification.
    
    Args:
        components: List of component dicts from page layout
        
    Returns:
        Minified CSS string ready for production
    """
    css_bundle = await bundle_css_for_page(components)
    return minify_css(css_bundle)
