"""Grant User role full CRUD on domain resources.

CareerLens is a personal productivity app -- the User role needs create/edit
permissions for jobs, applications, agents, workspace, and profile, not just
view-only access.

Revision ID: 029
Revises: 028
"""

import sqlalchemy as sa
from alembic import op

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'User'
          AND (
            (p.resource = 'jobs' AND p.action IN ('create', 'edit', 'delete'))
            OR (p.resource = 'applications' AND p.action IN ('create', 'edit', 'delete'))
            OR (p.resource = 'agents' AND p.action IN ('create', 'edit', 'delete'))
            OR (p.resource = 'workspace' AND p.action IN ('create', 'edit'))
            OR (p.resource = 'profile' AND p.action IN ('edit'))
          )
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        DELETE FROM role_permissions
        WHERE role_id = (SELECT id FROM roles WHERE name = 'User')
          AND permission_id IN (
            SELECT id FROM permissions
            WHERE (resource = 'jobs' AND action IN ('create', 'edit', 'delete'))
               OR (resource = 'applications' AND action IN ('create', 'edit', 'delete'))
               OR (resource = 'agents' AND action IN ('create', 'edit', 'delete'))
               OR (resource = 'workspace' AND action IN ('create', 'edit'))
               OR (resource = 'profile' AND action = 'edit')
          )
    """))
