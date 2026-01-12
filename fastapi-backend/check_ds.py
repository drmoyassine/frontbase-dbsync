import requests
import json

resp = requests.get("http://localhost:8000/api/pages/59d2db58-574b-4189-8b0d-a50cb1e4b4b2")
data = resp.json()

# Get all keys in page data
page_data = data.get('data', {})
print(f"Keys in page: {list(page_data.keys())}")

# Check binding for datasource_id
layout = page_data.get('layoutData', {})
components = layout.get('content', [])
if components:
    binding = components[0].get('props', {}).get('binding', {})
    print(f"Binding datasourceId: {binding.get('datasourceId')}")
    print(f"Binding tableName: {binding.get('tableName')}")
