"""add otp and first login fields to user

Revision ID: 180360c95634
Revises: 9b1bb8cca5ac
Create Date: 2026-07-14 16:52:39.016960

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '180360c95634'
down_revision: Union[str, Sequence[str], None] = '9b1bb8cca5ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('users')]
    
    if 'first_login' not in columns:
        op.add_column('users', sa.Column('first_login', sa.Boolean(), nullable=False, server_default=sa.text('1')))
    if 'otp_code' not in columns:
        op.add_column('users', sa.Column('otp_code', sa.String(length=10), nullable=True))
    if 'otp_expiry' not in columns:
        op.add_column('users', sa.Column('otp_expiry', sa.DateTime(), nullable=True))
        
    op.alter_column('users', 'role',
               type_=sa.String(length=50),
               existing_type=sa.Enum('ADMIN', 'PROJECT_MANAGER', 'SUPERVISOR', 'OPERATOR', name='userrole'),
               nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('users')]
    
    if 'otp_expiry' in columns:
        op.drop_column('users', 'otp_expiry')
    if 'otp_code' in columns:
        op.drop_column('users', 'otp_code')
    if 'first_login' in columns:
        op.drop_column('users', 'first_login')
