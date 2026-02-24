"""Add edge_databases table and edge_db_id to deployment_targets

Revision ID: 0018_add_edge_databases
Revises: 0017_add_deployment_targets
Create Date: 2026-02-24

Creates the edge_databases table for named edge DB connections (Turso, Neon, etc.).
Adds edge_db_id foreign key to deployment_targets so each target can reference
which edge database it uses.

Pre-seeds "Local SQLite" EdgeDatabase and "Local Edge" DeploymentTarget for
self-hosted mode. These are marked is_system=True and cannot be deleted.

Migrates existing Turso config from settings.json into an EdgeDatabase row.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
import json
import os
import uuid


# revision identifiers, used by Alembic.
revision = '0018_add_edge_databases'
down_revision = '0017_add_deployment_targets'
branch_labels = None
depends_on = None

# Fixed UUIDs for system entries (stable across migrations)
LOCAL_SQLITE_DB_ID = "00000000-0000-0000-0000-000000000001"
LOCAL_EDGE_TARGET_ID = "00000000-0000-0000-0000-000000000002"


def upgrade():
    """Create edge_databases table and add FK to deployment_targets."""
    conn = op.get_bind()
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    # 1. Create edge_databases table
    if 'edge_databases' not in tables:
        op.create_table('edge_databases',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('provider', sa.String(50), nullable=False),
            sa.Column('db_url', sa.String(500), nullable=False),
            sa.Column('db_token', sa.String(1000), nullable=True),
            sa.Column('is_default', sa.Boolean(), server_default='0'),
            sa.Column('is_system', sa.Boolean(), server_default='0'),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
        )

    # 2. Add columns to deployment_targets (if not exists)
    if 'deployment_targets' in tables:
        columns = [c['name'] for c in inspector.get_columns('deployment_targets')]
        if 'edge_db_id' not in columns:
            op.add_column('deployment_targets',
                sa.Column('edge_db_id', sa.String(36), nullable=True)
            )
        if 'is_system' not in columns:
            op.add_column('deployment_targets',
                sa.Column('is_system', sa.Boolean(), server_default='0')
            )

    # 3. Pre-seed local self-hosted entries
    _seed_local_entries(conn)

    # 4. Migrate existing Turso settings → EdgeDatabase row
    _migrate_turso_settings(conn)


def _seed_local_entries(conn):
    """Pre-seed Local SQLite EdgeDatabase + Local Edge DeploymentTarget."""
    from datetime import datetime
    now = datetime.utcnow().isoformat() + "Z"

    # Check if already seeded
    result = conn.execute(
        sa.text("SELECT id FROM edge_databases WHERE id = :id"),
        {"id": LOCAL_SQLITE_DB_ID}
    )
    if result.fetchone():
        return  # Already seeded

    edge_url = os.getenv("EDGE_URL", "http://localhost:3002")

    # Insert Local SQLite EdgeDatabase
    conn.execute(
        sa.text(
            "INSERT INTO edge_databases (id, name, provider, db_url, db_token, is_default, is_system, created_at, updated_at) "
            "VALUES (:id, :name, :provider, :db_url, '', 1, 1, :created_at, :updated_at)"
        ),
        {
            "id": LOCAL_SQLITE_DB_ID,
            "name": "Local SQLite",
            "provider": "sqlite",
            "db_url": "file:local",
            "created_at": now,
            "updated_at": now,
        }
    )

    # Insert Local Edge DeploymentTarget
    conn.execute(
        sa.text(
            "INSERT INTO deployment_targets (id, name, provider, adapter_type, url, edge_db_id, is_active, is_system, created_at, updated_at) "
            "VALUES (:id, :name, :provider, :adapter_type, :url, :edge_db_id, 1, 1, :created_at, :updated_at)"
        ),
        {
            "id": LOCAL_EDGE_TARGET_ID,
            "name": "Local Edge",
            "provider": "docker",
            "adapter_type": "full",
            "url": edge_url,
            "edge_db_id": LOCAL_SQLITE_DB_ID,
            "created_at": now,
            "updated_at": now,
        }
    )

    print(f"[Migration] Pre-seeded Local SQLite + Local Edge (self-hosted defaults)")


def _migrate_turso_settings(conn):
    """Read Turso settings from settings.json and create an EdgeDatabase row."""
    settings_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        'settings.json'
    )
    
    if not os.path.exists(settings_path):
        return
    
    try:
        with open(settings_path, 'r') as f:
            settings = json.load(f)
    except (json.JSONDecodeError, IOError):
        return
    
    turso = settings.get('turso', {})
    turso_url = turso.get('turso_url')
    turso_token = turso.get('turso_token')
    
    if not turso_url:
        return
    
    from datetime import datetime
    now = datetime.utcnow().isoformat() + "Z"
    db_id = str(uuid.uuid4())
    
    # Insert the EdgeDatabase row
    conn.execute(
        sa.text(
            "INSERT INTO edge_databases (id, name, provider, db_url, db_token, is_default, is_system, created_at, updated_at) "
            "VALUES (:id, :name, :provider, :db_url, :db_token, 0, 0, :created_at, :updated_at)"
        ),
        {
            "id": db_id,
            "name": "Default Turso",
            "provider": "turso",
            "db_url": turso_url,
            "db_token": turso_token or "",
            "created_at": now,
            "updated_at": now,
        }
    )
    
    # Update non-system deployment targets to reference this DB
    conn.execute(
        sa.text("UPDATE deployment_targets SET edge_db_id = :db_id WHERE is_system = 0 AND edge_db_id IS NULL"),
        {"db_id": db_id}
    )
    
    print(f"[Migration] Migrated Turso settings to EdgeDatabase '{db_id}' (Default Turso)")


def downgrade():
    """Remove edge_db_id and is_system from deployment_targets, drop edge_databases."""
    op.drop_column('deployment_targets', 'edge_db_id')
    op.drop_column('deployment_targets', 'is_system')
    op.drop_table('edge_databases')
