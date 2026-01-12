import sqlite3
import json

conn = sqlite3.connect('services/actions/pages.db')
row = conn.execute("SELECT layout_data FROM pages WHERE slug='cc'").fetchone()

if row:
    data = json.loads(row[0])
    content = data.get('content', [])
    if content:
        binding = content[0].get('binding', {})
        print('Stored binding keys:', list(binding.keys())[:10])
        print('Has dataRequest:', 'dataRequest' in binding)
        print('Has tableName:', 'tableName' in binding)
        print('tableName value:', binding.get('tableName'))
    else:
        print('No content array in stored data')
        print('Data keys:', data.keys())
else:
    print('No page found with slug cc')

conn.close()
