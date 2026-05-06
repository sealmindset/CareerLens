"""Agent logic modules -- each agent's core task execution."""

from app.services.agents.scout import run_scout_task
from app.services.agents.tailor import run_tailor_task
from app.services.agents.coach import run_coach_task
from app.services.agents.cover_letter import run_cover_letter_task
from app.services.agents.strategist import run_strategist_task
from app.services.agents.brand_advisor import run_brand_advisor_task
from app.services.agents.coordinator import run_coordinator_task
from app.services.agents.auto_fill import run_autofill_task
from app.services.agents.talking_points import run_talking_points_task
from app.services.agents.achievement_amplifier import run_achievement_amplifier_task
from app.services.agents.ats_predictor import run_ats_predictor_task
from app.services.agents.hiring_manager_sim import run_hiring_manager_sim_task
from app.services.agents.ninety_day_plan import run_ninety_day_plan_task
from app.services.agents.outreach_drafter import run_outreach_drafter_task
from app.services.agents.interview_verdict import run_interview_verdict_task
from app.services.agents.interview_prep_coach import run_interview_prep_coach_task

AGENT_RUNNERS = {
    "scout": run_scout_task,
    "tailor": run_tailor_task,
    "achievement_amplifier": run_achievement_amplifier_task,
    "ats_predictor": run_ats_predictor_task,
    "hiring_manager_sim": run_hiring_manager_sim_task,
    "coach": run_coach_task,
    "talking_points": run_talking_points_task,
    "cover_letter": run_cover_letter_task,
    "strategist": run_strategist_task,
    "brand_advisor": run_brand_advisor_task,
    "ninety_day_plan": run_ninety_day_plan_task,
    "outreach_drafter": run_outreach_drafter_task,
    "coordinator": run_coordinator_task,
    "auto_fill": run_autofill_task,
    "interview_verdict": run_interview_verdict_task,
    "interview_prep_coach": run_interview_prep_coach_task,
}

__all__ = ["AGENT_RUNNERS"]
