import requests, json

r = requests.get('http://127.0.0.1:8000/api/pages/public/cc')
page = r.json()['data']
dt = [c for c in page['layoutData']['content'] if c.get('type')=='DataTable'][0]
binding = dt.get('binding', {})

print('Full binding:')
print(json.dumps(binding, indent=2))
