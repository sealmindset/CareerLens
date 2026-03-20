"""Coordinator Agent -- Application orchestration.

Builds a comprehensive application checklist from all workspace artifacts,
tracks progress, and creates a follow-up plan.

Produces: application_checklist, follow_up_plan
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


async def run_coordinator_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Coordinator agent's orchestration task."""

    # Task 1: Application Checklist
    checklist_prompt = """Create a comprehensive application checklist using all available workspace data.

Review the artifacts from other agents and build an actionable checklist:

1. **Pre-Application Checklist**
   - [ ] Resume tailored for this role (reference Tailor's output if available)
   - [ ] Cover letter finalized (reference Strategist's output if available)
   - [ ] LinkedIn profile updated (reference Brand Advisor's output if available)
   - [ ] Company research reviewed (reference Brand Advisor's output if available)
   - [ ] Interview prep started (reference Coach's output if available)
   - [ ] Keywords optimized (reference Tailor's keyword guide if available)

2. **Application Submission Checklist**
   - [ ] Verify all required fields are complete
   - [ ] Confirm resume format (PDF recommended)
   - [ ] Double-check contact information
   - [ ] Save confirmation/reference number
   - [ ] Screenshot the submission for records

3. **Post-Submission Checklist**
   - [ ] Send thank-you/follow-up email (provide template)
   - [ ] Connect with recruiter/hiring manager on LinkedIn
   - [ ] Set follow-up reminders (7-day, 14-day)
   - [ ] Continue preparing for potential interview

4. **Readiness Summary**
   Based on available workspace artifacts, assess:
   - What's complete and ready
   - What still needs attention
   - Recommended order of remaining tasks
   - Estimated time to complete everything

Be specific -- reference actual content from other agents' outputs when available.
If certain agent outputs are missing, note what would be gained by running them.

Format as an interactive checklist with clear status indicators."""

    checklist_response = await call_agent_ai(
        context.db, "coordinator", checklist_prompt, context
    )

    checklist_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="coordinator",
        artifact_type="application_checklist",
        title=f"Application Checklist: {context.job.title} at {context.job.company}",
        content=checklist_response,
    )

    # Task 2: Follow-Up Plan
    followup_prompt = """Create a detailed follow-up plan and timeline for this application.

1. **Day of Submission**
   - Immediate actions after submitting
   - Who to notify (references, networking contacts)
   - What to document

2. **Week 1 Follow-Up**
   - Day 3: Check application portal status
   - Day 5-7: First follow-up email (provide template)
   - LinkedIn engagement strategy

3. **Week 2-3 Follow-Up**
   - Second follow-up strategy (if no response)
   - Alternative contact channels
   - When to escalate vs. wait

4. **If You Get an Interview**
   - Immediate response template
   - Pre-interview preparation timeline
   - Day-of checklist

5. **If You Don't Hear Back**
   - When to consider the application closed
   - How to maintain the relationship for future opportunities
   - What to learn from this application for the next one

6. **Key Dates & Reminders**
   - Create a timeline with specific dates based on today's date
   - Include all follow-up touchpoints
   - Note any application deadlines mentioned in the listing

Include email templates for each follow-up stage.

Format as a calendar-style action plan."""

    followup_response = await call_agent_ai(
        context.db, "coordinator", followup_prompt, context
    )

    followup_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="coordinator",
        artifact_type="follow_up_plan",
        title=f"Follow-Up Plan: {context.job.title} at {context.job.company}",
        content=followup_response,
    )

    return [checklist_artifact, followup_artifact]
