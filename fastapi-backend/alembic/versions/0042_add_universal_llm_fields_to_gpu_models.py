"""Add universal LLM provider fields to edge_gpu_models

Adds api_key (encrypted) and base_url columns to support non-CF providers
(OpenAI, Anthropic, Google, Ollama, OpenAI-compatible).

Revision ID: 0042_add_universal_llm_fields
Revises: 0041_add_page_versions
Create Date: 2026-04-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0042_add_universal_llm_fields'
down_revision: Union[str, Sequence[str], None] = '0041_add_page_versions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add api_key and base_url columns to edge_gpu_models."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    if 'edge_gpu_models' not in existing_tables:
        return  # Table doesn't exist yet (fresh DB)
    columns = [c['name'] for c in inspector.get_columns('edge_gpu_models')]

    with op.batch_alter_table('edge_gpu_models', schema=None) as batch_op:
        if 'api_key' not in columns:
            batch_op.add_column(sa.Column('api_key', sa.Text(), nullable=True))
        if 'base_url' not in columns:
            batch_op.add_column(sa.Column('base_url', sa.String(500), nullable=True))


def downgrade() -> None:
    """Remove api_key and base_url columns."""
    with op.batch_alter_table('edge_gpu_models', schema=None) as batch_op:
        batch_op.drop_column('base_url')
        batch_op.drop_column('api_key')
