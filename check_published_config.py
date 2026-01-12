import sqlite3
import json

conn = sqlite3.connect('services/actions/data/pages.db')
row = conn.execute('SELECT config FROM pages LIMIT 1').fetchone()

if not row:
    print("No pages found")
    exit()

config = json.loads(row[0])
components = config['layout']['components']

dt = None
for c in components:
    if c.get('type') == 'datatable':
        dt = c
        break

if not dt:
    print("No DataTable found")
    exit()

binding = dt.get('binding') or dt.get('props', {}).get('binding', {})
filters = binding.get('frontendFilters', [])

print(f"Total filters: {len(filters)}")

for i, f in enumerate(filters):
    col = f.get('column', 'N/A')
    has_opts = 'optionsDataRequest' in f
    print(f"Filter {i+1}: {col} - Has optionsDataRequest: {has_opts}")
    
    if has_opts:
        req = f['optionsDataRequest']
        print(f"  URL: {req.get('url', '')}")
        print(f"  Body: {req.get('body', {})}")
