"""Auto-Fill Agent -- AI-powered job application assistant.

Detects application method (form, chatbot, email, redirect, portal) and dispatches
to the appropriate handler. For automatable types (form, chatbot) it drives the
process; for others (email, redirect, portal) it generates AI-powered copy-paste guides.

Produces: form_fill_plan, form_fill_script (forms) OR chatbot_transcript (chatbots)
          OR application_guide (email/redirect/portal)
"""

import json
import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai, format_profile_context
from app.services.application_detector import detect_application_method
from app.services.chatbot_driver import (
    chatbot_result_to_transcript,
    drive_chatbot,
    format_answer,
    map_question_to_field,
)
from app.services.form_analyzer import analyze_form, form_analysis_to_dict
from app.services.workspace_service import get_latest_artifact, save_artifact

logger = logging.getLogger(__name__)


def _build_profile_data(context: AgentContext) -> dict:
    """Extract profile data into a structured dict for form filling."""
    profile = context.profile
    data: dict = {
        "full_name": "",
        "first_name": "",
        "last_name": "",
        "email": "",
        "phone": "",
        "linkedin_url": "",
        "headline": "",
        "summary": "",
        "current_title": "",
        "current_company": "",
        "years_experience": 0,
        "skills": [],
        "experiences": [],
        "educations": [],
    }

    if not profile:
        return data

    # Name from user relationship
    if profile.user:
        name = profile.user.display_name or profile.user.email or ""
        data["full_name"] = name
        parts = name.split(" ", 1)
        data["first_name"] = parts[0] if parts else ""
        data["last_name"] = parts[1] if len(parts) > 1 else ""
        data["email"] = profile.user.email or ""

    data["linkedin_url"] = profile.linkedin_url or ""
    data["headline"] = profile.headline or ""
    data["summary"] = profile.summary or ""

    # Current/most recent role
    if profile.experiences:
        current = next((e for e in profile.experiences if e.is_current), None)
        latest = current or profile.experiences[0]
        data["current_title"] = latest.title
        data["current_company"] = latest.company

        for exp in profile.experiences:
            data["experiences"].append({
                "title": exp.title,
                "company": exp.company,
                "start_date": str(exp.start_date) if exp.start_date else "",
                "end_date": str(exp.end_date) if exp.end_date else "Present",
                "description": exp.description or "",
                "is_current": exp.is_current,
            })

    if profile.skills:
        data["skills"] = [s.skill_name for s in profile.skills]

    if profile.educations:
        for edu in profile.educations:
            data["educations"].append({
                "institution": edu.institution,
                "degree": edu.degree or "",
                "field_of_study": edu.field_of_study or "",
                "graduation_date": str(edu.graduation_date) if edu.graduation_date else "",
            })

    return data


def _generate_autofill_script(field_mappings: list[dict]) -> str:
    """Generate a JavaScript snippet that fills form fields in the user's browser."""
    lines = [
        "// CareerLens Auto-Fill Script",
        "// Paste this into your browser console (F12 > Console) on the application page.",
        "// Review the filled values before submitting.",
        "(function() {",
        "  const mappings = " + json.dumps(field_mappings, indent=4) + ";",
        "",
        "  let filled = 0;",
        "  let skipped = 0;",
        "",
        "  for (const m of mappings) {",
        "    try {",
        "      const el = document.querySelector(m.selector);",
        "      if (!el) { skipped++; continue; }",
        "",
        "      // Trigger React/Angular change detection",
        "      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(",
        "        window.HTMLInputElement.prototype, 'value'",
        "      )?.set || Object.getOwnPropertyDescriptor(",
        "        window.HTMLTextAreaElement.prototype, 'value'",
        "      )?.set;",
        "",
        "      if (el.tagName === 'SELECT') {",
        "        // For selects, find the best matching option",
        "        const options = Array.from(el.options);",
        "        const match = options.find(o => ",
        "          o.textContent.toLowerCase().includes(m.value.toLowerCase())",
        "        );",
        "        if (match) {",
        "          el.value = match.value;",
        "          el.dispatchEvent(new Event('change', { bubbles: true }));",
        "          filled++;",
        "        } else { skipped++; }",
        "      } else if (el.type === 'checkbox' || el.type === 'radio') {",
        "        if (m.value === 'true' || m.value === 'yes') {",
        "          el.checked = true;",
        "          el.dispatchEvent(new Event('change', { bubbles: true }));",
        "          filled++;",
        "        }",
        "      } else {",
        "        if (nativeInputValueSetter) {",
        "          nativeInputValueSetter.call(el, m.value);",
        "        } else {",
        "          el.value = m.value;",
        "        }",
        "        el.dispatchEvent(new Event('input', { bubbles: true }));",
        "        el.dispatchEvent(new Event('change', { bubbles: true }));",
        "        el.dispatchEvent(new Event('blur', { bubbles: true }));",
        "        filled++;",
        "      }",
        "    } catch (e) {",
        "      console.warn('CareerLens: Could not fill field:', m.label, e);",
        "      skipped++;",
        "    }",
        "  }",
        "",
        "  console.log(`CareerLens Auto-Fill: ${filled} fields filled, ${skipped} skipped.`);",
        "  alert(`CareerLens Auto-Fill Complete!\\n\\n${filled} fields filled, ${skipped} skipped.\\n\\nPlease review all fields before submitting.`);",
        "})();",
    ]
    return "\n".join(lines)


