"""
Investigation: Why aren't filter options populating in browser?

Steps to trace:
1. Check if Hono requests /api/pages/public/cc when page loads
2. Check what data DataTable actually receives in browser
3. Check if useEffect is running
4. Check if /api/data/execute is being called
"""

import requests
import json

print("=" * 70)
print("INVESTIGATION: Filter Options Not Populating in Browser")
print("=" * 70)

# Step 1: Check what FastAPI returns
print("\n[1] Checking FastAPI /api/pages/public/cc response...")
response = requests.get('http://127.0.0.1:8000/api/pages/public/cc')

if response.status_code != 200:
    print(f"❌ FastAPI Error: {response.status_code}")
    exit(1)

page = response.json()['data']
layout = page.get('layoutData', {})
components = layout.get('content', [])

dt = next((c for c in components if c.get('type') == 'DataTable'), None)

if not dt:
    print("❌ No DataTable in response")
    exit(1)

binding = dt.get('binding', {})
filters = binding.get('frontendFilters', [])

print(f"✅ FastAPI returns {len(filters)} filters")

for i, f in enumerate(filters):
    col = f.get('column')
    has_opts = 'optionsDataRequest' in f
    print(f"   Filter {i+1}: {col}")
    print(f"      Has optionsDataRequest: {has_opts}")

# Step 2: Check if Hono is serving the page
print("\n[2] Checking if Hono serves page at http://localhost:3002/cc...")
try:
    hono_resp = requests.get('http://localhost:3002/cc')
    if hono_resp.status_code == 200:
        print(f"✅ Hono returns page (Status: {hono_resp.status_code})")
        
        # Check if page has window.__PAGE_DATA__
        if '__PAGE_DATA__' in hono_resp.text:
            print("   ✅ Page contains __PAGE_DATA__ script")
        else:
            print("   ❌ Page missing __PAGE_DATA__ script")
        
        # Extract __PAGE_DATA__ from HTML
        import re
        match = re.search(r'window\.__PAGE_DATA__\s*=\s*({[^;]+});', hono_resp.text)
        if match:
            page_data_str = match.group(1)
            try:
                page_data = json.loads(page_data_str)
                
                if 'layoutData' in page_data:
                    layout = page_data['layoutData']
                    dt_in_html = next((c for c in layout.get('content', []) if c.get('type') == 'DataTable'), None)
                    
                    if dt_in_html and 'binding' in dt_in_html:
                        filters_in_html = dt_in_html['binding'].get('frontendFilters', [])
                        print(f"   📊 Filters in HTML: {len(filters_in_html)}")
                        
                        for i, f in enumerate(filters_in_html):
                            has_opts = 'optionsDataRequest' in f
                            print(f"      Filter {i+1}: {f.get('column')} - optionsDataRequest: {has_opts}")
                    else:
                        print("   ❌ No DataTable binding in __PAGE_DATA__")
                else:
                    print("   ❌ No layoutData in __PAGE_DATA__")
            except Exception as e:
                print(f"   ❌ Failed to parse __PAGE_DATA__: {e}")
        else:
            print("   ❌ Could not extract __PAGE_DATA__ from HTML")
    else:
        print(f"❌ Hono error: {hono_resp.status_code}")
except Exception as e:
    print(f"❌ Cannot connect to Hono: {e}")

# Step 3: Analysis
print("\n[3] Root Cause Analysis:")
print("-" * 70)

if len(filters) > 0 and all('optionsDataRequest' in f for f in filters):
    print("✅ FastAPI generates optionsDataRequest correctly")
else:
    print("❌ FastAPI problem: optionsDataRequest not generated")

print("\nPossible issues:")
print("1. Hono caches old page data (without optionsDataRequest)")
print("2. Hono doesn't call /api/pages/public/cc (uses local storage)")
print("3. DataTable.tsx useEffect not running")
print("4. /api/data/execute endpoint broken")
print("\nNext: Check browser DevTools Console for errors")
