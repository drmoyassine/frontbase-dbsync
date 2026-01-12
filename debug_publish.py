"""Debug publish payload to find null values"""
import requests
import json

# Trigger publish and capture the error
r = requests.post('http://127.0.0.1:8000/api/pages/59d2db58-574b-4189-8b0d-a50cb1e4b4b2/publish/')
result = r.json()

print("="*60)
print("PUBLISH ERROR DETAILS")
print("="*60)
print(f"Success: {result.get('success')}")
print(f"Error: {result.get('error')}")
print()
print("Full validation errors:")
details = result.get('details', '')
if isinstance(details, str):
    try:
        details = json.loads(details)
    except:
        pass

if isinstance(details, dict) and 'details' in details:
    for err in details.get('details', []):
        print(f"  - Path: {err.get('path')}")
        print(f"    Message: {err.get('message')}")
        print()
elif isinstance(details, list):
    for err in details:
        print(f"  - Path: {err.get('path')}")
        print(f"    Message: {err.get('message')}")
        print()
else:
    print(details)
