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
import re
import subprocess
import tempfile

def _extract_css_classes_from_source(source_dir: str) -> set:
    """
    Extract CSS class names from Edge SSR TypeScript renderer source files.
    
    Scans for class="..." and className="..." patterns in template strings
    and string literals. Also handles conditional class expressions like
    `props.hideOnDesktop ? 'md:hidden' : ''`.
    
    Similar pattern to icon extraction: we parse the source to find
    exactly what CSS classes are used, then pass them to Tailwind.
    """
    classes = set()
    
    # Patterns to extract CSS classes from TypeScript source
    patterns = [
        # class="..." or className="..." in template literals
        r'class(?:Name)?=[\"\']([^\"\']+?)[\"\']',
        r'class(?:Name)?=\\?"([^"]+?)\\"',
        r'class(?:Name)?=\\"([^\\]+?)\\"',
        # String literals containing class names (e.g. 'md:hidden', 'flex gap-4')
        r"'([a-z][a-z0-9:/_-]+(?:\s+[a-z][a-z0-9:/_-]+)*)'",
    ]
    
    if not os.path.isdir(source_dir):
        return classes
    
    for root, dirs, files in os.walk(source_dir):
        for filename in files:
            if not (filename.endswith('.ts') or filename.endswith('.tsx')):
                continue
            filepath = os.path.join(root, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                for pattern in patterns:
                    for match in re.finditer(pattern, content):
                        class_str = match.group(1)
                        # Split by whitespace and filter valid class names
                        for cls in class_str.split():
                            # Valid Tailwind class: starts with letter or -, 
                            # contains only valid chars (letters, numbers, colons, slashes, brackets)
                            cls = cls.strip('",\'`{}$')
                            if cls and re.match(r'^[a-zA-Z!-][\w:/.[\]-]*$', cls):
                                classes.add(cls)
            except Exception as e:
                print(f"[css_bundler] Warning: Could not read {filepath}: {e}")
    
    return classes


async def generate_tailwind_utilities(components: list) -> str:
    """
    Generate Tailwind utility CSS using @source inline() with extracted class names.
    
    Instead of relying on Tailwind's Oxide scanner to parse TypeScript template
    literals (which misses responsive variants like md:flex), we:
    1. Read Edge SSR source files (.ts)
    2. Extract all CSS class names using regex
    3. Feed them to Tailwind v4 via @source inline("...")
    
    This is the CSS equivalent of the icon-fetch pattern: deterministic, 
    complete, and requires zero manual class maintenance.
    
    Compatible with Tailwind CSS v4.2+ (@source inline syntax).
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_css = os.path.join(tmpdir, "input.css")
            output_css = os.path.join(tmpdir, "output.css")
            
            # 1. Find Edge SSR source directory  
            edge_ssr_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "services", "edge", "src", "ssr")
            if not os.path.isdir(edge_ssr_dir):
                edge_ssr_dir = "/app/edge-ssr-source"
            
            # 2. Extract all CSS class names from source files
            extracted_classes = _extract_css_classes_from_source(edge_ssr_dir)
            
            # Also extract class names from component JSON (user-set className props)
            for component in components:
                _extract_classes_from_component(component, extracted_classes)
            
            if extracted_classes:
                print(f"[css_bundler] Extracted {len(extracted_classes)} unique CSS classes from Edge SSR source")
                # Log some responsive classes for verification
                responsive = [c for c in extracted_classes if ':' in c and not c.startswith('--')]
                if responsive:
                    print(f"[css_bundler] Responsive classes found: {sorted(responsive)[:20]}")
            else:
                print("[css_bundler] Warning: No CSS classes extracted, using safelist fallback")

            # 3. Build @source inline() directive with all extracted classes
            # Tailwind v4 @source inline() accepts a string of candidate classes
            classes_str = ' '.join(sorted(extracted_classes))
            
            # 4. Write input CSS with @source inline()
            with open(input_css, "w") as f:
                f.write('@import "tailwindcss";\n')
                f.write(f'@source inline("{classes_str}");\n\n')
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
                
            # 5. Run tailwindcss CLI (v4 standalone binary)
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
            
            # Always log stderr for diagnostics (includes version info)
            if stderr:
                stderr_text = stderr.decode().strip()
                if stderr_text:
                    print(f"[css_bundler] Tailwind CLI stderr: {stderr_text[:500]}")
            
            if process.returncode != 0:
                print(f"[css_bundler] Tailwind CLI failed (exit {process.returncode})")
                return ""
                
            if os.path.exists(output_css):
                with open(output_css, "r") as f:
                    result = f.read()
                # Check if responsive variants were generated
                has_media = '@media' in result
                print(f"[css_bundler] Tailwind utilities generated: {len(result)} bytes, has @media: {has_media}")
                return result
            return ""
    except Exception as e:
        print(f"[css_bundler] Error running Tailwind CLI: {str(e)}")
        return ""


def _extract_classes_from_component(component: dict, classes: set):
    """Extract CSS class names from component props (user-set className, etc.)"""
    if not isinstance(component, dict):
        return
    props = component.get('props', {})
    if isinstance(props, dict):
        for key, value in props.items():
            if key.lower() in ('classname', 'class', 'containerclass') and isinstance(value, str):
                for cls in value.split():
                    cls = cls.strip()
                    if cls:
                        classes.add(cls)
    # Recurse into children
    for child in component.get('children', []):
        _extract_classes_from_component(child, classes)

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
