"""RAG service for profile content retrieval.

Chunks profile data (experiences, skills, education, resume text),
stores embeddings via pgvector, and retrieves relevant chunks for agent prompts.
"""

import json
import logging
import uuid

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.embedding import ProfileChunk
from app.models.profile import Profile
from app.services.embedding_provider import (
    KeywordEmbeddingProvider,
    get_embedding_provider,
    keyword_score,
    tokenize,
    tokens_to_json,
)

logger = logging.getLogger(__name__)


# --- Chunking ---

def chunk_profile(profile: Profile) -> list[dict]:
    """Break a profile into semantic chunks for embedding.

    Each chunk is a dict with: chunk_type, chunk_text, source_id
    """
    chunks: list[dict] = []

    # Summary chunk
    if profile.summary:
        chunks.append({
            "chunk_type": "summary",
            "chunk_text": f"Professional Summary: {profile.summary}",
            "source_id": None,
        })

    # Headline chunk
    if profile.headline:
        chunks.append({
            "chunk_type": "summary",
            "chunk_text": f"Professional Headline: {profile.headline}",
            "source_id": None,
        })

    # Experience chunks -- one per experience entry
    for exp in (profile.experiences or []):
        parts = [f"{exp.title} at {exp.company}"]
        if exp.start_date:
            date_range = f"{exp.start_date}"
            date_range += f" to {exp.end_date}" if exp.end_date else " to present"
            parts.append(date_range)
        if exp.description:
            parts.append(exp.description)
        chunks.append({
            "chunk_type": "experience",
            "chunk_text": "\n".join(parts),
            "source_id": str(exp.id),
        })

    # Skills chunk -- group all skills into one chunk
    if profile.skills:
        skill_lines = []
        for s in profile.skills:
            line = f"{s.skill_name} ({s.proficiency_level})"
            if s.years_experience:
                line += f" - {s.years_experience} years"
            skill_lines.append(line)
        chunks.append({
            "chunk_type": "skill",
            "chunk_text": "Skills: " + ", ".join(skill_lines),
            "source_id": None,
        })

    # Education chunks -- one per entry
    for edu in (profile.educations or []):
        parts = []
        if edu.degree:
            parts.append(edu.degree)
        if edu.field_of_study:
            parts.append(f"in {edu.field_of_study}")
        parts.append(f"at {edu.institution}")
        if edu.graduation_date:
            parts.append(f"({edu.graduation_date})")
        chunks.append({
            "chunk_type": "education",
            "chunk_text": " ".join(parts),
            "source_id": str(edu.id),
        })

    # Raw resume text -- split into overlapping chunks if long
    if profile.raw_resume_text:
        text_content = profile.raw_resume_text
        chunk_size = settings.RAG_CHUNK_SIZE
        overlap = settings.RAG_CHUNK_OVERLAP

        if len(text_content) <= chunk_size * 2:
            # Short enough to keep as one or two chunks
            chunks.append({
                "chunk_type": "resume_text",
                "chunk_text": text_content,
                "source_id": None,
            })
        else:
            # Split into overlapping chunks by paragraphs where possible
            paragraphs = text_content.split("\n\n")
            current_chunk = ""
            for para in paragraphs:
                if len(current_chunk) + len(para) > chunk_size and current_chunk:
                    chunks.append({
                        "chunk_type": "resume_text",
                        "chunk_text": current_chunk.strip(),
                        "source_id": None,
                    })
                    # Keep overlap from end of current chunk
                    current_chunk = current_chunk[-overlap:] + "\n\n" + para
                else:
                    current_chunk = (current_chunk + "\n\n" + para).strip()
            if current_chunk.strip():
                chunks.append({
                    "chunk_type": "resume_text",
                    "chunk_text": current_chunk.strip(),
                    "source_id": None,
                })

    return chunks


# --- Indexing ---

async def index_profile(db: AsyncSession, profile: Profile) -> int:
    """Re-index a profile's content for RAG retrieval.

    Deletes existing chunks and creates new ones with fresh embeddings.
    Returns the number of chunks created.
    """
    provider = get_embedding_provider()
    is_keyword = isinstance(provider, KeywordEmbeddingProvider)

    # Delete existing chunks for this profile
    await db.execute(
        delete(ProfileChunk).where(ProfileChunk.profile_id == profile.id)
    )
    await db.flush()

    # Generate chunks
    chunks = chunk_profile(profile)
    if not chunks:
        return 0

    # Generate embeddings (if using vector provider)
    texts = [c["chunk_text"] for c in chunks]
    if not is_keyword:
        try:
            embeddings = await provider.embed(texts)
        except Exception as e:
            logger.error("Embedding generation failed, falling back to keyword: %s", e)
            embeddings = [[] for _ in texts]
            is_keyword = True
    else:
        embeddings = [[] for _ in texts]

    # Store chunks
    for i, chunk_data in enumerate(chunks):
        chunk = ProfileChunk(
            profile_id=profile.id,
            chunk_type=chunk_data["chunk_type"],
            chunk_text=chunk_data["chunk_text"],
            source_id=chunk_data["source_id"],
            keyword_tokens=tokens_to_json(chunk_data["chunk_text"]),
        )
        # Set embedding if available
        if embeddings[i]:
            chunk.embedding = embeddings[i]

        db.add(chunk)

    await db.flush()
    logger.info(
        "Indexed %d chunks for profile %s (provider: %s)",
        len(chunks), profile.id, "keyword" if is_keyword else "vector",
    )
    return len(chunks)


