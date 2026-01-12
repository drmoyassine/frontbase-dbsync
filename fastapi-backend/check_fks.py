import sqlite3
import json

conn = sqlite3.connect('unified.db')
rows = conn.execute("SELECT datasource_id, table_name, foreign_keys FROM table_schema_cache WHERE table_name = 'institutions'").fetchall()
for ds_id, table_name, fks in rows:
    fk_list = json.loads(fks) if fks else []
    print(f"DS: {ds_id}")
    print(f"  FKs: {fk_list}")
conn.close()
