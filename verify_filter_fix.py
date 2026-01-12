import requests
import json

# Force fresh request
r = requests.get('http://127.0.0.1:8000/api/pages/public/cc', 
                 headers={'Cache-Control': 'no-cache'})
page = r.json()['data']
dt = [c for c in page['layoutData']['content'] if c.get('type')=='DataTable'][0]
binding = dt.get('binding', {})

print("="*60)
print("FILTER OPTIONS REQUEST VERIFICATION")
print("="*60)
print(f"tableName in binding: {binding.get('tableName')}")
print()

filters = binding.get('frontendFilters', [])
print(f"Total filters: {len(filters)}")
print()

for i, f in enumerate(filters):
    col = f.get('column')
    opts_req = f.get('optionsDataRequest', {})
    body = opts_req.get('body', {})
    print(f"Filter {i+1}: column='{col}'")
    print(f"  target_table: '{body.get('target_table')}'")
    print(f"  target_col:   '{body.get('target_col')}'")
    print(f"  CORRECT: {body.get('target_col') == col.split('.')[-1] if col else 'N/A'}")
    print()
