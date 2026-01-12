
import sys
import os
import json
from pprint import pprint

# Add app directory to path
sys.path.append(os.path.join(os.getcwd(), 'fastapi-backend'))

from app.routers.pages import compute_data_request


def test_compute_data_request():
    print("Testing compute_data_request...")
    
    # Mock Datasource
    datasource_dict = {
        'id': 'ds_123',
        'type': 'supabase',
        'name': 'Test DB',
        'url': 'https://mock.supabase.co',
        'anonKey': 'mock-key'
    }
    
    # Pass as dict since compute_data_request handles it (duck typing)
    ds_obj = datasource_dict
    
    # Mock Binding
    binding = {
        'tableName': 'institutions',
        'columns': ['name', 'countries.country', 'countries.flag'],
        'frontendFilters': [
            {
                'id': 'f1',
                'column': 'countries.country',
                'filterType': 'dropdown',
                'label': 'Country'
            },
            {
                'id': 'f2',
                'column': 'name',
                'filterType': 'text',
                'label': 'Name'
            }
        ]
    }
    
    # Run computation
    # Note: This will try to connect to SQLite to look up FKs. 
    # If standard unified.db is present, it might find nothing or fail if table doesn't exist.
    # However, we mocked the datasource, so get_table_foreign_keys might return empty if not found.
    # But filtering logic for options request depends on filter type, not FKs (except for strict join check which I skipped in favor of simple distinct)
    
    try:
        result = compute_data_request(binding, ds_obj)
        
        if not result:
            print("❌ compute_data_request returned None")
            return

        query_config = result.get('queryConfig', {})
        
        # 1. Verify Column Aliasing
        columns_str = result.get('body', {}).get('columns', '')
        print(f"\nGenererated Columns: {columns_str}")
        
        if 'countries.country AS "countries.country"' in columns_str:
            print("✅ Column aliasing verified")
        else:
            print("❌ Column aliasing FAILED")
            
        # 2. Verify Filter Options Request
        filters = query_config.get('frontendFilters', [])
        dropdown_filter = next((f for f in filters if f['id'] == 'f1'), None)
        
        if dropdown_filter and 'optionsDataRequest' in dropdown_filter:
            print("\n✅ optionsDataRequest found in dropdown filter")
            req = dropdown_filter['optionsDataRequest']
            print("\nRequest Details:")
            pprint(req)
            
            if req['url'].endswith('frontbase_get_distinct_values') and req['body']['target_col'] == 'country':
                 print("✅ Request URL and Body appear correct")
            else:
                 print("❌ Request details incorrect")
        else:
            print("❌ optionsDataRequest NOT found")

    except Exception as e:
        print(f"❌ Error running test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_compute_data_request()
