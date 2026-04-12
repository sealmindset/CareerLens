"""Talking Points Agent -- Interview story generation.

Transforms each bullet point from the tailored resume into a compelling
interview story using the Problem-Solved-Deployed framework.  Sources detail
from resume variants and the user profile to enrich thin bullets.

Integrates with the Story Bank:
- Reuses existing stories when a bullet fuzzy-matches a banked story
- Saves newly generated stories to the bank for future reuse
- Increments times_used on reused stories

Produces: interview_stories, story_cheatsheet
"""

import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_variant import ResumeVariant
from app.models.story_bank import StoryBankStory
from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Variant context for story enrichment
# ---------------------------------------------------------------------------

async def _load_all_variants(db: AsyncSession, user_id) -> list[ResumeVariant]:
    result = await db.execute(
        select(ResumeVariant).where(ResumeVariant.user_id == user_id)
    )
    return list(result.scalars().all())


def _format_variants_as_source_material(variants: list[ResumeVariant]) -> str:
    """Format all resume variants as source material for story enrichment.

    Extracts accomplishments, leadership indicators, and scope metrics that
    may not appear in the condensed tailored resume.
    """
    if not variants:
        return ""

    parts = ["## Source Material from Resume Variants\n"]

    for v in variants:
        parts.append(f"### Variant: \"{v.name}\"")

        if v.headline:
            parts.append(f"**Headline:** {v.headline}")
        if v.summary:
            parts.append(f"**Summary:** {v.summary}")

        if v.experiences:
            for exp in v.experiences:
                company = exp.get("company", "")
                title = exp.get("title", "")
                if not company and not title:
                    continue

                parts.append(f"\n**{title} at {company}**")

                if exp.get("description"):
                    parts.append(f"  Description: {exp['description']}")

                if exp.get("accomplishments"):
                    parts.append("  Accomplishments:")
                    for acc in exp["accomplishments"]:
                        parts.append(f"    - {acc}")

                if exp.get("leadership_indicators"):
                    parts.append(
                        f"  Leadership: {', '.join(exp['leadership_indicators'])}"
                    )

                scope = exp.get("scope_metrics") or {}
                scope_items = []
                if scope.get("team_size"):
                    scope_items.append(f"team_size={scope['team_size']}")
                if scope.get("budget"):
                    scope_items.append(f"budget={scope['budget']}")
                if scope.get("org_reach"):
                    scope_items.append(f"org_reach={scope['org_reach']}")
                if scope_items:
                    parts.append(f"  Scope: {', '.join(scope_items)}")

        if v.certifications:
            certs = ", ".join(
                c.get("name", "") for c in v.certifications if c.get("name")
            )
            if certs:
                parts.append(f"**Certifications:** {certs}")

        parts.append("")  # blank line between variants

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Story Bank helpers
# ---------------------------------------------------------------------------

def _normalize(text: str) -> set[str]:
    """Normalize text to a set of lowercase words for comparison."""
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _word_overlap_ratio(a: str, b: str) -> float:
    """Compute word overlap ratio between two strings (Jaccard-like)."""
    words_a = _normalize(a)
    words_b = _normalize(b)
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


MATCH_THRESHOLD = 0.55


def _match_bullet_to_story(
    bullet: str, stories: list[StoryBankStory]
) -> StoryBankStory | None:
    """Find the best matching story for a bullet, or None."""
    best_match: StoryBankStory | None = None
    best_score = 0.0

    for story in stories:
        score = _word_overlap_ratio(bullet, story.source_bullet)
        if score > best_score:
            best_score = score
            best_match = story

    if best_score >= MATCH_THRESHOLD and best_match:
        return best_match
    return None


async def _load_story_bank(
    db: AsyncSession, user_id: uuid.UUID
) -> list[StoryBankStory]:
    """Load all active stories from the user's Story Bank."""
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.user_id == user_id,
            StoryBankStory.status == "active",
        )
    )
    return list(result.scalars().all())


def _format_reused_story(story: StoryBankStory) -> str:
    """Format a banked story as markdown matching the AI output format."""
    title = story.story_title
    parts = [
        f"### {story.source_title or 'Role'} at {story.source_company or 'Company'} → {title}",
        "",
        "**THE PROBLEM (The Hook)**",
        story.problem,
        "",
        "**HOW I SOLVED IT (The Differentiator)**",
        story.solved,
        "",
        "**WHAT I DEPLOYED (The Proof)**",
        story.deployed,
    ]
    if story.takeaway:
        parts.extend(["", f"**Key Takeaway:** {story.takeaway}"])
    return "\n".join(parts)


