"""
Check exactly what FastAPI returns when Hono requests a page.
This simulates what Hono sees.
"""
import requests
import json

# Simulate Hono's request to FastAPI
fastapi_url = "http://127.0.0.1:8000/api/pages/public/institutions"

response = requests.get(fastapi_url)
print(f"Status: {response.status_code}\n")

if response.status_code != 200:
    print(f"Error: {response.text}")
    exit(1)

data = response.json()
if not data.get('success'):
    print(f"API Error: {data}")
    exit(1)

page = data['data']
layout = page['layoutData']
components = layout.get('components', [])

# Find DataTable
dt = None
for comp in components:
    if comp.get('type') == 'datatable':
        dt = comp
        break

if not dt:
    print("❌ No DataTable found")
    exit(1)

print("✅ Found DataTable component\n")

# Extract binding
binding = dt.get('binding') or dt.get('props', {}).get('binding')

if not binding:
    print("❌ No binding in DataTable")
    exit(1)

# Check frontendFilters
filters = binding.get('frontendFilters', [])
print(f"📊 frontendFilters count: {len(filters)}\n")

for i, f in enumerate(filters):
    print(f"Filter {i+1}:")
    print(f"  Column: {f.get('column')}")
    print(f"  Type: {f.get('filterType')}")
    print(f"  Label: {f.get('label')}")
    
    if 'optionsDataRequest' in f:
        print(f"  ✅ HAS optionsDataRequest")
        req = f['optionsDataRequest']
        print(f"     URL: {req.get('url')}")
        print(f"     Body: {req.get('body')}")
    else:
        print(f"  ❌ MISSING optionsDataRequest")
    
    print()

# Check if dataRequest exists at all
if 'dataRequest' in binding:
    print("✅ Main dataRequest found")
    dr = binding['dataRequest']
    print(f"   URL: {dr.get('url', 'N/A')[:60]}...")
else:
    print("❌ No dataRequest in binding")
