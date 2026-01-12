import requests
import json

r = requests.get('http://127.0.0.1:8000/api/pages/public/cc')
page = r.json()['data']
dt = [c for c in page['layoutData']['content'] if c.get('type') == 'DataTable'][0]
filters = dt['binding'].get('frontendFilters', [])

print(f"Total filters: {len(filters)}\n")

for i, f in enumerate(filters):
    col = f.get('column')
    has_opts = 'optionsDataRequest' in f
    print(f"Filter {i+1}: {col}")
    print(f"  Has optionsDataRequest: {has_opts}")
    
    if has_opts:
        print(f"  URL: {f['optionsDataRequest'].get('url')}")
        print(f"  Body: {f['optionsDataRequest'].get('body')}")
    print()
