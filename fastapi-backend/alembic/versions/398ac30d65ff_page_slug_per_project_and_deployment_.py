"""page_slug_per_project_and_deployment_preview_url

- Drop global unique constraint on pages.slug (slugs are now unique per project,
  enforced at the application layer since NULL project_id values can't participate
  in a composite DB unique constraint portably across SQLite and Postgres).
- Add preview_url column to page_deployments to store the tenant-aware edge URL
  returned on publish (avoids recomputing from the engine's internal URL).

Revision ID: 398ac30d65ff
Revises: 83aa01f6a1e6
Create Date: 2026-04-23 00:30:14.775284

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '398ac30d65ff'
down_revision: Union[str, Sequence[str], None] = '83aa01f6a1e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Add preview_url to page_deployments (guarded — safe to re-run)
    inspector = sa.inspect(op.get_bind())
    dep_columns = [c['name'] for c in inspector.get_columns('page_deployments')]
    if 'preview_url' not in dep_columns:
        with op.batch_alter_table('page_deployments', schema=None) as batch_op:
            batch_op.add_column(sa.Column('preview_url', sa.String(length=2000), nullable=True))

    # 2. Drop the global unique constraint on pages.slug.
    #    In SQLite, column-level unique constraints are embedded in the CREATE TABLE DDL
    #    and have no user-visible name, so drop_constraint() fails. We use batch mode
    #    with recreate='always' which rebuilds the entire table without the unique flag.
    #    Alembic derives the new table DDL from the current Python models (which no longer
    #    have unique=True on slug), so the rebuilt table won't have the constraint.
    page_columns = [c['name'] for c in inspector.get_columns('pages')]
    if 'slug' in page_columns:
        bind = op.get_bind()
        if bind.dialect.name == 'sqlite':
            with op.batch_alter_table('pages', schema=None, recreate='always') as batch_op:
                pass  # Rebuild table to drop inline unique constraint
        else:
            # Find the actual unique constraint name on Postgres
            unique_constraints = inspector.get_unique_constraints('pages')
            for uc in unique_constraints:
                if 'slug' in uc['column_names']:
                    with op.batch_alter_table('pages', schema=None) as batch_op:
                        batch_op.drop_constraint(uc['name'], type_='unique')
                    break


def downgrade() -> None:
    """Downgrade schema."""
    # Remove preview_url
    with op.batch_alter_table('page_deployments', schema=None) as batch_op:
        batch_op.drop_column('preview_url')

    # Restore global unique on slug (best-effort — may fail if duplicates exist)
    with op.batch_alter_table('pages', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_pages_slug', ['slug'])
