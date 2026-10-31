"""Orchestrates the five RAG steps for ingestion and question answering."""

import hashlib
import unicodedata
from dataclasses import dataclass

from app.pipeline.chunking import chunk_document
from app.pipeline.embedding import Embedder
from app.pipeline.generation import Generator, build_prompt
from app.pipeline.ingestion import decode_text, sanitize_text
from app.pipeline.summarization import PolicySummary, Summarizer
from app.pipeline.vector_store import ChromaVectorStore, RetrievedChunk

NO_CONTEXT_ANSWER = "No policy documents have been ingested yet, so this question cannot be answered."


class EmptyDocumentError(ValueError):
    """The document has no usable text after sanitization."""


@dataclass(frozen=True)
class IngestResult:
    document_id: str
    chunks: int


@dataclass(frozen=True)
class Answer:
    answer: str
    sources: list[RetrievedChunk]


class RagService:
    def __init__(
        self,
        embedder: Embedder,
        store: ChromaVectorStore,
        generator: Generator,
        chunk_size: int,
        chunk_overlap: int,
        default_top_k: int,
        summary_max_chars: int = 60000,
    ):
        self.embedder = embedder
        self.store = store
        self.generator = generator
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.default_top_k = default_top_k
        self.summary_max_chars = summary_max_chars

    def ingest(self, raw: bytes, source: str, metadata: dict, document_id: str | None = None) -> IngestResult:
        # Step 1 — read as UTF-8 and sanitize
        text = sanitize_text(decode_text(raw))
        if not text:
            raise EmptyDocumentError("Document contains no text after sanitization")

        # Callers that catalogue the original file (policy-scheme-service) pass its id so chunks point back to it.
        # Otherwise: SHA-256 of the raw bytes — same file -> same id, so re-ingesting replaces instead of duplicating.
        document_id = document_id or hashlib.sha256(raw).hexdigest()

        # Step 2 — boundary-aware, overlapping chunks tagged with provenance
        chunks = chunk_document(
            text,
            document_id=document_id,
            metadata={**metadata, "source": source},
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
        )

        # Step 3 — embed and index
        embeddings = self.embedder.embed_documents([chunk.text for chunk in chunks])
        self.store.replace_document(document_id, chunks, embeddings)

        return IngestResult(document_id=document_id, chunks=len(chunks))

    def retrieve(self, query: str, top_k: int | None = None) -> list[RetrievedChunk]:
        # Step 4 — embed the query with the same model, then fetch the top-K closest chunks
        vector = self.embedder.embed_query(query)
        return self.store.query(vector, top_k or self.default_top_k)

    def ask(self, query: str, top_k: int | None = None) -> Answer:
        chunks = self.retrieve(query, top_k)
        if not chunks:
            return Answer(answer=NO_CONTEXT_ANSWER, sources=[])

        # Step 5 — grounded prompt -> LLM
        instructions, prompt = build_prompt(query, chunks)
        return Answer(answer=self.generator.generate(instructions, prompt), sources=chunks)

    def summarize(self, text: str, scheme_name: str | None = None) -> PolicySummary:
        """Eligibility, benefits and requirements as point lists, grounded only in the document."""
        clean = sanitize_text(unicodedata.normalize("NFC", text))
        if not clean:
            raise EmptyDocumentError("Document contains no text after sanitization")
        return Summarizer(self.generator, max_chars=self.summary_max_chars).summarize(clean, scheme_name)
