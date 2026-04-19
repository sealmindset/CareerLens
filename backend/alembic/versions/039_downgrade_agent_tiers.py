"""Downgrade ats_predictor, achievement_amplifier, outreach_drafter to light tier.

These agents do formulaic, structured work (keyword matching, bullet rewriting,
templated drafting) that doesn't require heavy reasoning.  With MLX enabled they
run locally for free on Apple Silicon.

Revision ID: 039
Revises: 038
"""

import sqlalchemy as sa
from alembic import op

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None

SLUGS = ("ats-predictor-system", "achievement-amplifier-system", "outreach-drafter-system")


def upgrade() -> None:
    for slug in SLUGS:
        op.execute(
            sa.text(
                "UPDATE managed_prompts SET model_tier = 'light' WHERE slug = :slug"
            ).bindparams(slug=slug)
        )


def downgrade() -> None:
    for slug in SLUGS:
        op.execute(
            sa.text(
                "UPDATE managed_prompts SET model_tier = 'standard' WHERE slug = :slug"
            ).bindparams(slug=slug)
        )
