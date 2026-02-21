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

import json
import os
import subprocess
import tempfile

async def generate_tailwind_utilities(components: list) -> str:
    """
    Generate Tailwind utility CSS by scanning Edge SSR renderer source files.
    
    The component JSON doesn't contain CSS class names — those are hardcoded
    in the Edge SSR renderers (PageRenderer.ts, landing/*.ts). We scan those
    source files so Tailwind can extract all used utility classes.
    
    Compatible with Tailwind CSS v4+ (@import syntax).
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            content_dir = os.path.join(tmpdir, "content")
            os.makedirs(content_dir, exist_ok=True)
            input_css = os.path.join(tmpdir, "input.css")
            output_css = os.path.join(tmpdir, "output.css")
            
            # 1. Copy Edge SSR renderer source files as scan targets
            # Check multiple paths: local dev (relative), Docker (copied at build)
            edge_ssr_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "services", "edge", "src", "ssr")
            
            # Docker path: Edge SSR source copied into FastAPI image at build time
            if not os.path.isdir(edge_ssr_dir):
                edge_ssr_dir = "/app/edge-ssr-source"
            
            source_files_found = False
            if os.path.isdir(edge_ssr_dir):
                # Copy renderer files to content dir
                import shutil
                for root, dirs, files in os.walk(edge_ssr_dir):
                    for f in files:
                        if f.endswith('.ts') or f.endswith('.tsx'):
                            src = os.path.join(root, f)
                            dst = os.path.join(content_dir, f)
                            shutil.copy2(src, dst)
                            source_files_found = True
            
            # Also write component JSON (for any class names in props like className)
            with open(os.path.join(content_dir, "components.json"), "w") as f:
                json.dump(components, f)
            
            if not source_files_found:
                # Fallback: write a safelist file with ALL classes used by Edge SSR renderers.
                # Extracted from: PageRenderer.ts, Navbar.ts, Hero.ts, Features.ts,
                # Pricing.ts, CTA.ts, FAQ.ts, Footer.ts, LogoCloud.ts
                safelist = """
                /* === Custom color utilities (from @theme) === */
                bg-primary bg-primary/90 bg-background bg-accent bg-card bg-muted bg-secondary
                bg-primary-foreground bg-destructive
                text-primary text-primary-foreground text-foreground text-muted-foreground
                text-accent-foreground text-secondary-foreground text-card-foreground
                text-destructive text-destructive-foreground
                border-border border-input border-b border-t border-0 border
                hover:bg-primary/90 hover:bg-accent hover:bg-secondary/80
                hover:text-foreground hover:text-primary hover:text-accent-foreground
                hover:underline hover:opacity-80 hover:opacity-90 hover:shadow-lg
                dark:block dark:hidden dark:bg-background dark:text-foreground

                /* === Layout === */
                grid grid-cols-1 grid-cols-2 grid-cols-3 grid-cols-4
                md:grid-cols-2 md:grid-cols-3 md:grid-cols-4
                lg:grid-cols-3 lg:grid-cols-4
                sm:grid-cols-2 sm:grid-cols-3
                flex flex-col flex-row flex-wrap flex-1 shrink-0 grow
                md:flex-row md:flex

                /* === Alignment === */
                items-center items-start items-end
                justify-center justify-between justify-start justify-end

                /* === Spacing === */
                gap-1 gap-2 gap-3 gap-4 gap-6 gap-8 gap-10 gap-12
                md:gap-8
                p-2 p-3 p-4 p-6 p-8 px-2 px-3 px-4 px-6 px-8
                py-2 py-3 py-4 py-6 py-8 py-10 py-12 py-16 py-20 py-24
                sm:px-6 lg:px-8 md:px-12
                sm:py-16 lg:py-24
                m-0 m-auto mt-1 mt-2 mt-4 mt-6 mt-8 mt-12 mb-2 mb-3 mb-4 mb-6 mb-8 mb-12
                mx-auto ml-1 ml-auto mr-auto
                pt-4 pt-8 pb-4

                /* === Sizing === */
                w-full w-auto w-5 w-6 w-8 w-10 w-12 w-16 w-24 w-32 w-48
                h-5 h-6 h-8 h-10 h-12 h-16 h-auto
                min-h-screen max-w-xs max-w-sm max-w-md max-w-lg max-w-xl max-w-2xl max-w-4xl max-w-6xl max-w-7xl

                /* === Typography === */
                text-xs text-sm text-base text-lg text-xl text-2xl text-3xl text-4xl text-5xl
                sm:text-xl sm:text-4xl lg:text-5xl xl:text-6xl md:text-4xl
                font-normal font-medium font-semibold font-bold font-extrabold
                text-left text-center text-right
                leading-tight leading-snug leading-normal leading-relaxed leading-none
                tracking-tight tracking-normal tracking-wide
                whitespace-nowrap break-words truncate

                /* === Generic colors (non-custom) === */
                text-white text-black text-gray-400 text-gray-500 text-gray-600 text-gray-900
                bg-white bg-black bg-transparent bg-gray-50 bg-gray-100 bg-gray-900 bg-green-500/10

                /* === Borders & Radius === */
                rounded rounded-md rounded-lg rounded-xl rounded-2xl rounded-full
                border-gray-200 border-gray-300

                /* === Shadows & Effects === */
                shadow shadow-sm shadow-md shadow-lg shadow-xl

                /* === Positioning === */
                relative absolute fixed sticky inset-0 top-0 bottom-0 left-0 right-0 -top-3 left-1/2
                z-10 z-20 z-50
                -translate-x-1/2

                /* === Overflow & Display === */
                overflow-hidden overflow-auto overflow-x-hidden
                hidden block inline-block inline-flex
                md:hidden md:flex md:block md:inline-flex
                lg:hidden lg:flex lg:block

                /* === Visibility & Opacity === */
                opacity-50 opacity-70 opacity-80 opacity-90

                /* === Transitions === */
                transition-all transition-colors duration-150 duration-200 duration-300

                /* === Interactive === */
                cursor-pointer pointer-events-none select-none

                /* === Lists & Spacing === */
                list-none list-disc space-y-1 space-y-2 space-y-3 space-y-4 space-x-4

                /* === Media Objects === */
                object-cover object-contain
                aspect-video aspect-square

                /* === Misc === */
                container
                underline no-underline
                sr-only not-sr-only
                """
                with open(os.path.join(content_dir, "safelist.txt"), "w") as f:
                    f.write(safelist)
                print("[css_bundler] Using safelist fallback (Edge source not found)")
            else:
                print(f"[css_bundler] Scanning Edge SSR source files for Tailwind classes")
                
            # Write input CSS — Tailwind v4 syntax with theme config
            with open(input_css, "w") as f:
                f.write('@import "tailwindcss/utilities";\n')
                f.write('@source "./content";\n\n')
                # Map CSS variable color names so Tailwind generates
                # bg-primary, text-muted-foreground, border-border, etc.
                f.write('@theme {\n')
                f.write('  --color-background: hsl(var(--background));\n')
                f.write('  --color-foreground: hsl(var(--foreground));\n')
                f.write('  --color-primary: hsl(var(--primary));\n')
                f.write('  --color-primary-foreground: hsl(var(--primary-foreground));\n')
                f.write('  --color-secondary: hsl(var(--secondary));\n')
                f.write('  --color-secondary-foreground: hsl(var(--secondary-foreground));\n')
                f.write('  --color-muted: hsl(var(--muted));\n')
                f.write('  --color-muted-foreground: hsl(var(--muted-foreground));\n')
                f.write('  --color-accent: hsl(var(--accent));\n')
                f.write('  --color-accent-foreground: hsl(var(--accent-foreground));\n')
                f.write('  --color-destructive: hsl(var(--destructive));\n')
                f.write('  --color-destructive-foreground: hsl(var(--destructive-foreground));\n')
                f.write('  --color-card: hsl(var(--card));\n')
                f.write('  --color-card-foreground: hsl(var(--card-foreground));\n')
                f.write('  --color-popover: hsl(var(--popover));\n')
                f.write('  --color-popover-foreground: hsl(var(--popover-foreground));\n')
                f.write('  --color-border: hsl(var(--border));\n')
                f.write('  --color-input: hsl(var(--input));\n')
                f.write('  --color-ring: hsl(var(--ring));\n')
                f.write('  --radius: var(--radius);\n')
                f.write('}\n')
                
            # Run tailwindcss CLI (v4 — no JS config needed)
            cmd = [
                "tailwindcss",
                "-i", input_css,
                "-o", output_css,
                "--minify"
            ]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=tmpdir
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                print(f"[css_bundler] Tailwind CLI failed: {stderr.decode()}")
                return ""
                
            if os.path.exists(output_css):
                with open(output_css, "r") as f:
                    result = f.read()
                print(f"[css_bundler] Tailwind utilities generated: {len(result)} bytes")
                return result
            return ""
    except Exception as e:
        print(f"[css_bundler] Error running Tailwind CLI: {str(e)}")
        return ""

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
    
    # ==== TAILWIND CSS GENERATION ====
    tailwind_css = await generate_tailwind_utilities(components)
    if tailwind_css:
        css_bundle += "\n/* Tailwind Utilities */\n" + tailwind_css
    
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