async def _detect_method(context: AgentContext) -> tuple[str, str, str]:
    """Detect the application method, using stored value or running detection.

    Returns (method, platform, details).
    """
    job = context.job
    # Use stored detection from import if available
    if job.application_method and job.application_method != "unknown":
        return (
            job.application_method,
            job.application_platform or "unknown",
            job.application_method_details or "",
        )

    # Run detection now (Phase 1 domain check + Phase 2 AI page analysis)
    result = await detect_application_method(job.url, use_ai=True)

    # Store the result on the job for future use
    job.application_method = result.method
    job.application_platform = result.platform
    job.application_method_details = result.details
    await context.db.commit()

    return result.method, result.platform, result.details


async def _run_chatbot_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Drive a conversational chatbot and save the transcript."""
    job = context.job
    profile_data = _build_profile_data(context)

    # AI fallback mapper for questions the keyword rules can't handle
    async def ai_mapper(question: str, pdata: dict) -> str:
        prompt = (
            f"A chatbot asked: \"{question}\"\n\n"
            f"Candidate profile: {json.dumps(pdata, indent=2, default=str)}\n\n"
            f"Respond with ONLY the answer the candidate should give. "
            f"Keep it short and natural -- one sentence max."
        )
        return await call_agent_ai(context.db, "coordinator", prompt, context)

    logger.info("Auto-fill: Driving chatbot at %s", job.url)
    result = await drive_chatbot(
        url=job.url,
        profile_data=profile_data,
        ai_mapper=ai_mapper,
    )

    # Save transcript as an artifact
    transcript = chatbot_result_to_transcript(result)
    transcript_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="chatbot_transcript",
        title=f"Chatbot Application: {job.title} at {job.company}",
        content=transcript,
    )

    artifacts = [transcript_artifact]

    # Also generate a fill plan summarizing what was submitted
    plan_lines = [
        "# Chatbot Application Summary",
        "",
        f"**Job:** {job.title} at {job.company}",
        f"**URL:** {job.url}",
        f"**Status:** {'Application submitted' if result.completed else 'Incomplete'}",
        "",
    ]
    if result.error:
        plan_lines.append(f"> **Note:** {result.error}")
        plan_lines.append("")

    if result.candidate_data_sent:
        plan_lines.append("## Data Submitted")
        plan_lines.append("")
        plan_lines.append("| Field | Value |")
        plan_lines.append("|-------|-------|")
        for field_name, value in result.candidate_data_sent.items():
            display_name = field_name.replace("_", " ").title()
            plan_lines.append(f"| {display_name} | {value} |")
        plan_lines.append("")

    if not result.completed:
        plan_lines.extend([
            "## Next Steps",
            "",
            "The chatbot conversation did not complete automatically. You may need to:",
            "1. Visit the URL above and continue the conversation manually",
            "2. Upload your resume if prompted",
            "3. Confirm your application",
        ])

    plan_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="form_fill_plan",
        title=f"Chatbot Summary: {job.title} at {job.company}",
        content="\n".join(plan_lines),
    )
    artifacts.append(plan_artifact)

    return artifacts


async def run_autofill_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Auto-Fill agent -- detects application method and dispatches."""

    job = context.job
    if not job.url:
        return await _generate_generic_fill_guide(context)

    # Detect application method (stored from import or live detection)
    method, platform, details = await _detect_method(context)
    logger.info("Auto-fill: Detected method=%s platform=%s for %s", method, platform, job.url[:80])

    # Dispatch based on detected method
    if method == "chatbot":
        return await _run_chatbot_task(context)

    if method == "email":
        return await _generate_email_guide(context, platform, details)

    if method == "redirect":
        return await _generate_redirect_guide(context, platform, details)

    if method == "api_portal":
        return await _generate_portal_guide(context, platform, details)

    # Default: try form analysis (covers "form" and "unknown" methods)
    logger.info("Auto-fill: Analyzing form at %s", job.url)
    analysis = await analyze_form(job.url)

    # If form analysis finds no fields, try chatbot driver as fallback
    if not analysis.fields and not analysis.error:
        logger.info("Auto-fill: No form fields found, attempting chatbot driver")
        return await _run_chatbot_task(context)

    if analysis.error and not analysis.fields:
        logger.warning("Form analysis failed: %s. Generating generic fill guide.", analysis.error)
        return await _generate_generic_fill_guide(context, analysis.error)

    # Form-based flow: Build profile data for mapping
    profile_data = _build_profile_data(context)

    # Get tailored resume and cover letter if available
    tailored_resume = await get_latest_artifact(context.db, context.workspace_id, "tailored_resume")
    cover_letter = await get_latest_artifact(context.db, context.workspace_id, "cover_letter")

    # Step 3: Use AI to map profile data to form fields
    form_fields_desc = json.dumps(
        [{"label": f.label, "name": f.name, "type": f.field_type,
          "required": f.required, "options": f.options[:20], "selector": f.css_selector}
         for f in analysis.fields],
        indent=2,
    )

    profile_data_desc = json.dumps(profile_data, indent=2, default=str)

    mapping_prompt = f"""You are an expert at filling out job application forms.

## Form Fields Found on the Application Page
Page: {analysis.page_title}
URL: {job.url}
Fields:
{form_fields_desc}

## Candidate Profile Data
{profile_data_desc}

## Job Being Applied For
Title: {job.title}
Company: {job.company}

## Available Documents
- Tailored Resume: {"Yes" if tailored_resume else "No"}
- Cover Letter: {"Yes" if cover_letter else "No"}

## Your Task

1. Map each form field to the best matching profile data value.
2. Return a JSON array of field mappings. Each mapping must have:
   - "selector": the CSS selector of the field (from the form fields above)
   - "label": human-readable field label
   - "value": the value to fill in (from profile data)
   - "confidence": "high", "medium", or "low"
   - "note": any note about the mapping (e.g., "verify phone number")

3. For fields you cannot map (like file uploads), set value to "" and confidence to "skip" with a note explaining what the user should do manually.

4. For select dropdowns, use the closest matching option text from the options list.

5. Be smart about common field patterns:
   - "first_name" / "fname" / "given_name" → first name
   - "last_name" / "lname" / "family_name" / "surname" → last name
   - Fields asking about salary → leave empty with note "User should fill manually"
   - Work authorization / visa / sponsorship → leave empty with note "User should verify"
   - "How did you hear about us" → "Company website" or "Job board"

Return ONLY the JSON array, no other text. Example:
[
  {{"selector": "#firstName", "label": "First Name", "value": "John", "confidence": "high", "note": ""}},
  {{"selector": "#resume", "label": "Resume Upload", "value": "", "confidence": "skip", "note": "Upload your tailored resume manually"}}
]"""

    mapping_response = await call_agent_ai(
        context.db, "coordinator", mapping_prompt, context
    )

    # Parse the AI response to extract the JSON mapping
    field_mappings = _parse_mapping_response(mapping_response)

    # Step 4: Generate the fill plan (markdown artifact)
    fill_plan = _build_fill_plan(analysis, field_mappings, profile_data, job)
    plan_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="form_fill_plan",
        title=f"Auto-Fill Plan: {job.title} at {job.company}",
        content=fill_plan,
    )

    # Step 5: Generate the JS auto-fill script
    fillable_mappings = [m for m in field_mappings if m.get("confidence") != "skip" and m.get("value")]
    script = _generate_autofill_script(fillable_mappings)
    script_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="form_fill_script",
        title=f"Auto-Fill Script: {job.title} at {job.company}",
        content=script,
        content_format="javascript",
    )

    return [plan_artifact, script_artifact]


