"""add_performance_indexes

Revision ID: 064e53e69acc
Revises: fa4231c8c929
Create Date: 2026-07-15 15:42:22.736815

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '064e53e69acc'
down_revision: Union[str, Sequence[str], None] = 'fa4231c8c929'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('idx_shift_logs_perf', 'shift_logs', ['project', 'office_name', 'date'])
    op.create_index('idx_audit_logs_perf', 'audit_logs', ['timestamp', 'project'])
    op.create_index('idx_indents_perf', 'indents', ['project', 'office_name', 'status'])


def downgrade() -> None:
    op.drop_index('idx_shift_logs_perf', table_name='shift_logs')
    op.drop_index('idx_audit_logs_perf', table_name='audit_logs')
    op.drop_index('idx_indents_perf', table_name='indents')
