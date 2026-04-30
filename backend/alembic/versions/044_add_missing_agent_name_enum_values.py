"""Add missing agent_name enum values for chat-capable agents.

Revision ID: 044
Revises: 043
"""

from alembic import op

revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None

_new_values = [
    "talking_points",
    "ats_predictor",
    "hiring_manager_sim",
    "ninety_day_plan",
    "outreach_drafter",
    "auto_fill",
    "ageism_shield",
    "overqualification_shield",
    "interview_verdict",
    "identity_shield",
]


def upgrade():
    for val in _new_values:
        op.execute(f"ALTER TYPE agent_name ADD VALUE IF NOT EXISTS '{val}'")


def downgrade():
    pass
