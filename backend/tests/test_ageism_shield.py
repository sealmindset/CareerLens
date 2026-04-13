"""Ageism Shield tests — pattern analysis and endpoint integration."""

import pytest

from app.services.agents.ageism_shield import (
    analyze_resume_for_ageism,
    format_analysis_report,
    AgeismAnalysis,
)


# ---------------------------------------------------------------------------
# Unit tests: pattern-based analysis
# ---------------------------------------------------------------------------


def test_detects_old_dates():
    """Dates going back >15 years should be flagged."""
    resume = """
    ## Professional Experience

    **Senior Engineer** at BigCorp (2005 - 2010)
    - Built distributed systems

    **Lead Architect** at TechCo (2010 - 2024)
    - Led platform team
    """
    analysis = analyze_resume_for_ageism(resume)
    date_findings = [f for f in analysis.findings if f.category == "dates"]
    assert len(date_findings) > 0
    assert analysis.risk_score > 0


def test_detects_education_dates():
    """Education dates should be flagged."""
    resume = """
    ## Education
    B.S. Computer Science, State University, 1995
    """
    analysis = analyze_resume_for_ageism(resume)
    edu_findings = [f for f in analysis.findings if f.category == "education"]
    assert len(edu_findings) > 0


def test_detects_years_of_experience():
    """'25 years of experience' should be flagged."""
    resume = "Senior professional with 25 years of experience in software engineering."
    analysis = analyze_resume_for_ageism(resume)
    lang_findings = [f for f in analysis.findings if f.category == "language"]
    assert len(lang_findings) > 0
    assert any("years" in f.detail.lower() for f in lang_findings)


def test_detects_seasoned_language():
    """'Seasoned professional' should be flagged."""
    resume = "A seasoned professional with extensive experience in enterprise architecture."
    analysis = analyze_resume_for_ageism(resume)
    lang_findings = [f for f in analysis.findings if f.category == "language"]
    assert len(lang_findings) >= 1


def test_detects_dated_technology():
    """Legacy technology names should be flagged."""
    resume = "Skills: COBOL, Visual Basic 6, Classic ASP, Lotus Notes"
    analysis = analyze_resume_for_ageism(resume)
    tech_findings = [f for f in analysis.findings if f.category == "technology"]
    assert len(tech_findings) >= 3


def test_clean_resume_low_risk():
    """A modern resume with recent dates should score low."""
    resume = """
    ## Professional Summary
    Accomplished software architect with deep expertise in cloud-native systems.

    ## Experience
    **Principal Engineer** at CloudCorp (2020 - Present)
    - Architected microservices platform serving 10M users

    **Senior Engineer** at TechStart (2016 - 2020)
    - Led migration from monolith to Kubernetes

    ## Skills
    Python, Go, Kubernetes, AWS, Terraform

    ## Education
    Computer Science, State University
    """
    analysis = analyze_resume_for_ageism(resume)
    assert analysis.risk_score < 30


def test_report_format():
    """Report should be valid markdown with risk level."""
    resume = "A veteran engineer with 30 years of experience since 1994."
    analysis = analyze_resume_for_ageism(resume)
    report = format_analysis_report(analysis)
    assert "# Ageism Shield Report" in report
    assert "Risk Level:" in report
    assert "Fix:" in report


def test_detects_incomplete_education_language():
    """Language drawing attention to incomplete degrees should be flagged."""
    resume = """
    ## Education
    Some college coursework, State University (attended 1992-1994)
    """
    analysis = analyze_resume_for_ageism(resume)
    edu_findings = [f for f in analysis.findings if f.category == "education"]
    assert len(edu_findings) >= 1
    assert any("incomplete" in f.detail.lower() or "attention" in f.detail.lower()
               for f in edu_findings)


def test_detects_too_many_roles():
    """More than 8 distinct roles should be flagged."""
    roles = "\n".join(
        f"**Role {i}** at Company{i} | 20{10+i}\n- Did things"
        for i in range(10)
    )
    resume = f"## Experience\n{roles}"
    analysis = analyze_resume_for_ageism(resume)
    struct_findings = [f for f in analysis.findings if f.category == "structure"]
    assert len(struct_findings) >= 1


def test_risk_score_capped_at_100():
    """Risk score should never exceed 100."""
    resume = (
        "A seasoned veteran with extensive experience spanning decades of work "
        "since 1985. 40 years of experience in COBOL, Fortran, Visual Basic 6, "
        "Classic ASP, Delphi, PowerBuilder, ColdFusion, Lotus Notes, FoxPro.\n"
        "## Education\n"
        "B.S. Computer Science, 1985, State University\n"
        "Some college coursework attended 1982-1985"
    )
    analysis = analyze_resume_for_ageism(resume)
    assert analysis.risk_score <= 100
