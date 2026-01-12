"""
Test the /api/pages/public/cc endpoint to see if optionsDataRequest is now generated
"""
import requests
import json

response = requests.get('http://127.0.0.1:8000/api/pages/public/cc')

if response.status_code != 200:
    print(f"❌ Error: {response.status_code}")
    print(response.text)
    exit(1)

page = response.json()['data']
layout = page.get('layoutData', {})
components = layout.get('content', [])

dt = next((c for c in components if c.get('type') == 'DataTable'), None)

if not dt:
    print("❌ No DataTable found")
    exit(1)

print("✅ Found DataTable\n")

binding = dt.get('binding', {})
filters = binding.get('frontendFilters', [])

print(f"Datasource ID: {binding.get('datasourceId', 'MISSING')}")
print(f"Total filters: {len(filters)}\n")

for i, f in enumerate(filters):
    col = f.get('column')
    ftype = f.get('filterType')
    
    print(f"Filter {i+1}: {col} ({ftype})")
    
    if 'optionsDataRequest' in f:
        print(f"  ✅ HAS optionsDataRequest")
        req = f['optionsDataRequest']
        print(f"     URL: {req.get('url', 'N/A')}")
        print(f"     Body: {req.get('body', {})}")
    else:
        print(f"  ❌ MISSING optionsDataRequest")
    print()
