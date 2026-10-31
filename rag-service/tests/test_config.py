from app.config import Settings


def test_defaults_when_env_is_empty():
    settings = Settings.from_env({})

    assert settings.openai_api_key == ""
    assert settings.openai_model == "gpt-4o-mini"
    assert settings.openrouter_api_key == ""
    assert settings.openrouter_base_url == "https://openrouter.ai/api/v1"
    assert settings.embedding_model == "nvidia/nemotron-3.5-embed-1b:free"
    assert settings.chroma_persist_dir == "/app/data/chroma"
    assert settings.chroma_collection == "policies"
    assert settings.chunk_size == 500
    assert settings.chunk_overlap == 50
    assert settings.top_k == 4
    assert settings.summary_max_chars == 60000


def test_reads_values_from_env():
    settings = Settings.from_env(
        {
            "OPENAI_API_KEY": "key",
            "OPENAI_MODEL": "m",
            "OPENROUTER_API_KEY": "or-key",
            "OPENROUTER_BASE_URL": "https://example.test/v1",
            "EMBEDDING_MODEL": "e",
            "CHROMA_PERSIST_DIR": "/tmp/c",
            "CHROMA_COLLECTION": "col",
            "CHUNK_SIZE": "800",
            "CHUNK_OVERLAP": "120",
            "RAG_TOP_K": "5",
            "SUMMARY_MAX_CHARS": "30000",
        }
    )

    assert settings == Settings(
        openai_api_key="key",
        openai_model="m",
        openrouter_api_key="or-key",
        openrouter_base_url="https://example.test/v1",
        embedding_model="e",
        chroma_persist_dir="/tmp/c",
        chroma_collection="col",
        chunk_size=800,
        chunk_overlap=120,
        top_k=5,
        summary_max_chars=30000,
    )