# --- Retrieval ---

async def retrieve_relevant_chunks(
    db: AsyncSession,
    profile_id: uuid.UUID,
    query: str,
    top_k: int | None = None,
    chunk_types: list[str] | None = None,
) -> list[ProfileChunk]:
    """Retrieve the most relevant profile chunks for a given query.

    Uses vector similarity if embeddings exist, otherwise falls back to keyword matching.
    """
    if top_k is None:
        top_k = settings.RAG_TOP_K

    provider = get_embedding_provider()
    is_keyword = isinstance(provider, KeywordEmbeddingProvider)

    if not is_keyword:
        return await _retrieve_by_vector(db, profile_id, query, top_k, chunk_types, provider)
    else:
        return await _retrieve_by_keyword(db, profile_id, query, top_k, chunk_types)


async def _retrieve_by_vector(
    db: AsyncSession,
    profile_id: uuid.UUID,
    query: str,
    top_k: int,
    chunk_types: list[str] | None,
    provider,
) -> list[ProfileChunk]:
    """Retrieve chunks using pgvector cosine similarity."""
    try:
        query_embedding = await provider.embed_query(query)
    except Exception as e:
        logger.error("Query embedding failed, falling back to keyword: %s", e)
        return await _retrieve_by_keyword(db, profile_id, query, top_k, chunk_types)

    # Build the vector similarity query using raw SQL for pgvector operator
    type_filter = ""
    params: dict = {
        "profile_id": profile_id,
        "query_vec": str(query_embedding),
        "top_k": top_k,
    }
    if chunk_types:
        placeholders = ", ".join(f":type_{i}" for i in range(len(chunk_types)))
        type_filter = f"AND chunk_type IN ({placeholders})"
        for i, ct in enumerate(chunk_types):
            params[f"type_{i}"] = ct

    sql = text(f"""
        SELECT id, profile_id, chunk_type, chunk_text, source_id,
               keyword_tokens, created_at, updated_at,
               1 - (embedding <=> :query_vec::vector) AS similarity
        FROM profile_chunks
        WHERE profile_id = :profile_id
          AND embedding IS NOT NULL
          {type_filter}
        ORDER BY embedding <=> :query_vec::vector
        LIMIT :top_k
    """)

    result = await db.execute(sql, params)
    rows = result.fetchall()

    # Load as ProfileChunk objects
    if not rows:
        return await _retrieve_by_keyword(db, profile_id, query, top_k, chunk_types)

    chunk_ids = [row[0] for row in rows]
    stmt = select(ProfileChunk).where(ProfileChunk.id.in_(chunk_ids))
    chunk_result = await db.execute(stmt)
    chunks = list(chunk_result.scalars().all())

    # Preserve similarity ordering
    id_order = {cid: idx for idx, cid in enumerate(chunk_ids)}
    chunks.sort(key=lambda c: id_order.get(c.id, 999))

    return chunks


async def _retrieve_by_keyword(
    db: AsyncSession,
    profile_id: uuid.UUID,
    query: str,
    top_k: int,
    chunk_types: list[str] | None,
) -> list[ProfileChunk]:
    """Retrieve chunks using BM25-style keyword matching."""
    stmt = select(ProfileChunk).where(ProfileChunk.profile_id == profile_id)
    if chunk_types:
        stmt = stmt.where(ProfileChunk.chunk_type.in_(chunk_types))

    result = await db.execute(stmt)
    all_chunks = list(result.scalars().all())

    if not all_chunks:
        return []

    query_tokens = tokenize(query)
    if not query_tokens:
        # No meaningful query tokens -- return all chunks (up to top_k)
        return all_chunks[:top_k]

    # Score and sort
    scored = []
    for chunk in all_chunks:
        score = keyword_score(query_tokens, chunk.keyword_tokens)
        scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Return top_k chunks with score > 0, plus any unscored ones to fill
    results = [chunk for score, chunk in scored if score > 0][:top_k]

    # If we have fewer than top_k results, add remaining chunks
    if len(results) < top_k:
        seen_ids = {c.id for c in results}
        for _, chunk in scored:
            if chunk.id not in seen_ids:
                results.append(chunk)
                if len(results) >= top_k:
                    break

    return results[:top_k]


# --- Context formatting ---

def format_rag_context(chunks: list[ProfileChunk]) -> str:
    """Format retrieved chunks into a context string for agent prompts."""
    if not chunks:
        return ""

    parts = ["## Candidate Profile (retrieved by relevance)\n"]

    # Group by chunk type for readability
    by_type: dict[str, list[ProfileChunk]] = {}
    for chunk in chunks:
        by_type.setdefault(chunk.chunk_type, []).append(chunk)

    type_order = ["summary", "experience", "skill", "education", "resume_text"]
    type_labels = {
        "summary": "Summary",
        "experience": "Experience",
        "skill": "Skills",
        "education": "Education",
        "resume_text": "Resume Details",
    }

    for ct in type_order:
        if ct not in by_type:
            continue
        parts.append(f"\n**{type_labels.get(ct, ct)}:**")
        for chunk in by_type[ct]:
            parts.append(chunk.chunk_text)

    return "\n".join(parts)
