"""Add all missing columns to datasource_views.

Revision ID: 0030
Revises: 0029_core_zone_and_credential_metadata
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '0030_add_datasource_views_description'
down_revision = '0029_core_zone_and_credential_metadata'
branch_labels = None
depends_on = None

# All columns the model expects
EXPECTED_COLUMNS = {
    'description': sa.Column('description', sa.Text(), nullable=True),
    'target_table': sa.Column('target_table', sa.String(255), nullable=True),
    'filters': sa.Column('filters', sa.JSON(), nullable=True),
    'field_mappings': sa.Column('field_mappings', sa.JSON(), nullable=True),
    'linked_views': sa.Column('linked_views', sa.JSON(), nullable=True),
    'visible_columns': sa.Column('visible_columns', sa.JSON(), nullable=True),
    'pinned_columns': sa.Column('pinned_columns', sa.JSON(), nullable=True),
    'column_order': sa.Column('column_order', sa.JSON(), nullable=True),
    'webhooks': sa.Column('webhooks', sa.JSON(), nullable=True),
}


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # Introspect existing columns
    inspector = sa.inspect(conn)
    existing = {col['name'] for col in inspector.get_columns('datasource_views')}

    missing = {name: col for name, col in EXPECTED_COLUMNS.items() if name not in existing}
    if not missing:
        return

    if dialect == 'sqlite':
        with op.batch_alter_table('datasource_views') as batch_op:
            for name, col in missing.items():
                batch_op.add_column(col)
    else:
        for name, col in missing.items():
            op.add_column('datasource_views', col)


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('datasource_views') as batch_op:
            for name in EXPECTED_COLUMNS:
                batch_op.drop_column(name)
    else:
        for name in EXPECTED_COLUMNS:
            op.drop_column('datasource_views', name)
