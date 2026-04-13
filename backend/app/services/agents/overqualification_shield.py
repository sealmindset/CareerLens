"""Overqualification Shield -- Detect seniority signals and right-size resumes.

Detects patterns that trigger "overqualified" rejection:
- VP/Director/C-suite titles applied to IC or mid-level roles
- Budget authority and P&L scope that dwarfs the target role
- Executive language (board presentations, C-suite access)
- Team/org size that implies a different career level
- Scale mismatch (global operations for a regional role)

Produces:
  1. overqualification_report -- risk analysis with specific findings
  2. right_sized_resume -- rewritten resume positioning seniority as focused expertise

The right-sized resume reframes leadership experience as hands-on expertise
without fabricating or removing real accomplishments.
"""

import logging
import re
from dataclasses import dataclass, field

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pattern-based analysis (runs before AI, feeds the report)
# ---------------------------------------------------------------------------

# Title seniority patterns -- VP/Director/C-suite applied to non-exec roles
EXECUTIVE_TITLES = [
    (r"\b(?:Chief\s+\w+\s+Officer|C[A-Z]O)\b", "C-suite title"),
    (r"\bSVP\b|\bSenior\s+Vice\s+President\b", "Senior Vice President"),
    (r"\bEVP\b|\bExecutive\s+Vice\s+President\b", "Executive Vice President"),
    (r"\bVice\s+President\b|\bVP\b", "Vice President"),
    (r"\bManaging\s+Director\b", "Managing Director"),
    (r"\bDirector\b", "Director"),
    (r"\bGlobal\s+Head\b", "Global Head"),
    (r"\bHead\s+of\b", "Head of"),
]

# Scope signals -- budget, org size, P&L
SCOPE_PATTERNS = [
    (r"\$\d+[MB]\b|\$\d+\s*(?:million|billion)\b", "Large budget reference"),
    (r"\b(?:P&L|profit\s+and\s+loss|profit\s*&\s*loss)\b", "P&L ownership"),
    (r"\b\d{2,}\+?\s*direct\s+reports?\b", "Large direct report count"),
    (r"\b(?:managed|led|oversaw)\s+(?:a\s+)?team\s+of\s+\d{2,}", "Large team management"),
    (r"\borg(?:anization)?\s+of\s+\d{3,}", "Large organization size"),
    (r"\b\d{3,}\+?\s*(?:employees?|people|staff|engineers?|developers?)\b", "Large headcount"),
]

# Executive language patterns
EXECUTIVE_LANGUAGE = [
    (r"\bboard\s+(?:of\s+directors?|presentations?|reporting)\b", "Board-level engagement"),
    (r"\bC-suite\b|\bc-level\b", "C-suite access"),
    (r"\bexecutive\s+committee\b", "Executive committee membership"),
    (r"\bstakeholder\s+(?:at\s+)?(?:the\s+)?(?:executive|senior|C-)\b", "Executive stakeholders"),
    (r"\benterprise[\s-]wide\b", "Enterprise-wide scope"),
    (r"\bglobal\s+(?:operations?|strategy|transformation|initiative)\b", "Global scope"),
    (r"\bfull\s+P&L\b|\bP&L\s+(?:ownership|responsibility|authority)\b", "Full P&L authority"),
    (r"\btransformation(?:al)?\s+(?:leader|initiative|program)\b", "Transformation leadership"),
    (r"\bmerger|acquisition|M&A\b", "M&A involvement"),
]

# Scale mismatch patterns
SCALE_PATTERNS = [
    (r"\b\d+\+?\s*(?:countries|regions|continents)\b", "Multi-country scope"),
    (r"\bglobal\s+(?:team|operations?|presence|footprint)\b", "Global operations"),
    (r"\brevenue\s+(?:of\s+)?\$\d+", "Revenue figure"),
    (r"\b(?:Fortune|Inc\.?)\s*\d{3,4}\b", "Fortune/Inc company reference"),
]


@dataclass
class OverqualificationFinding:
    category: str  # titles, scope, language, scale
    severity: str  # high, medium, low
    location: str  # where in the resume
    detail: str  # what was found
    suggestion: str  # how to fix


@dataclass
class OverqualificationAnalysis:
    findings: list[OverqualificationFinding] = field(default_factory=list)
    risk_score: int = 0  # 0-100
    summary: str = ""


