"""Seed data -- roles, permissions, users, sample domain data

Revision ID: 003
Revises: 002
Create Date: 2026-03-19 00:00:00.000000

Seeds system roles, permissions, role-permission mappings, mock users,
and sample domain data for the mock-pro user.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Deterministic UUID namespace
# ---------------------------------------------------------------------------
NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

# --- Roles ---
ROLE_SUPER_ADMIN = str(uuid.uuid5(NS, "role-super-admin"))
ROLE_ADMIN = str(uuid.uuid5(NS, "role-admin"))
ROLE_PRO_USER = str(uuid.uuid5(NS, "role-pro-user"))
ROLE_USER = str(uuid.uuid5(NS, "role-user"))

# --- Users ---
USER_ADMIN = str(uuid.uuid5(NS, "user-mock-admin"))
USER_MANAGER = str(uuid.uuid5(NS, "user-mock-manager"))
USER_PRO = str(uuid.uuid5(NS, "user-mock-pro"))
USER_REGULAR = str(uuid.uuid5(NS, "user-mock-user"))

# --- Profile ---
PROFILE_PRO = str(uuid.uuid5(NS, "profile-mock-pro"))

# --- Skills ---
SKILL_IDS = [str(uuid.uuid5(NS, f"skill-{i}")) for i in range(10)]

# --- Experiences ---
EXP_1 = str(uuid.uuid5(NS, "exp-1"))
EXP_2 = str(uuid.uuid5(NS, "exp-2"))

# --- Education ---
EDU_1 = str(uuid.uuid5(NS, "edu-1"))

# --- Job Listings ---
JOB_IDS = [str(uuid.uuid5(NS, f"job-{i}")) for i in range(15)]

# --- Applications ---
APP_IDS = [str(uuid.uuid5(NS, f"app-{i}")) for i in range(5)]

# --- Agent Conversations ---
CONV_IDS = [str(uuid.uuid5(NS, f"conv-{i}")) for i in range(3)]
MSG_IDS = [str(uuid.uuid5(NS, f"msg-{i}")) for i in range(10)]

# ---------------------------------------------------------------------------
# Permission definitions
# ---------------------------------------------------------------------------
RESOURCE_ACTIONS = {
    "dashboard": ["view"],
    "profile": ["view", "create", "edit", "delete"],
    "jobs": ["view", "create", "edit", "delete"],
    "applications": ["view", "create", "edit", "delete"],
    "agents": ["view", "create"],
    "settings": ["view", "edit"],
    "users": ["view", "create", "edit", "delete"],
    "roles": ["view", "create", "edit", "delete"],
}


def _perm_id(resource: str, action: str) -> str:
    return str(uuid.uuid5(NS, f"perm-{resource}-{action}"))


# Role -> permission mappings
ROLE_PERMISSIONS = {
    ROLE_SUPER_ADMIN: [
        (r, a) for r, actions in RESOURCE_ACTIONS.items() for a in actions
    ],
    ROLE_ADMIN: [
        (r, a)
        for r, actions in RESOURCE_ACTIONS.items()
        for a in actions
        if r not in ("roles",)
    ],
    ROLE_PRO_USER: [
        (r, a)
        for r, actions in RESOURCE_ACTIONS.items()
        for a in actions
        if r in ("profile", "jobs", "applications", "agents", "dashboard", "settings")
        and not (r == "settings" and a != "view")
        and not (r == "dashboard" and a != "view")
    ],
    ROLE_USER: [
        ("profile", "view"),
        ("jobs", "view"),
        ("applications", "view"),
        ("agents", "view"),
        ("dashboard", "view"),
    ],
}


def upgrade() -> None:
    # =========================================================================
    # 1. ROLES
    # =========================================================================
    op.execute(sa.text(
        "INSERT INTO roles (id, name, description, is_system) VALUES "
        f"('{ROLE_SUPER_ADMIN}', 'Super Admin', 'Full system access with all permissions', true), "
        f"('{ROLE_ADMIN}', 'Admin', 'Administrative access excluding role management', true), "
        f"('{ROLE_PRO_USER}', 'Pro User', 'Full domain access for profiles, jobs, applications, and agents', true), "
        f"('{ROLE_USER}', 'User', 'View-only access to domain resources', true) "
        "ON CONFLICT (name) DO NOTHING"
    ))

    # =========================================================================
    # 2. PERMISSIONS
    # =========================================================================
    perm_values = []
    for resource, actions in RESOURCE_ACTIONS.items():
        for action in actions:
            pid = _perm_id(resource, action)
            desc = f"Can {action} {resource}"
            perm_values.append(f"('{pid}', '{resource}', '{action}', '{desc}')")

    op.execute(sa.text(
        "INSERT INTO permissions (id, resource, action, description) VALUES "
        + ", ".join(perm_values)
        + " ON CONFLICT (resource, action) DO NOTHING"
    ))

    # =========================================================================
    # 3. ROLE-PERMISSION MAPPINGS
    # =========================================================================
    rp_values = []
    for role_id, perms in ROLE_PERMISSIONS.items():
        for resource, action in perms:
            pid = _perm_id(resource, action)
            rp_values.append(f"('{role_id}', '{pid}')")

    op.execute(sa.text(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES "
        + ", ".join(rp_values)
        + " ON CONFLICT DO NOTHING"
    ))

    # =========================================================================
    # 4. SEED USERS
    # =========================================================================
    op.execute(sa.text(
        "INSERT INTO users (id, oidc_subject, email, display_name, is_active, role_id) VALUES "
        f"('{USER_ADMIN}', 'mock-admin', 'admin@career-lens.local', 'Admin User', true, '{ROLE_SUPER_ADMIN}'), "
        f"('{USER_MANAGER}', 'mock-manager', 'manager@career-lens.local', 'Manager User', true, '{ROLE_ADMIN}'), "
        f"('{USER_PRO}', 'mock-pro', 'pro@career-lens.local', 'Pro User', true, '{ROLE_PRO_USER}'), "
        f"('{USER_REGULAR}', 'mock-user', 'user@career-lens.local', 'Regular User', true, '{ROLE_USER}') "
        "ON CONFLICT (oidc_subject) DO NOTHING"
    ))

    # =========================================================================
    # 5. SAMPLE PROFILE for mock-pro
    # =========================================================================
    op.execute(sa.text(
        "INSERT INTO profiles (id, user_id, headline, summary, raw_resume_text, linkedin_url) VALUES "
        f"('{PROFILE_PRO}', '{USER_PRO}', "
        "'Senior Software Engineer | Full-Stack Developer', "
        "'Experienced software engineer with 8+ years building scalable web applications "
        "and cloud-native services. Passionate about clean architecture, developer experience, "
        "and leveraging AI to improve software delivery.', "
        "'Senior Software Engineer with 8+ years of experience in Python, TypeScript, React, "
        "and cloud infrastructure. Led migration from monolith to microservices. Built real-time "
        "analytics dashboards. Expertise in FastAPI, Next.js, AWS, Docker, and PostgreSQL.', "
        "'https://linkedin.com/in/pro-user') "
        "ON CONFLICT DO NOTHING"
    ))

    # --- Skills ---
    skills = [
        ("Python", "expert", 8, "resume"),
        ("TypeScript", "expert", 6, "resume"),
        ("React", "advanced", 5, "resume"),
        ("Next.js", "advanced", 3, "resume"),
        ("AWS", "advanced", 5, "resume"),
        ("Docker", "advanced", 5, "resume"),
        ("PostgreSQL", "advanced", 7, "resume"),
        ("FastAPI", "expert", 3, "resume"),
        ("Kubernetes", "intermediate", 2, "manual"),
        ("GraphQL", "intermediate", 2, "manual"),
    ]
    skill_values = []
    for i, (name, prof, yrs, source) in enumerate(skills):
        skill_values.append(
            f"('{SKILL_IDS[i]}', '{PROFILE_PRO}', '{name}', '{prof}', {yrs}, '{source}')"
        )
    op.execute(sa.text(
        "INSERT INTO profile_skills (id, profile_id, skill_name, proficiency_level, years_experience, source) VALUES "
        + ", ".join(skill_values)
        + " ON CONFLICT DO NOTHING"
    ))

    # --- Work Experiences ---
    op.execute(sa.text(
        "INSERT INTO profile_experiences (id, profile_id, company, title, description, start_date, end_date, is_current) VALUES "
        f"('{EXP_1}', '{PROFILE_PRO}', 'TechCorp Industries', 'Senior Software Engineer', "
        "'Lead engineer on the platform team building cloud-native microservices with Python and TypeScript. "
        "Architecting scalable solutions on AWS, mentoring junior developers, and driving engineering best practices. "
        "Led migration of monolithic application to microservices architecture. "
        "Reduced API response times by 40%% through caching and query optimization.', "
        "'2021-03-01', NULL, true), "
        f"('{EXP_2}', '{PROFILE_PRO}', 'DataFlow Solutions', 'Software Engineer', "
        "'Full-stack developer building data visualization and analytics products. "
        "Built real-time analytics dashboard serving 10K+ daily users. "
        "Designed RESTful API layer consumed by mobile and web clients. "
        "Introduced automated testing achieving 85%% code coverage.', "
        "'2018-06-01', '2021-02-28', false) "
        "ON CONFLICT DO NOTHING"
    ))

    # --- Education ---
    op.execute(sa.text(
        "INSERT INTO profile_educations (id, profile_id, institution, degree, field_of_study, graduation_date) VALUES "
        f"('{EDU_1}', '{PROFILE_PRO}', 'University of Minnesota', 'Bachelor of Science', 'Computer Science', "
        "'2018-05-15') "
        "ON CONFLICT DO NOTHING"
    ))

    # =========================================================================
    # 6. SAMPLE JOB LISTINGS for mock-pro
    # =========================================================================
    jobs = [
        ("Senior Full-Stack Engineer", "Acme Corp", "San Francisco, CA", "linkedin", "new", 92, "$140K-$180K"),
        ("Staff Software Engineer", "Netflix", "Los Gatos, CA", "linkedin", "analyzed", 88, "$180K-$220K"),
        ("Principal Engineer - Platform", "Stripe", "San Francisco, CA", "company_site", "new", 85, "$190K-$230K"),
        ("Senior Backend Engineer", "Spotify", "New York, NY", "indeed", "applied", 82, "$150K-$190K"),
        ("Engineering Manager", "Datadog", "Boston, MA", "linkedin", "analyzed", 78, "$170K-$210K"),
        ("Senior Software Engineer - AI", "Anthropic", "San Francisco, CA", "company_site", "new", 95, "$200K-$240K"),
        ("Full-Stack Developer", "Shopify", "Remote", "indeed", "applied", 75, "$130K-$170K"),
        ("Senior Python Developer", "Cloudflare", "Austin, TX", "linkedin", "new", 80, "$145K-$185K"),
        ("Tech Lead - Frontend", "Vercel", "Remote", "company_site", "archived", 72, "$160K-$200K"),
        ("Senior DevOps Engineer", "HashiCorp", "Remote", "indeed", "analyzed", 68, "$140K-$180K"),
        ("Software Architect", "Confluent", "Denver, CO", "linkedin", "new", 77, "$175K-$215K"),
        ("Senior Engineer - Developer Tools", "GitHub", "Remote", "company_site", "applied", 90, "$165K-$205K"),
        ("Backend Engineer - Payments", "Square", "San Francisco, CA", "linkedin", "archived", 65, "$135K-$175K"),
        ("Platform Engineer", "Twilio", "Denver, CO", "indeed", "new", 73, "$145K-$185K"),
        ("Senior SRE", "PagerDuty", "Remote", "linkedin", "analyzed", 45, "$140K-$180K"),
    ]

    job_values = []
    for i, (title, company, location, source, status, score, salary) in enumerate(jobs):
        desc = f"We are looking for a {title} to join our team at {company}. This is an exciting opportunity to work on cutting-edge technology."
        url = f"https://example.com/jobs/{i+1}"
        job_values.append(
            f"('{JOB_IDS[i]}', '{USER_PRO}', '{title}', '{company}', '{url}', "
            f"'{desc}', '{location}', '{salary}', '{source}', '{status}', {score})"
        )

    op.execute(sa.text(
        "INSERT INTO job_listings (id, user_id, title, company, url, "
        "description, location, salary_range, source, status, match_score) VALUES "
        + ", ".join(job_values)
        + " ON CONFLICT DO NOTHING"
    ))

    # =========================================================================
    # 7. SAMPLE APPLICATIONS
    # =========================================================================
    applications = [
        (APP_IDS[0], JOB_IDS[3], "submitted", "review", "2026-03-10T14:30:00+00:00", "2026-03-24",
         "Tailored resume emphasizing backend and streaming experience."),
        (APP_IDS[1], JOB_IDS[6], "tailoring", "review", None, None,
         "Working on cover letter draft."),
        (APP_IDS[2], JOB_IDS[11], "submitted", "review", "2026-03-12T09:00:00+00:00", "2026-03-26",
         "Highlighted open-source contributions and developer tooling experience."),
        (APP_IDS[3], JOB_IDS[5], "interviewing", "review", "2026-03-08T11:00:00+00:00", "2026-03-22",
         "Phone screen scheduled for March 22. Reviewed AI safety research papers."),
        (APP_IDS[4], JOB_IDS[0], "draft", "auto_submit", None, None,
         "Need to tailor resume for full-stack role."),
    ]

    app_values = []
    for app_id, job_id, status, mode, submitted, followup, notes in applications:
        submitted_sql = f"'{submitted}'" if submitted else "NULL"
        followup_sql = f"'{followup}'" if followup else "NULL"
        app_values.append(
            f"('{app_id}', '{USER_PRO}', '{job_id}', '{status}', '{mode}', "
            f"'{notes}', {submitted_sql}, {followup_sql})"
        )

    op.execute(sa.text(
        "INSERT INTO applications (id, user_id, job_listing_id, status, submission_mode, "
        "notes, submitted_at, follow_up_date) VALUES "
        + ", ".join(app_values)
        + " ON CONFLICT DO NOTHING"
    ))

    # =========================================================================
    # 8. SAMPLE AGENT CONVERSATIONS
    # =========================================================================
    op.execute(sa.text(
        "INSERT INTO agent_conversations (id, user_id, agent_name, context_type, context_id, status) VALUES "
        f"('{CONV_IDS[0]}', '{USER_PRO}', 'coach', 'gap_interview', NULL, 'active'), "
        f"('{CONV_IDS[1]}', '{USER_PRO}', 'scout', 'job_analysis', '{JOB_IDS[5]}', 'completed'), "
        f"('{CONV_IDS[2]}', '{USER_PRO}', 'tailor', 'resume_tailoring', '{JOB_IDS[11]}', 'active') "
        "ON CONFLICT DO NOTHING"
    ))

    # Messages for conversation 1 (Coach)
    msg_idx = 0
    coach_messages = [
        ("user", "I want to practice for a senior software engineer interview. Can you help me identify gaps in my experience?"),
        ("assistant", "I would be happy to help you prepare! Based on your profile, you have strong full-stack experience with Python and TypeScript. Let me ask you some targeted questions to identify potential gaps.\\n\\nFirst question: Can you describe a time when you had to design a system that needed to handle significant scale?"),
        ("user", "At TechCorp, I led the migration from a monolith to microservices. We had to handle about 50K requests per second at peak. I chose to use event-driven architecture with Kafka for inter-service communication."),
        ("assistant", "Excellent example! Your experience with microservices migration and event-driven architecture is strong.\\n\\nFollow-up: How did you handle data consistency across your microservices? Did you implement any specific patterns like saga or eventual consistency?"),
    ]
    coach_msg_values = []
    for role, content in coach_messages:
        escaped = content.replace("'", "''")
        coach_msg_values.append(
            f"('{MSG_IDS[msg_idx]}', '{CONV_IDS[0]}', '{role}', '{escaped}')"
        )
        msg_idx += 1

    # Messages for conversation 2 (Scout)
    scout_messages = [
        ("user", "Can you analyze the Senior Software Engineer - AI position at Anthropic for me?"),
        ("assistant", "I have analyzed the Anthropic position against your profile.\\n\\n**Match Score: 95/100**\\n\\n**Strong Matches:**\\n- Python expertise (8 years)\\n- Cloud infrastructure experience with AWS\\n- Full-stack development background\\n\\n**Potential Gaps:**\\n- No explicit AI/ML experience listed\\n\\n**Recommendation:** This is an excellent match. Emphasize any AI-adjacent work you have done."),
    ]
    scout_msg_values = []
    for role, content in scout_messages:
        escaped = content.replace("'", "''")
        scout_msg_values.append(
            f"('{MSG_IDS[msg_idx]}', '{CONV_IDS[1]}', '{role}', '{escaped}')"
        )
        msg_idx += 1

    # Messages for conversation 3 (Tailor)
    tailor_messages = [
        ("user", "I need help tailoring my resume for the Senior Engineer - Developer Tools position at GitHub."),
        ("assistant", "I will help you tailor your resume for the GitHub Developer Tools role.\\n\\n**Key adjustments:**\\n1. Lead with CI/CD experience\\n2. Emphasize developer experience focus\\n3. Showcase open-source contributions\\n4. Quantify impact with metrics\\n\\nShall I draft a tailored summary section?"),
        ("user", "Yes, please draft a tailored summary."),
        ("assistant", "Here is a tailored summary:\\n\\n**Senior Software Engineer** with 8+ years of experience building developer-facing tools and platform infrastructure. Led the design and implementation of CI/CD pipelines that reduced deployment cycles from hours to minutes. Architected microservices platform on AWS serving 50K+ requests/second with 99.9%% uptime. Passionate about developer experience and building tools that make engineering teams more productive."),
    ]
    tailor_msg_values = []
    for role, content in tailor_messages:
        escaped = content.replace("'", "''")
        tailor_msg_values.append(
            f"('{MSG_IDS[msg_idx]}', '{CONV_IDS[2]}', '{role}', '{escaped}')"
        )
        msg_idx += 1

    all_msg_values = coach_msg_values + scout_msg_values + tailor_msg_values
    op.execute(sa.text(
        "INSERT INTO agent_messages (id, conversation_id, role, content) VALUES "
        + ", ".join(all_msg_values)
        + " ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    # Delete in reverse order of dependencies
    op.execute(sa.text("DELETE FROM agent_messages WHERE conversation_id IN ("
        f"'{CONV_IDS[0]}', '{CONV_IDS[1]}', '{CONV_IDS[2]}')"))
    op.execute(sa.text("DELETE FROM agent_conversations WHERE user_id = "
        f"'{USER_PRO}'"))
    op.execute(sa.text("DELETE FROM applications WHERE user_id = "
        f"'{USER_PRO}'"))
    op.execute(sa.text("DELETE FROM job_listings WHERE user_id = "
        f"'{USER_PRO}'"))
    op.execute(sa.text(f"DELETE FROM profile_educations WHERE profile_id = '{PROFILE_PRO}'"))
    op.execute(sa.text(f"DELETE FROM profile_experiences WHERE profile_id = '{PROFILE_PRO}'"))
    op.execute(sa.text(f"DELETE FROM profile_skills WHERE profile_id = '{PROFILE_PRO}'"))
    op.execute(sa.text(f"DELETE FROM profiles WHERE id = '{PROFILE_PRO}'"))
    op.execute(sa.text(
        f"DELETE FROM users WHERE id IN ('{USER_ADMIN}', '{USER_MANAGER}', '{USER_PRO}', '{USER_REGULAR}')"))
    op.execute(sa.text("DELETE FROM role_permissions WHERE role_id IN ("
        f"'{ROLE_SUPER_ADMIN}', '{ROLE_ADMIN}', '{ROLE_PRO_USER}', '{ROLE_USER}')"))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE resource IN ('dashboard', 'profile', 'jobs', 'applications', 'agents', 'settings', 'users', 'roles')"))
    op.execute(sa.text(
        f"DELETE FROM roles WHERE id IN ('{ROLE_SUPER_ADMIN}', '{ROLE_ADMIN}', '{ROLE_PRO_USER}', '{ROLE_USER}')"))