def _parse_mapping_response(response: str) -> list[dict]:
    """Extract JSON field mappings from AI response."""
    # Try to find JSON array in the response
    response = response.strip()

    # Try direct parse
    try:
        data = json.loads(response)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown code block
    import re
    json_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', response)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    # Try finding array brackets
    start = response.find('[')
    end = response.rfind(']')
    if start >= 0 and end > start:
        try:
            data = json.loads(response[start:end + 1])
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    logger.warning("Could not parse field mapping JSON from AI response")
    return []


def _build_fill_plan(analysis, field_mappings: list[dict], profile_data: dict, job) -> str:
    """Build a human-readable fill plan as markdown."""
    lines = [
        f"# Application Auto-Fill Plan",
        f"",
        f"**Job:** {job.title} at {job.company}",
        f"**URL:** [{analysis.page_title or job.url}]({analysis.url})",
        f"**Form fields detected:** {len(analysis.fields)}",
        f"**Fields auto-filled:** {sum(1 for m in field_mappings if m.get('confidence') != 'skip' and m.get('value'))}",
        f"",
    ]

    if analysis.error:
        lines.append(f"> **Note:** {analysis.error}")
        lines.append("")

    # Auto-filled fields
    auto_filled = [m for m in field_mappings if m.get("confidence") != "skip" and m.get("value")]
    manual_fields = [m for m in field_mappings if m.get("confidence") == "skip" or not m.get("value")]

    if auto_filled:
        lines.append("## Auto-Filled Fields")
        lines.append("")
        lines.append("| Field | Value | Confidence |")
        lines.append("|-------|-------|------------|")
        for m in auto_filled:
            value = m.get("value", "")
            # Truncate long values for the table
            display_val = value[:60] + "..." if len(str(value)) > 60 else value
            conf = m.get("confidence", "medium")
            conf_icon = {"high": "🟢", "medium": "🟡", "low": "🔴"}.get(conf, "⚪")
            note = f" *({m['note']})*" if m.get("note") else ""
            lines.append(f"| {m.get('label', 'Unknown')} | {display_val}{note} | {conf_icon} {conf} |")
        lines.append("")

    if manual_fields:
        lines.append("## Fields Requiring Manual Input")
        lines.append("")
        for m in manual_fields:
            note = m.get("note", "Fill manually")
            lines.append(f"- **{m.get('label', 'Unknown')}**: {note}")
        lines.append("")

    lines.extend([
        "## How to Use the Auto-Fill Script",
        "",
        "1. Open the application URL in your browser: " + analysis.url,
        "2. Log in to the application portal if required",
        "3. Navigate to the application form",
        "4. Open your browser's Developer Console (press **F12**, then click **Console**)",
        "5. Copy the auto-fill script from the **Auto-Fill Script** artifact",
        "6. Paste it into the console and press **Enter**",
        "7. **Review all filled fields** before submitting",
        "8. Manually fill any fields listed in the 'Manual Input' section above",
        "9. Upload your tailored resume and cover letter if prompted",
        "",
        "---",
        "",
        "*Generated by CareerLens Auto-Fill Agent*",
    ])

    return "\n".join(lines)


