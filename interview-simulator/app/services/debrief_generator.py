import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.debrief import InterviewSimDebrief
from app.models.question import InterviewSimQuestion
from app.models.response import InterviewSimResponse
from app.models.session import InterviewSimSession
from app.services.ai_provider import ai_complete

logger = logging.getLogger(__name__)

DEBRIEF_SYSTEM_PROMPT = """You are an expert interview coach writing a post-interview debrief.
Focus on COMMUNICATION quality — how well the candidate delivered their answers, not content correctness.

Write in markdown. Be direct, actionable, and specific. Reference actual responses when possible.
Do NOT fabricate information not present in the data."""


async def generate_debrief(db: AsyncSession, session_id) -> InterviewSimDebrief:
    session = await db.get(InterviewSimSession, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")

    questions = (
        await db.execute(
            select(InterviewSimQuestion)
            .where(InterviewSimQuestion.session_id == session_id)
            .order_by(InterviewSimQuestion.question_index)
        )
    ).scalars().all()

    responses = (
        await db.execute(
            select(InterviewSimResponse)
            .where(InterviewSimResponse.session_id == session_id)
        )
    ).scalars().all()
    response_map = {r.question_id: r for r in responses}

    # Build per-question summary
    q_summaries = []
    total_clarity = []
    total_specificity = []
    total_confidence = []
    total_structure = []
    total_filler = 0
    total_nudges = 0

    for q in questions:
        resp = response_map.get(q.id)
        if not resp:
            q_summaries.append(f"Q{q.question_index}: {q.question_text}\n  → (no response)")
            continue

        scores = (
            f"clarity={resp.clarity_score:.1f}, "
            f"specificity={resp.specificity_score:.1f}, "
            f"confidence={resp.confidence_score:.1f}, "
            f"structure={resp.structure_score:.1f}"
            if resp.clarity_score is not None
            else "not scored"
        )

        q_summaries.append(
            f"Q{q.question_index}: {q.question_text}\n"
            f"  Response ({resp.pace_wpm or '?'} wpm, {resp.filler_word_count} fillers, "
            f"example: {resp.example_quality or '?'}): {scores}\n"
            f"  Transcript excerpt: {resp.transcript[:200]}..."
            f"{'  ⚠️ Was nudged' if resp.was_nudged else ''}"
        )

        if resp.clarity_score is not None:
            total_clarity.append(resp.clarity_score)
        if resp.specificity_score is not None:
            total_specificity.append(resp.specificity_score)
        if resp.confidence_score is not None:
            total_confidence.append(resp.confidence_score)
        if resp.structure_score is not None:
            total_structure.append(resp.structure_score)
        total_filler += resp.filler_word_count
        if resp.was_nudged:
            total_nudges += 1

    avg = lambda lst: round(sum(lst) / len(lst), 2) if lst else 0.5

    avg_clarity = avg(total_clarity)
    avg_specificity = avg(total_specificity)
    avg_confidence = avg(total_confidence)
    avg_structure = avg(total_structure)

    agent_ctx = session.agent_context or {}
    has_stories = bool(agent_ctx.get("story_bank_summaries"))
    has_gaps = bool(agent_ctx.get("skill_gaps"))

    context_block = ""
    if has_stories:
        stories = agent_ctx["story_bank_summaries"]
        story_lines = []
        for s in (stories if isinstance(stories, list) else [])[:15]:
            title = s.get("story_title", s.get("title", "Untitled"))
            hook = s.get("hook_line", "")
            keywords = ", ".join(s.get("trigger_keywords", [])[:5])
            story_lines.append(f"- {title}: {hook} (keywords: {keywords})")
        if story_lines:
            context_block += f"\nCandidate's Prepared STAR Stories:\n" + "\n".join(story_lines) + "\n"

    if has_gaps:
        gaps = agent_ctx["skill_gaps"]
        if isinstance(gaps, list):
            gap_names = [g.get("requirement", g.get("skill", str(g))) for g in gaps[:10]]
            context_block += f"\nKnown Skill Gaps:\n- " + "\n- ".join(gap_names) + "\n"
        elif isinstance(gaps, str):
            context_block += f"\nKnown Skill Gaps:\n{gaps[:1500]}\n"

    extra_sections = ""
    if has_stories:
        extra_sections += "\n5. **Story Utilization** — which prepared stories the candidate referenced vs. missed opportunities to cite specific experiences"
    if has_gaps:
        extra_sections += "\n6. **Gap Correlation** — map weak answers to the candidate's known skill gaps with actionable advice"

    section_count = "FOUR" if not extra_sections else ("SIX" if has_stories and has_gaps else "FIVE")

    user_prompt = f"""Generate a post-interview debrief for this practice session.

Role: {session.job_title} at {session.company}
Style: {session.interview_style}
Questions answered: {len(responses)}/{len(questions)}
Total filler words: {total_filler}
Times nudged: {total_nudges}
Average scores: clarity={avg_clarity}, specificity={avg_specificity}, confidence={avg_confidence}, structure={avg_structure}

Per-question breakdown:
{chr(10).join(q_summaries)}
{context_block}
Generate {section_count} markdown sections:
1. **What Landed** — specific things the candidate did well (communication-wise)
2. **What Missed** — specific communication weaknesses with examples
3. **Portfolio Gaps** — topics/areas where the candidate had no concrete examples to draw from
4. **Improvement Plan** — 3-5 actionable steps to improve communication for next time{extra_sections}

Return each section as plain markdown text."""

    try:
        raw = await ai_complete(DEBRIEF_SYSTEM_PROMPT, user_prompt, temperature=0.5)
        sections = _parse_sections(raw)
    except Exception as exc:
        logger.error("AI debrief generation failed: %s", exc)
        sections = {
            "what_landed": "Debrief generation failed. Review individual question scores.",
            "what_missed": "",
            "portfolio_gaps": "",
            "improvement_plan": "",
        }

    # Compute integer scores (0-100)
    to_100 = lambda v: round(v * 100)

    overall = round((avg_clarity + avg_specificity + avg_confidence + avg_structure) / 4 * 100)

    # Word count → conciseness
    total_words = sum(len(r.transcript.split()) for r in responses if r.transcript)
    words_per_answer = total_words / max(len(responses), 1)
    conciseness = 80 if 50 <= words_per_answer <= 200 else (60 if words_per_answer < 50 else 50)

    debrief = InterviewSimDebrief(
        session_id=session_id,
        user_id=session.user_id,
        overall_score=overall,
        clarity_score=to_100(avg_clarity),
        specificity_score=to_100(avg_specificity),
        confidence_score=to_100(avg_confidence),
        structure_score=to_100(avg_structure),
        conciseness_score=conciseness,
        what_landed=sections.get("what_landed", ""),
        what_missed=sections.get("what_missed", ""),
        portfolio_gaps=sections.get("portfolio_gaps", ""),
        improvement_plan=sections.get("improvement_plan", ""),
        story_utilization=sections.get("story_utilization") or None,
        gap_correlation=sections.get("gap_correlation") or None,
    )
    db.add(debrief)

    # Update session overall score
    session.overall_score = {
        "overall": overall,
        "clarity": to_100(avg_clarity),
        "specificity": to_100(avg_specificity),
        "confidence": to_100(avg_confidence),
        "structure": to_100(avg_structure),
        "conciseness": conciseness,
    }

    await db.commit()
    await db.refresh(debrief)
    return debrief


def _parse_sections(raw: str) -> dict:
    sections = {
        "what_landed": "",
        "what_missed": "",
        "portfolio_gaps": "",
        "improvement_plan": "",
    }
    current_key = None
    buffer: list[str] = []

    key_map = {
        "what landed": "what_landed",
        "what missed": "what_missed",
        "portfolio gaps": "portfolio_gaps",
        "improvement plan": "improvement_plan",
        "story utilization": "story_utilization",
        "gap correlation": "gap_correlation",
    }

    for line in raw.split("\n"):
        stripped = line.strip().lower().replace("**", "").replace("##", "").strip()
        matched = False
        for label, key in key_map.items():
            if label in stripped:
                if current_key and buffer:
                    sections[current_key] = "\n".join(buffer).strip()
                current_key = key
                buffer = []
                matched = True
                break
        if not matched:
            buffer.append(line)

    if current_key and buffer:
        sections[current_key] = "\n".join(buffer).strip()

    return sections