def analyze_overqualification(resume_text: str, job_description: str) -> OverqualificationAnalysis:
    """Pattern-based analysis for overqualification signals."""
    findings: list[OverqualificationFinding] = []
    jd_lower = job_description.lower()

    # Determine target role level from JD
    is_ic_role = bool(re.search(
        r"\b(?:senior\s+)?(?:engineer|developer|analyst|designer|scientist|specialist|consultant|architect)\b",
        jd_lower,
    ))
    is_mid_role = not bool(re.search(
        r"\b(?:director|vp|vice\s+president|head\s+of|chief|C[A-Z]O|SVP|EVP)\b",
        jd_lower,
    ))

    # --- Title seniority analysis ---
    for pattern, label in EXECUTIVE_TITLES:
        matches = re.findall(pattern, resume_text, re.IGNORECASE)
        if matches:
            severity = "high" if is_ic_role and label in ("C-suite title", "Senior Vice President", "Executive Vice President") else "medium"
            if label == "Director" and not is_ic_role:
                severity = "low"
            findings.append(OverqualificationFinding(
                category="titles",
                severity=severity,
                location="Experience section",
                detail=f"Title '{matches[0]}' ({label}) may signal overqualification for "
                       f"{'an IC-level' if is_ic_role else 'a mid-level'} role.",
                suggestion=f"Reframe as functional expertise: e.g., 'Engineering Leader' or "
                           f"'Hands-on {label.split()[-1]}' that emphasizes doing, not directing.",
            ))

    # --- Scope signals ---
    for pattern, label in SCOPE_PATTERNS:
        match = re.search(pattern, resume_text, re.IGNORECASE)
        if match:
            matched_text = match.group()
            # Check if the scope dwarfs the role
            severity = "medium"
            if label == "Large budget reference":
                # Extract amount -- high severity if >$10M for non-director role
                amount_match = re.search(r"\$(\d+)", matched_text)
                if amount_match:
                    amount = int(amount_match.group(1))
                    if "B" in matched_text or "billion" in matched_text.lower():
                        severity = "high"
                    elif amount >= 10 and ("M" in matched_text or "million" in matched_text.lower()):
                        severity = "high" if is_mid_role else "medium"
            elif label in ("Large direct report count", "Large team management", "Large headcount"):
                count_match = re.search(r"(\d+)", matched_text)
                if count_match and int(count_match.group(1)) > 20:
                    severity = "high" if is_ic_role else "medium"

            findings.append(OverqualificationFinding(
                category="scope",
                severity=severity,
                location="Experience section",
                detail=f"'{matched_text}' -- {label}. This scope may intimidate "
                       f"the hiring manager for this role level.",
                suggestion="De-emphasize org-chart metrics. Replace with delivery metrics: "
                           "features shipped, systems built, problems solved.",
            ))

    # --- Executive language ---
    for pattern, label in EXECUTIVE_LANGUAGE:
        match = re.search(pattern, resume_text, re.IGNORECASE)
        if match:
            severity = "high" if is_ic_role else "medium"
            findings.append(OverqualificationFinding(
                category="language",
                severity=severity,
                location="Resume text",
                detail=f"'{match.group()}' -- {label}. Executive language signals "
                       f"a career level above the target role.",
                suggestion="Replace with hands-on equivalents: 'board presentations' -> "
                           "'presented technical strategy to leadership', "
                           "'enterprise-wide' -> 'cross-team'.",
            ))

    # --- Scale mismatch ---
    for pattern, label in SCALE_PATTERNS:
        match = re.search(pattern, resume_text, re.IGNORECASE)
        if match:
            findings.append(OverqualificationFinding(
                category="scale",
                severity="medium",
                location="Resume text",
                detail=f"'{match.group()}' -- {label}. Global/enterprise scope may "
                       f"make the candidate seem too big for this role.",
                suggestion="Scope down to relevant details: '15 countries' -> "
                           "'distributed teams', focus on the hands-on work, not the empire.",
            ))

    # --- Calculate risk score ---
    severity_weights = {"high": 25, "medium": 15, "low": 5}
    raw_score = sum(severity_weights.get(f.severity, 5) for f in findings)
    risk_score = min(100, raw_score)

    # Summary
    if risk_score >= 60:
        summary = "High overqualification risk -- multiple strong seniority signals detected."
    elif risk_score >= 30:
        summary = "Moderate overqualification risk -- some seniority signals found."
    elif risk_score > 0:
        summary = "Low overqualification risk -- minor signals detected."
    else:
        summary = "Minimal overqualification risk -- resume reads at an appropriate level."

    return OverqualificationAnalysis(
        findings=findings,
        risk_score=risk_score,
        summary=summary,
    )


def format_overqualification_report(analysis: OverqualificationAnalysis) -> str:
    """Format the analysis as a markdown report artifact."""
    parts = [
        "# Overqualification Shield Report\n",
    ]

    if analysis.risk_score >= 60:
        level = "HIGH RISK"
        color_note = "Significant right-sizing recommended."
    elif analysis.risk_score >= 30:
        level = "MODERATE RISK"
        color_note = "Targeted adjustments recommended."
    elif analysis.risk_score > 0:
        level = "LOW RISK"
        color_note = "Minor adjustments suggested."
    else:
        level = "CLEAR"
        color_note = "No significant overqualification signals detected."

    parts.append(f"**Risk Level: {level}** (Score: {analysis.risk_score}/100)")
    parts.append(f"\n{color_note}\n")
    parts.append(f"_{analysis.summary}_\n")

    if not analysis.findings:
        parts.append("\nNo overqualification patterns detected. Resume reads at an appropriate level for the target role.")
        return "\n".join(parts)

    # Group by category
    categories = {}
    for f in analysis.findings:
        categories.setdefault(f.category, []).append(f)

    category_labels = {
        "titles": "Title Seniority Signals",
        "scope": "Scope & Authority Signals",
        "language": "Executive Language",
        "scale": "Scale Mismatch",
    }

    for cat, cat_findings in categories.items():
        label = category_labels.get(cat, cat.title())
        parts.append(f"\n## {label}\n")
        for f in cat_findings:
            severity_badge = {"high": "!!!", "medium": "!!", "low": "!"}.get(f.severity, "!")
            parts.append(f"**{severity_badge} {f.severity.upper()}** -- {f.detail}\n")
            parts.append(f"> **Fix:** {f.suggestion}\n")

    parts.append("\n---\n")
    parts.append("*The right-sized resume below has these issues addressed automatically. "
                 "Review the changes to ensure accuracy.*")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# AI-powered right-sizer (uses the analysis to guide rewriting)
