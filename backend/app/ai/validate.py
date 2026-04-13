import re
from typing import Any


def validate_agent_output(response: str) -> str:
    """Validate and sanitize AI output before returning to user."""
    # Iteratively strip nested script/iframe tags (handles <scr<script>ipt> bypass)
    sanitized = response
    prev = None
    while prev != sanitized:
        prev = sanitized
        sanitized = re.sub(
            r"<script[^>]*>.*?</script>", "", sanitized, flags=re.DOTALL | re.IGNORECASE
        )
        sanitized = re.sub(
            r"</?script[^>]*>", "", sanitized, flags=re.IGNORECASE
        )
        sanitized = re.sub(
            r"<iframe[^>]*>.*?</iframe>", "", sanitized, flags=re.DOTALL | re.IGNORECASE
        )
        sanitized = re.sub(
            r"</?iframe[^>]*>", "", sanitized, flags=re.IGNORECASE
        )
    # Strip event handler injection
    sanitized = re.sub(
        r"<img[^>]*onerror[^>]*>", "", sanitized, flags=re.IGNORECASE
    )
    # Strip markdown injection
    sanitized = re.sub(r"\[([^\]]*)\]\(javascript:[^)]*\)", r"\1", sanitized)
    return sanitized
