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


def test_ingest_links_chunks_to_a_caller_supplied_document_id(client):
    document_id = "b" * 64

    res = upload(client, TEXT.encode(), document_id=document_id, category="c")

    assert res.status_code == 201
    assert res.json()["document_id"] == document_id
    [result] = client.post("/retrieve", json={"query": "apple harvest", "top_k": 1}).json()["results"]
    assert result["metadata"]["document_id"] == document_id
    assert result["metadata"]["category"] == "c"


@pytest.mark.parametrize("document_id", ["../etc/passwd", "has space", "x" * 129])
def test_ingest_rejects_unsafe_document_ids(client, document_id):
    assert upload(client, TEXT.encode(), document_id=document_id).status_code == 422


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

    def generate_json(self, instructions, prompt, schema_name, schema):
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


def test_summarize_returns_the_three_point_wise_sections(client, generator):
    generator.json_responses = [{"eligibility": ["1. e1", "e2"], "benefits": ["- b1"], "requirements": []}]

    res = client.post("/summarize", json={"text": TEXT, "scheme_name": "s"})

    assert res.status_code == 200
    assert res.json() == {"eligibility": ["e1", "e2"], "benefits": ["b1"], "requirements": []}


@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "t", "scheme_name": "x" * 201}])
def test_summarize_validates_the_request(client, payload):
    assert client.post("/summarize", json=payload).status_code == 422


def test_summarize_rejects_text_with_no_content(client):
    assert client.post("/summarize", json={"text": " ~~ "}).status_code == 400


@pytest.mark.parametrize(
    ("error", "status"),
    [(GeneratorNotConfiguredError("no key"), 503), (GenerationError("upstream"), 502)],
)
def test_summarize_maps_generator_failures_to_http_errors(service, error, status):
    service.generator = FailingGenerator(error)

    assert TestClient(create_app(service)).post("/summarize", json={"text": TEXT}).status_code == status