def _format_reused_cheatsheet_entry(story: StoryBankStory) -> str:
    """Format a banked story as a cheatsheet card."""
    label = f"{story.source_title or 'Role'} → {story.story_title}"
    hook = story.hook_line or "(no hook saved)"
    triggers = ", ".join(story.trigger_keywords) if story.trigger_keywords else "(no triggers)"
    proof = story.proof_metric or "(no metric)"
    return f"**{label}**\nHook: {hook}\nTriggers: {triggers}\nProof: {proof}"


def _parse_stories_from_markdown(
    markdown: str,
) -> list[dict]:
    """Parse AI-generated stories markdown into structured dicts.

    Each story block starts with ### and contains Problem/Solved/Deployed sections.
    """
    stories: list[dict] = []

    # Split on ### headings
    blocks = re.split(r"\n(?=### )", markdown)

    for block in blocks:
        block = block.strip()
        if not block.startswith("###"):
            continue

        # Extract title line
        title_match = re.match(r"###\s+(.+?)(?:\n|$)", block)
        if not title_match:
            continue

        full_title = title_match.group(1).strip()

        # Parse company/title from "Role at Company → Summary"
        source_company = ""
        source_title = ""
        story_title = full_title
        arrow_match = re.match(r"(.+?)\s+at\s+(.+?)\s*→\s*(.+)", full_title)
        if arrow_match:
            source_title = arrow_match.group(1).strip()
            source_company = arrow_match.group(2).strip()
            story_title = arrow_match.group(3).strip()

        # Extract sections via bold headers
        problem = ""
        solved = ""
        deployed = ""
        takeaway = ""

        problem_match = re.search(
            r"\*\*THE PROBLEM.*?\*\*\s*\n(.*?)(?=\n\*\*HOW I SOLVED|\n\*\*WHAT I DEPLOYED|\Z)",
            block, re.DOTALL
        )
        if problem_match:
            problem = problem_match.group(1).strip()

        solved_match = re.search(
            r"\*\*HOW I SOLVED.*?\*\*\s*\n(.*?)(?=\n\*\*WHAT I DEPLOYED|\n\*\*Key Takeaway|\Z)",
            block, re.DOTALL
        )
        if solved_match:
            solved = solved_match.group(1).strip()

        deployed_match = re.search(
            r"\*\*WHAT I DEPLOYED.*?\*\*\s*\n(.*?)(?=\n\*\*Key Takeaway|\Z)",
            block, re.DOTALL
        )
        if deployed_match:
            deployed = deployed_match.group(1).strip()

        takeaway_match = re.search(
            r"\*\*Key Takeaway:?\*\*\s*(.+?)(?:\n|$)", block
        )
        if takeaway_match:
            takeaway = takeaway_match.group(1).strip()

        if problem and solved and deployed:
            stories.append({
                "story_title": story_title,
                "source_company": source_company,
                "source_title": source_title,
                "problem": problem,
                "solved": solved,
                "deployed": deployed,
                "takeaway": takeaway,
            })

    return stories


def _parse_cheatsheet_entries(cheatsheet_md: str) -> list[dict]:
    """Parse cheatsheet markdown into structured dicts with hook/triggers/proof."""
    entries: list[dict] = []

    # Split on bold title lines
    blocks = re.split(r"\n(?=\*\*)", cheatsheet_md)

    for block in blocks:
        block = block.strip()
        if not block.startswith("**"):
            continue

        hook = ""
        triggers: list[str] = []
        proof = ""

        hook_match = re.search(r"Hook:\s*(.+?)(?:\n|$)", block)
        if hook_match:
            hook = hook_match.group(1).strip()

        triggers_match = re.search(r"Triggers?:\s*(.+?)(?:\n|$)", block)
        if triggers_match:
            triggers = [t.strip() for t in triggers_match.group(1).split(",") if t.strip()]

        proof_match = re.search(r"Proof:\s*(.+?)(?:\n|$)", block)
        if proof_match:
            proof = proof_match.group(1).strip()

        if hook or triggers or proof:
            entries.append({
                "hook_line": hook,
                "trigger_keywords": triggers,
                "proof_metric": proof,
            })

    return entries


