"""Test what /api/data/execute returns for filter options"""
import requests
import json

# First get the optionsDataRequest from the page
r = requests.get('http://127.0.0.1:8000/api/pages/public/cc')
page = r.json()['data']
dt = [c for c in page['layoutData']['content'] if c.get('type')=='DataTable'][0]
binding = dt.get('binding', {})
filters = binding.get('frontendFilters', [])

print("Testing filter options requests via Hono /api/data/execute\n")

for f in filters:
    col = f.get('column')
    opts_req = f.get('optionsDataRequest')
    
    if opts_req:
        print(f"Filter: {col}")
        print(f"  Request URL: {opts_req.get('url', '')[:60]}...")
        print(f"  Body: {opts_req.get('body')}")
        
        # Call Hono's /api/data/execute
        try:
            resp = requests.post('http://localhost:3002/api/data/execute', 
                json={'dataRequest': opts_req},
                timeout=5
            )
            print(f"  Response Status: {resp.status_code}")
            
            if resp.status_code == 200:
                result = resp.json()
                print(f"  Success: {result.get('success')}")
                
                data = result.get('data', [])
                if isinstance(data, list):
                    print(f"  Data type: list, length: {len(data)}")
                    if len(data) > 0:
                        print(f"  First 3 items: {data[:3]}")
                        print(f"  First item type: {type(data[0])}")
                else:
                    print(f"  Data type: {type(data)}")
                    print(f"  Data preview: {str(data)[:100]}")
            else:
                print(f"  Error: {resp.text[:200]}")
        except Exception as e:
            print(f"  Request failed: {e}")
        print()
