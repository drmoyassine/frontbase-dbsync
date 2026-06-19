"""Multi-project: project flags, project_members + grant tables, tenant_addons, invite project_ids.

Revision ID: 0048
Revises: 0047
Create Date: 2026-06-19

Note: at runtime, Base.metadata.create_all creates the new tables and
app.services.project_setup.ensure_multiproject_schema adds the columns to existing
`project` / `tenant_invites` tables. This migration is the prod/audit record (and
helps DBs managed via alembic).
"""
from alembic import op
import sqlalchemy as sa

revision = '0048'
down_revision = '0047'
branch_labels = None
depends_on = None

_NEW_TABLES = {
    'project_members': [
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('role', sa.String(length=20), server_default='viewer'),
        sa.Column('created_at', sa.String(), nullable=False),
    ],
    'project_datasources': [
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('datasource_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
    ],
    'project_storage': [
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('storage_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
    ],
    'project_connected_accounts': [
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('account_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=False),
    ],
    'tenant_addons': [
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('tenant_id', sa.String(), nullable=False),
        sa.Column('addon_type', sa.String(length=40), nullable=False),
        sa.Column('quantity', sa.Integer(), server_default='1'),
        sa.Column('status', sa.String(length=20), server_default='pending'),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
    ],
}


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()

    # New tables
    for name, cols in _NEW_TABLES.items():
        if name not in existing:
            op.create_table(name, *cols)

    # Columns on existing tables
    if 'project' in existing:
        pcols = [c['name'] for c in inspector.get_columns('project')]
        with op.batch_alter_table('project', schema=None) as batch_op:
            if 'is_default' not in pcols:
                batch_op.add_column(sa.Column('is_default', sa.Boolean(), server_default='0'))
            if 'status' not in pcols:
                batch_op.add_column(sa.Column('status', sa.String(length=20), server_default='active'))
            if 'created_by' not in pcols:
                batch_op.add_column(sa.Column('created_by', sa.String(), nullable=True))

    if 'tenant_invites' in existing:
        icols = [c['name'] for c in inspector.get_columns('tenant_invites')]
        if 'project_ids' not in icols:
            with op.batch_alter_table('tenant_invites', schema=None) as batch_op:
                batch_op.add_column(sa.Column('project_ids', sa.Text(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()
    for name in reversed(list(_NEW_TABLES.keys())):
        if name in existing:
            op.drop_table(name)
