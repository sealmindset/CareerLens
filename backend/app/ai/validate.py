import re
from typing import Any


def validate_agent_output(response: str) -> str:
    """Validate and sanitize AI output before returning to user."""
    # Strip HTML/script tags
    sanitized = re.sub(
        r"<script[^>]*>.*?</script>", "", response, flags=re.DOTALL | re.IGNORECASE
    )
    sanitized = re.sub(
        r"<iframe[^>]*>.*?</iframe>", "", sanitized, flags=re.DOTALL | re.IGNORECASE
    )
    sanitized = re.sub(
        r"<img[^>]*onerror[^>]*>", "", sanitized, flags=re.IGNORECASE
    )
    # Strip markdown injection
    sanitized = re.sub(r"\[([^\]]*)\]\(javascript:[^)]*\)", r"\1", sanitized)
    return sanitized
