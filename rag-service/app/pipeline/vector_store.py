"""Step 3.3 (indexing) and Steps 4.2–4.3 (cosine proximity, top-K) on ChromaDB."""

from dataclasses import dataclass

from app.pipeline.chunking import Chunk


@dataclass(frozen=True)
class RetrievedChunk:
    id: str
    text: str
    metadata: dict
    score: float  # cosine similarity, higher is closer


class ChromaVectorStore:
    def __init__(self, client, collection_name: str):
        # Embeddings are computed by our own embedder, so Chroma's default embedding function is disabled.
        self._collection = client.get_or_create_collection(
            collection_name,
            embedding_function=None,
            configuration={"hnsw": {"space": "cosine"}},
        )

    def replace_document(self, document_id: str, chunks: list[Chunk], embeddings: list[list[float]]) -> None:
        """Index a document's chunks, dropping any chunks previously stored for it."""
        self._collection.delete(where={"document_id": document_id})
        if not chunks:
            return
        self._collection.upsert(
            ids=[chunk.id for chunk in chunks],
            embeddings=embeddings,
            documents=[chunk.text for chunk in chunks],
            metadatas=[chunk.metadata for chunk in chunks],
        )

    def query(self, embedding: list[float], top_k: int) -> list[RetrievedChunk]:
        result = self._collection.query(
            query_embeddings=[embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )
        return [
            RetrievedChunk(id=chunk_id, text=text, metadata=metadata or {}, score=1.0 - distance)
            for chunk_id, text, metadata, distance in zip(
                result["ids"][0], result["documents"][0], result["metadatas"][0], result["distances"][0]
            )
        ]

    def count(self) -> int:
        return self._collection.count()