async def _generate_generic_fill_guide(
    context: AgentContext,
    error_note: str | None = None,
) -> list[WorkspaceArtifact]:
    """Generate a generic fill guide when Playwright can't access the page."""
    profile_data = _build_profile_data(context)
    job = context.job

    # Get workspace artifacts
    tailored_resume = await get_latest_artifact(context.db, context.workspace_id, "tailored_resume")
    cover_letter = await get_latest_artifact(context.db, context.workspace_id, "cover_letter")

    guide_prompt = f"""Create a comprehensive form-filling guide for a job application.

## Job Details
Title: {job.title}
Company: {job.company}
URL: {job.url or "Not provided"}

## Candidate Profile
Name: {profile_data.get("full_name", "N/A")}
Email: {profile_data.get("email", "N/A")}
Current Role: {profile_data.get("current_title", "N/A")} at {profile_data.get("current_company", "N/A")}
LinkedIn: {profile_data.get("linkedin_url", "N/A")}
Headline: {profile_data.get("headline", "N/A")}

## Available Documents
- Tailored Resume: {"Available" if tailored_resume else "Not yet generated (run Tailor agent first)"}
- Cover Letter: {"Available" if cover_letter else "Not yet generated (run Strategist agent first)"}

## Create a Fill Guide

Create a ready-to-use guide listing every common application form field and the exact value to enter.
Format as a checklist the user can follow while filling out the form:

1. **Personal Information** section with exact values
2. **Professional Experience** section with what to enter
3. **Education** section
4. **Skills & Qualifications** section
5. **Documents** section (resume, cover letter upload instructions)
6. **Additional Questions** section with suggested answers for common questions like:
   - "Why are you interested in this role?"
   - "Desired salary" (advice, not specific number)
   - "Work authorization"
   - "How did you hear about this position?"
   - "Are you willing to relocate?"
7. **Pre-Submit Checklist** of things to verify

Make every answer specific and copy-pasteable where possible."""

    if error_note:
        guide_prompt += f"\n\nNote: I could not automatically analyze the form ({error_note}), so provide a comprehensive generic guide."

    guide_response = await call_agent_ai(
        context.db, "coordinator", guide_prompt, context
    )

    plan_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="form_fill_plan",
        title=f"Application Fill Guide: {job.title} at {job.company}",
        content=guide_response,
    )

    return [plan_artifact]


