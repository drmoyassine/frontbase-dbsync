"""
Investigate RPC data flow for Hono DataTable
Test the actual RPC response via Hono's data API
"""
import json
import sqlite3
import requests

# First get the datasource from Hono page to get credentials
print("=== Getting Datasource from Hono DB ===")
conn = sqlite3.connect('../services/actions/data/pages.db')
rows = conn.execute("SELECT datasources FROM published_pages WHERE slug = 'cc'").fetchall()
if rows and rows[0][0]:
    datasources = json.loads(rows[0][0])
    ds = datasources[0] if datasources else None
    if ds:
        print(f"Datasource: {ds.get('name')} ({ds.get('type')})")
        url = ds.get('url')
        anon_key = ds.get('anonKey')
        
        # Now test the RPC directly with same params Hono uses
        print("\n=== Testing RPC Directly ===")
        rpc_body = {
            "table_name": "institutions",
            "columns": "institutions.*, countries.country, countries.flag",
            "joins": [{"type": "left", "table": "countries", "on": "institutions.country_id = countries.id"}],
            "sort_col": None,
            "sort_dir": "asc",
            "page": 1,
            "page_size": 2,
            "filters": []
        }
        
        try:
            resp = requests.post(
                f"{url}/rest/v1/rpc/frontbase_get_rows",
                json=rpc_body,
                headers={
                    "apikey": anon_key,
                    "Authorization": f"Bearer {anon_key}",
                    "Content-Type": "application/json"
                }
            )
            print(f"Status: {resp.status_code}")
            result = resp.json()
            
            if isinstance(result, dict) and 'rows' in result:
                if result['rows']:
                    first_row = result['rows'][0]
                    print(f"\n=== ALL First Row Keys ===")
                    print(sorted(first_row.keys()))
                    
                    print(f"\n=== Country-related values ===")
                    print(f"  'country': {first_row.get('country')}")
                    print(f"  'countries.country': {first_row.get('countries.country', 'NOT EXISTS')}")
                    print(f"  'country_name': {first_row.get('country_name', 'NOT EXISTS')}")
                    print(f"  'country_id': {first_row.get('country_id')}")
                    
                    print(f"\n=== Problem Analysis ===")
                    print(f"When RPC returns 'country' but binding expects 'countries.country':")
                    print(f"  getCellValue tries: row['countries.country'] -> FAILS")
                    print(f"  Nested access: row.countries.country -> FAILS (no nested object)")
                    print(f"  Last part fallback: row['country'] -> SHOULD WORK")
                    if 'country' in first_row:
                        print(f"  >>> 'country' exists with value: {first_row['country']}")
            else:
                print(f"Unexpected result: {resp.text[:500]}")
        except Exception as e:
            print(f"Error: {e}")
conn.close()

