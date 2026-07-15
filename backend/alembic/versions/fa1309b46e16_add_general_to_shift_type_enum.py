"""add_general_to_shift_type_enum

Revision ID: fa1309b46e16
Revises: 180360c95634
Create Date: 2026-07-15 12:00:00.477073

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa1309b46e16'
down_revision: Union[str, Sequence[str], None] = '180360c95634'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TABLE shift_logs MODIFY COLUMN shift_type ENUM('shift_1', 'shift_2', 'general') NOT NULL;")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE shift_logs MODIFY COLUMN shift_type ENUM('shift_1', 'shift_2') NOT NULL;")