async def _generate_email_guide(
    context: AgentContext,
    platform: str,
    detection_details: str,
) -> list[WorkspaceArtifact]:
    """Generate an AI-powered email application guide with copy-paste content."""
    profile_data = _build_profile_data(context)
    job = context.job

    tailored_resume = await get_latest_artifact(context.db, context.workspace_id, "tailored_resume")
    cover_letter = await get_latest_artifact(context.db, context.workspace_id, "cover_letter")

    prompt = f"""Create a ready-to-send email application for this job. The employer accepts
applications via email.

## Job Details
Title: {job.title}
Company: {job.company}
URL: {job.url or "Not provided"}
Detection: {detection_details}

## Candidate Profile
Name: {profile_data.get("full_name", "N/A")}
Email: {profile_data.get("email", "N/A")}
Current Role: {profile_data.get("current_title", "N/A")} at {profile_data.get("current_company", "N/A")}
LinkedIn: {profile_data.get("linkedin_url", "N/A")}
Headline: {profile_data.get("headline", "N/A")}

## Available Documents
- Tailored Resume: {"Available" if tailored_resume else "Not yet generated"}
- Cover Letter: {"Available -- use as email body basis" if cover_letter else "Not yet generated"}

## Generate

Create a complete email the candidate can copy-paste:

1. **Subject Line** -- professional, includes job title and candidate name
2. **Email Body** -- concise cover letter adapted for email format (3-4 paragraphs)
3. **Attachment Checklist** -- what files to attach (resume, cover letter PDF, portfolio, etc.)
4. **Follow-Up Template** -- a polite follow-up email to send 5-7 days later if no response

Format each section clearly with headers. Make everything copy-pasteable."""

    guide_response = await call_agent_ai(
        context.db, "coordinator", prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="application_guide",
        title=f"Email Application Guide: {job.title} at {job.company}",
        content=guide_response,
    )
    return [artifact]


async def _generate_redirect_guide(
    context: AgentContext,
    platform: str,
    detection_details: str,
) -> list[WorkspaceArtifact]:
    """Generate a guide for job board redirect applications with copy-paste data."""
    profile_data = _build_profile_data(context)
    job = context.job

    tailored_resume = await get_latest_artifact(context.db, context.workspace_id, "tailored_resume")
    cover_letter = await get_latest_artifact(context.db, context.workspace_id, "cover_letter")

    prompt = f"""This job listing redirects to the employer's own application portal
(detected via {platform}). Create a comprehensive application guide with all data
ready to copy-paste.

## Job Details
Title: {job.title}
Company: {job.company}
URL: {job.url}
Platform: {platform}
Detection: {detection_details}

## Candidate Profile
{json.dumps(profile_data, indent=2, default=str)}

## Available Documents
- Tailored Resume: {"Available" if tailored_resume else "Not yet generated"}
- Cover Letter: {"Available" if cover_letter else "Not yet generated"}

## Generate

Create a step-by-step guide:

1. **Where to Apply** -- the actual employer portal URL if detectable, otherwise instructions
   to find it from the job board listing
2. **Copy-Paste Data** -- a table of every common field and the exact value to enter:
   | Field | Value to Copy |
   Include: name, email, phone, LinkedIn, current title, company, all dates, education, etc.
3. **Common Questions** -- pre-written answers for typical application questions:
   - Why are you interested in this role?
   - Describe your relevant experience
   - Salary expectations (advice)
   - Work authorization
   - Availability / start date
   - How did you hear about this position?
4. **Documents to Upload** -- what to prepare and in what format
5. **Pre-Submit Checklist**

Make every answer specific to this candidate and copy-pasteable."""

    guide_response = await call_agent_ai(
        context.db, "coordinator", prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="application_guide",
        title=f"Application Guide ({platform}): {job.title} at {job.company}",
        content=guide_response,
    )
    return [artifact]


