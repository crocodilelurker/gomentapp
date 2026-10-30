import os
from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    embedding_model: str = "nvidia/nemotron-3.5-embed-1b:free"
    chroma_persist_dir: str = "/app/data/chroma"
    chroma_collection: str = "policies"
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k: int = 4

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        defaults = cls()

        def get(key, default):
            return env.get(key) or default

        return cls(
            openai_api_key=get("OPENAI_API_KEY", defaults.openai_api_key),
            openai_model=get("OPENAI_MODEL", defaults.openai_model),
            openrouter_api_key=get("OPENROUTER_API_KEY", defaults.openrouter_api_key),
            openrouter_base_url=get("OPENROUTER_BASE_URL", defaults.openrouter_base_url),
            embedding_model=get("EMBEDDING_MODEL", defaults.embedding_model),
            chroma_persist_dir=get("CHROMA_PERSIST_DIR", defaults.chroma_persist_dir),
            chroma_collection=get("CHROMA_COLLECTION", defaults.chroma_collection),
            chunk_size=int(get("CHUNK_SIZE", defaults.chunk_size)),
            chunk_overlap=int(get("CHUNK_OVERLAP", defaults.chunk_overlap)),
            top_k=int(get("RAG_TOP_K", defaults.top_k)),
        )
