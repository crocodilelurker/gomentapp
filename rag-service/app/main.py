"""Production entrypoint: wires real ChromaDB, OpenRouter (Nemotron) embeddings and OpenAI into the API."""

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.api import create_app
from app.config import Settings
from app.pipeline.embedding import OpenRouterEmbedder
from app.pipeline.generation import OpenAIGenerator
from app.pipeline.vector_store import ChromaVectorStore
from app.service import RagService


def build_service(settings: Settings) -> RagService:
    client = chromadb.PersistentClient(
        path=settings.chroma_persist_dir,
        settings=ChromaSettings(anonymized_telemetry=False),
    )
    return RagService(
        embedder=OpenRouterEmbedder(
            api_key=settings.openrouter_api_key,
            model=settings.embedding_model,
            base_url=settings.openrouter_base_url,
        ),
        store=ChromaVectorStore(client, settings.chroma_collection),
        generator=OpenAIGenerator(api_key=settings.openai_api_key, model=settings.openai_model),
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        default_top_k=settings.top_k,
        summary_max_chars=settings.summary_max_chars,
    )


app = create_app(build_service(Settings.from_env()))
