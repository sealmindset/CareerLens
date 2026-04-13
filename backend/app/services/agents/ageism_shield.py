"""Ageism Shield — Analyze, report, and scrub age-revealing signals from resumes.

Detects patterns that trigger age bias in hiring:
- Experience dates going back >15 years
- Education dates / graduation years
- "X+ years of experience" language
- Dated technology references
- Career-length-revealing patterns
- Overqualification signals

Produces:
  1. ageism_report — risk analysis with specific findings
  2. ageism_scrubbed_resume — rewritten resume with age signals removed

The scrubbed resume consolidates early career into a brief "Earlier Career"
section, removes education dates, replaces age-revealing language, and
reframes experience to emphasize current relevance without revealing
career length.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import date

from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact
from app.models.workspace import WorkspaceArtifact

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pattern-based analysis (runs before AI, feeds the report)
# ---------------------------------------------------------------------------

CURRENT_YEAR = date.today().year
CUTOFF_YEAR = CURRENT_YEAR - 15  # experience older than this gets flagged

# Dated technology references that signal age
DATED_TECH = [
    "COBOL", "Fortran", "Visual Basic 6", "VB6", "Classic ASP",
    "Delphi", "PowerBuilder", "ColdFusion", "Lotus Notes",
    "FoxPro", "Clipper", "Turbo Pascal", "Ada", "RPG/400",
    "MFC", "COM/DCOM", "ActiveX", "Silverlight", "Flash",
    "ActionScript", "Windows NT", "Windows 2000", "Novell",
    "NetWare", "Sybase", "Informix",
]

# Language patterns that reveal age or suggest overqualification
AGE_LANGUAGE = [
    (r"\b(\d{2,})\+?\s*years?\s+(?:of\s+)?experience", "Years-of-experience count"),
    (r"\bseasoned\s+(?:professional|executive|leader)", "Seasoned professional"),
    (r"\bextensive\s+(?:experience|background|career)", "Extensive experience"),
    (r"\bveteran\b", "Veteran label"),
    (r"\bdecades?\s+of\b", "Decades of experience"),
    (r"\blong[\s-]?standing\b", "Long-standing"),
    (r"\bover\s+(?:two|three|four)\s+decades?\b", "Multi-decade reference"),
    (r"\bsince\s+(?:19|200[0-5])\b", "Since [early year]"),
    (r"\bpioneered\b", "Pioneered (early-career signal)"),
    (r"\btrack\s+record\s+spanning\b", "Track record spanning"),
]


@dataclass
class AgeismFinding:
    category: str  # dates, education, language, technology, structure
    severity: str  # high, medium, low
    location: str  # where in the resume
    detail: str  # what was found
    suggestion: str  # how to fix


@dataclass
class AgeismAnalysis:
    findings: list[AgeismFinding] = field(default_factory=list)
    risk_score: int = 0  # 0-100, higher = more age signals
    summary: str = ""


def analyze_resume_for_ageism(resume_text: str) -> AgeismAnalysis:
    """Pattern-based analysis for age-revealing signals."""
    findings: list[AgeismFinding] = []

    # --- Date analysis ---
    # Find year references in experience sections (YYYY patterns)
    year_pattern = re.compile(r"\b(19\d{2}|20[0-2]\d)\b")
    years_found = [int(y) for y in year_pattern.findall(resume_text)]

    earliest_year = min(years_found) if years_found else CURRENT_YEAR
    if earliest_year < CUTOFF_YEAR:
        span = CURRENT_YEAR - earliest_year
        findings.append(AgeismFinding(
            category="dates",
            severity="high",
            location="Experience section",
            detail=f"Dates span {span} years (back to {earliest_year}). "
                   f"Anything before {CUTOFF_YEAR} signals career length.",
            suggestion=f"Consolidate roles before {CUTOFF_YEAR} into a brief "
                       f"'Earlier Career' line (titles + companies, no dates).",
        ))

    # Count how many distinct years are before the cutoff
    old_years = sorted(set(y for y in years_found if y < CUTOFF_YEAR))
    if len(old_years) > 2:
        findings.append(AgeismFinding(
            category="dates",
            severity="medium",
            location="Multiple sections",
            detail=f"Found {len(old_years)} year references before {CUTOFF_YEAR}: "
                   f"{', '.join(str(y) for y in old_years[:5])}{'...' if len(old_years) > 5 else ''}",
            suggestion="Remove or consolidate all dates older than 15 years.",
        ))

    # --- Education dates ---
    edu_section = re.search(
        r"(?:education|academic|degree|university|college).*?(?=\n#|\Z)",
        resume_text, re.IGNORECASE | re.DOTALL
    )
    if edu_section:
        edu_text = edu_section.group()
        edu_years = [int(y) for y in year_pattern.findall(edu_text)]
        if edu_years and min(edu_years) < CUTOFF_YEAR:
            findings.append(AgeismFinding(
                category="education",
                severity="high",
                location="Education section",
                detail=f"Education dates ({min(edu_years)}) reveal approximate age. "
                       f"Graduation year is one of the strongest age signals.",
                suggestion="Remove all dates from education. List institution "
                           "and field of study only. No graduation year, no 'attended' dates.",
            ))

    # Check for incomplete degree language that draws attention
    incomplete_patterns = [
        r"(?:attended|some\s+college|coursework|incomplete|did\s+not\s+(?:finish|complete))",
        r"(?:no\s+degree|without\s+degree|non-degreed)",
    ]
    for pat in incomplete_patterns:
        if re.search(pat, resume_text, re.IGNORECASE):
            findings.append(AgeismFinding(
                category="education",
                severity="medium",
                location="Education section",
                detail="Language draws attention to incomplete education. "
                       "This invites scrutiny from badge-culture employers.",
                suggestion="List institution and field of study only. "
                           "No qualifying language. Let 15+ years of demonstrated "
                           "expertise speak louder than a credential line.",
            ))
            break

    # --- Age-revealing language ---
    for pattern, label in AGE_LANGUAGE:
        match = re.search(pattern, resume_text, re.IGNORECASE)
        if match:
            matched_text = match.group()
            # Check if it's a high year count
            severity = "medium"
            if "years" in label.lower():
                year_num = re.search(r"(\d+)", matched_text)
                if year_num and int(year_num.group()) > 15:
                    severity = "high"
            findings.append(AgeismFinding(
                category="language",
                severity=severity,
                location="Resume text",
                detail=f"'{matched_text}' — {label}. Quantifying career "
                       f"length invites age calculation.",
                suggestion="Replace with impact-focused language: "
                           "'proven track record', 'deep expertise', "
                           "'demonstrated ability'.",
            ))

    # --- Dated technology ---
    for tech in DATED_TECH:
        if re.search(r"\b" + re.escape(tech) + r"\b", resume_text, re.IGNORECASE):
            findings.append(AgeismFinding(
                category="technology",
                severity="low",
                location="Skills/Experience",
                detail=f"'{tech}' is a dated technology reference that signals era.",
                suggestion=f"Remove '{tech}' unless the target role specifically "
                           f"requires it. Replace with modern equivalent if applicable.",
            ))

    # --- Structural signals ---
    # Count number of distinct company/role entries
    role_markers = re.findall(
        r"(?:^|\n)(?:\*\*|#{1,3}\s).*?(?:at|@|\|)\s+\w+",
        resume_text, re.IGNORECASE
    )
    if len(role_markers) > 8:
        findings.append(AgeismFinding(
            category="structure",
            severity="medium",
            location="Overall resume",
            detail=f"Resume lists {len(role_markers)} distinct roles. "
                   f"More than 8 positions suggests a very long career.",
            suggestion="Keep 4-6 most relevant recent roles detailed. "
                       "Consolidate earlier roles into 'Earlier Career' section.",
        ))

    # --- Calculate risk score ---
    severity_weights = {"high": 25, "medium": 15, "low": 5}
    raw_score = sum(severity_weights.get(f.severity, 5) for f in findings)
    risk_score = min(100, raw_score)

    # Summary
    if risk_score >= 60:
        summary = "High ageism risk — multiple strong age signals detected."
    elif risk_score >= 30:
        summary = "Moderate ageism risk — some age-revealing patterns found."
    elif risk_score > 0:
        summary = "Low ageism risk — minor signals detected."
    else:
        summary = "Minimal ageism risk — no significant age signals found."

    return AgeismAnalysis(
        findings=findings,
        risk_score=risk_score,
        summary=summary,
    )


def format_analysis_report(analysis: AgeismAnalysis) -> str:
    """Format the analysis as a markdown report artifact."""
    parts = [
        "# Ageism Shield Report\n",
    ]

    # Risk score visual
    if analysis.risk_score >= 60:
        level = "HIGH RISK"
        color_note = "Significant rewriting recommended."
    elif analysis.risk_score >= 30:
        level = "MODERATE RISK"
        color_note = "Targeted fixes recommended."
    elif analysis.risk_score > 0:
        level = "LOW RISK"
        color_note = "Minor adjustments suggested."
    else:
        level = "CLEAR"
        color_note = "No significant age signals detected."

    parts.append(f"**Risk Level: {level}** (Score: {analysis.risk_score}/100)")
    parts.append(f"\n{color_note}\n")
    parts.append(f"_{analysis.summary}_\n")

    if not analysis.findings:
        parts.append("\nNo age-revealing patterns detected. Resume appears age-neutral.")
        return "\n".join(parts)

    # Group by category
    categories = {}
    for f in analysis.findings:
        categories.setdefault(f.category, []).append(f)

    category_labels = {
        "dates": "Date Signals",
        "education": "Education Signals",
        "language": "Age-Revealing Language",
        "technology": "Dated Technology",
        "structure": "Structural Signals",
    }

    for cat, findings in categories.items():
        label = category_labels.get(cat, cat.title())
        parts.append(f"\n## {label}\n")
        for f in findings:
            severity_badge = {"high": "!!!", "medium": "!!", "low": "!"}.get(f.severity, "!")
            parts.append(f"**{severity_badge} {f.severity.upper()}** — {f.detail}\n")
            parts.append(f"> **Fix:** {f.suggestion}\n")

    parts.append("\n---\n")
    parts.append("*The scrubbed resume below has these issues addressed automatically. "
                 "Review the changes to ensure accuracy.*")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# AI-powered scrubber (uses the analysis to guide rewriting)
# ---------------------------------------------------------------------------

AGEISM_SHIELD_PROMPT_SLUG = "ageism-shield-system"

AGEISM_SHIELD_DEFAULT_PROMPT = """You are the Ageism Shield, a specialized resume rewriting expert for CareerLens.

