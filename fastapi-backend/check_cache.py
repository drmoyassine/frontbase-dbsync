import sqlite3
import json

conn = sqlite3.connect('unified.db')

# Get SupaDB datasource
cursor = conn.execute("SELECT id FROM datasources WHERE LOWER(name) LIKE '%supa%'")
DATASOURCE_ID = cursor.fetchone()[0]

# Check activities table FKs
cursor = conn.execute("""
    SELECT foreign_keys FROM table_schema_cache 
    WHERE datasource_id = ? AND table_name = 'activities'
""", (DATASOURCE_ID,))
row = cursor.fetchone()

if row:
    fks = json.loads(row[0]) if row[0] else []
    print(f"activities table FKs: {len(fks)}")
    for fk in fks:
        print(f"  {fk}")
else:
    print("activities table not found in cache")
