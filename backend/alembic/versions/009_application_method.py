"""Add application method detection columns to job_listings.

Revision ID: 009
Revises: 008
"""

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("job_listings", sa.Column("application_method", sa.String(50), nullable=True))
    op.add_column("job_listings", sa.Column("application_platform", sa.String(100), nullable=True))
    op.add_column("job_listings", sa.Column("application_method_details", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("job_listings", "application_method_details")
    op.drop_column("job_listings", "application_platform")
    op.drop_column("job_listings", "application_method")
