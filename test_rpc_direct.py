"""Test the RPC directly to understand what it returns"""
import requests

# Get datasource info first
r = requests.get('http://127.0.0.1:8000/api/pages/public/cc')
page = r.json()['data']
ds = page.get('datasources', [{}])[0] if page.get('datasources') else {}

ds_url = ds.get('url', 'https://uwzosvgxeyovuzdmijou.supabase.co')
anon_key = ds.get('anonKey', '')

print(f"Datasource URL: {ds_url}")
print()

# Test RPC for countries.country (working)
rpc_url = f"{ds_url}/rest/v1/rpc/frontbase_get_distinct_values"
body1 = {'target_table': 'countries', 'target_col': 'country'}

print("Test 1: countries.country")
r1 = requests.post(rpc_url, json=body1, headers={
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
})
print(f"Status: {r1.status_code}")
print(f"Response (first 500 chars): {r1.text[:500]}")
print()

# Test RPC for country_name (failing with 500)
body2 = {'target_table': 'institutions', 'target_col': 'country_name'}

print("Test 2: institutions.country_name")
r2 = requests.post(rpc_url, json=body2, headers={
    'apikey': anon_key,
    'Authorization': f'Bearer {anon_key}',
    'Content-Type': 'application/json'
})
print(f"Status: {r2.status_code}")
print(f"Response (first 500 chars): {r2.text[:500]}")