# ---------------------------------------------------------------------------

async def run_overqualification_shield(
    context: AgentContext,
    resume_text: str,
) -> list[WorkspaceArtifact]:
    """Run the Overqualification Shield on a resume.

    1. Pattern-based analysis -> risk report
    2. AI-powered right-sizing -> right-sized resume

    Returns [overqualification_report, right_sized_resume] artifacts.
    """
    artifacts = []

    # Step 1: Pattern analysis
    job_desc = context.job.description or ""
    analysis = analyze_overqualification(resume_text, job_desc)
    report_content = format_overqualification_report(analysis)

    report_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="overqualification_report",
        title=f"Overqualification Shield Report: {context.job.title} at {context.job.company}",
        content=report_content,
    )
    artifacts.append(report_artifact)

    # Step 2: AI right-sizing (always run -- AI catches nuances patterns miss)
    findings_summary = ""
    if analysis.findings:
        finding_lines = []
        for f in analysis.findings:
            finding_lines.append(f"- [{f.severity.upper()}] {f.category}: {f.detail}")
        findings_summary = (
            "\n\n## Pre-Analysis Findings\n"
            "The following overqualification signals were detected. Address ALL of them "
            "plus any others you identify:\n\n"
            + "\n".join(finding_lines)
        )

    rightsizing_prompt = f"""Rewrite this resume to neutralize overqualification signals while preserving expertise.

## Resume to Right-Size

{resume_text}

{findings_summary}

## Job Target

{context.job.title} at {context.job.company}

## YOUR PHILOSOPHY

The candidate is MORE capable than this role requires. That is their STRENGTH, not their liability.
The resume must communicate "this person will hit the ground running and deliver outsized value"
WITHOUT communicating "this person is going to be bored, expensive, and leave in 6 months."

## CRITICAL RULES

### Title Right-Sizing
- Reframe VP/Director titles for IC roles: "VP of Engineering" -> "Engineering Leader" or "Hands-on Engineering Leader"
- Keep the company name and dates unchanged
- The reframed title should still be truthful -- it describes the WORK, not the org chart position
- For Director-to-Senior transitions: emphasize the hands-on technical work, not the empire

### Scope De-Emphasis
- Replace budget figures with delivery outcomes: "$50M budget" -> "Delivered the platform that..."
- Replace direct report counts with collaboration language: "Led 200-person org" -> "Led cross-functional teams"
- Replace P&L ownership with business impact: "Full P&L for $100M business" -> "Drove product strategy resulting in..."
- Keep the IMPACT, remove the SCALE that intimidates

### Executive Language Conversion
- "Board presentations" -> "Presented technical strategy to senior leadership"
- "Enterprise-wide transformation" -> "Cross-team modernization initiative"
- "C-suite stakeholders" -> "Senior leadership and business partners"
- "Global operations across 15 countries" -> "Distributed engineering teams"

### Professional Summary Rewrite
- Add a "Why This Role" positioning statement (1 sentence) explaining the intentional move
- Frame career arc as deliberate specialization, not a step down
- Emphasize DOING over DIRECTING: "I build, ship, and solve" energy
- Example: "After leading platform engineering at [Company], I'm focused on what I do best:
  hands-on [specialty] work where I can directly impact [target company's mission]."

### What to PRESERVE
- All technical accomplishments and specific expertise
- Quantified delivery metrics (features shipped, performance improvements, etc.)
- Problem-solving examples and technical depth
- The candidate's authentic voice and energy
- NEVER fabricate or remove real accomplishments -- only REFRAME

## OUTPUT FORMAT

Produce a CLEAN, SUBMISSION-READY resume. No commentary, no annotations, no "why I changed this."
The resume should read as a highly capable individual contributor or technical leader --
not an executive slumming it. Format as clean markdown."""

    rightsized_response = await call_agent_ai(
        context.db, "overqualification_shield", rightsizing_prompt, context
    )

    rightsized_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="right_sized_resume",
        title=f"Right-Sized Resume: {context.job.title} at {context.job.company}",
        content=rightsized_response,
    )
    artifacts.append(rightsized_artifact)

    logger.info(
        "Overqualification Shield: risk_score=%d, findings=%d, for %s at %s",
        analysis.risk_score,
        len(analysis.findings),
        context.job.title,
        context.job.company,
    )

    return artifacts
