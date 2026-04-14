"""Fix resume variant version counter default to start at 0.

Existing variants with current_version=2 and only one version snapshot
are corrected to current_version=1 with version_number=1.

Revision ID: 027
Revises: 026
"""

import sqlalchemy as sa
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change the column default from 1 to 0
    op.alter_column(
        "resume_variants",
        "current_version",
        server_default=sa.text("0"),
    )

    # Fix existing data: renumber version snapshots to start at 1
    # For each variant, renumber versions sequentially starting at 1
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            WITH ranked AS (
                SELECT id, variant_id, version_number,
                       ROW_NUMBER() OVER (
                           PARTITION BY variant_id
                           ORDER BY version_number ASC
                       ) AS new_version
                FROM resume_variant_versions
            )
            UPDATE resume_variant_versions v
            SET version_number = r.new_version
            FROM ranked r
            WHERE v.id = r.id AND v.version_number != r.new_version
        """)
    )

    # Update current_version on variants to match the count of their snapshots
    conn.execute(
        sa.text("""
            UPDATE resume_variants rv
            SET current_version = COALESCE(
                (SELECT MAX(version_number) FROM resume_variant_versions
                 WHERE variant_id = rv.id), 0
            )
        """)
    )


def downgrade() -> None:
    op.alter_column(
        "resume_variants",
        "current_version",
        server_default=sa.text("1"),
    )
