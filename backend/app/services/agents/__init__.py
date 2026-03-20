"""Agent logic modules -- each agent's core task execution."""

from app.services.agents.scout import run_scout_task
from app.services.agents.tailor import run_tailor_task
from app.services.agents.coach import run_coach_task
from app.services.agents.strategist import run_strategist_task
from app.services.agents.brand_advisor import run_brand_advisor_task
from app.services.agents.coordinator import run_coordinator_task

AGENT_RUNNERS = {
    "scout": run_scout_task,
    "tailor": run_tailor_task,
    "coach": run_coach_task,
    "strategist": run_strategist_task,
    "brand_advisor": run_brand_advisor_task,
    "coordinator": run_coordinator_task,
}

__all__ = ["AGENT_RUNNERS"]
