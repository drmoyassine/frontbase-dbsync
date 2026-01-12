
import requests
import json
import sqlite3
import os

def test_options_request():
    # 1. Get Supabase Credentials from unified.db (Simulate what pages.py does)
    db_path = os.path.join(os.getcwd(), 'fastapi-backend', 'unified.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT api_url, anon_key_encrypted FROM datasources WHERE type='supabase' LIMIT 1")
    row = cursor.fetchone()
    
    if not row:
        print("❌ No Supabase datasource found in unified.db")
        return

    api_url, anon_key = row
    
    # 2. Construct the Options Request (Simulate compute_data_request output)
    # Target: frontbase_get_distinct_values
    rpc_url = f"{api_url}/rest/v1/rpc/frontbase_get_distinct_values"
    
    # Payload for a known table/column (e.g. institutions.name or countries.country)
    # Try primary table first
    payload_primary = {
        "target_table": "institutions",
        "target_col": "name"
    }
    
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json"
    }
    
    print(f"\n--- Testing Primary Column Options (institutions.name) ---")
    print(f"URL: {rpc_url}")
    try:
        response = requests.post(rpc_url, json=payload_primary, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}...") # truncate
    except Exception as e:
        print(f"Error: {e}")

    # Try related column
    # Check if we need to split table/col
    payload_related = {
        "target_table": "countries",
        "target_col": "country"
    }
    
    print(f"\n--- Testing Related Column Options (countries.country) ---")
    try:
        response = requests.post(rpc_url, json=payload_related, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}...")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_options_request()
