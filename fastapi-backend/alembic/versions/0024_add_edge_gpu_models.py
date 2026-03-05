"""Add edge GPU models table.

Revision ID: 0024_add_edge_gpu_models
Revises: 0023_add_workflow_settings
"""
from alembic import op
import sqlalchemy as sa

revision = '0024_add_edge_gpu_models'
down_revision = '0023_add_workflow_settings'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'edge_gpu_models',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('model_type', sa.String(50), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('model_id', sa.String(200), nullable=False),
        sa.Column('endpoint_url', sa.String(500), nullable=True),
        sa.Column('provider_config', sa.Text(), nullable=True),
        sa.Column('edge_engine_id', sa.String(), sa.ForeignKey('edge_engines.id'), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.Column('updated_at', sa.String(), nullable=False),
    )


def downgrade():
    op.drop_table('edge_gpu_models')
