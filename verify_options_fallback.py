
import sqlite3
import os
import sys

def verify_fallback():
    # 1. Connect to unified.db
    db_path = os.path.join(os.getcwd(), 'fastapi-backend', 'unified.db')
    print(f"DB Path: {db_path}")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    # 2. Fetch all datasources (simulating get_datasources_for_publish)
    datasources = conn.execute("SELECT * FROM datasources WHERE is_active = 1").fetchall()
    print(f"Found {len(datasources)} active datasources")
    
    if not datasources:
        print("❌ No active datasources found!")
        return

    # 3. Simulate Logic: Binding has NO datasourceId
    # So we pick the first one
    ds = datasources[0]
    print(f"Fallback Datasource: {ds['name']} (ID: {ds['id']})")
    
    # 4. Check Credentials
    api_url = ds['api_url']
    anon_key = ds['anon_key_encrypted'] # Assuming this is the key column
    
    print(f"API URL: {api_url}")
    print(f"Anon Key Length: {len(anon_key) if anon_key else 0}")
    
    if not api_url or not anon_key:
        print("❌ Missing credentials in fallback datasource!")
        return

    print("✅ Credentials found in fallback datasource")
    
    # 5. Simulate Request Construction using these credentials
    # This matches verify_options_rpc.py but uses the FOUND credentials
    import requests
    
    rpc_url = f"{api_url}/rest/v1/rpc/frontbase_get_distinct_values"
    payload = {
        "target_table": "institutions",
        "target_col": "name"
    }
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json"
    }
    
    print(f"\n--- Testing RPC with Fallback Credentials ---")
    try:
        response = requests.post(rpc_url, json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}...")
        
        if response.status_code == 200:
            print("✅ RPC Success!")
        else:
            print("❌ RPC Failed")
            
    except Exception as e:
        print(f"❌ Network Error: {e}")

if __name__ == "__main__":
    verify_fallback()
