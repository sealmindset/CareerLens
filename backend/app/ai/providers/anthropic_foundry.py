import logging

from anthropic import AsyncAnthropic
from app.ai.provider import AIProvider
from app.config import settings

logger = logging.getLogger(__name__)


def _resolve_api_key() -> str:
    """Resolve API key: use AZURE_AI_FOUNDRY_API_KEY if set, else DefaultAzureCredential."""
    if settings.AZURE_AI_FOUNDRY_API_KEY:
        return settings.AZURE_AI_FOUNDRY_API_KEY
    try:
        from azure.identity import DefaultAzureCredential
        credential = DefaultAzureCredential()
        token = credential.get_token("https://cognitiveservices.azure.com/.default")
        return token.token
    except Exception as e:
        logger.error("Azure AI Foundry auth failed: no API key and DefaultAzureCredential unavailable: %s", e)
        raise ValueError(
            "AZURE_AI_FOUNDRY_API_KEY is not set and DefaultAzureCredential failed. "
            "Set the API key in .env or run 'az login' for Azure CLI auth."
        ) from e


class AnthropicFoundryProvider(AIProvider):
    """Azure AI Foundry provider using Anthropic SDK with base_url override.

    Supports dual-mode auth: API key (preferred) or DefaultAzureCredential fallback.
    """

    def __init__(self):
        self.client = AsyncAnthropic(
            api_key=_resolve_api_key(),
            base_url=settings.AZURE_AI_FOUNDRY_ENDPOINT,
        )

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.AI_MODEL_STANDARD
        response = await self.client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.content[0].text

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.AI_MODEL_STANDARD
        async with self.client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt},
            ],
        ) as stream:
            async for text in stream.text_stream:
                yield text
