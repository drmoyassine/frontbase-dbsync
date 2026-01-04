import asyncio
import httpx
import json
import sys
import os

# Configuration
BASE_URL = "http://127.0.0.1:8000"
DATASOURCE_ID = "75bdfec7-71f6-4613-8854-a318cb3f0016" # Supapostgres from previous context
MAIN_TABLE = "institutions"
RELATED_TABLE = "providers" 

async def simulate_frontend():
    async with httpx.AsyncClient(timeout=30.0) as client:
        print(f"\n--- 1. Fetching Main Table Schema ({MAIN_TABLE}) ---")
        url = f"{BASE_URL}/api/sync/datasources/{DATASOURCE_ID}/tables/{MAIN_TABLE}/schema"
        print(f"GET {url}")
        resp = await client.get(url)
        if resp.status_code != 200:
            print(f"Error fetching main schema: {resp.text}")
            return
        
        main_schema = resp.json()
        fks = [c for c in main_schema.get('columns', []) if c.get('is_foreign') or c.get('foreign_key')]
        print(f"Found {len(fks)} Foreign Keys columns (or checking foreign_keys list):")
        
        # Check explicit foreign_keys list if available
        if 'foreign_keys' in main_schema:
            for fk in main_schema['foreign_keys']:
                print(f"  - FK to table: '{fk.get('referred_table')}' via '{fk.get('constrained_columns')}'")

        # Verify related table name casing from FK
        fk_ref_table = next((fk.get('referred_table') for fk in main_schema.get('foreign_keys', []) if fk.get('referred_table').lower() == RELATED_TABLE.lower()), None)
        
        if not fk_ref_table:
            # Fallback scan columns
            print(f"Checking columns for FK...")
            # (Simplification: assuming foreign_keys list is accurate as per previous tests)
            print(f"CRITICAL: Could not find FK to {RELATED_TABLE} in schema foreign_keys list!")
            # Try to infer?
            fk_ref_table = "contacts" # Fallback
        
        print(f"Targeting Related Table: '{fk_ref_table}' (as defined in FK)")

        print(f"\n--- 2. Fetching Related Table Schema ({fk_ref_table}) to get Column Names ---")
        url = f"{BASE_URL}/api/sync/datasources/{DATASOURCE_ID}/tables/{fk_ref_table}/schema"
        print(f"GET {url}")
        resp = await client.get(url)
        if resp.status_code != 200:
            print(f"Error fetching related schema: {resp.text}")
            return

        related_schema = resp.json()
        # Get a few sample columns to test
        target_cols = ['case_summary', 'auth_user_id', 'provider_name', 'name', 'email']
        
        found_cols = []
        for col in related_schema.get('columns', []):
            if col['name'].lower() in [tc.lower() for tc in target_cols]:
                found_cols.append(col['name'])
        
        print(f"Found related columns with EXACT casing: {found_cols}")

        if not found_cols:
            print("No target columns found in related table schema!")
            return

        # Simulate Frontend constructing the request
        select_parts = ",".join(found_cols)
        select_param = f"*,{fk_ref_table}({select_parts})"
        
        print(f"\n--- 3. Simulating Data Request ---")
        url = f"{BASE_URL}/api/sync/datasources/{DATASOURCE_ID}/tables/{MAIN_TABLE}/data"
        print(f"GET {url}")
        print(f"Select Param: {select_param}")
        
        resp = await client.get(
            url,
            params={"select": select_param, "limit": 20}
        )
        
        if resp.status_code != 200:
            print(f"Error fetching data: {resp.text}")
            return
            
        data = resp.json()
        records = data.get('records', [])
        print(f"Retrieved {len(records)} records.")
        
        if records:
            print("\n--- 4. content Analysis (First 5 records) ---")
            
            error_count = 0
            for i, record in enumerate(records):
                # Check for dotted keys presence/absence
                dotted_keys = [k for k in record.keys() if '.' in k]
                
                # Check for nested keys (raw)
                nested_keys = [k for k in record.keys() if isinstance(record[k], dict)]
                
                # Check specifically for provider_name
                has_flattened = any(k.endswith('provider_name') and '.' in k for k in record.keys())
                has_nested = 'providers' in record
                
                if i < 5:
                    print(f"Record {i}: has_flattened={has_flattened}, has_nested={has_nested}, dotted_keys={dotted_keys}")
                    if has_nested:
                         print(f"   RAW 'providers' value: {record['providers']}")
                
                if not has_flattened and not has_nested:
                    # Is it because provider_id is null?
                    p_id = record.get('provider_id')
                    print(f"WARNING: Record {i} missing enrichment! provider_id={p_id}")
                    error_count += 1
            
            if error_count == 0:
                print("\nSUCCESS: All records appear enriched or valid.")
            else:
                print(f"\nFAILURE: {error_count} records missing enrichment.")
        else:
            print("No records returned.")

if __name__ == "__main__":
    asyncio.run(simulate_frontend())
