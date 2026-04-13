"""Overqualification Shield tests -- pattern detection and report formatting."""

from app.services.agents.overqualification_shield import (
    analyze_overqualification,
    format_overqualification_report,
    OverqualificationAnalysis,
)


RESUME_EXECUTIVE = """
# John Smith
## Vice President of Engineering

**Professional Summary**
Seasoned VP of Engineering with full P&L ownership of a $50M business unit.
Led a global organization of 200 engineers across 15 countries.

**Experience**

### Vice President of Engineering | MegaCorp
2018 - Present
- Managed $50M annual budget and full P&L for the platform division
- Led 200-person engineering organization across 15 countries
- Presented quarterly results to the Board of Directors
- Drove enterprise-wide digital transformation initiative
- Built C-suite relationships to align technology and business strategy

### Senior Director of Engineering | BigTech
2014 - 2018
- Oversaw 80 direct reports across 5 teams
- Executive committee member for product strategy
"""

JOB_IC = """Senior Software Engineer at StartupCo.
We are looking for a senior engineer to join our platform team.
Requirements: 5+ years of experience, Python, distributed systems.
This is an individual contributor role."""

JOB_DIRECTOR = """Director of Engineering at GrowthCo.
We need a Director of Engineering to lead our 30-person engineering team.
Requirements: 10+ years experience, team management, strategic planning."""


def test_analyze_executive_resume_for_ic_role():
    """Executive resume against IC role should have high risk."""
    analysis = analyze_overqualification(RESUME_EXECUTIVE, JOB_IC)
    assert analysis.risk_score >= 60
    assert len(analysis.findings) >= 3
    categories = {f.category for f in analysis.findings}
    assert "titles" in categories
    assert "scope" in categories


def test_analyze_executive_resume_for_director_role():
    """Executive resume against Director role should still be flagged but with fewer high-severity findings."""
    analysis_dir = analyze_overqualification(RESUME_EXECUTIVE, JOB_DIRECTOR)
    analysis_ic = analyze_overqualification(RESUME_EXECUTIVE, JOB_IC)
    # Still flagged against Director role
    assert analysis_dir.risk_score > 0
    # Should have fewer high-severity findings than IC role
    high_dir = sum(1 for f in analysis_dir.findings if f.severity == "high")
    high_ic = sum(1 for f in analysis_ic.findings if f.severity == "high")
    assert high_ic >= high_dir


def test_analyze_clean_resume():
    """Resume with no overqualification signals should score 0."""
    clean_resume = """
    # Jane Developer
    ## Senior Software Engineer

    **Experience**
    ### Senior Software Engineer | TechCo
    - Built microservices using Python and FastAPI
    - Improved API response times by 40%
    - Collaborated with product team on feature design
    """
    analysis = analyze_overqualification(clean_resume, JOB_IC)
    assert analysis.risk_score == 0
    assert len(analysis.findings) == 0
    assert "Minimal" in analysis.summary


def test_title_detection():
    """VP and Director titles should be detected."""
    resume = "VP of Engineering at Company. Also served as Director of Product."
    analysis = analyze_overqualification(resume, JOB_IC)
    title_findings = [f for f in analysis.findings if f.category == "titles"]
    assert len(title_findings) >= 2


def test_scope_detection_budget():
    """Budget figures should be detected as scope signals."""
    resume = "Managed $50M annual technology budget across the enterprise."
    analysis = analyze_overqualification(resume, JOB_IC)
    scope_findings = [f for f in analysis.findings if f.category == "scope"]
    assert len(scope_findings) >= 1
    assert any("budget" in f.detail.lower() for f in scope_findings)


def test_scope_detection_team_size():
    """Large team sizes should be detected."""
    resume = "Led team of 150 engineers across multiple offices."
    analysis = analyze_overqualification(resume, JOB_IC)
    scope_findings = [f for f in analysis.findings if f.category == "scope"]
    assert len(scope_findings) >= 1


def test_executive_language_detection():
    """Board-level and C-suite language should be flagged."""
    resume = "Presented quarterly results to the Board of Directors. Built C-suite relationships."
    analysis = analyze_overqualification(resume, JOB_IC)
    lang_findings = [f for f in analysis.findings if f.category == "language"]
    assert len(lang_findings) >= 2


def test_scale_mismatch_detection():
    """Global scope signals should be detected."""
    resume = "Managed global operations across 15 countries with revenue of $200M."
    analysis = analyze_overqualification(resume, JOB_IC)
    scale_findings = [f for f in analysis.findings if f.category == "scale"]
    assert len(scale_findings) >= 1


def test_risk_score_capped_at_100():
    """Risk score should never exceed 100."""
    # Stack many signals
    resume = (
        "Chief Technology Officer and SVP of Engineering. "
        "Full P&L ownership of $500M business. "
        "Led 500-person global organization across 20 countries. "
        "Board of Directors presentations. C-suite stakeholder management. "
        "Executive committee member. Enterprise-wide transformation. "
        "Managed $100M annual budget with 200 direct reports."
    )
    analysis = analyze_overqualification(resume, JOB_IC)
    assert analysis.risk_score <= 100


def test_format_report_high_risk():
    """High risk report should contain HIGH RISK label."""
    analysis = analyze_overqualification(RESUME_EXECUTIVE, JOB_IC)
    report = format_overqualification_report(analysis)
    assert "HIGH RISK" in report
    assert "Overqualification Shield Report" in report


def test_format_report_no_findings():
    """Report with no findings should say no patterns detected."""
    analysis = OverqualificationAnalysis(findings=[], risk_score=0, summary="Clear")
    report = format_overqualification_report(analysis)
    assert "CLEAR" in report
    assert "No overqualification patterns" in report


def test_severity_weighting():
    """High severity findings should contribute more to score than low."""
    resume_high = "Vice President of Engineering at MegaCorp"
    resume_low = "Director at SmallCo"
    score_high = analyze_overqualification(resume_high, JOB_IC).risk_score
    score_low = analyze_overqualification(resume_low, JOB_IC).risk_score
    assert score_high >= score_low
