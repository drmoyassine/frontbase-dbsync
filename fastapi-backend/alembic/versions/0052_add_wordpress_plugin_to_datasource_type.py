"""Add wordpress_plugin to datasource type CHECK constraint.

Revision ID: 0052_add_wordpress_plugin_to_datasource_type
Revises: 0051_post_sprint_file_move_jobs
Create Date: 2026-06-24

This migration updates the CHECK constraint on the datasources.type column
to include 'wordpress_plugin' as a valid enum value. The datasources table
is managed by SQLAlchemy create_all(), not Alembic, so enum additions need
explicit migration to update the CHECK constraint.

Problem:
- When datasources table was created, the CHECK constraint only included
  enum values that existed at that time
- WORDPRESS_PLUGIN was added later, so PostgreSQL rejects rows with
  type='wordpress_plugin'
- This causes datasources to disappear on redeploy and prevents creating
  new WordPress Plugin datasources

Solution:
- Drop the existing CHECK constraint on datasources.type
- Add a new CHECK constraint with all current enum values including
  'wordpress_plugin'
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '0052_add_wordpress_plugin_to_datasource_type'
down_revision: Union[str, Sequence[str], None] = '0050_post_sprint_ip_anonymization'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All current DatasourceType enum values - must match the model!
DATASOURCE_TYPES = [
    'supabase',
    'postgres',
    'wordpress',
    'wordpress_rest',
    'wordpress_graphql',
    'wordpress_plugin',  # The missing value
    'neon',
    'mysql',
    'google_sheets',
    'rest',
]


def _find_type_check_constraint(conn, table_name: str) -> Union[str, None]:
    """Find the CHECK constraint name for the type column."""
    inspector = inspect(conn)
    constraints = inspector.get_check_constraints(table_name)

    for constraint in constraints:
        # Look for a constraint that checks the 'type' column
        if 'type' in constraint.get('sqltext', ''):
            return constraint['name']

    return None


def upgrade() -> None:
    """Update the CHECK constraint on datasources.type to include wordpress_plugin."""
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == 'sqlite':
        # SQLite doesn't enforce CHECK constraints the same way
        # and stores enums as plain strings, so no action needed
        print("SQLite detected - no CHECK constraint update needed")
        return

    if dialect != 'postgresql':
        print(f"Unsupported dialect {dialect} - skipping CHECK constraint update")
        return

    # Check if datasources table exists
    inspector = inspect(conn)
    if 'datasources' not in inspector.get_table_names():
        print("datasources table does not exist yet - skipping")
        return

    # Find the existing CHECK constraint on the type column
    constraint_name = _find_type_check_constraint(conn, 'datasources')

    if constraint_name:
        print(f"Found CHECK constraint {constraint_name} on datasources.type")

        # Drop the old constraint
        try:
            conn.execute(sa.text(f'ALTER TABLE datasources DROP CONSTRAINT IF EXISTS {constraint_name}'))
            conn.commit()
            print(f"Dropped CHECK constraint {constraint_name}")
        except Exception as e:
            print(f"Warning: Could not drop constraint {constraint_name}: {e}")

    # Add the new CHECK constraint with all enum values
    values_list = ', '.join(f"'{v}'" for v in DATASOURCE_TYPES)
    check_sql = f"CHECK (type IN ({values_list}))"

    try:
        conn.execute(sa.text(f'ALTER TABLE datasources ADD CONSTRAINT datasources_type_check {check_sql}'))
        conn.commit()
        print(f"Added CHECK constraint for datasources.type with values: {DATASOURCE_TYPES}")
    except Exception as e:
        print(f"Warning: Could not add CHECK constraint: {e}")


def downgrade() -> None:
    """Downgrade is not straightforward - would need to remove wordpress_plugin from the constraint."""
    # For simplicity, we don't support downgrading this migration
    # The constraint is permissive enough that having extra values won't break anything
    pass
