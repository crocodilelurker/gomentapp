import pytest
from fastapi.testclient import TestClient

from app.api import create_app
from app.pipeline.embedding import EmbedderNotConfiguredError, EmbeddingError
from app.pipeline.generation import GenerationError, GeneratorNotConfiguredError

TEXT = "Apple orchards produce fruit. Apples are harvested from orchard trees every autumn."


@pytest.fixture
def client(service):
    return TestClient(create_app(service))


def upload(client, content, filename="policy.txt", **form):
    return client.post("/ingest", files={"file": (filename, content, "text/plain")}, data=form)


def test_health(client):
    res = client.get("/health")

    assert res.status_code == 200
    assert res.json() == {"service": "rag-service", "status": "ok"}


def test_ingest_accepts_a_txt_file_with_metadata(client):
    res = upload(client, TEXT.encode(), scheme_name="s", department="d", release_date="2026-01-01")

    assert res.status_code == 201
    body = res.json()
    assert body["chunks"] >= 1
    assert isinstance(body["document_id"], str)


def test_ingest_rejects_files_that_are_not_txt(client):
    assert upload(client, b"%PDF", filename="policy.pdf").status_code == 415


def test_ingest_rejects_non_utf8_content(client):
    res = upload(client, "café".encode("latin-1"))

    assert res.status_code == 400


def test_ingest_rejects_empty_content(client):
    assert upload(client, b"  \n ").status_code == 400


def test_retrieve_returns_top_k_chunks(client):
    upload(client, TEXT.encode(), scheme_name="s")

    res = client.post("/retrieve", json={"query": "apple harvest", "top_k": 1})

    assert res.status_code == 200
    [result] = res.json()["results"]
    assert set(result) == {"id", "text", "score", "metadata"}
    assert result["metadata"]["scheme_name"] == "s"


@pytest.mark.parametrize("payload", [{"query": ""}, {"query": "q", "top_k": 0}, {"query": "q", "top_k": 21}])
def test_retrieve_validates_the_request(client, payload):
    assert client.post("/retrieve", json=payload).status_code == 422


def test_ask_returns_the_answer_with_its_sources(client):
    upload(client, TEXT.encode())

    res = client.post("/ask", json={"query": "When are apples harvested?"})

    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "generated answer #1"
    assert len(body["sources"]) >= 1


class FailingGenerator:
    def __init__(self, error):
        self.error = error

    def generate(self, instructions, prompt):
        raise self.error


@pytest.mark.parametrize(
    ("error", "status"),
    [(GeneratorNotConfiguredError("no key"), 503), (GenerationError("upstream"), 502)],
)
def test_ask_maps_generator_failures_to_http_errors(service, error, status):
    service.generator = FailingGenerator(error)
    client = TestClient(create_app(service))
    upload(client, TEXT.encode())

    assert client.post("/ask", json={"query": "q"}).status_code == status


class FailingEmbedder:
    def __init__(self, error):
        self.error = error

    def embed_documents(self, texts):
        raise self.error

    def embed_query(self, text):
        raise self.error


@pytest.mark.parametrize(
    ("error", "status"),
    [(EmbedderNotConfiguredError("no key"), 503), (EmbeddingError("upstream"), 502)],
)
@pytest.mark.parametrize(
    "call",
    [
        lambda client: upload(client, TEXT.encode()),
        lambda client: client.post("/retrieve", json={"query": "q"}),
        lambda client: client.post("/ask", json={"query": "q"}),
    ],
    ids=["ingest", "retrieve", "ask"],
)
def test_embedding_failures_map_to_http_errors(service, error, status, call):
    service.embedder = FailingEmbedder(error)

    assert call(TestClient(create_app(service))).status_code == status
