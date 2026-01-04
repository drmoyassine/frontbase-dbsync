import requests
import json

# SupaDB Local ID
DATASOURCE_ID = "75bdfec7-71f6-4613-8854-a318cb3f0016"
TABLE = "activities"

url = f"http://localhost:8000/api/sync/datasources/{DATASOURCE_ID}/tables/{TABLE}/data"
params = {"limit": 1, "select": "*,contacts(*)"}

print(f"Testing: {TABLE}")
print(f"Select: {params['select']}")

response = requests.get(url, params=params, timeout=30)
print(f"Status: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    records = data.get("records", [])
    if records:
        first = records[0]
        print(f"\nAll keys in response ({len(first.keys())} keys):")
        for k in sorted(first.keys()):
            val = first[k]
            if '.' in k or 'contact' in k.lower():
                print(f"  * {k}: {val}")
