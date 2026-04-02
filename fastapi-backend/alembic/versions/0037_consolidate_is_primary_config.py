"""Consolidate is_primary into config JSON blob

Revision ID: 0037_consolidate_is_primary_config
Revises: 0036_add_is_primary_auth_forms
Create Date: 2026-03-27

Migrates is_primary column value into the config JSON blob for each auth form,
then drops the is_primary column. This consolidates boolean flags into the
config JSON to avoid future migrations for new flags (e.g. is_embeddable).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import json


revision: str = '0037_consolidate_is_primary_config'
down_revision: Union[str, Sequence[str], None] = '0036_add_is_primary_auth_forms'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' not in inspector.get_table_names():
        return  # Table doesn't exist yet

    columns = [c['name'] for c in inspector.get_columns('auth_forms')]

    if 'is_primary' not in columns:
        return  # Already migrated or column never existed

    # 1. Data migration: copy is_primary value into config JSON (Python-side, dialect-safe)
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

    # 2. Drop the column (batch mode required for SQLite)
    #    Explicit table_args needed because SQLite reflection maps Text columns
    #    to NullType when created outside Alembic (e.g., via 0001's if-not-exists guard).
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
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' not in inspector.get_table_names():
        return

    columns = [c['name'] for c in inspector.get_columns('auth_forms')]
    if 'is_primary' in columns:
        return  # Column already exists

    # 1. Re-add column
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

    # 2. Extract is_primary from config JSON back to column
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
