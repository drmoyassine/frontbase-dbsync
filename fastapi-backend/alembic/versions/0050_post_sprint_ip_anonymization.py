"""post-sprint 2.1: ip anonymization + retention on audit_logs

Revision ID: 0050
Revises: 0049
Create Date: 2026-06-23

Adds dual-field IP storage to security audit logs:
  - ip_address_anonymized  : long-retained /24 (IPv4) or /48 (IPv6) value
  - ip_full_until           : isoformat UTC string marking when the FULL
                             ip_address should be purged (NULL = retain forever)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0050'
down_revision: Union[str, Sequence[str], None] = '0049'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('ip_address_anonymized', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('ip_full_until', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_column('ip_full_until')
        batch_op.drop_column('ip_address_anonymized')
