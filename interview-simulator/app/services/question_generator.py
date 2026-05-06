import json
import logging

from app.services.ai_provider import ai_complete, parse_json_response

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert interview question designer for professional job interviews.
Generate realistic interview questions that a real interviewer would ask.

Rules:
- Questions must be specific to the role, company, and industry
- Mix question types as requested (behavioral, technical, situational)
- Include follow-up probes an interviewer might naturally ask
- If interviewer context is provided, adjust tone and focus accordingly
- Return ONLY valid JSON, no markdown fences, no commentary"""

QUESTION_TYPES = {
    "behavioral": "Behavioral questions (STAR method). Focus on past experiences, teamwork, leadership, conflict resolution, and decision-making.",
    "technical": "Technical questions specific to the role. Focus on domain knowledge, problem-solving approaches, system design, and technical decision-making.",
    "conversational": "Conversational questions. Mix of light rapport-building, culture-fit, motivation, and experience questions. More natural flow.",
}


def _build_agent_context_block(agent_context: dict | None) -> str:
    if not agent_context:
        return ""

    parts = []
    gaps = agent_context.get("skill_gaps")
    if gaps and isinstance(gaps, list):
        gap_names = [g.get("requirement", g.get("skill", str(g))) for g in gaps[:10]]
        parts.append(f"Candidate Skill Gaps (probe these areas):\n- " + "\n- ".join(gap_names))
    elif gaps and isinstance(gaps, str):
        parts.append(f"Candidate Skill Gaps (probe these areas):\n{gaps[:1500]}")

    review = agent_context.get("hiring_manager_review")
    if review:
        parts.append(f"Hiring Manager Concerns:\n{review[:1500]}")

    stage = agent_context.get("interview_stage")
    if stage:
        parts.append(f"Interview Stage: {stage} — adjust question focus accordingly.")

    seniority = agent_context.get("candidate_seniority")
    if seniority:
        parts.append(f"Candidate Seniority: {seniority} — calibrate difficulty appropriately.")

    if not parts:
        return ""
    return "\n\n".join(parts)


async def generate_questions(
    job_title: str,
    company: str,
    job_description: str | None,
    interviewer_context: str | None,
    interview_style: str,
    question_count: int,
    agent_context: dict | None = None,
) -> list[dict]:
    style_guide = QUESTION_TYPES.get(interview_style, QUESTION_TYPES["behavioral"])
    context_block = _build_agent_context_block(agent_context)

    user_prompt = f"""Generate exactly {question_count} interview questions.

Role: {job_title}
Company: {company}
Interview Style: {interview_style}
Style Guide: {style_guide}

{"Job Description:\n" + job_description if job_description else "No job description provided."}

{"Interviewer Background:\n" + interviewer_context if interviewer_context else "No specific interviewer context."}

{context_block}

Return a JSON array of objects with these fields:
- "index": question number (1-based)
- "text": the question text
- "type": one of "behavioral", "technical", "situational", "follow_up", "rapport"
- "expected_signals": array of 2-4 things a strong answer would include

Example format:
[
  {{
    "index": 1,
    "text": "Tell me about a time you had to lead a cross-functional team through a challenging project.",
    "type": "behavioral",
    "expected_signals": ["specific project example", "leadership actions taken", "measurable outcome", "lessons learned"]
  }}
]"""

    try:
        raw = await ai_complete(SYSTEM_PROMPT, user_prompt, temperature=0.7)
        questions = parse_json_response(raw)
        if not isinstance(questions, list):
            raise ValueError("Expected a JSON array")

        validated = []
        for i, q in enumerate(questions[:question_count]):
            validated.append({
                "index": q.get("index", i + 1),
                "text": q["text"],
                "type": q.get("type", "behavioral"),
                "expected_signals": q.get("expected_signals", []),
            })
        logger.info("Generated %d questions for %s at %s", len(validated), job_title, company)
        return validated
    except Exception as exc:
        logger.error("Question generation failed: %s", exc)
        return _fallback_questions(job_title, question_count, interview_style)


def _fallback_questions(job_title: str, count: int, style: str) -> list[dict]:
    templates = {
        "behavioral": [
            "Tell me about a time you had to deal with a difficult situation at work.",
            "Describe a project you're most proud of and why.",
            "How do you handle disagreements with team members?",
            "Tell me about a time you failed and what you learned from it.",
            "Describe a situation where you had to adapt to a significant change.",
            "Tell me about a time you went above and beyond expectations.",
            "How do you prioritize when you have multiple urgent tasks?",
            "Describe a time you had to influence someone without direct authority.",
            "Tell me about a time you received difficult feedback.",
            "How do you approach learning new skills or technologies?",
        ],
        "technical": [
            f"Walk me through your technical approach to a recent {job_title} project.",
            "How do you ensure quality in your technical deliverables?",
            "Describe your approach to debugging a complex issue.",
            "How do you stay current with industry trends and best practices?",
            "Walk me through how you would design a system for high availability.",
            "How do you approach code reviews or technical documentation?",
            "Describe a technical decision you made that had significant impact.",
            "How do you balance technical debt with feature development?",
            "What's your approach to testing and quality assurance?",
            "How do you handle ambiguous technical requirements?",
        ],
        "conversational": [
            "What drew you to this role and our company?",
            "How would your colleagues describe your working style?",
            "What does an ideal work environment look like for you?",
            "What are you looking to learn or develop in your next role?",
            "Tell me about something you're passionate about outside of work.",
            "How do you approach collaboration with remote team members?",
            "What's the most interesting problem you've worked on recently?",
            "How do you define success in your career?",
            "What questions do you have about our team culture?",
            "Where do you see yourself growing in the next few years?",
        ],
    }
    pool = templates.get(style, templates["behavioral"])
    return [
        {
            "index": i + 1,
            "text": pool[i % len(pool)],
            "type": style,
            "expected_signals": ["specific example", "clear outcome"],
        }
        for i in range(count)
    ]
