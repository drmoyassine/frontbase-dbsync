"""Consolidate is_primary into config JSON blob

Revision ID: 0037_consolidate_is_primary_config
Revises: 0036_add_is_primary_auth_forms
Create Date: 2026-03-27

Migrates is_primary column value into the config JSON blob for each auth form,
then drops the is_primary column. This consolidates boolean flags into the
config JSON to avoid future migrations for new flags (e.g. is_embeddable).

Uses raw SQL for the column drop instead of batch_alter_table to avoid
SQLite NullType reflection issues (created_at/updated_at columns created
via 0001's if-not-exists guard reflect as NullType on some environments).
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
    dialect = conn.dialect.name
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

    # 2. Drop the is_primary column
    if dialect == 'sqlite':
        # SQLite cannot ALTER TABLE DROP COLUMN (pre-3.35) — manual table recreation.
        # Raw SQL avoids Alembic's batch_alter_table reflection which fails with
        # NullType on columns created via 0001's if-not-exists guard.
        conn.execute(sa.text("""
            CREATE TABLE _auth_forms_new (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                config TEXT DEFAULT '{}',
                target_contact_type TEXT,
                allowed_contact_types TEXT DEFAULT '[]',
                redirect_url TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT,
                updated_at TEXT
            )
        """))
        conn.execute(sa.text("""
            INSERT INTO _auth_forms_new
                (id, name, type, config, target_contact_type,
                 allowed_contact_types, redirect_url, is_active,
                 created_at, updated_at)
            SELECT id, name, type, config, target_contact_type,
                   allowed_contact_types, redirect_url, is_active,
                   created_at, updated_at
            FROM auth_forms
        """))
        conn.execute(sa.text("DROP TABLE auth_forms"))
        conn.execute(sa.text("ALTER TABLE _auth_forms_new RENAME TO auth_forms"))
    else:
        # PostgreSQL can drop columns directly
        op.drop_column('auth_forms', 'is_primary')


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' not in inspector.get_table_names():
        return

    columns = [c['name'] for c in inspector.get_columns('auth_forms')]
    if 'is_primary' in columns:
        return  # Column already exists

    if dialect == 'sqlite':
        # Manual table recreation for SQLite
        conn.execute(sa.text("""
            CREATE TABLE _auth_forms_new (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                config TEXT DEFAULT '{}',
                target_contact_type TEXT,
                allowed_contact_types TEXT DEFAULT '[]',
                redirect_url TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT,
                updated_at TEXT,
                is_primary INTEGER DEFAULT 0
            )
        """))
        conn.execute(sa.text("""
            INSERT INTO _auth_forms_new
                (id, name, type, config, target_contact_type,
                 allowed_contact_types, redirect_url, is_active,
                 created_at, updated_at, is_primary)
            SELECT id, name, type, config, target_contact_type,
                   allowed_contact_types, redirect_url, is_active,
                   created_at, updated_at, 0
            FROM auth_forms
        """))
        conn.execute(sa.text("DROP TABLE auth_forms"))
        conn.execute(sa.text("ALTER TABLE _auth_forms_new RENAME TO auth_forms"))
    else:
        op.add_column('auth_forms', sa.Column('is_primary', sa.Integer(), server_default='0'))

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