Your job is to take a tailored resume and remove ALL signals that reveal the candidate's age or career length, while PRESERVING the depth of expertise that makes them a strong candidate.

## YOUR PHILOSOPHY

The candidate has 15+ years of deep expertise. That expertise is their WEAPON, not their liability. The resume must communicate "this person can do the job better than anyone" WITHOUT communicating "this person has been working since before you were born."

Experience compensates for formal education. The resume should let accomplishments speak louder than credentials. Never draw attention to education gaps — a brief, factual listing satisfies ATS requirements without inviting scrutiny.

## CRITICAL RULES

### Date Management
- Keep ONLY the last 10-15 years of experience with full dates
- Roles older than 15 years: consolidate into a one-line "Earlier Career" section at the bottom of experience: "Previously held roles at [Company], [Company], and [Company] in [general domain]." — NO dates, NO titles, NO bullets
- Remove ALL graduation dates, attendance dates, or year references from education
- Remove certification dates older than 10 years (keep the certification itself)

### Education Section
- Place at the BOTTOM of the resume (after Experience, Skills, Certifications)
- List ONLY: Institution and Field of Study — one line
- NO dates, NO "attended", NO "coursework completed", NO "incomplete", NO "some college"
- NO GPA, NO honors from decades ago
- Keep it minimal and factual — this line exists for ATS, not for the hiring manager

