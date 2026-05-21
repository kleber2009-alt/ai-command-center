"""
Per-tenant knowledge base management.

Each tenant gets an isolated Qdrant collection: kb_t_{short_hash}.
Handles document ingestion (PDF/TXT/MD) and semantic search.
"""
from __future__ import annotations

import hashlib
import io
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

log = logging.getLogger("aisales.tenant_kb")

QDRANT_URL = os.getenv("QDRANT_URL", "http://aisales-qdrant:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

CHUNK_SIZE = 600      # chars
CHUNK_OVERLAP = 80    # chars


def collection_name_for(tenant_id: str) -> str:
    short = hashlib.md5(tenant_id.encode()).hexdigest()[:8]
    return f"kb_t_{short}"


def _chunk_text(text: str) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        chunk = text[start:end].strip()
        if len(chunk) > 60:
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP
    return chunks


def _extract_text(data: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                pages = [p.extract_text() or "" for p in pdf.pages]
            return "\n\n".join(pages)
        except ImportError:
            log.warning("pdfplumber not installed, treating PDF as text")
    for enc in ("utf-8", "cp1251", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def _get_qdrant():
    from qdrant_client import QdrantClient  # type: ignore
    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY or None)


def _get_openai():
    from openai import OpenAI  # type: ignore
    return OpenAI(api_key=OPENAI_API_KEY)


def _ensure_collection(qdrant, col: str) -> None:
    from qdrant_client.models import Distance, VectorParams  # type: ignore
    try:
        qdrant.get_collection(col)
    except Exception:
        qdrant.create_collection(
            collection_name=col,
            vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
        )
        log.info("tenant_kb · created collection %s", col)


async def ingest_document(tenant_id: str, filename: str, data: bytes) -> int:
    """
    Chunk + embed + upsert a document into the tenant's Qdrant collection.
    Returns number of chunks upserted.
    """
    from qdrant_client.models import PointStruct  # type: ignore

    text = _extract_text(data, filename)
    chunks = _chunk_text(text)
    if not chunks:
        log.warning("tenant_kb · no chunks from %s", filename)
        return 0

    col = collection_name_for(tenant_id)
    qdrant = _get_qdrant()
    openai = _get_openai()

    _ensure_collection(qdrant, col)

    # Embed in batches of 20
    points: list[PointStruct] = []
    BATCH = 20
    for i in range(0, len(chunks), BATCH):
        batch = chunks[i : i + BATCH]
        resp = openai.embeddings.create(model="text-embedding-3-small", input=batch)
        for j, emb in enumerate(resp.data):
            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=emb.embedding,
                    payload={
                        "text": batch[j],
                        "source": filename,
                        "tenant_id": tenant_id,
                        "chunk_idx": i + j,
                    },
                )
            )

    qdrant.upsert(collection_name=col, points=points)
    log.info("tenant_kb · upserted %d chunks → %s", len(points), col)
    return len(points)


def search_tenant_kb(
    tenant_id: str,
    query_vector: list[float],
    limit: int = 3,
    threshold: float = 0.20,
) -> list[dict]:
    """Search a tenant's Qdrant collection. Returns empty list on any error."""
    col = collection_name_for(tenant_id)
    try:
        qdrant = _get_qdrant()
        hits = qdrant.search(
            collection_name=col,
            query_vector=query_vector,
            limit=limit,
            score_threshold=threshold,
        )
        return [
            {
                "collection": col,
                "content": h.payload.get("text", ""),
                "title": h.payload.get("source", ""),
                "similarity": round(h.score, 3),
            }
            for h in hits
        ]
    except Exception as e:
        log.warning("tenant_kb · search failed in %s: %s", col, e)
        return []


async def save_doc_record(
    tenant_id: str,
    filename: str,
    file_size: int,
    chunks_count: int,
    postgres_url: Optional[str] = None,
) -> None:
    """Persist tenant_kb_docs record to postgres (best-effort)."""
    url = postgres_url or os.getenv("POSTGRES_URL", "")
    if not url:
        return
    try:
        import asyncpg  # type: ignore
        conn = await asyncpg.connect(url)
        await conn.execute(
            """
            INSERT INTO tenant_kb_docs (tenant_id, filename, file_size_bytes, chunks_count)
            VALUES ($1::uuid, $2, $3, $4)
            """,
            tenant_id, filename, file_size, chunks_count,
        )
        await conn.close()
    except Exception as e:
        log.warning("tenant_kb · save_doc_record failed: %s", e)
