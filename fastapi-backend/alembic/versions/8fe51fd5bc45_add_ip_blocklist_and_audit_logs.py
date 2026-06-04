"""add_ip_blocklist_and_audit_logs

Revision ID: 8fe51fd5bc45
Revises: 990ec754befc
Create Date: 2026-06-04 23:53:32.855095

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '8fe51fd5bc45'
down_revision: Union[str, Sequence[str], None] = '990ec754befc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if 'audit_logs' not in tables:
        op.create_table('audit_logs',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('action', sa.String(length=100), nullable=False),
            sa.Column('ip_address', sa.String(length=50), nullable=True),
            sa.Column('user_agent', sa.String(length=255), nullable=True),
            sa.Column('details', sa.Text(), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        
    if 'ip_blocklist' not in tables:
        op.create_table('ip_blocklist',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('ip_or_range', sa.String(length=100), nullable=False),
            sa.Column('reason', sa.String(length=255), nullable=True),
            sa.Column('created_at', sa.String(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('ip_or_range')
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if 'ip_blocklist' in tables:
        op.drop_table('ip_blocklist')
        
    if 'audit_logs' in tables:
        op.drop_table('audit_logs')
