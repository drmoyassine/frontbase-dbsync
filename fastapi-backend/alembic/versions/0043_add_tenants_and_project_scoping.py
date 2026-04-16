"""Add tenants table, tenant_members table, tenant_id on project, project_id on pages.

This is a merge migration that merges all current heads, then adds
the tenancy tables.

Revision ID: 0043
Revises: e7f8a9b1c2d3, 0035_add_scope_to_edge_api_keys, e23b4c5d6f7a, df956eaea66f, c79d5e6983cc
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0043'
down_revision = ('e7f8a9b1c2d3', '0035_add_scope_to_edge_api_keys', 'e23b4c5d6f7a', 'df956eaea66f', 'c79d5e6983cc')
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guard: check existing tables/columns to make migration re-runnable
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- 1. Create tenants table ---
    if 'tenants' not in existing_tables:
        op.create_table(
            'tenants',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('slug', sa.String(50), unique=True, nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('plan', sa.String(20), server_default='free'),
            sa.Column('status', sa.String(20), server_default='active'),
            sa.Column('settings', sa.Text(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('updated_at', sa.String(), nullable=False),
        )

    # --- 2. Create tenant_members table ---
    if 'tenant_members' not in existing_tables:
        op.create_table(
            'tenant_members',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('tenant_id', sa.String(), sa.ForeignKey('tenants.id'), nullable=False),
            sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('role', sa.String(20), server_default='owner'),
            sa.Column('created_at', sa.String(), nullable=False),
        )

    # --- 3. Add tenant_id to project table ---
    if 'project' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('project')]
        if 'tenant_id' not in columns:
            with op.batch_alter_table('project', schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column('tenant_id', sa.String(), nullable=True)
                )
                batch_op.create_foreign_key(
                    'fk_project_tenant_id', 'tenants', ['tenant_id'], ['id']
                )

    # --- 4. Add project_id to pages table ---
    if 'pages' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('pages')]
        if 'project_id' not in columns:
            with op.batch_alter_table('pages', schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column('project_id', sa.String(), nullable=True)
                )
                batch_op.create_foreign_key(
                    'fk_pages_project_id', 'project', ['project_id'], ['id']
                )


def downgrade() -> None:
    # Remove columns first (batch mode for SQLite compat)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'pages' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('pages')]
        if 'project_id' in columns:
            with op.batch_alter_table('pages', schema=None) as batch_op:
                batch_op.drop_column('project_id')

    if 'project' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('project')]
        if 'tenant_id' in columns:
            with op.batch_alter_table('project', schema=None) as batch_op:
                batch_op.drop_column('tenant_id')

    if 'tenant_members' in existing_tables:
        op.drop_table('tenant_members')

    if 'tenants' in existing_tables:
        op.drop_table('tenants')
