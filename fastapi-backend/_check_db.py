import sqlite3, os
db_path = "C:/app/data/frontbase.db"
print(f"File exists: {os.path.exists(db_path)}, size: {os.path.getsize(db_path) if os.path.exists(db_path) else 0}")
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print(f"Tables ({len(tables)}): {tables}")
if 'alembic_version' in tables:
    c.execute("SELECT version_num FROM alembic_version")
    print(f"Alembic version: {c.fetchall()}")
if 'edge_databases' in tables:
    c.execute("PRAGMA table_info(edge_databases)")
    cols = [r[1] for r in c.fetchall()]
    print(f"edge_databases cols: {cols}")
    c.execute("SELECT id, name, provider, is_system FROM edge_databases")
    print(f"edge_databases rows: {c.fetchall()}")
if 'deployment_targets' in tables:
    c.execute("PRAGMA table_info(deployment_targets)")
    cols = [r[1] for r in c.fetchall()]
    print(f"deployment_targets cols: {cols}")
    c.execute("SELECT id, name, provider FROM deployment_targets")
    print(f"deployment_targets rows: {c.fetchall()}")
conn.close()
