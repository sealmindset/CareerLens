"""Tailor Agent -- Resume customization.

Rewrites the candidate's resume to authentically match a specific job listing.
Never fabricates experience -- reframes existing experience to highlight relevance.

When a resume variant is available, uses it as the starting base instead of the raw profile.
After tailoring, evaluates both the original variant and tailored version to recommend
which has the better chance of landing an interview.

Produces: tailored_resume, keyword_optimization, resume_evaluation (if variant available)
"""

import json
import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resume_variant import ResumeVariant
from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


def _format_variant_context(variant: ResumeVariant) -> str:
    """Format a resume variant's structured data as context for the AI."""
    parts = [f"## Resume Variant: {variant.name}\n"]

    if variant.headline:
        parts.append(f"**Headline:** {variant.headline}")
    if variant.summary:
        parts.append(f"**Summary:** {variant.summary}")

    if variant.skills:
        skills_text = ", ".join(
            f"{s.get('skill_name', '')} ({s.get('proficiency_level', 'intermediate')})"
            for s in variant.skills
        )
        parts.append(f"**Skills:** {skills_text}")

    if variant.experiences:
        parts.append("\n**Experience:**")
        for exp in variant.experiences:
            current = " (current)" if exp.get("is_current") else ""
            dates = ""
            if exp.get("start_date"):
                dates = f" ({exp['start_date']}"
                dates += f" - {exp.get('end_date', 'present')})"
            parts.append(f"- **{exp.get('title', '')}** at {exp.get('company', '')}{dates}{current}")
            if exp.get("description"):
                parts.append(f"  {exp['description']}")
            if exp.get("accomplishments"):
                for acc in exp["accomplishments"]:
                    parts.append(f"  - {acc}")
            if exp.get("leadership_indicators"):
                parts.append(f"  Leadership: {', '.join(exp['leadership_indicators'])}")

    if variant.educations:
        parts.append("\n**Education:**")
        for edu in variant.educations:
            degree = f"{edu.get('degree', '')} in " if edu.get("degree") else ""
            field = edu.get("field_of_study", "")
            parts.append(f"- {degree}{field} at {edu.get('institution', '')}")

    if variant.certifications:
        parts.append("\n**Certifications:**")
        for cert in variant.certifications:
            parts.append(f"- {cert.get('name', '')}{' (' + cert['issuer'] + ')' if cert.get('issuer') else ''}")

    if variant.raw_resume_text:
        preview = variant.raw_resume_text[:3000]
        if len(variant.raw_resume_text) > 3000:
            preview += "\n[... resume continues ...]"
        parts.append(f"\n**Full Resume Text:**\n{preview}")

    return "\n".join(parts)


async def _get_matched_variant(
    db: AsyncSession, context: AgentContext
) -> ResumeVariant | None:
    """Get the best-matched resume variant for this application's job."""
    # Check if application already has a variant selected
    if context.application.resume_variant_id:
        result = await db.execute(
            select(ResumeVariant).where(
                ResumeVariant.id == context.application.resume_variant_id
            )
        )
        return result.scalar_one_or_none()

    # Auto-match: find user's variants and pick the best one
    result = await db.execute(
        select(ResumeVariant).where(ResumeVariant.user_id == context.user_id)
    )
    variants = result.scalars().all()

    if not variants:
        return None

    # Simple keyword matching against job description
    jd_text = f"{context.job.title or ''} {context.job.company or ''} {context.job.description or ''}".lower()

    best_variant = None
    best_score = -1.0

    for v in variants:
        score = 0.0
        keywords = v.matching_keywords or []
        matched = [kw for kw in keywords if kw.lower() in jd_text]
        if keywords:
            score = (len(matched) / len(keywords)) * 80
        if v.is_default:
            score = max(score, 40.0)
        if v.target_roles:
            role_targets = [r.strip().lower() for r in v.target_roles.split(",")]
            title_lower = (context.job.title or "").lower()
            if any(target in title_lower for target in role_targets):
                score += 20
        if score > best_score:
            best_score = score
            best_variant = v

    return best_variant


