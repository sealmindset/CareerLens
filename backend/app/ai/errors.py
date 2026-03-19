import logging

logger = logging.getLogger(__name__)


class SafeAIError:
    def __init__(self, message: str, retry_after: int | None = None):
        self.message = message
        self.retry_after = retry_after


def sanitize_ai_error(error: Exception) -> SafeAIError:
    """Map provider errors to safe client messages. Never expose internals."""
    logger.error("AI provider error: %s", str(error), exc_info=True)
    error_str = str(error).lower()
    if "429" in error_str or "rate" in error_str:
        return SafeAIError(
            "AI service is temporarily busy. Please try again.", retry_after=60
        )
    if "401" in error_str or "403" in error_str or "auth" in error_str:
        return SafeAIError(
            "AI service configuration error. Contact your administrator."
        )
    if "timeout" in error_str:
        return SafeAIError(
            "AI request timed out. Please try again with a shorter input."
        )
    if "content" in error_str and "filter" in error_str:
        return SafeAIError("Request could not be processed due to content policy.")
    return SafeAIError("AI processing failed. Please try again.")
