"""Steps 3.1–3.2 and 4.1 — embeddings via OpenRouter (Nemotron)."""

from types import SimpleNamespace

import openai
import pytest

from app.pipeline.embedding import EmbedderNotConfiguredError, EmbeddingError, OpenRouterEmbedder


class FakeEmbeddings:
    """Stands in for client.embeddings; vector = [len(text), position in batch]."""

    def __init__(self, error=None, drop_last=False):
        self.calls = []
        self.error = error
        self.drop_last = drop_last

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        data = [SimpleNamespace(index=i, embedding=[float(len(text)), float(i)]) for i, text in enumerate(kwargs["input"])]
        if self.drop_last:
            data = data[:-1]
        # Returned out of order to prove results are re-ordered by index.
        return SimpleNamespace(data=list(reversed(data)))


def make_embedder(embeddings, **kwargs):
    return OpenRouterEmbedder(api_key="key", model="nvidia/model", client=SimpleNamespace(embeddings=embeddings), **kwargs)


def test_embeds_documents_as_search_documents():
    fake = FakeEmbeddings()

    vectors = make_embedder(fake).embed_documents(["a", "bbb"])

    assert vectors == [[1.0, 0.0], [3.0, 1.0]]
    assert fake.calls == [
        {
            "model": "nvidia/model",
            "input": ["a", "bbb"],
            "encoding_format": "float",
            "extra_body": {"input_type": "search_document"},
        }
    ]


def test_embeds_a_query_as_a_search_query():
    fake = FakeEmbeddings()

    vector = make_embedder(fake).embed_query("hello")

    assert vector == [5.0, 0.0]
    assert fake.calls[0]["input"] == ["hello"]
    assert fake.calls[0]["extra_body"] == {"input_type": "search_query"}


def test_sends_documents_in_batches():
    fake = FakeEmbeddings()

    vectors = make_embedder(fake, batch_size=2).embed_documents(["a", "b", "c"])

    assert [call["input"] for call in fake.calls] == [["a", "b"], ["c"]]
    assert vectors == [[1.0, 0.0], [1.0, 1.0], [1.0, 0.0]]


def test_embedding_no_documents_makes_no_request():
    fake = FakeEmbeddings()

    assert make_embedder(fake).embed_documents([]) == []
    assert fake.calls == []


def test_raises_when_no_api_key_is_configured():
    with pytest.raises(EmbedderNotConfiguredError):
        OpenRouterEmbedder(api_key="", model="nvidia/model").embed_query("q")


def test_wraps_provider_errors():
    with pytest.raises(EmbeddingError):
        make_embedder(FakeEmbeddings(error=openai.OpenAIError("boom"))).embed_query("q")


def test_raises_when_the_provider_returns_the_wrong_number_of_vectors():
    with pytest.raises(EmbeddingError):
        make_embedder(FakeEmbeddings(drop_last=True)).embed_documents(["a", "b"])


def test_points_the_client_at_the_openrouter_base_url():
    embedder = OpenRouterEmbedder(api_key="key", model="nvidia/model", base_url="https://openrouter.ai/api/v1")

    assert str(embedder._get_client().base_url).startswith("https://openrouter.ai/api/v1")