### Language Scrubbing
- Replace "X years of experience" with "proven track record" or "deep expertise in"
- Replace "seasoned/veteran/extensive" with "accomplished" or "results-driven"
- Replace "decades of" with nothing — let accomplishments demonstrate depth
- Remove "since [year]" references
- Never quantify career length — let the SCOPE of work imply seniority

### Technology Updates
- Remove references to legacy/dated technologies unless the job requires them
- If a legacy tech is relevant, pair it with the modern equivalent: "modernized from X to Y"

### Structural Optimization
- Maximum 5-6 detailed roles with bullets
- Professional Summary: 3-4 sentences focusing on WHAT you deliver, not HOW LONG you've delivered it
- Lead every bullet with impact and outcomes, not with duration or tenure

### What to PRESERVE
- All quantified achievements and metrics
- Leadership scope (team sizes, budget, organizational impact)
- Specific technical accomplishments
- Industry expertise and domain knowledge
- The candidate's authentic voice

## OUTPUT FORMAT

Produce a CLEAN, SUBMISSION-READY resume. No commentary, no annotations, no "why I changed this."
The resume should read as if age was never a factor — naturally modern, impact-focused, and compelling.

Format as clean markdown ready to be converted to a professional document."""


async def run_ageism_shield(
    context: AgentContext,
    tailored_resume: str,
) -> list[WorkspaceArtifact]:
    """Run the Ageism Shield on a tailored resume.

    1. Pattern-based analysis → risk report
    2. AI-powered scrub → age-neutral resume

    Returns [ageism_report, ageism_scrubbed_resume] artifacts.
    """
    artifacts = []

    # Step 1: Pattern analysis
    analysis = analyze_resume_for_ageism(tailored_resume)
    report_content = format_analysis_report(analysis)

    report_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="ageism_report",
        title=f"Ageism Shield Report: {context.job.title} at {context.job.company}",
        content=report_content,
    )
    artifacts.append(report_artifact)

    # Step 2: AI scrub (always run — the AI catches nuances patterns miss)
    findings_summary = ""
    if analysis.findings:
        finding_lines = []
        for f in analysis.findings:
            finding_lines.append(f"- [{f.severity.upper()}] {f.category}: {f.detail}")
        findings_summary = (
            "\n\n## Pre-Analysis Findings\n"
            "The following age signals were detected. Address ALL of them "
            "plus any others you identify:\n\n"
            + "\n".join(finding_lines)
        )

    scrub_prompt = f"""Rewrite this tailored resume to remove all age-revealing signals.

