"""Persistent vector storage for chunk embeddings, backed by Chroma.

Every embedding call in pipeline.py currently recomputes vectors from scratch
per pipeline run, then throws them away. This module caches chunk embeddings
on disk (keyed by a hash of the source document text), so re-evaluating the
same RFP/bid — e.g. against a different bid, or after a NO_RULES_FOUND retry —
reuses the stored vectors instead of re-embedding identical chunks.

pgvector was the natural fit given Postgres is already in use, but the
extension isn't installed on this project's Postgres server, so Chroma
(embedded, no separate service, no DB admin access needed) is used instead.
"""

import hashlib
import os
from pathlib import Path

import chromadb

_CHROMA_DIR = os.environ.get("CHROMA_DIR", str(Path(__file__).parent / "chroma_data"))

_client = chromadb.PersistentClient(path=_CHROMA_DIR)
_collection = _client.get_or_create_collection(
    name="document_chunks",
    metadata={"hnsw:space": "cosine"},
)


def doc_hash(text: str) -> str:
    """Stable cache key for a document's raw text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def get_cached_embeddings(doc_id: str, num_chunks: int) -> list[list[float]] | None:
    """Return the cached embeddings for doc_id's chunks, or None on a partial/total miss."""
    ids = [f"{doc_id}:{i}" for i in range(num_chunks)]
    result = _collection.get(ids=ids, include=["embeddings"])
    found_ids = result.get("ids") or []
    if len(found_ids) != num_chunks:
        return None
    by_id = dict(zip(found_ids, result["embeddings"]))
    return [[float(x) for x in by_id[i]] for i in ids]


def store_embeddings(doc_id: str, chunks: list[str], embeddings: list[list[float]]) -> None:
    """Persist chunk embeddings, keyed as '<doc_id>:<chunk_index>'."""
    ids = [f"{doc_id}:{i}" for i in range(len(chunks))]
    _collection.upsert(ids=ids, embeddings=embeddings, documents=chunks)
