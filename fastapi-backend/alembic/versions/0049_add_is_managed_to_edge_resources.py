"""Add is_managed flag to edge resources (managed-tier, Frontbase-provisioned).

Revision ID: 0049
Revises: 0048
Create Date: 2026-06-19

This was added to the ORM models + the startup self-heal in commit d782b34 but the
alembic migration was missing — so the column is absent on Postgres deployments that
run migrations, causing `column edge_engines.is_managed does not exist` at query time.
Idempotent: skips columns that already exist.
"""
from alembic import op
import sqlalchemy as sa

revision = '0049'
down_revision = '0048'
branch_labels = None
depends_on = None

_EDGE_TABLES = ('edge_engines', 'edge_databases', 'edge_caches', 'edge_queues')


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()
    for tname in _EDGE_TABLES:
        if tname not in existing:
            continue
        cols = {c['name'] for c in inspector.get_columns(tname)}
        if 'is_managed' not in cols:
            with op.batch_alter_table(tname, schema=None) as batch_op:
                batch_op.add_column(sa.Column('is_managed', sa.Boolean(), server_default='0', nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()
    for tname in _EDGE_TABLES:
        if tname not in existing:
            continue
        cols = {c['name'] for c in inspector.get_columns(tname)}
        if 'is_managed' in cols:
            with op.batch_alter_table(tname, schema=None) as batch_op:
                batch_op.drop_column('is_managed')
