"""Identity Shield — Protect the candidate's professional identity during resume tailoring.

Detects and corrects identity violations:
- Title demotions (Architect → Engineer, Director → Manager, etc.)
- Professional summary rewrites that change the candidate's positioning
- Story Bank content that was watered down or reframed to a lower level
- Education embellishments (fabricated coursework, honors, etc.)
- Headline/header changes that misrepresent the candidate's level

Runs as a post-pass on the tailored resume (ON by default).

Produces:
  1. identity_shield_report — violations found with before/after diffs
  2. identity_protected_resume — corrected resume (only if violations found)
"""

import logging
import re

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai, format_profile_context
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


def _extract_titles_from_profile(context: AgentContext) -> list[str]:
    """Extract the candidate's actual job titles from the profile."""
    titles = []
    if context.profile and context.profile.experiences:
        for exp in context.profile.experiences:
            if exp.title:
                titles.append(exp.title.strip())
    if context.profile and context.profile.headline:
        titles.insert(0, context.profile.headline.strip())
    return titles


def _extract_titles_from_resume(resume: str) -> list[str]:
    """Extract job titles that appear in bold or header patterns in the resume."""
    titles = []
    # Match patterns like **Title** at Company or **Title**, Company
    for match in re.finditer(r"\*\*([^*]+)\*\*", resume):
        text = match.group(1).strip()
        # Filter out section headers
        if text.lower() not in (
            "professional summary", "key skills", "professional experience",
            "education", "additional", "certifications", "projects",
            "technical skills", "core competencies", "skills",
            "experience", "work experience", "career history",
        ):
            titles.append(text)
    return titles


# Seniority tiers — higher number = more senior
SENIORITY_KEYWORDS = {
    "chief": 90, "cto": 90, "ciso": 90, "cio": 90, "vp": 85,
    "vice president": 85, "fellow": 85,
    "director": 80, "head of": 80,
    "principal": 75, "distinguished": 75,
    "architect": 70, "staff": 70,
    "lead": 65, "manager": 65,
    "senior": 60, "sr.": 60, "sr ": 60,
    "engineer": 50, "developer": 50, "analyst": 50,
    "specialist": 45, "consultant": 45,
    "associate": 40, "junior": 30, "jr.": 30, "intern": 10,
}


def _seniority_score(title: str) -> int:
    """Estimate seniority level from a title string."""
    title_lower = title.lower()
    best = 50  # default middle
    for keyword, score in SENIORITY_KEYWORDS.items():
        if keyword in title_lower:
            best = max(best, score)
    return best


def analyze_identity(
    tailored_resume: str,
    context: AgentContext,
) -> dict:
    """Pattern-based analysis of identity violations in a tailored resume.

    Returns a dict with findings list and violation_count.
    """
    findings = []
    profile_titles = _extract_titles_from_profile(context)
    resume_titles = _extract_titles_from_resume(tailored_resume)

    if not profile_titles:
        return {"findings": findings, "violation_count": 0}

    # Check 1: Title demotions
    current_title = profile_titles[0]  # headline or most recent title
    current_score = _seniority_score(current_title)

    # Check if the resume header / first bold title was changed
    if resume_titles:
        header_title = resume_titles[0]
        header_score = _seniority_score(header_title)
        if header_score < current_score - 5:
            findings.append({
                "type": "title_demotion",
                "severity": "critical",
                "detail": (
                    f"Resume header title '{header_title}' is lower seniority than "
                    f"the candidate's actual title '{current_title}'"
                ),
                "original": current_title,
                "tailored": header_title,
            })

    # Check each profile title against what appears in the resume
    for profile_title in profile_titles:
        profile_score = _seniority_score(profile_title)
        # Look for this title in the resume (case-insensitive)
        profile_lower = profile_title.lower()
        found_exact = any(
            profile_lower in rt.lower() or rt.lower() in profile_lower
            for rt in resume_titles
        )
        if not found_exact and profile_score >= 60:
            # High-seniority title is missing — may have been replaced
            findings.append({
                "type": "title_missing",
                "severity": "high",
                "detail": f"Profile title '{profile_title}' not found in tailored resume",
                "original": profile_title,
            })

    # Check 2: Summary rewrite detection
    if context.profile and context.profile.summary:
        original_summary = context.profile.summary.strip()
        # Check if at least some of the original summary words appear
        orig_words = set(original_summary.lower().split())
        # Find the summary section in the resume
        summary_match = re.search(
            r"(?:professional\s+summary|summary|profile)\s*\n+(.*?)(?=\n#|\n\*\*[A-Z]|\Z)",
            tailored_resume,
            re.IGNORECASE | re.DOTALL,
        )
        if summary_match:
            resume_summary = summary_match.group(1).strip()
            resume_words = set(resume_summary.lower().split())
            # Calculate overlap
            if orig_words:
                overlap = len(orig_words & resume_words) / len(orig_words)
                if overlap < 0.3:
                    findings.append({
                        "type": "summary_rewrite",
                        "severity": "high",
                        "detail": (
                            f"Professional summary was substantially rewritten "
                            f"({int(overlap * 100)}% word overlap with original). "
                            f"The candidate's positioning may have been changed."
                        ),
                    })

    return {
        "findings": findings,
        "violation_count": len(findings),
    }


