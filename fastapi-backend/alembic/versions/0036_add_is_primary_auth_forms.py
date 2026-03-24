"""Add is_primary to auth_forms

Revision ID: 0036_add_is_primary_auth_forms
Revises: 0035_add_scope_to_edge_api_keys
Create Date: 2026-03-24

Adds is_primary boolean column to auth_forms table.
When is_primary=1, that form is used for private page gating overlay.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0036_add_is_primary_auth_forms'
down_revision: Union[str, Sequence[str], None] = '0035_add_scope_to_edge_api_keys'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    from sqlalchemy import inspect
    inspector = inspect(conn)

    if 'auth_forms' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('auth_forms')]
        if 'is_primary' not in columns:
            with op.batch_alter_table('auth_forms', schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column('is_primary', sa.Integer(), server_default='0')
                )


def downgrade() -> None:
    with op.batch_alter_table('auth_forms', schema=None) as batch_op:
        batch_op.drop_column('is_primary')
