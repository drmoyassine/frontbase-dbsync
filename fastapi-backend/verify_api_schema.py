
import asyncio
import sys
import os
sys.path.append(os.getcwd())

from app.services.sync.service import DatasourceService

async def verify_schema():
    ds_id = "ea1908bf-1aae-4acf-bbfe-aa99917eebfd"
    related_table = "wp_posts"
    
    print(f"Simulating Frontend Request: GET /api/sync/datasources/{ds_id}/tables/{related_table}/schema")
    
    service = DatasourceService()
    ds = await service.get_datasource(ds_id)
    if not ds:
        print("Datasource not found!")
        return

    adapter = service.get_adapter(ds)
    await adapter.connect()
    
    try:
        # This mirrors what the endpoint calls
        schema = await adapter.get_schema(related_table)
        
        print("\n--- API Response Simulation ---")
        if schema and "columns" in schema:
            print(f"Success! Retrieved schema for {related_table}")
            print(f"Column count: {len(schema['columns'])}")
            
            # Check for key columns the user might want
            target_cols = ['post_title', 'post_content', 'post_date']
            found_cols = [c['name'] for c in schema['columns'] if c['name'] in target_cols]
            print(f"Found target columns: {found_cols}")
        else:
            print("Failed to retrieve schema or empty columns.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await adapter.disconnect()

if __name__ == "__main__":
    asyncio.run(verify_schema())
