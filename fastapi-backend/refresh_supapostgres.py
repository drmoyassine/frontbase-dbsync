import requests

# Get the SupaPostgres datasource ID
import sqlite3
conn = sqlite3.connect('unified.db')
cursor = conn.execute("SELECT id, name FROM datasources WHERE LOWER(name) LIKE '%supa%'")
ds = cursor.fetchone()

if ds:
    DATASOURCE_ID = ds[0]
    print(f"Refreshing schema for: {ds[1]} ({DATASOURCE_ID})")
    
    # Call the relationships endpoint with refresh=true
    url = f"http://localhost:8000/api/sync/datasources/{DATASOURCE_ID}/relationships"
    params = {"refresh": "true"}
    
    print(f"GET {url}?refresh=true")
    response = requests.get(url, params=params, timeout=120)  # Long timeout for discovery
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Tables: {len(data.get('tables', []))}")
        print(f"Relationships: {len(data.get('relationships', []))}")
        
        # Show first few relationships
        for rel in data.get('relationships', [])[:3]:
            print(f"  {rel['source_table']}.{rel['source_column']} -> {rel['target_table']}.{rel['target_column']}")
    else:
        print(f"Error: {response.text[:300]}")
