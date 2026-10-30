from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.pipeline.embedding import EmbedderNotConfiguredError, EmbeddingError
from app.pipeline.generation import GenerationError, GeneratorNotConfiguredError
from app.pipeline.ingestion import EncodingError
from app.pipeline.vector_store import RetrievedChunk
from app.service import EmptyDocumentError, RagService


class QueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int | None = Field(default=None, ge=1, le=20)


def _serialize(chunk: RetrievedChunk) -> dict:
    return {"id": chunk.id, "text": chunk.text, "score": chunk.score, "metadata": chunk.metadata}


@contextmanager
def _model_provider_errors() -> Iterator[None]:
    """Missing credentials -> 503; provider failures -> 502."""
    try:
        yield
    except (EmbedderNotConfiguredError, GeneratorNotConfiguredError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except EmbeddingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The embedding model request failed") from exc
    except GenerationError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The language model request failed") from exc


def create_app(service: RagService) -> FastAPI:
    app = FastAPI(title="rag-service")

    @app.get("/health")
    def health():
        return {"service": "rag-service", "status": "ok"}

    @app.post("/ingest", status_code=status.HTTP_201_CREATED)
    def ingest(
        file: Annotated[UploadFile, File()],
        scheme_name: Annotated[str | None, Form()] = None,
        department: Annotated[str | None, Form()] = None,
        release_date: Annotated[str | None, Form()] = None,
    ):
        if not (file.filename or "").lower().endswith(".txt"):
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only .txt files are supported")
        try:
            with _model_provider_errors():
                result = service.ingest(
                    file.file.read(),
                    source=file.filename,
                    metadata={"scheme_name": scheme_name, "department": department, "release_date": release_date},
                )
        except (EncodingError, EmptyDocumentError) as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        return {"document_id": result.document_id, "chunks": result.chunks}

    @app.post("/retrieve")
    def retrieve(request: QueryRequest):
        with _model_provider_errors():
            chunks = service.retrieve(request.query, request.top_k)
        return {"query": request.query, "results": [_serialize(chunk) for chunk in chunks]}

    @app.post("/ask")
    def ask(request: QueryRequest):
        with _model_provider_errors():
            answer = service.ask(request.query, request.top_k)
        return {"answer": answer.answer, "sources": [_serialize(chunk) for chunk in answer.sources]}

    return app
