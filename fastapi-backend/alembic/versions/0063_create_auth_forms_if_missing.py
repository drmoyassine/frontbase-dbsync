"""Create auth_forms if missing

Revision ID: 0063
Revises: 0062
Create Date: 2026-06-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0063'
down_revision: Union[str, Sequence[str], None] = '0062'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)
    
    if 'auth_forms' not in inspector.get_table_names():
        op.create_table('auth_forms',
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
            sa.Column('tenant_id', sa.String(), nullable=True)
        )


def downgrade() -> None:
    # Since this was historically in 0001, we won't drop it on downgrade 
    # as other environments might have had it since 0001.
    pass
