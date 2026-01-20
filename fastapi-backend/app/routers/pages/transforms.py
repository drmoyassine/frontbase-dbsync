"""
Pure transformation functions for component conversion.
No side effects, returns new objects.
"""
from typing import Dict, List, Callable, Any


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
        
        # Handle new format: { activeProperties: [...], values: {...}, stylingMode: '...' }
        if isinstance(styles_data, dict) and 'values' in styles_data:
            user_styles = styles_data.get('values', {})
        else:
            user_styles = styles_data if isinstance(styles_data, dict) else {}
        
        # Merge: template defaults + user edits (user edits take precedence)
        merged_styles = {**base_styles, **user_styles}
        
        # Store as the new format for SSR compatibility
        result['styles'] = {
            'activeProperties': styles_data.get('activeProperties', list(merged_styles.keys())),
            'values': merged_styles,
            'stylingMode': styles_data.get('stylingMode', 'visual')
        }
        
        del result['stylesData']
    elif base_styles:
        # No stylesData but has existing styles - ensure consistent format
        if not isinstance(existing_styles, dict) or 'values' not in existing_styles:
            result['styles'] = {
                'activeProperties': list(base_styles.keys()),
                'values': base_styles,
                'stylingMode': 'visual'
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
