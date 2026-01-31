"""
Pure transformation functions for component conversion.
No side effects, returns new objects.
"""
from typing import Dict, List, Callable, Any
import httpx
import asyncio
import re


def normalize_binding_location(component: Dict) -> Dict:
    """
    Ensures binding is at component.binding (single source of truth).
    Returns new component dict.
    
    Args:
        component: Component dict that may have binding in props or root
        
    Returns:
        New component dict with binding at root level
    """
    result = dict(component)
    
    # If binding is in props, move to root
    if 'props' in result and isinstance(result.get('props'), dict):
        props = result['props']
        if 'binding' in props:
            result['binding'] = props['binding']
            # Create new props dict without binding
            new_props = {k: v for k, v in props.items() if k != 'binding'}
            if new_props:
                result['props'] = new_props
            else:
                del result['props']
    
    return result


def map_styles_schema(component: Dict) -> Dict:
    """
    Maps stylesData → styles for SSR compatibility.
    MERGES template defaults (styles) with user edits (stylesData.values).
    PRESERVES viewportOverrides for responsive styling.
    Returns new component dict.
    
    Args:
        component: Component dict with styles and/or stylesData
        
    Returns:
        New component dict with merged styles
    """
    result = dict(component)
    
    # Start with existing styles (template defaults)
    existing_styles = result.get('styles', {})
    
    # If existing_styles is already in the new format, extract values
    if isinstance(existing_styles, dict) and 'values' in existing_styles:
        base_styles = existing_styles.get('values', {})
    else:
        base_styles = existing_styles if isinstance(existing_styles, dict) else {}
    
    # Get user edits from stylesData
    if 'stylesData' in result:
        styles_data = result['stylesData']
        
        # Handle new format: { activeProperties: [...], values: {...}, stylingMode: '...', viewportOverrides: {...} }
        if isinstance(styles_data, dict) and 'values' in styles_data:
            user_styles = styles_data.get('values', {})
        else:
            user_styles = styles_data if isinstance(styles_data, dict) else {}
        
        # Merge: template defaults + user edits (user edits take precedence)
        merged_styles = {**base_styles, **user_styles}
        
        # Store as the new format for SSR compatibility
        # CRITICAL: Preserve viewportOverrides for responsive styling!
        result['styles'] = {
            'activeProperties': styles_data.get('activeProperties', list(merged_styles.keys())),
            'values': merged_styles,
            'stylingMode': styles_data.get('stylingMode', 'visual'),
            'viewportOverrides': styles_data.get('viewportOverrides'),  # PRESERVE THIS!
        }
        
        # Keep stylesData as well for backward compatibility with Edge
        # (Edge reads from both styles and stylesData)
        result['stylesData'] = result['styles']
        
    elif base_styles:
        # No stylesData but has existing styles - ensure consistent format
        if not isinstance(existing_styles, dict) or 'values' not in existing_styles:
            result['styles'] = {
                'activeProperties': list(base_styles.keys()),
                'values': base_styles,
                'stylingMode': 'visual',
                'viewportOverrides': None,
            }
    
    return result


def process_component_children(
    component: Dict,
    processor_fn: Callable[[Dict], Dict]
) -> Dict:
    """
    Recursively applies processor_fn to all children.
    Returns new component dict.
    
    Args:
        component: Component dict potentially with children
        processor_fn: Function to apply to each child
        
    Returns:
        New component dict with processed children
    """
    result = dict(component)
    
    if 'children' in result and result['children']:
        result['children'] = [processor_fn(child) for child in result['children']]
    
    return result


def find_datasource(datasources: List[Dict], datasource_id: str = None) -> Dict:
    """
    Finds datasource by ID or returns first available.
    
    Args:
        datasources: List of datasource dicts
        datasource_id: Optional datasource ID to find
        
    Returns:
        Datasource dict or None
    """
    if not datasources:
        return None
    
    # Find by ID if provided
    if datasource_id:
        for ds in datasources:
            # Handle both Pydantic models and dicts
            ds_dict = ds.model_dump(by_alias=True) if hasattr(ds, 'model_dump') else ds
            if ds_dict.get('id') == datasource_id:
                return ds_dict
    
    # Fallback to first datasource
    ds = datasources[0]
    return ds.model_dump(by_alias=True) if hasattr(ds, 'model_dump') else ds

# =============================================================================
# Icon Pre-rendering via Lucide CDN
# =============================================================================

# CDN URL for Lucide icons (unpkg serves lucide-static package)
LUCIDE_CDN_BASE = "https://unpkg.com/lucide-static@latest/icons"


def pascal_to_kebab(name: str) -> str:
    """Convert PascalCase to kebab-case (e.g., 'ChevronRight' -> 'chevron-right', 'BarChart3' -> 'bar-chart-3')"""
    # Insert hyphen before uppercase letters and digits (not at start)
    result = re.sub(r'(?<!^)(?=[A-Z])', '-', name)  # Before uppercase
    result = re.sub(r'(?<=[a-zA-Z])(?=[0-9])', '-', result)  # Before digits after letters
    return result.lower()


from ...services.sync.redis_client import cache_get, cache_set, get_configured_redis_settings

# Global In-Memory Cache for Icons (First Level)
_ICON_CACHE: Dict[str, str] = {}
_ICON_CACHE_LOCK = asyncio.Lock()


