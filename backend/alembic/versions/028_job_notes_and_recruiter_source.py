"""Add notes column to job_listings, recruiter/referral sources, make URL optional.

Revision ID: 028
Revises: 027
"""

import sqlalchemy as sa
from alembic import op

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add notes column
    op.add_column("job_listings", sa.Column("notes", sa.Text(), nullable=True))

    # Make URL nullable
    op.alter_column("job_listings", "url", existing_type=sa.String(2000), nullable=True)

    # Add new source enum values
    op.execute("ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'recruiter'")
    op.execute("ALTER TYPE job_source ADD VALUE IF NOT EXISTS 'referral'")

    # Drop old unique constraint and replace with partial unique index
    op.drop_constraint("uq_job_listing_user_url", "job_listings", type_="unique")
    op.create_index(
        "uq_job_listing_user_url",
        "job_listings",
        ["user_id", "url"],
        unique=True,
        postgresql_where=sa.text("url IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_job_listing_user_url", "job_listings")
    op.create_unique_constraint("uq_job_listing_user_url", "job_listings", ["user_id", "url"])
    op.alter_column("job_listings", "url", existing_type=sa.String(2000), nullable=False)
    op.drop_column("job_listings", "notes")
