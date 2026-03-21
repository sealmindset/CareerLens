"""Add Zero Trust domain knowledge to all agent prompts.

Revision ID: 012
Revises: 011
"""

from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"

ZERO_TRUST_SECTION = """

## DOMAIN KNOWLEDGE: ZERO TRUST SECURITY

When the user's profile references Zero Trust, use this authoritative definition and framing:

Zero Trust security is built on one simple idea: **never assume trust, always verify.** Whether it's a person, an AI agent, or an app trying to access resources, nothing is trusted by default. Equally, protections should be designed to work seamlessly behind the scenes, keeping business operations secure without impacting productivity.

By design, Zero Trust follows **three core principles** to guard entry to the network and protect critical assets:

1. **Verify Explicitly** — Always confirm *who* (a person or device) or *what* (an AI agent or other process) is requesting access to the environment. Every access request is authenticated and authorized based on all available data points.

2. **Enforce Least Privilege Access** — Grant only the permissions needed to specific resources to get the work done, and only for as long as necessary. Minimize the blast radius of any potential breach.

3. **Assume Breach** — Operate under the assumption that the environment has already been compromised, so proactive defenses are in place to protect the most critical assets. Segment access, verify end-to-end encryption, and use analytics to detect and respond to threats.

When referencing Zero Trust in generated content (resumes, cover letters, headlines, summaries, interview prep):
- Frame it as a **strategic approach**, not just a technology or product
- Emphasize the **business enablement** angle — security that works behind the scenes without slowing people down
- Connect it to the three core principles when appropriate
- Position the user as someone who understands Zero Trust as a philosophy of continuous verification, not a checkbox
"""

# All active agent prompt slugs
PROMPT_SLUGS = [
    "brand-advisor-system",
    "experience-enhancer-system",
    "coach-system",
    "strategist-system",
    "tailor-system",
    "scout-system",
    "coordinator-system",
]


def upgrade():
    for slug in PROMPT_SLUGS:
        op.execute(
            sa.text(
                "UPDATE managed_prompts SET content = content || :section, "
                "updated_at = NOW() WHERE slug = :slug"
            ).bindparams(section=ZERO_TRUST_SECTION, slug=slug)
        )


def downgrade():
    for slug in PROMPT_SLUGS:
        op.execute(
            sa.text(
                "UPDATE managed_prompts SET content = REPLACE(content, :section, ''), "
                "updated_at = NOW() WHERE slug = :slug"
            ).bindparams(section=ZERO_TRUST_SECTION, slug=slug)
        )
