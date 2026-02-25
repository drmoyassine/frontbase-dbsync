"""Ensure edge_databases and deployment_targets exist locally for dev."""
import sqlite3, uuid, os
from datetime import datetime

db_path = os.path.join(os.path.dirname(__file__), 'frontbase.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Check existing tables
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print(f"Existing tables: {tables}")

# Create edge_databases if missing
if 'edge_databases' not in tables:
    c.execute("""
    CREATE TABLE edge_databases (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        db_url VARCHAR(500) NOT NULL,
        db_token VARCHAR(1000),
        is_default BOOLEAN DEFAULT 0,
        is_system BOOLEAN DEFAULT 0,
        created_at VARCHAR NOT NULL,
        updated_at VARCHAR NOT NULL
    )""")
    print("Created edge_databases table")

# Create deployment_targets if missing
if 'deployment_targets' not in tables:
    c.execute("""
    CREATE TABLE deployment_targets (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        adapter_type VARCHAR(50) DEFAULT 'full',
        url VARCHAR(500) NOT NULL,
        edge_db_id VARCHAR(36) REFERENCES edge_databases(id),
        is_active BOOLEAN DEFAULT 1,
        is_system BOOLEAN DEFAULT 0,
        created_at VARCHAR NOT NULL,
        updated_at VARCHAR NOT NULL
    )""")
    print("Created deployment_targets table")

# Pre-seed system entries if missing
LOCAL_DB_ID = "00000000-0000-0000-0000-000000000001"
LOCAL_TARGET_ID = "00000000-0000-0000-0000-000000000002"
now = datetime.utcnow().isoformat() + "Z"

c.execute("SELECT id FROM edge_databases WHERE id = ?", (LOCAL_DB_ID,))
if not c.fetchone():
    c.execute(
        "INSERT INTO edge_databases (id, name, provider, db_url, db_token, is_default, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, '', 1, 1, ?, ?)",
        (LOCAL_DB_ID, "Local SQLite", "sqlite", "file:local", now, now)
    )
    print("Seeded Local SQLite edge database")

c.execute("SELECT id FROM deployment_targets WHERE id = ?", (LOCAL_TARGET_ID,))
if not c.fetchone():
    edge_url = os.getenv("EDGE_URL", "http://localhost:3002")
    c.execute(
        "INSERT INTO deployment_targets (id, name, provider, adapter_type, url, edge_db_id, is_active, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)",
        (LOCAL_TARGET_ID, "Local Edge", "docker", "full", edge_url, LOCAL_DB_ID, now, now)
    )
    print("Seeded Local Edge deployment target")

conn.commit()

# Verify
c.execute("SELECT id, name, provider FROM edge_databases")
print(f"Edge databases: {c.fetchall()}")
c.execute("SELECT id, name, provider FROM deployment_targets")
print(f"Deployment targets: {c.fetchall()}")

conn.close()
print("Done!")
