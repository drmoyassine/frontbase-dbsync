
import asyncio
import sys
import os
import json
sys.path.append(os.getcwd())

from app.services.sync.service import DatasourceService

async def debug_schema():
    ds_id = "ea1908bf-1aae-4acf-bbfe-aa99917eebfd"
    table_name = "wp_mylisting_locations"
    
    print(f"Inspecting schema for {table_name} in datasource {ds_id}...")
    
    service = DatasourceService()
    ds = await service.get_datasource(ds_id)
    if not ds:
        print("Datasource not found!")
        return

    adapter = service.get_adapter(ds)
    await adapter.connect()
    
    try:
        schema = await adapter.get_schema(table_name)
        
        print("\n--- Columns ---")
        for col in schema.get("columns", []):
            print(f"Name: {col['name']} | Type: {col['type']} | Is Foreign: {col.get('is_foreign')} | Foreign Table: {col.get('foreign_table')}")
            
        print("\n--- Foreign Keys (List) ---")
        print(json.dumps(schema.get("foreign_keys", []), indent=2))
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await adapter.disconnect()

if __name__ == "__main__":
    asyncio.run(debug_schema())
