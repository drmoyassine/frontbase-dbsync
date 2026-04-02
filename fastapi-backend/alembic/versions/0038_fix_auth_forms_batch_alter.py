"""Fix auth_forms batch_alter_table NullType error

Revision ID: 0038_fix_auth_forms_batch_alter
Revises: 0037_consolidate_is_primary_config
Create Date: 2026-04-02

Safety-net migration: if 0037 already succeeded (is_primary column removed),
this is a no-op. If 0037 failed mid-execution, this completes the work.

Uses raw SQL to avoid Alembic batch_alter_table reflection issues on SQLite.
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
    dialect = conn.dialect.name
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' not in inspector.get_table_names():
        return

    columns = [c['name'] for c in inspector.get_columns('auth_forms')]

    if 'is_primary' not in columns:
        return  # 0037 already succeeded — nothing to do

    # 0037 failed. Re-do data migration + column drop.
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

    if dialect == 'sqlite':
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
        op.drop_column('auth_forms', 'is_primary')


def downgrade() -> None:
    # Same as 0037 downgrade
    conn = op.get_bind()
    dialect = conn.dialect.name
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' not in inspector.get_table_names():
        return

    columns = [c['name'] for c in inspector.get_columns('auth_forms')]
    if 'is_primary' in columns:
        return

    if dialect == 'sqlite':
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
