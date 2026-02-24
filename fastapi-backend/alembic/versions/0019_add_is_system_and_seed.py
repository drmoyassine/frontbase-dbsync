"""Add is_system column to edge_databases and deployment_targets, seed local defaults

Revision ID: 0019_add_is_system_and_seed
Revises: 0018_add_edge_databases
Create Date: 2026-02-25

Adds is_system boolean to both tables and pre-seeds Local SQLite + Local Edge
for self-hosted mode. These system entries cannot be deleted by the user.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
import os


# revision identifiers, used by Alembic.
revision = '0019_add_is_system_and_seed'
down_revision = '0018_add_edge_databases'
branch_labels = None
depends_on = None

# Fixed UUIDs for system entries
LOCAL_SQLITE_DB_ID = "00000000-0000-0000-0000-000000000001"
LOCAL_EDGE_TARGET_ID = "00000000-0000-0000-0000-000000000002"


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    # 1. Add is_system to edge_databases (if missing)
    edge_cols = [c['name'] for c in inspector.get_columns('edge_databases')]
    if 'is_system' not in edge_cols:
        op.add_column('edge_databases',
            sa.Column('is_system', sa.Boolean(), server_default='0')
        )

    # 2. Add is_system to deployment_targets (if missing)
    target_cols = [c['name'] for c in inspector.get_columns('deployment_targets')]
    if 'is_system' not in target_cols:
        op.add_column('deployment_targets',
            sa.Column('is_system', sa.Boolean(), server_default='0')
        )

    # 3. Seed system entries
    _seed_local_entries(conn)


def _seed_local_entries(conn):
    from datetime import datetime
    now = datetime.utcnow().isoformat() + "Z"

    inspector = inspect(conn)

    # Check if already seeded
    result = conn.execute(
        sa.text("SELECT id FROM edge_databases WHERE id = :id"),
        {"id": LOCAL_SQLITE_DB_ID}
    )
    if result.fetchone():
        # Already exists - just ensure is_system is set
        conn.execute(
            sa.text("UPDATE edge_databases SET is_system = 1 WHERE id = :id"),
            {"id": LOCAL_SQLITE_DB_ID}
        )
        # Only update deployment_targets if the row exists
        conn.execute(
            sa.text("UPDATE deployment_targets SET is_system = 1 WHERE id = :id"),
            {"id": LOCAL_EDGE_TARGET_ID}
        )
        print("[Migration 0019] Marked existing local entries as is_system=True")
        return

    edge_url = os.getenv("EDGE_URL", "http://localhost:3002")

    # Insert Local SQLite EdgeDatabase
    conn.execute(
        sa.text(
            "INSERT INTO edge_databases (id, name, provider, db_url, db_token, is_default, is_system, created_at, updated_at) "
            "VALUES (:id, :name, :provider, :db_url, '', 1, 1, :ts, :ts)"
        ),
        {"id": LOCAL_SQLITE_DB_ID, "name": "Local SQLite", "provider": "sqlite", "db_url": "file:local", "ts": now}
    )

    # Insert Local Edge DeploymentTarget — check which columns exist
    target_cols = [c['name'] for c in inspector.get_columns('deployment_targets')]
    has_edge_db = 'edge_db_id' in target_cols

    if has_edge_db:
        conn.execute(
            sa.text(
                "INSERT INTO deployment_targets (id, name, provider, adapter_type, url, edge_db_id, is_active, is_system, created_at, updated_at) "
                "VALUES (:id, :name, :provider, :adapter, :url, :edge_db_id, 1, 1, :ts, :ts)"
            ),
            {"id": LOCAL_EDGE_TARGET_ID, "name": "Local Edge", "provider": "docker",
             "adapter": "full", "url": edge_url, "edge_db_id": LOCAL_SQLITE_DB_ID, "ts": now}
        )
    else:
        conn.execute(
            sa.text(
                "INSERT INTO deployment_targets (id, name, provider, adapter_type, url, is_active, is_system, created_at, updated_at) "
                "VALUES (:id, :name, :provider, :adapter, :url, 1, 1, :ts, :ts)"
            ),
            {"id": LOCAL_EDGE_TARGET_ID, "name": "Local Edge", "provider": "docker",
             "adapter": "full", "url": edge_url, "ts": now}
        )

    print("[Migration 0019] Seeded Local SQLite + Local Edge (self-hosted defaults)")


def downgrade():
    op.drop_column('deployment_targets', 'is_system')
    op.drop_column('edge_databases', 'is_system')
