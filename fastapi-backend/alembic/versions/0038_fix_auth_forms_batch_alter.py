"""Fix auth_forms batch_alter_table NullType error

Revision ID: 0038_fix_auth_forms_batch_alter
Revises: 0037_consolidate_is_primary_config
Create Date: 2026-04-02

Migration 0037 fails on VPS SQLite because batch_alter_table cannot reflect
the type of created_at/updated_at columns (they were created as sa.Text()
but SQLite reflection maps them to NullType). This migration completes the
same operation (drop is_primary column) with explicit type hints so Alembic
can recreate the table correctly.

If 0037 already succeeded (is_primary column gone), this is a no-op.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import json


revision: str = '0038_fix_auth_forms_batch_alter'
down_revision: Union[str, Sequence[str], None] = '0037_consolidate_is_primary_config'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' not in inspector.get_table_names():
        return  # Table doesn't exist — nothing to do

    columns = [c['name'] for c in inspector.get_columns('auth_forms')]

    if 'is_primary' not in columns:
        return  # 0037 already succeeded — column is gone

    # 0037 failed mid-execution. Re-do the data migration + column drop.

    # 1. Data migration: ensure is_primary is copied into config JSON
    rows = conn.execute(sa.text("SELECT id, config, is_primary FROM auth_forms")).fetchall()
    for row in rows:
        try:
            config = json.loads(row.config or '{}')
        except (json.JSONDecodeError, TypeError):
            config = {}
        config['is_primary'] = bool(row.is_primary)
        conn.execute(
            sa.text("UPDATE auth_forms SET config = :config WHERE id = :id"),
            {"config": json.dumps(config), "id": row.id}
        )

    # 2. Drop the column with explicit type hints for all columns.
    #    This prevents the NullType reflection error on SQLite.
    with op.batch_alter_table('auth_forms', schema=None, table_args=[
        sa.Column('id', sa.Text(), primary_key=True),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('type', sa.Text(), nullable=False),
        sa.Column('config', sa.Text(), server_default='{}'),
        sa.Column('target_contact_type', sa.Text()),
        sa.Column('allowed_contact_types', sa.Text(), server_default='[]'),
        sa.Column('redirect_url', sa.Text()),
        sa.Column('is_active', sa.Integer(), server_default='1'),
        sa.Column('created_at', sa.Text()),
        sa.Column('updated_at', sa.Text()),
        sa.Column('is_primary', sa.Integer(), server_default='0'),
    ]) as batch_op:
        batch_op.drop_column('is_primary')


def downgrade() -> None:
    # Same as 0037 downgrade — re-add is_primary column
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' not in inspector.get_table_names():
        return

    columns = [c['name'] for c in inspector.get_columns('auth_forms')]
    if 'is_primary' in columns:
        return  # Column already exists

    with op.batch_alter_table('auth_forms', schema=None, table_args=[
        sa.Column('id', sa.Text(), primary_key=True),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('type', sa.Text(), nullable=False),
        sa.Column('config', sa.Text(), server_default='{}'),
        sa.Column('target_contact_type', sa.Text()),
        sa.Column('allowed_contact_types', sa.Text(), server_default='[]'),
        sa.Column('redirect_url', sa.Text()),
        sa.Column('is_active', sa.Integer(), server_default='1'),
        sa.Column('created_at', sa.Text()),
        sa.Column('updated_at', sa.Text()),
    ]) as batch_op:
        batch_op.add_column(
            sa.Column('is_primary', sa.Integer(), server_default='0')
        )

    # Extract is_primary from config JSON back to column
    rows = conn.execute(sa.text("SELECT id, config FROM auth_forms")).fetchall()
    for row in rows:
        try:
            config = json.loads(row.config or '{}')
        except (json.JSONDecodeError, TypeError):
            config = {}
        is_primary = 1 if config.get('is_primary') else 0
        conn.execute(
            sa.text("UPDATE auth_forms SET is_primary = :val WHERE id = :id"),
            {"val": is_primary, "id": row.id}
        )
