import requests, json

r = requests.get('http://127.0.0.1:8000/api/pages/public/cc')
page = r.json()['data']
dt = [c for c in page['layoutData']['content'] if c.get('type')=='DataTable'][0]
binding = dt.get('binding', {})

print('tableName in binding:', binding.get('tableName'))
print()

for f in binding.get('frontendFilters', []):
    col = f.get('column')
    opts_req = f.get('optionsDataRequest', {})
    body = opts_req.get('body', {})
    print(f"Filter: {col}")
    print(f"  target_table: {body.get('target_table')}")
    print(f"  target_col: {body.get('target_col')}")
    print()
