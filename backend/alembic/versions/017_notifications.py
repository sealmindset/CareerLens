"""Notifications table and seed data (N01, N07).

Revision ID: 017
Revises: 016
"""

import uuid
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

# Reuse user IDs from seed_data (003)
USER_ADMIN = str(uuid.uuid5(NS, "user-mock-admin"))
USER_PRO = str(uuid.uuid5(NS, "user-mock-pro"))
USER_REGULAR = str(uuid.uuid5(NS, "user-mock-user"))

# Notification IDs
NOTIF_IDS = [str(uuid.uuid5(NS, f"notif-{i}")) for i in range(8)]

# Reference some seeded entity IDs for related_entity links
APP_0 = str(uuid.uuid5(NS, "app-0"))
APP_1 = str(uuid.uuid5(NS, "app-1"))
JOB_0 = str(uuid.uuid5(NS, "job-0"))
JOB_3 = str(uuid.uuid5(NS, "job-3"))


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("recipient_type", sa.String(20), nullable=False, index=True),
        sa.Column("recipient_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column("notification_type", sa.String(60), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("related_entity_type", sa.String(60), nullable=True),
        sa.Column("related_entity_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sent_by", sa.String(120), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="SENT"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ----- Seed notifications (N07) -----
    now = datetime.now(timezone.utc)

    seeds = [
        # 0: Broadcast to all internal users — system announcement (read by admin)
        {
            "id": NOTIF_IDS[0],
            "recipient_type": "INTERNAL",
            "recipient_id": None,
            "notification_type": "SYSTEM",
            "title": "Welcome to CareerLens v0.16!",
            "message": "We've added in-app notifications, activity logging, and more. Check the changelog for details.",
            "related_entity_type": None,
            "related_entity_id": None,
            "sent_by": "system",
            "sent_at": (now - timedelta(days=10)).isoformat(),
            "read_at": (now - timedelta(days=9)).isoformat(),
            "status": "READ",
        },
        # 1: Pipeline complete — targeted to pro user
        {
            "id": NOTIF_IDS[1],
            "recipient_type": "INTERNAL",
            "recipient_id": USER_PRO,
            "notification_type": "PIPELINE_COMPLETE",
            "title": "Application pipeline finished",
            "message": "Your full agent pipeline for 'Senior Engineer at Acme Corp' has completed. Review the tailored resume and cover letter in the workspace.",
            "related_entity_type": "application",
            "related_entity_id": APP_0,
            "sent_by": "coordinator",
            "sent_at": (now - timedelta(days=5)).isoformat(),
            "read_at": None,
            "status": "SENT",
        },
        # 2: Story ready — targeted to pro user
        {
            "id": NOTIF_IDS[2],
            "recipient_type": "INTERNAL",
            "recipient_id": USER_PRO,
            "notification_type": "STORY_READY",
            "title": "New interview story drafted",
            "message": "The Talking Points agent generated 3 interview stories from your latest resume variant. Review them in Story Bank.",
            "related_entity_type": None,
            "related_entity_id": None,
            "sent_by": "talking_points",
            "sent_at": (now - timedelta(days=3)).isoformat(),
            "read_at": None,
            "status": "SENT",
        },
        # 3: Status change — targeted to pro user (already read)
        {
            "id": NOTIF_IDS[3],
            "recipient_type": "INTERNAL",
            "recipient_id": USER_PRO,
            "notification_type": "STATUS_CHANGE",
            "title": "Application moved to Interviewing",
            "message": "Your application for 'Data Platform Lead' has been updated to Interviewing status.",
            "related_entity_type": "application",
            "related_entity_id": APP_1,
            "sent_by": "system",
            "sent_at": (now - timedelta(days=2)).isoformat(),
            "read_at": (now - timedelta(days=1)).isoformat(),
            "status": "READ",
        },
        # 4: New job match — broadcast
        {
            "id": NOTIF_IDS[4],
            "recipient_type": "INTERNAL",
            "recipient_id": None,
            "notification_type": "ASSIGNMENT",
            "title": "New high-match job found",
            "message": "A new job listing 'Staff Software Engineer at TechCo' matches your profile at 92%. Check it out in Jobs.",
            "related_entity_type": "job",
            "related_entity_id": JOB_0,
            "sent_by": "scout",
            "sent_at": (now - timedelta(days=1)).isoformat(),
            "read_at": None,
            "status": "SENT",
        },
        # 5: Targeted to admin — prompt updated
        {
            "id": NOTIF_IDS[5],
            "recipient_type": "INTERNAL",
            "recipient_id": USER_ADMIN,
            "notification_type": "SYSTEM",
            "title": "AI Instruction updated",
            "message": "The 'tailor-system' prompt was published to production by admin@career-lens.local.",
            "related_entity_type": None,
            "related_entity_id": None,
            "sent_by": "system",
            "sent_at": (now - timedelta(hours=12)).isoformat(),
            "read_at": None,
            "status": "SENT",
        },
        # 6: Targeted to regular user — welcome
        {
            "id": NOTIF_IDS[6],
            "recipient_type": "INTERNAL",
            "recipient_id": USER_REGULAR,
            "notification_type": "SYSTEM",
            "title": "Welcome to CareerLens!",
            "message": "Get started by uploading your resume on the Profile page. Our AI agents will help you craft targeted applications.",
            "related_entity_type": None,
            "related_entity_id": None,
            "sent_by": "system",
            "sent_at": (now - timedelta(days=7)).isoformat(),
            "read_at": None,
            "status": "SENT",
        },
        # 7: Pipeline complete — targeted to pro user (for unread variety)
        {
            "id": NOTIF_IDS[7],
            "recipient_type": "INTERNAL",
            "recipient_id": USER_PRO,
            "notification_type": "PIPELINE_COMPLETE",
            "title": "Resume tailoring complete",
            "message": "The Tailor agent has finished customizing your resume for 'Engineering Manager at StartupXYZ'. Review the result in your workspace.",
            "related_entity_type": "job",
            "related_entity_id": JOB_3,
            "sent_by": "tailor",
            "sent_at": (now - timedelta(hours=6)).isoformat(),
            "read_at": None,
            "status": "SENT",
        },
    ]

    for s in seeds:
        recipient_id_sql = f"'{s['recipient_id']}'" if s["recipient_id"] else "NULL"
        related_entity_type_sql = f"'{s['related_entity_type']}'" if s["related_entity_type"] else "NULL"
        related_entity_id_sql = f"'{s['related_entity_id']}'" if s["related_entity_id"] else "NULL"
        read_at_sql = f"'{s['read_at']}'" if s["read_at"] else "NULL"
        message_escaped = s["message"].replace("'", "''") if s["message"] else "NULL"
        message_sql = f"'{message_escaped}'" if s["message"] else "NULL"

        op.execute(sa.text(
            f"INSERT INTO notifications "
            f"(id, recipient_type, recipient_id, notification_type, title, message, "
            f"related_entity_type, related_entity_id, sent_by, sent_at, read_at, status) "
            f"VALUES ("
            f"'{s['id']}', '{s['recipient_type']}', {recipient_id_sql}, "
            f"'{s['notification_type']}', '{s['title']}', {message_sql}, "
            f"{related_entity_type_sql}, {related_entity_id_sql}, "
            f"'{s['sent_by']}', '{s['sent_at']}', {read_at_sql}, '{s['status']}'"
            f") ON CONFLICT DO NOTHING"
        ))


def downgrade() -> None:
    op.drop_table("notifications")