## Resume to Scrub

{tailored_resume}

{findings_summary}

## Job Target

{context.job.title} at {context.job.company}

## HOLISTIC VIBE CHECK

Beyond fixing specific findings, evaluate the ENTIRE resume's tone and impression.
The resume must read as someone who:
- Is a current, active problem-solver — not a historian of past decades
- Has the expertise to compensate for any credential gap — let accomplishments BE the degree
- Feels like a diamond in the rough — clearly overdelivers, but doesn't scream "overqualified"
- Uses modern language, modern framing, modern energy — no "been there, done that" undertones
- Could be 35 or 55 and the reader wouldn't know or care — only the IMPACT registers

Check for subtle signals pattern detection misses:
- Does the Professional Summary sound like someone looking back on a career, or forward at this role?
- Do the bullet points feel current and urgent, or retrospective?
- Is the skills section weighted toward current technologies, not legacy ones?
- Does the overall structure feel lean and focused (5-6 roles max), not encyclopedic?
- Would this resume make a 30-year-old recruiter think "this person gets it"?

CRITICAL: Output ONLY the rewritten resume. No commentary, no explanations, no before/after notes.
The output must be a clean, submission-ready, ATS-optimized resume in markdown format."""

    scrubbed_response = await call_agent_ai(
        context.db, "ageism_shield", scrub_prompt, context
    )

    scrubbed_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="ageism_scrubbed_resume",
        title=f"Age-Optimized Resume: {context.job.title} at {context.job.company}",
        content=scrubbed_response,
    )
    artifacts.append(scrubbed_artifact)

    logger.info(
        "Ageism Shield: risk_score=%d, findings=%d, for %s at %s",
        analysis.risk_score,
        len(analysis.findings),
        context.job.title,
        context.job.company,
    )

    return artifacts
