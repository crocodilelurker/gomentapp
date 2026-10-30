"""Step 3.1–3.2 (and 4.1) — Dense vector embeddings with an NVIDIA Nemotron model served by OpenRouter."""

from typing import Protocol

from openai import OpenAI, OpenAIError

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class EmbedderNotConfiguredError(RuntimeError):
    """The embedding provider cannot be called because it has no credentials."""


class EmbeddingError(RuntimeError):
    """The embedding provider returned an error or an unusable response."""


class Embedder(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class OpenRouterEmbedder:
    """Calls OpenRouter's OpenAI-compatible /embeddings endpoint.

    Documents and queries are sent with input_type "search_document" / "search_query" so
    retrieval-tuned models can encode each side appropriately. Documents go in batches
    to keep request sizes bounded.
    """

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = OPENROUTER_BASE_URL,
        batch_size: int = 64,
        client=None,
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.batch_size = batch_size
        self._client = client

    def _get_client(self):
        if self._client is None:
            if not self.api_key:
                raise EmbedderNotConfiguredError("OPENROUTER_API_KEY is not set")
            self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        return self._client

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts, "search_document")

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], "search_query")[0]

    def _embed(self, texts: list[str], input_type: str) -> list[list[float]]:
        if not texts:
            return []
        client = self._get_client()
        vectors = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            try:
                response = client.embeddings.create(
                    model=self.model,
                    input=batch,
                    encoding_format="float",
                    extra_body={"input_type": input_type},
                )
            except OpenAIError as exc:
                raise EmbeddingError(str(exc)) from exc
            if len(response.data) != len(batch):
                raise EmbeddingError(f"Expected {len(batch)} embeddings, received {len(response.data)}")
            vectors.extend(item.embedding for item in sorted(response.data, key=lambda item: item.index))
        return vectors
