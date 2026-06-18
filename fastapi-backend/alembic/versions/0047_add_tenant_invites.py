"""Add tenant_invites table (tenant self-service team invitations).

Revision ID: 0047
Revises: 0046
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0047'
down_revision = '0046'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'tenant_invites' not in inspector.get_table_names():
        op.create_table(
            'tenant_invites',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('tenant_id', sa.String(), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('role', sa.String(length=20), server_default='editor'),
            sa.Column('token', sa.String(length=64), nullable=False, unique=True),
            sa.Column('status', sa.String(length=20), server_default='pending'),
            sa.Column('invited_by', sa.String(), nullable=False),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.Column('expires_at', sa.String(), nullable=False),
            sa.Column('accepted_at', sa.String(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'tenant_invites' in inspector.get_table_names():
        op.drop_table('tenant_invites')
