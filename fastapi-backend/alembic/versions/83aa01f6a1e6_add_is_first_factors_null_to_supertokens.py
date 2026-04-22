"""add is_first_factors_null to supertokens

Revision ID: 83aa01f6a1e6
Revises: 0044
Create Date: 2026-04-22 02:59:48.754918

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83aa01f6a1e6'
down_revision: Union[str, Sequence[str], None] = '0044'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    
    if conn.engine.dialect.name == "postgresql":
        # Safe-check: Only run if the supertokens schema and table actually exist 
        # (This avoids failing in self-host/local dev without SuperTokens)
        from sqlalchemy import text
        has_table = conn.execute(
            text("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'supertokens' AND table_name = 'tenant_configs')")
        ).scalar()
        
        if has_table:
            conn.execute(text("ALTER TABLE supertokens.tenant_configs ADD COLUMN IF NOT EXISTS is_first_factors_null BOOLEAN DEFAULT TRUE"))
            conn.execute(text("ALTER TABLE supertokens.tenant_configs ALTER COLUMN is_first_factors_null DROP DEFAULT"))


def downgrade() -> None:
    """Downgrade schema."""
    pass