async def fetch_icon_svg(icon_name: str, client: httpx.AsyncClient) -> tuple[str, str | None]:
    """
    Fetch a single icon SVG with Multi-Level Caching (L1: Memory, L2: Redis, L3: CDN).
    
    Args:
        icon_name: PascalCase icon name
        client: Shared httpx async client
        
    Returns:
        Tuple of (icon_name, svg_content or None)
    """
    # L1: Memory Cache
    if icon_name in _ICON_CACHE:
        return (icon_name, _ICON_CACHE[icon_name])

    # L2: Redis Cache
    redis_settings = await get_configured_redis_settings()
    redis_url = redis_settings.get("url") if redis_settings and redis_settings.get("enabled") else None
    
    if redis_url:
        cache_key = f"icon:svg:{icon_name}"
        cached_svg = await cache_get(redis_url, cache_key)
        if cached_svg:
            # Populate L1 and return
            async with _ICON_CACHE_LOCK:
                _ICON_CACHE[icon_name] = cached_svg
            return (icon_name, cached_svg)

    # L3: CDN Fetch
    kebab_name = pascal_to_kebab(icon_name)
    url = f"{LUCIDE_CDN_BASE}/{kebab_name}.svg"
    
    try:
        response = await client.get(url, timeout=5.0)
        if response.status_code == 200:
            svg_content = response.text
            # Modify SVG for inline use
            svg_content = svg_content.replace('width="24"', 'width="1em"')
            svg_content = svg_content.replace('height="24"', 'height="1em"')
            
            # Update L1 Cache
            async with _ICON_CACHE_LOCK:
                _ICON_CACHE[icon_name] = svg_content
            
            # Update L2 Redis Cache (Background task would be better, but await is fast enough)
            if redis_url:
                # Cache for 30 days (icons don't change often)
                await cache_set(redis_url, cache_key, svg_content, ttl=2592000)
                
            print(f"[icon_fetch] ✅ Fetched '{icon_name}' from CDN")
            return (icon_name, svg_content)
        else:
            print(f"[icon_fetch] ⚠️ Icon '{icon_name}' not found (HTTP {response.status_code})")
            return (icon_name, None)
    except Exception as e:
        print(f"[icon_fetch] ❌ Failed to fetch '{icon_name}': {e}")
        return (icon_name, None)


async def fetch_icons_batch(icon_names: set[str]) -> dict[str, str]:
    """
    Fetch multiple icons in parallel from CDN, utilizing L1/L2 cache.
    """
    if not icon_names:
        return {}
    
    # 1. Check L1 Memory Cache first
    missing_from_l1 = [name for name in icon_names if name not in _ICON_CACHE]
    
    if not missing_from_l1:
        print(f"[icon_fetch] All {len(icon_names)} icons found in L1 memory cache.")
        return {name: _ICON_CACHE[name] for name in icon_names}

    # 2. Check L2 Redis & Fetch L3 CDN for what remains
    # We do this logic inside fetch_icon_svg per item for simplicity, 
    # but could optimize to bulk-get from Redis if client supported it.
    
    print(f"[icon_fetch] Resolving {len(missing_from_l1)} icons (Redis/CDN)...")
    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [fetch_icon_svg(name, client) for name in missing_from_l1]
        results = await asyncio.gather(*tasks)
    
    # Construct final result
    final_map = {}
    for name, svg in results:
        if svg:
            final_map[name] = svg
            
    # Add already cached items
    for name in icon_names:
        if name in _ICON_CACHE:
            final_map[name] = _ICON_CACHE[name]
            
    return final_map


def collect_icons_from_component(component: Dict, icons: set[str]) -> None:
    """
    Recursively collect all icon names from a component tree.
    Modifies 'icons' set in-place.
    
    Handles:
    - props.icon (standard components)
    - props.features[].icon (Features section)
    """
    props = component.get('props', {})
    if isinstance(props, dict):
        # Standard icon prop
        icon = props.get('icon')
        if icon and isinstance(icon, str):
            icons.add(icon)
        
        # Features section: props.features[].icon
        features = props.get('features', [])
        if isinstance(features, list):
            for feature in features:
                if isinstance(feature, dict):
                    feature_icon = feature.get('icon')
                    if feature_icon and isinstance(feature_icon, str):
                        icons.add(feature_icon)
    
    # Recurse into children
    children = component.get('children', [])
    if children:
        for child in children:
            collect_icons_from_component(child, icons)



def inject_icon_svg(component: Dict, icon_map: dict[str, str]) -> Dict:
    """
    Inject pre-fetched iconSvg into component props.
    Recursively processes children.
    
    Handles:
    - props.iconSvg (standard components)
    - props.features[].iconSvg (Features section)
    
    Returns new component dict.
    """
    result = dict(component)
    props = result.get('props', {})
    
    if isinstance(props, dict):
        new_props = dict(props)
        
        # Standard icon prop
        icon_name = props.get('icon')
        if icon_name and icon_name in icon_map:
            new_props['iconSvg'] = icon_map[icon_name]
        
        # Features section: props.features[].icon -> iconSvg
        features = props.get('features', [])
        if isinstance(features, list) and features:
            new_features = []
            for feature in features:
                if isinstance(feature, dict):
                    feature_icon = feature.get('icon')
                    if feature_icon and feature_icon in icon_map:
                        new_features.append({**feature, 'iconSvg': icon_map[feature_icon]})
                    else:
                        new_features.append(feature)
                else:
                    new_features.append(feature)
            new_props['features'] = new_features
        
        result['props'] = new_props
    
    # Recurse into children
    if 'children' in result and result['children']:
        result['children'] = [
            inject_icon_svg(child, icon_map) 
            for child in result['children']
        ]
    
    return result

