"""
Data enrichment functions for component bindings.
Adds dataRequest and optionsDataRequest while preserving all original fields.
"""
from typing import Dict, List, Any


def remove_nulls(obj: Any) -> Any:
    """
    Recursively remove null values from dicts and lists.
    Zod .optional() accepts undefined but rejects null.
    """
    if isinstance(obj, dict):
        return {k: remove_nulls(v) for k, v in obj.items() if v is not None}
    elif isinstance(obj, list):
        return [remove_nulls(item) for item in obj if item is not None]
    else:
        return obj


def enrich_binding_with_data_request(
    binding: Dict,
    datasource: Dict,
    compute_data_request_fn,
    component_id: str = None
) -> Dict:
    """
    Enriches binding with dataRequest AND preserves frontendFilters.
    Returns NEW binding dict with all original fields intact.
    
    CRITICAL: This function ensures frontendFilters is enriched and preserved.
    
    Args:
        binding: Original binding dict
        datasource: Datasource dict for generating requests
        compute_data_request_fn: Function to compute main dataRequest
        component_id: Component ID for Pydantic validation (required field)
        
    Returns:
        New binding dict with dataRequest and enriched frontendFilters
    """
    # Start with full copy of original binding
    enriched = dict(binding)
    
    # Add componentId if provided (required by Pydantic schema)
    if component_id:
        enriched['componentId'] = component_id
    
    # Ensure datasourceId is set (required by Zod validation)
    if not enriched.get('datasourceId') and datasource:
        ds_id = datasource.get('id') if isinstance(datasource, dict) else getattr(datasource, 'id', None)
        if ds_id:
            enriched['datasourceId'] = ds_id
    
    # Generate and add main dataRequest
    data_request = compute_data_request_fn(binding, datasource)
    if data_request:
        enriched['dataRequest'] = data_request
    
    # This is where filter options requests are added
    if 'frontendFilters' in enriched and enriched['frontendFilters']:
        enriched['frontendFilters'] = enrich_filters_with_options_request(
            enriched['frontendFilters'],
            binding.get('tableName', ''),
            datasource
        )
    
    # Remove null values recursively - Zod .optional() accepts undefined but rejects null
    # This prevents validation errors like "Expected string, received null"
    enriched = remove_nulls(enriched)
    
    return enriched


def enrich_filters_with_options_request(
    filters: List[Dict],
    table_name: str,
    datasource: Dict
) -> List[Dict]:
    """
    For each dropdown/multiselect filter, adds optionsDataRequest.
    Returns NEW filters list with all filters preserved.
    
    Args:
        filters: List of filter configurations
        table_name: Main table name for primary columns
        datasource: Datasource dict with URL and credentials
        
    Returns:
        New list of filters with optionsDataRequest added where applicable
    """
    enriched_filters = []
    
    for filter_item in filters:
        # Create new filter dict (don't mutate original)
        enriched_filter = dict(filter_item)
        
        filter_type = enriched_filter.get('filterType')
        column = enriched_filter.get('column')
        
        # Only add options request for dropdown/multiselect
        if filter_type in ('dropdown', 'multiselect') and column:
            enriched_filter['optionsDataRequest'] = generate_options_request(
                column,
                table_name,
                datasource
            )
        
        enriched_filters.append(enriched_filter)
    
    return enriched_filters


def generate_options_request(
    column: str,
    table_name: str,
    datasource: Dict
) -> Dict:
    """
    Generates HTTP request spec for fetching distinct filter options.
    Uses frontbase_get_distinct_values RPC.
    
    Args:
        column: Column name (may be dot-notation for related columns)
        table_name: Main table name
        datasource: Datasource dict with URL and anonKey
        
    Returns:
        DataRequest dict for fetching options
    """
    ds_url = datasource.get('url', '')
    anon_key = datasource.get('anonKey', '')
    
    # Determine target table and column
    if '.' in column:
        # Related column: countries.country
        parts = column.split('.')
        target_table = parts[0]
        target_col = parts[1]
    else:
        # Primary column: country_name
        target_table = table_name
        target_col = column
    
    # Build RPC request
    rpc_url = f"{ds_url}/rest/v1/rpc/frontbase_get_distinct_values"
    
    return {
        'url': rpc_url,
        'method': 'POST',
        'headers': {
            'apikey': anon_key or '{{SUPABASE_ANON_KEY}}',
            'Authorization': f"Bearer {anon_key}" if anon_key else 'Bearer {{SUPABASE_ANON_KEY}}',
            'Content-Type': 'application/json'
        },
        'body': {
            'target_table': target_table,
            'target_col': target_col
        },
        'resultPath': ''  # RPC returns array directly
    }