async def _save_stories_to_bank(
    db: AsyncSession,
    user_id: uuid.UUID,
    parsed_stories: list[dict],
    cheatsheet_entries: list[dict],
    bullets: list[str],
    variant_id: uuid.UUID | None = None,
) -> list[StoryBankStory]:
    """Save newly generated stories to the Story Bank."""
    saved: list[StoryBankStory] = []

    for i, story_data in enumerate(parsed_stories):
        # Match cheatsheet entry by index (same order)
        cs = cheatsheet_entries[i] if i < len(cheatsheet_entries) else {}
        bullet = bullets[i] if i < len(bullets) else story_data.get("story_title", "")

        story = StoryBankStory(
            user_id=user_id,
            source_bullet=bullet,
            source_variant_id=variant_id,
            source_company=story_data.get("source_company", ""),
            source_title=story_data.get("source_title", ""),
            story_title=story_data.get("story_title", ""),
            problem=story_data["problem"],
            solved=story_data["solved"],
            deployed=story_data["deployed"],
            takeaway=story_data.get("takeaway", ""),
            hook_line=cs.get("hook_line", ""),
            trigger_keywords=cs.get("trigger_keywords", []),
            proof_metric=cs.get("proof_metric", ""),
        )
        db.add(story)
        saved.append(story)

    await db.flush()
    for s in saved:
        await db.refresh(s)

    return saved


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run_talking_points_task(
    context: AgentContext,
) -> list[WorkspaceArtifact]:
    """Run the Talking Points agent's story generation task.

    Checks the Story Bank first and reuses existing stories for matching
    bullets. Only calls the AI for bullets that don't have banked stories.
    New stories are saved to the bank for future reuse.
    """

    # Load all resume variants for enrichment
    variants = await _load_all_variants(context.db, context.user_id)
    variant_context = _format_variants_as_source_material(variants)

    # Load existing stories from the bank
    banked_stories = await _load_story_bank(context.db, context.user_id)

    # Try to extract bullet points from the tailored resume artifact
    tailored_content = ""
    for artifact in context.workspace_artifacts:
        if artifact.artifact_type == "tailored_resume":
            tailored_content = artifact.content
            break

    # Partition bullets: match against bank or queue for AI generation
    # We pass all bullets to the AI anyway for new ones, but track reused
    reused: list[tuple[str, StoryBankStory]] = []  # (bullet, matched story)
    new_bullets: list[str] = []

    if banked_stories and tailored_content:
        # Extract bullet-like lines from the tailored resume
        lines = tailored_content.split("\n")
        for line in lines:
            stripped = line.strip().lstrip("-•*").strip()
            if len(stripped) > 20 and not stripped.startswith("#"):
                match = _match_bullet_to_story(stripped, banked_stories)
                if match:
                    reused.append((stripped, match))
                else:
                    new_bullets.append(stripped)

    # Increment times_used for reused stories
    for _bullet, story in reused:
        story.times_used += 1
    if reused:
        await context.db.flush()

    logger.info(
        "Talking Points: %d stories reused from bank, %d new bullets to generate",
        len(reused),
        len(new_bullets),
    )

    # ── AI Call 1: Interview Story Guide ──────────────────────────────────
    # Only generate for new bullets (or all if no bank stories matched)

    new_stories_md = ""
    if not reused or new_bullets or not banked_stories:
        bullet_instruction = ""
        if reused and new_bullets:
            bullet_instruction = (
                "\n\n**IMPORTANT: Only generate stories for these NEW bullets "
                "(stories for other bullets already exist):**\n"
                + "\n".join(f"- {b}" for b in new_bullets)
                + "\n"
            )

        stories_prompt = f"""You are generating interview stories for every bullet point in the candidate's tailored resume.

## Source Material

### Tailored Resume
Find the "Tailored Resume" artifact in the Workspace Context above. For EVERY bullet point in
the experience section of that tailored resume, you will create one interview story.

If no tailored resume is found in workspace context, use the candidate's profile experience
section as the bullet source instead.
{bullet_instruction}
### Deeper Context (Resume Variants)
{variant_context}

Use the variant data above to enrich your stories with specifics: accomplishments, leadership
indicators, scope metrics (team sizes, budgets), and detailed descriptions that may not appear
in the condensed tailored resume.

## Output Format

For EACH bullet point, produce a story block:

---

### [Role Title] at [Company] → [Bullet summary in ≤10 words]

**THE PROBLEM (The Hook)**
[2-3 sentences. Lead with a situation the interviewer has probably lived through themselves.
Make them lean in. Set the stakes -- what was at risk, what was broken, what was the
constraint. Be specific: name the technology, the team size, the timeline, the business
pressure. This should feel like the opening of a conversation, not a presentation.]

**HOW I SOLVED IT (The Differentiator)**
[3-5 sentences. This is where judgment shows. What did you try? What did you decide NOT to do?
What was your approach and why? Show the tradeoffs you weighed. Name specific technologies,
methodologies, or frameworks you chose and WHY. Include collaboration -- who did you bring in,
what did you align on? This section separates "I was there" from "I drove the outcome."]

**WHAT I DEPLOYED (The Proof)**
[2-3 sentences. Numbers, outcomes, cultural shifts -- the thing the interviewer remembers.
Be concrete: percentages, dollar amounts, time saved, incidents reduced, team velocity gained.
If the outcome was a cultural shift or process change, describe the before/after. End with
the lasting impact -- what's still true today because of this work?]

**Key Takeaway:** [One sentence the interviewer writes in their notes.]

---

## Tone & Delivery Notes

- Each story should RUN 90 seconds to 3-4 minutes depending on interviewer engagement
- Write in FIRST PERSON as the candidate -- "I noticed that..." not "The candidate noticed..."
- The tone is natural, conversational -- like riffing with a sharp colleague over coffee
- No corporate jargon unless it's the actual name of something ("We used Kubernetes" is fine;
  "We leveraged synergistic paradigms" is not)
- The core takeaway should FLOW NATURALLY from the story, not be bolted on
- Vary the emotional register: some stories are scrappy and fast, others are strategic and slow
- If a bullet point is thin (e.g., "Managed team of 5"), still create a story -- use the
  variant data and profile to find the richer context behind it

## Rules

- NEVER fabricate experiences, numbers, or outcomes not supported by the source material
- If source material is thin for a bullet, note it and create the best story possible from
  what exists, marking uncertain details with [verify with candidate]
- Cover EVERY bullet point -- do not skip any
- Order stories by resume order (most recent role first)

Format the entire output as clean markdown."""

        new_stories_md = await call_agent_ai(
            context.db, "talking_points", stories_prompt, context
        )

    # Assemble full stories artifact: reused stories + newly generated
    all_story_parts: list[str] = []

    # Add reused stories first (they came from earlier bullets typically)
    for _bullet, story in reused:
        all_story_parts.append(_format_reused_story(story))

    # Add newly generated stories
    if new_stories_md:
        all_story_parts.append(new_stories_md)

    combined_stories = "\n\n---\n\n".join(all_story_parts) if all_story_parts else new_stories_md

    stories_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="talking_points",
        artifact_type="interview_stories",
        title=f"Interview Stories: {context.job.title} at {context.job.company}",
        content=combined_stories,
    )

    # ── AI Call 2: Story Cheatsheet ───────────────────────────────────────

    cheatsheet_prompt = f"""You are creating a pocket-card cheat sheet from the interview stories below.

## Interview Stories
{combined_stories}

## Output Format

Create a QUICK-REFERENCE CARD that fits the candidate's mental model. This is what they'd
glance at in the car before walking into the interview.

For each story, produce exactly:

**[Role → Bullet summary]**
Hook: [One sentence that opens the story -- the "lean-in" moment]
Triggers: [2-3 keywords/phrases that jog memory of the full story]
Proof: [The key number or outcome -- the thing they remember]

---

## Rules
- Keep each story entry to 3-4 lines MAXIMUM
- The hook should be the FIRST THING out of their mouth when the interviewer asks
- Trigger keywords are memory anchors -- "Redis migration", "3am incident", "exec alignment"
- The proof number should be the single most impressive metric from the story
- Maintain the same order as the stories
- NO extra commentary, headers, or instructions -- just the cards

Format as clean markdown."""

    cheatsheet_response = await call_agent_ai(
        context.db, "talking_points", cheatsheet_prompt, context
    )

    cheatsheet_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="talking_points",
        artifact_type="story_cheatsheet",
        title=f"Story Cheatsheet: {context.job.title} at {context.job.company}",
        content=cheatsheet_response,
    )

    # ── Save new stories to Story Bank ────────────────────────────────────

    if new_stories_md:
        parsed_stories = _parse_stories_from_markdown(new_stories_md)
        cheatsheet_entries = _parse_cheatsheet_entries(cheatsheet_response)

        # Offset cheatsheet entries past the reused stories
        reused_count = len(reused)
        new_cheatsheet = cheatsheet_entries[reused_count:] if reused_count < len(cheatsheet_entries) else cheatsheet_entries

        if parsed_stories:
            await _save_stories_to_bank(
                db=context.db,
                user_id=context.user_id,
                parsed_stories=parsed_stories,
                cheatsheet_entries=new_cheatsheet,
                bullets=new_bullets,
            )
            logger.info("Saved %d new stories to Story Bank", len(parsed_stories))

    return [stories_artifact, cheatsheet_artifact]
