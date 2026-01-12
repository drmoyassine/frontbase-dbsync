"""
Check what FastAPI returns for the 'cc' page.
"""
import requests
import json

# Get the page from FastAPI (what Hono sees)
response = requests.get('http://127.0.0.1:8000/api/pages/public/cc')

if response.status_code != 200:
    print(f"❌ Error: {response.status_code}")
    print(response.text)
    exit(1)

data = response.json()
page = data['data']
components = page['layoutData'].get('content', [])

# Find DataTable
dt = next((c for c in components if c.get('type') == 'datatable'), None)

if not dt:
    print("❌ No DataTable component found")
    exit(1)

print("✅ Found DataTable\n")

# Get binding
binding = dt.get('binding') or dt.get('props', {}).get('binding')

if not binding:
    print("❌ No binding found")
    exit(1)

# Check frontendFilters
filters = binding.get('frontendFilters', [])
print(f"📊 Total frontendFilters: {len(filters)}\n")

has_any_options_request = False

for i, f in enumerate(filters):
    col = f.get('column')
    ftype = f.get('filterType')
    label = f.get('label', col)
    
    print(f"Filter {i+1}: {label}")
    print(f"  Column: {col}")
    print(f"  Type: {ftype}")
    
    if 'optionsDataRequest' in f:
        print(f"  ✅ HAS optionsDataRequest")
        req = f['optionsDataRequest']
        print(f"     URL: {req.get('url')}")
        print(f"     Method: {req.get('method')}")
        print(f"     Body: {json.dumps(req.get('body'), indent=8)}")
        has_any_options_request = True
    else:
        print(f"  ❌ MISSING optionsDataRequest")
        if ftype in ('dropdown', 'multiselect'):
            print(f"     ⚠️  This filter type SHOULD have optionsDataRequest!")
    
    print()

if not has_any_options_request:
    print("\n🔴 CRITICAL: No filters have optionsDataRequest!")
    print("   → FastAPI is NOT generating the request objects")
    print("   → This means convert_component in pages.py isn't running")
    print("   → OR the datasource list is empty during publish")
else:
    print("\n✅ At least one filter has optionsDataRequest")
    print("   → Backend is working correctly")
    print("   → Issue must be in DataTable.tsx or browser")
