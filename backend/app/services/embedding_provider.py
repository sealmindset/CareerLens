"""Embedding providers for RAG system.

Supports:
- "openai": Uses OpenAI text-embedding-3-small (requires OPENAI_API_KEY)
- "keyword": BM25-style keyword matching fallback (no API needed)
"""

import json
import logging
import math
import re
from abc import ABC, abstractmethod
from collections import Counter

from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    """Abstract embedding provider interface."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts. Returns list of float vectors."""
        ...

    @abstractmethod
    async def embed_query(self, query: str) -> list[float]:
        """Generate embedding for a single query string."""
        ...

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Return the embedding vector dimensions."""
        ...


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider using text-embedding-3-small."""

    def __init__(self) -> None:
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.EMBEDDING_MODEL
        self._dimensions = settings.EMBEDDING_DIMENSIONS

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        # OpenAI allows batch embedding (up to 2048 inputs)
        batch_size = 512
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await self._client.embeddings.create(
                input=batch,
                model=self._model,
                dimensions=self._dimensions,
            )
            all_embeddings.extend([d.embedding for d in response.data])
        return all_embeddings

    async def embed_query(self, query: str) -> list[float]:
        result = await self.embed([query])
        return result[0]


# --- Keyword-based fallback (no embedding API needed) ---

_STOP_WORDS = frozenset(
    "a an and are as at be by for from has have he her his how i in is it its "
    "me my no not of on or our she the their them they this to was we what when "
    "where which who will with you your".split()
)


def tokenize(text: str) -> list[str]:
    """Simple tokenizer: lowercase, split on non-alphanumeric, remove stop words."""
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


def tokens_to_json(text: str) -> str:
    """Convert text to JSON array of keyword tokens for storage."""
    return json.dumps(tokenize(text))


def keyword_score(query_tokens: list[str], doc_tokens_json: str) -> float:
    """BM25-inspired keyword relevance score."""
    if not query_tokens or not doc_tokens_json:
        return 0.0
    try:
        doc_tokens = json.loads(doc_tokens_json)
    except (json.JSONDecodeError, TypeError):
        return 0.0

    if not doc_tokens:
        return 0.0

    doc_freq = Counter(doc_tokens)
    doc_len = len(doc_tokens)
    avg_dl = 100  # approximate average doc length
    k1 = 1.5
    b = 0.75

    score = 0.0
    for qt in query_tokens:
        tf = doc_freq.get(qt, 0)
        if tf > 0:
            idf = math.log(1 + 1)  # simplified IDF (single doc context)
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * doc_len / avg_dl)
            score += idf * numerator / denominator

    return score


class KeywordEmbeddingProvider(EmbeddingProvider):
    """Keyword-based fallback that uses token matching instead of vectors.

    Does not produce real embeddings -- embed() returns empty vectors.
    Retrieval is done via keyword_score() on stored keyword_tokens.
    """

    @property
    def dimensions(self) -> int:
        return 0  # No vector dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[] for _ in texts]

    async def embed_query(self, query: str) -> list[float]:
        return []


def get_embedding_provider() -> EmbeddingProvider:
    """Factory: returns configured embedding provider."""
    provider_name = settings.EMBEDDING_PROVIDER.lower()

    if provider_name == "openai":
        if not settings.OPENAI_API_KEY:
            logger.warning(
                "EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set. "
                "Falling back to keyword provider."
            )
            return KeywordEmbeddingProvider()
        return OpenAIEmbeddingProvider()

    # Default: keyword-based fallback
    return KeywordEmbeddingProvider()
