"""add automation_executions table

Revision ID: a1b2c3d4e5f6
Revises: e510beacc2ae
Create Date: 2026-03-01

Adds the automation_executions table for storing test execution logs
in the backend. This table may already exist in SQLite from create_all()
but needs a proper migration for PostgreSQL and tracking.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'e510beacc2ae'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name

    # Check if table already exists (SQLite may have it from create_all)
    if dialect == 'sqlite':
        result = conn.execute(sa.text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='automation_executions'"
        ))
        if result.fetchone():
            return  # Table already exists, skip creation
    elif dialect == 'postgresql':
        result = conn.execute(sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'automation_executions')"
        ))
        if result.scalar():
            return  # Table already exists, skip creation

    now_default = sa.text("datetime('now')") if dialect == 'sqlite' else sa.text("NOW()")

    op.create_table(
        'automation_executions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('draft_id', sa.String(36), nullable=True),
        sa.Column('workflow_id', sa.String(36), nullable=True),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('trigger_type', sa.String(50), nullable=False),
        sa.Column('trigger_payload', sa.JSON, nullable=True),
        sa.Column('node_executions', sa.JSON, nullable=True),
        sa.Column('result', sa.JSON, nullable=True),
        sa.Column('error', sa.Text, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=now_default),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table('automation_executions')
