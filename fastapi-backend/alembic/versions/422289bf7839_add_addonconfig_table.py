"""add_addonconfig_table

Revision ID: 422289bf7839
Revises: e6c00005bce8
Create Date: 2026-07-13 00:43:54.554430

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '422289bf7839'
down_revision: Union[str, Sequence[str], None] = 'e6c00005bce8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('addon_configs',
    sa.Column('id', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('quota_display', sa.String(length=50), nullable=True),
    sa.Column('price_cents', sa.Integer(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    
    # Seed initial data
    op.execute("""
    INSERT INTO addon_configs (id, name, description, quota_display, price_cents, is_active) VALUES
    ('edge_engine', 'Edge Compute Engine', 'Deploy standalone backend workflows and HTML apps close to users. Unlocks 1 project slot for separate environments.', '+1 Engine & Project Slot', 1000, 1),
    ('managed_edge_db', 'Managed Edge Database', 'Highly available, zero-config relational database (SQLite/Turso) running globally at the edge.', '+1 Managed DB', 500, 1),
    ('managed_cache', 'Managed Edge Cache', 'Supercharge database read speeds and key-value storage using low-latency Upstash Redis caches.', '+1 Managed Cache', 200, 1),
    ('managed_queue', 'Managed Edge Queue', 'Guaranteed message delivery, rate-limiting, and async background job queues powered by QStash.', '+1 Managed Queue', 200, 1),
    ('managed_vector', 'Managed Vector Database', 'Store embeddings and run semantic vector search queries for AI-powered retrieval-augmented apps.', '+1 Managed Vector DB', 300, 1),
    ('managed_storage', 'Managed Storage Bucket', 'Highly durable S3-compatible object storage buckets for user uploads, static assets, and media.', '+1 Storage Provider', 200, 1),
    ('managed_domain', 'Custom Domain', 'Attach a custom domain to a Frontbase edge engine for white-labeled serving.', '+1 Custom Domain', 100, 1);
    """)

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('addon_configs')
