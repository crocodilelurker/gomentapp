"""End-to-end pipeline orchestration: Steps 1–5 wired together."""

import hashlib

import pytest

from app.pipeline.ingestion import EncodingError
from app.pipeline.summarization import PolicySummary
from app.service import NO_CONTEXT_ANSWER, EmptyDocumentError

APPLES = "Apple orchards produce fruit. Apples are harvested from orchard trees every autumn."
RIVERS = "Rivers carry water to the sea. Boats travel along the river water."


def test_ingest_stores_every_chunk(service, store):
    result = service.ingest(APPLES.encode(), source="apples.txt", metadata={})

    assert result.chunks >= 1
    assert store.count() == result.chunks


def test_ingesting_the_same_document_twice_does_not_duplicate_chunks(service, store):
    first = service.ingest(APPLES.encode(), source="apples.txt", metadata={})
    second = service.ingest(APPLES.encode(), source="apples.txt", metadata={})

    assert first.document_id == second.document_id
    assert store.count() == first.chunks


def test_default_document_id_is_the_sha256_of_the_raw_bytes(service):
    result = service.ingest(APPLES.encode(), source="apples.txt", metadata={})

    assert result.document_id == hashlib.sha256(APPLES.encode()).hexdigest()


def test_ingest_uses_a_caller_supplied_document_id(service):
    document_id = "a" * 64

    result = service.ingest(APPLES.encode(), source="apples.txt", metadata={}, document_id=document_id)

    [top] = service.retrieve("apple orchard", top_k=1)
    assert result.document_id == document_id
    assert top.id == f"{document_id}:0"
    assert top.metadata["document_id"] == document_id


def test_ingest_tags_chunks_with_the_given_metadata(service):
    service.ingest(APPLES.encode(), source="apples.txt", metadata={"scheme_name": "orchard-scheme"})

    [top] = service.retrieve("apple orchard", top_k=1)

    assert top.metadata["scheme_name"] == "orchard-scheme"
    assert top.metadata["source"] == "apples.txt"


def test_ingest_rejects_documents_that_are_empty_after_sanitization(service):
    with pytest.raises(EmptyDocumentError):
        service.ingest(b" \n ~~ \n", source="empty.txt", metadata={})


def test_ingest_rejects_non_utf8_documents(service):
    with pytest.raises(EncodingError):
        service.ingest("café".encode("latin-1"), source="bad.txt", metadata={})


def test_retrieve_ranks_the_most_relevant_chunk_first(service):
    service.ingest(APPLES.encode(), source="apples.txt", metadata={})
    service.ingest(RIVERS.encode(), source="rivers.txt", metadata={})

    results = service.retrieve("river boats on the water")

    assert results[0].metadata["source"] == "rivers.txt"


def test_retrieve_uses_the_default_top_k(service):
    for i in range(5):
        service.ingest(f"Document {i} text about topic {i}.".encode(), source=f"{i}.txt", metadata={})

    assert len(service.retrieve("topic")) == 3


def test_ask_sends_the_top_k_chunks_to_the_generator(service, generator):
    service.ingest(APPLES.encode(), source="apples.txt", metadata={})
    service.ingest(RIVERS.encode(), source="rivers.txt", metadata={})

    answer = service.ask("When are apples harvested?", top_k=1)

    assert answer.answer == "generated answer #1"
    assert [s.metadata["source"] for s in answer.sources] == ["apples.txt"]
    [call] = generator.calls
    assert "harvested from orchard trees" in call["prompt"]
    assert "Rivers carry water" not in call["prompt"]
    assert "User Question: When are apples harvested?" in call["prompt"]


def test_ask_without_any_ingested_documents_skips_the_generator(service, generator):
    answer = service.ask("Anything?")

    assert answer.answer == NO_CONTEXT_ANSWER
    assert answer.sources == []
    assert generator.calls == []


def test_summarize_sanitizes_the_text_before_summarising(service, generator):
    generator.json_responses = [{"eligibility": ["e"], "benefits": ["b"], "requirements": ["r"]}]

    summary = service.summarize("Document body text.\n\n~ . |\n\nMore text.", scheme_name="s")

    assert summary == PolicySummary(eligibility=["e"], benefits=["b"], requirements=["r"])
    [call] = generator.json_calls
    assert "Document body text.\n\nMore text." in call["prompt"]
    assert "~ . |" not in call["prompt"]


def test_summarize_rejects_text_that_is_empty_after_sanitization(service, generator):
    with pytest.raises(EmptyDocumentError):
        service.summarize(" \n ~~ \n")
    assert generator.json_calls == []