async def run_tailor_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Tailor agent's resume customization task."""

    # Try to get a matched resume variant
    variant = await _get_matched_variant(context.db, context)
    variant_context = ""
    if variant:
        variant_context = (
            f"\n\n{_format_variant_context(variant)}\n\n"
            f"IMPORTANT: Use the resume variant above as your PRIMARY source material. "
            f"This variant ('{variant.name}') was specifically chosen for this type of role. "
            f"Base your tailored resume on this variant's content, framing, and emphasis -- "
            f"do not fall back to the generic profile unless the variant is missing information."
        )

    # Task 1: Tailored Resume
    resume_prompt = f"""Rewrite the candidate's resume specifically tailored for this job listing.
{variant_context}

CRITICAL: The output must be a CLEAN, SUBMISSION-READY resume that can be sent directly to
an employer or parsed by an ATS. Do NOT include any commentary, rationale, analysis, notes,
explanations, blockquotes, or "why this matters" annotations. No text that starts with ">".
The resume should look exactly like what a candidate would submit -- nothing more.

RULES:
- NEVER fabricate experience, skills, or achievements
- Reframe existing experience to highlight relevance to this specific role
- Use keywords and phrases from the job description naturally
- Quantify achievements where the data exists (don't invent numbers)
- Optimize for ATS (Applicant Tracking Systems) by including exact keyword matches
- Maintain the candidate's authentic voice
- NO commentary, notes, or explanations mixed into the resume content
- NO blockquotes (lines starting with ">") anywhere in the output

STRUCTURE the tailored resume as:
1. **Professional Summary** -- 3-4 sentences tailored to this role
2. **Key Skills** -- organized by relevance to the job requirements
3. **Professional Experience** -- each role reframed for relevance, most recent first
4. **Education** -- highlight relevant coursework or achievements
5. **Additional** -- certifications, projects, or other relevant items

For each experience entry, include:
- The original title and company (unchanged)
- Rewritten bullet points that emphasize relevance to the target role

Format as clean markdown ready to be converted to a professional document."""

    resume_response = await call_agent_ai(
        context.db, "tailor", resume_prompt, context
    )

    resume_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="tailored_resume",
        title=f"Tailored Resume: {context.job.title} at {context.job.company}",
        content=resume_response,
    )

    # Task 2: Keyword Optimization Guide
    keyword_prompt = """Create a keyword optimization guide for this application.

Analyze the job description and produce:

1. **Must-Include Keywords** -- terms that MUST appear in the resume/cover letter
   - The exact keyword or phrase
   - Where it appears in the job description
   - How the candidate's profile maps to it
   - Suggested placement (summary, skills, experience bullet)

2. **ATS Tips** -- specific formatting and keyword tips for this company's likely ATS
   - File format recommendations
   - Section heading conventions
   - Skills section formatting

3. **Language Matching** -- phrases from the job description to echo:
   - Job description says → Resume should say
   - (Map the company's language to the candidate's experience)

4. **Red Flags to Avoid** -- things that might trigger ATS rejection or recruiter skip

Format as a practical checklist the candidate can use while reviewing their resume."""

    keyword_response = await call_agent_ai(
        context.db, "tailor", keyword_prompt, context
    )

    keyword_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="keyword_optimization",
        title=f"Keyword Optimization: {context.job.title}",
        content=keyword_response,
    )

    artifacts = [resume_artifact, keyword_artifact]

    # Task 3: Resume Evaluation (only if we have a variant to compare against)
    if variant and variant.raw_resume_text:
        evaluation_prompt = f"""You are evaluating two versions of a resume for the same job application.

## Original Variant Resume ("{variant.name}")
{variant.raw_resume_text[:4000]}

## AI-Tailored Resume
{resume_response[:4000]}

## Job Listing
{context.job.title} at {context.job.company}
{(context.job.description or '')[:2000]}

Evaluate both resumes against this specific job listing and provide your recommendation.
Consider:
- ATS keyword optimization and pass-through likelihood
- Relevance of framing and emphasis to the specific role
- Authenticity and natural language (does it read like a real person?)
- Impact of quantified achievements
- Overall hiring manager impression

Return your evaluation as a JSON object (no markdown fencing):
{{
  "recommended": "original" or "tailored",
  "reasoning": "2-3 sentence explanation of why this version is stronger for THIS specific role",
  "original_strengths": ["strength 1", "strength 2"],
  "tailored_strengths": ["strength 1", "strength 2"],
  "key_differences": ["difference 1", "difference 2", "difference 3"]
}}"""

        try:
            from app.ai.provider import get_ai_provider, get_model_for_tier
            provider = get_ai_provider()
            model = get_model_for_tier("standard")
            eval_raw = await provider.complete(
                system_prompt="You are an expert resume reviewer and hiring consultant. Provide honest, actionable evaluation.",
                user_prompt=evaluation_prompt,
                model=model,
                temperature=0.3,
                max_tokens=2048,
            )
            # Clean JSON response
            cleaned = eval_raw.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
                cleaned = re.sub(r"\s*```$", "", cleaned)
            eval_data = json.loads(cleaned.strip())

            # Format as readable markdown
            rec = eval_data.get("recommended", "tailored")
            rec_label = f"**{variant.name} (Original)**" if rec == "original" else "**AI-Tailored Version**"
            eval_content = f"# Resume Evaluation: {context.job.title} at {context.job.company}\n\n"
            eval_content += f"## Recommendation: {rec_label}\n\n"
            eval_content += f"{eval_data.get('reasoning', '')}\n\n"
            eval_content += f"### Original Variant Strengths ({variant.name})\n"
            for s in eval_data.get("original_strengths", []):
                eval_content += f"- {s}\n"
            eval_content += "\n### Tailored Version Strengths\n"
            for s in eval_data.get("tailored_strengths", []):
                eval_content += f"- {s}\n"
            eval_content += "\n### Key Differences\n"
            for d in eval_data.get("key_differences", []):
                eval_content += f"- {d}\n"
            eval_content += "\n---\n"
            eval_content += f"*Choose the version that best represents your candidacy for this role. "
            eval_content += f"The {'original variant' if rec == 'original' else 'tailored version'} is recommended, "
            eval_content += "but the final choice is yours.*"

            eval_artifact = await save_artifact(
                db=context.db,
                workspace_id=context.workspace_id,
                agent_name="tailor",
                artifact_type="resume_evaluation",
                title=f"Resume Evaluation: {variant.name} vs Tailored",
                content=eval_content,
            )
            artifacts.append(eval_artifact)
        except Exception as e:
            logger.warning("Resume evaluation failed: %s", e)

    return artifacts
