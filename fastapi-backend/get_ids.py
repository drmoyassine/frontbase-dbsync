import sqlite3
conn = sqlite3.connect('unified.db')
cursor = conn.execute("SELECT id, name, type FROM datasources")
for row in cursor:
    print(f"{row[0]} | {row[1]} | {row[2]}")