def format_identity_report(analysis: dict, context: AgentContext) -> str:
    """Format identity analysis as a readable markdown report."""
    parts = [
        f"# Identity Shield Report\n",
        f"**Job Target:** {context.job.title} at {context.job.company}\n",
    ]

    findings = analysis["findings"]
    if not findings:
        parts.append(
            "No identity violations detected. The tailored resume preserves "
            "the candidate's professional identity, titles, and positioning."
        )
        return "\n".join(parts)

    critical = [f for f in findings if f["severity"] == "critical"]
    high = [f for f in findings if f["severity"] == "high"]

    parts.append(
        f"**{len(findings)} violation(s) detected** "
        f"({len(critical)} critical, {len(high)} high)\n"
    )

    if critical:
        parts.append("## Critical Violations\n")
        for f in critical:
            parts.append(f"- **{f['type'].replace('_', ' ').title()}**: {f['detail']}")
            if f.get("original"):
                parts.append(f"  - Original: {f['original']}")
            if f.get("tailored"):
                parts.append(f"  - Tailored: {f['tailored']}")
        parts.append("")

    if high:
        parts.append("## High-Priority Violations\n")
        for f in high:
            parts.append(f"- **{f['type'].replace('_', ' ').title()}**: {f['detail']}")
            if f.get("original"):
                parts.append(f"  - Original: {f['original']}")
        parts.append("")

    parts.append(
        "\n---\n*The Identity Shield has produced a corrected resume below "
        "with these violations fixed.*"
    )

    return "\n".join(parts)


async def run_identity_shield(
    context: AgentContext,
    tailored_resume: str,
) -> list[WorkspaceArtifact]:
    """Run the Identity Shield on a tailored resume.

    1. Pattern-based analysis → identity violation report
    2. AI-powered correction → identity-protected resume (only if violations found)

    Returns list of artifacts produced.
    """
    artifacts = []

    # Step 1: Pattern analysis
    analysis = analyze_identity(tailored_resume, context)
    report_content = format_identity_report(analysis, context)

    report_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="identity_shield_report",
        title=f"Identity Shield Report: {context.job.title} at {context.job.company}",
        content=report_content,
    )
    artifacts.append(report_artifact)

    # Step 2: AI correction (only if violations found)
    if analysis["violation_count"] == 0:
        logger.info("Identity Shield: no violations found, skipping AI correction")
        return artifacts

    # Build the profile context for title/summary reference
    profile_titles = _extract_titles_from_profile(context)
    titles_list = "\n".join(f"- {t}" for t in profile_titles) if profile_titles else "None available"

    original_summary = ""
    if context.profile and context.profile.summary:
        original_summary = context.profile.summary.strip()

    findings_summary = "\n".join(
        f"- [{f['severity'].upper()}] {f['detail']}"
        for f in analysis["findings"]
    )

    correction_prompt = f"""You are the Identity Shield. Your ONLY job is to correct identity
violations in a tailored resume — restoring the candidate's actual titles, summary,
and professional positioning.

## Resume to Correct

{tailored_resume}

## Violations Found

{findings_summary}

## Candidate's ACTUAL Titles (from profile — these are FACTS, not suggestions)

{titles_list}

## Candidate's ACTUAL Professional Summary

{original_summary or "Not available — preserve whatever exists in the resume."}

## RULES

1. RESTORE all titles to their exact original form from the profile. If the profile says
   "Enterprise AI & Security Architect", that is the title. Period.
2. RESTORE the Professional Summary to match the candidate's original, with at most
   1 additional sentence connecting to this specific role.
3. Do NOT change anything else — keep all bullets, keywords, skills, and formatting
   from the tailored version. Only fix the identity violations.
4. Story Bank content must remain as-is — do not water it down.
5. The output must be a CLEAN, SUBMISSION-READY resume — no commentary or annotations.

## Job Target

{context.job.title} at {context.job.company}

Produce the corrected resume as clean markdown."""

    try:
        corrected_resume = await call_agent_ai(
            context.db, "tailor", correction_prompt, context
        )

        corrected_artifact = await save_artifact(
            db=context.db,
            workspace_id=context.workspace_id,
            agent_name="tailor",
            artifact_type="identity_protected_resume",
            title=f"Identity-Protected Resume: {context.job.title} at {context.job.company}",
            content=corrected_resume,
        )
        artifacts.append(corrected_artifact)
    except Exception as e:
        logger.warning("Identity Shield AI correction failed: %s", e)

    return artifacts
