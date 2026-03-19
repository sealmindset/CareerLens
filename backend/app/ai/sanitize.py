import re
import logging

logger = logging.getLogger(__name__)

INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions",
    r"disregard\s+(?:above|your)\s+instructions",
    r"you\s+are\s+now",
    r"act\s+as\s+(?:root|admin|sudo)",
    r"pretend\s+you\s+are",
    r"roleplay\s+as",
    r"system:",
    r"###\s*(?:System|Human|Assistant):",
    r"<\|(?:system|user|assistant)\|>",
]

_compiled = [re.compile(p, re.IGNORECASE) for p in INJECTION_PATTERNS]


def sanitize_prompt_input(text: str) -> str:
    """Strip injection patterns and wrap in delimiter tags."""
    sanitized = text
    for pattern in _compiled:
        match = pattern.search(sanitized)
        if match:
            logger.warning("Stripped injection pattern: %s", match.group())
            sanitized = pattern.sub("", sanitized)
    return f"<user_input>{sanitized.strip()}</user_input>"
