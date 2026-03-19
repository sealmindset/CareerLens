"""Domain schema -- profiles, jobs, applications, agent conversations

Revision ID: 002
Revises: 001
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Enum types ---
    proficiency_level = sa.Enum(
        "beginner", "intermediate", "advanced", "expert",
        name="proficiency_level", create_type=True,
    )
    skill_source = sa.Enum(
        "resume", "linkedin", "gap_interview", "manual",
        name="skill_source", create_type=True,
    )
    job_type = sa.Enum(
        "full_time", "part_time", "contract", "remote",
        name="job_type", create_type=True,
    )
    job_source = sa.Enum(
        "linkedin", "indeed", "glassdoor", "company_site", "manual",
        name="job_source", create_type=True,
    )
    job_status = sa.Enum(
        "new", "analyzing", "analyzed", "applied", "archived",
        name="job_status", create_type=True,
    )
    requirement_type = sa.Enum(
        "required", "preferred", "nice_to_have",
        name="requirement_type", create_type=True,
    )
    application_status = sa.Enum(
        "draft", "tailoring", "ready_to_review", "submitted",
        "interviewing", "offer", "rejected", "withdrawn",
        name="application_status", create_type=True,
    )
    submission_mode = sa.Enum(
        "review", "auto_submit",
        name="submission_mode", create_type=True,
    )
    agent_name = sa.Enum(
        "scout", "tailor", "coach", "strategist", "brand_advisor", "coordinator",
        name="agent_name", create_type=True,
    )
    context_type = sa.Enum(
        "job_analysis", "resume_tailoring", "gap_interview", "brand_research", "form_filling",
        name="context_type", create_type=True,
    )
    conversation_status = sa.Enum(
        "active", "completed", "paused",
        name="conversation_status", create_type=True,
    )
    message_role = sa.Enum(
        "system", "user", "assistant",
        name="message_role", create_type=True,
    )

    # --- profiles ---
    op.create_table(
        "profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("headline", sa.String(500), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("raw_resume_text", sa.Text(), nullable=True),
        sa.Column("linkedin_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- profile_skills ---
    op.create_table(
        "profile_skills",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("profile_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("skill_name", sa.String(255), nullable=False),
        sa.Column("proficiency_level", proficiency_level, nullable=False, server_default="intermediate"),
        sa.Column("years_experience", sa.Integer(), nullable=True),
        sa.Column("source", skill_source, nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- profile_experiences ---
    op.create_table(
        "profile_experiences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("profile_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company", sa.String(255), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- profile_educations ---
    op.create_table(
        "profile_educations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("profile_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("institution", sa.String(255), nullable=False),
        sa.Column("degree", sa.String(255), nullable=True),
        sa.Column("field_of_study", sa.String(255), nullable=True),
        sa.Column("graduation_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- job_listings ---
    op.create_table(
        "job_listings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("company", sa.String(255), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("salary_range", sa.String(255), nullable=True),
        sa.Column("job_type", job_type, nullable=True),
        sa.Column("source", job_source, nullable=False, server_default="manual"),
        sa.Column("status", job_status, nullable=False, server_default="new"),
        sa.Column("match_score", sa.Float(), nullable=True),
        sa.Column("match_analysis", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "url", name="uq_job_listing_user_url"),
    )

    # --- job_requirements ---
    op.create_table(
        "job_requirements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_listing_id", UUID(as_uuid=True), sa.ForeignKey("job_listings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requirement_text", sa.Text(), nullable=False),
        sa.Column("requirement_type", requirement_type, nullable=False, server_default="required"),
        sa.Column("is_met", sa.Boolean(), nullable=True),
        sa.Column("gap_notes", sa.Text(), nullable=True),
    )

    # --- applications ---
    op.create_table(
        "applications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("job_listing_id", UUID(as_uuid=True), sa.ForeignKey("job_listings.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("status", application_status, nullable=False, server_default="draft"),
        sa.Column("tailored_resume", sa.Text(), nullable=True),
        sa.Column("cover_letter", sa.Text(), nullable=True),
        sa.Column("submission_mode", submission_mode, nullable=False, server_default="review"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("follow_up_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- agent_conversations ---
    op.create_table(
        "agent_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_name", agent_name, nullable=False),
        sa.Column("context_type", context_type, nullable=False),
        sa.Column("context_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status", conversation_status, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- agent_messages ---
    op.create_table(
        "agent_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("agent_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", message_role, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agent_messages")
    op.drop_table("agent_conversations")
    op.drop_table("applications")
    op.drop_table("job_requirements")
    op.drop_table("job_listings")
    op.drop_table("profile_educations")
    op.drop_table("profile_experiences")
    op.drop_table("profile_skills")
    op.drop_table("profiles")

    # Drop enum types
    sa.Enum(name="message_role").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="conversation_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="context_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="agent_name").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="submission_mode").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="application_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="requirement_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="job_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="job_source").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="job_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="skill_source").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="proficiency_level").drop(op.get_bind(), checkfirst=True)