async def _generate_portal_guide(
    context: AgentContext,
    platform: str,
    detection_details: str,
) -> list[WorkspaceArtifact]:
    """Generate a guide for ATS portal applications (Workday, Taleo, etc.) with copy-paste data."""
    profile_data = _build_profile_data(context)
    job = context.job

    tailored_resume = await get_latest_artifact(context.db, context.workspace_id, "tailored_resume")
    cover_letter = await get_latest_artifact(context.db, context.workspace_id, "cover_letter")

    platform_tips = {
        "workday": (
            "Workday portals require creating an account. The form is multi-step with "
            "personal info, work history, education, and voluntary disclosures. Workday "
            "often auto-parses uploaded resumes -- upload first, then correct any errors."
        ),
        "successfactors": (
            "SuccessFactors portals are similar to Workday -- account creation, multi-step "
            "wizard. Upload resume early as it may auto-populate fields."
        ),
        "taleo": (
            "Oracle Taleo portals are older-style multi-page forms. Create an account, "
            "then fill each section. Taleo does not auto-parse resumes well -- expect to "
            "re-enter everything manually."
        ),
        "icims": (
            "iCIMS portals often allow social login (LinkedIn). If available, use LinkedIn "
            "login to auto-populate fields. Otherwise, create an account and fill manually."
        ),
        "brassring": (
            "BrassRing (IBM Kenexa) portals are multi-step. Create a profile, upload resume, "
            "then complete the application form section by section."
        ),
    }

    tips = platform_tips.get(platform, (
        f"This employer uses {platform} as their applicant tracking system. "
        "Create an account if required, then complete the application form."
    ))

    prompt = f"""This employer uses an ATS portal ({platform}) that requires account creation
and a multi-step application process. Create a complete guide with all data ready to
copy-paste into each step.

## Job Details
Title: {job.title}
Company: {job.company}
URL: {job.url}
Platform: {platform}
Platform Tips: {tips}

## Candidate Profile
{json.dumps(profile_data, indent=2, default=str)}

## Available Documents
- Tailored Resume: {"Available" if tailored_resume else "Not yet generated"}
- Cover Letter: {"Available" if cover_letter else "Not yet generated"}

## Generate

Create a {platform}-specific step-by-step guide:

1. **Account Setup** -- what to expect during registration, suggested username/email
2. **Step-by-Step Form Guide** -- for each typical section of a {platform} application:
   a. **Personal Information** -- exact values to copy-paste for each field
   b. **Work Experience** -- each position formatted for the portal's fields (title,
      company, dates, description -- each as a separate copy-pasteable block)
   c. **Education** -- institution, degree, dates
   d. **Skills** -- formatted for the portal's skill entry format
   e. **Documents** -- which files to upload and recommended format (PDF, DOCX)
   f. **Additional Questions** -- pre-written answers for common screening questions
3. **{platform.title()}-Specific Tips** -- known quirks, auto-parse behavior, save/resume tips
4. **Pre-Submit Checklist**

Make every value copy-pasteable. Format work experience entries as individual blocks
the candidate can paste one at a time into the portal's "Add Experience" form."""

    guide_response = await call_agent_ai(
        context.db, "coordinator", prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="auto_fill",
        artifact_type="application_guide",
        title=f"Portal Guide ({platform.title()}): {job.title} at {job.company}",
        content=guide_response,
    )
    return [artifact]
