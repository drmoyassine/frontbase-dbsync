"""
Fix Problem 2: Add datasourceId to DataTable binding in database
"""
import sqlite3
import json

conn = sqlite3.connect('fastapi-backend/unified.db')

# Get the page
cursor = conn.execute("SELECT layout_data FROM pages WHERE id = '59d2db58-574b-4189-8b0d-a50cb1e4b4b2'")
row = cursor.fetchone()

if not row:
    print("❌ Page not found")
    exit(1)

layout = json.loads(row[0])

# Find DataTable and add datasourceId
updated = False
for comp in layout.get('content', []):
    if comp.get('type') == 'DataTable':
        if 'binding' not in comp:
            comp['binding'] = {}
        
        comp['binding']['datasourceId'] = 'ab497b53-1805-4cdf-b9ff-2ff76f1802c9'
        print(f"✅ Added datasourceId to DataTable")
        updated = True

if updated:
    # Save back
    conn.execute(
        "UPDATE pages SET layout_data = ? WHERE id = '59d2db58-574b-4189-8b0d-a50cb1e4b4b2'",
        (json.dumps(layout),)
    )
    conn.commit()
    print("✅ Database updated")
else:
    print("⚠️  No DataTable found to update")

conn.close()
