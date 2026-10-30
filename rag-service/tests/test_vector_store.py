"""Step 3.3 (indexing) and Steps 4.2–4.3 (proximity search, top-K) against a real in-memory ChromaDB."""

from app.pipeline.chunking import Chunk


def make_chunk(chunk_id, document_id, text):
    return Chunk(id=chunk_id, text=text, metadata={"document_id": document_id})


def test_returns_nearest_chunks_first_with_cosine_similarity_scores(store):
    store.replace_document(
        "d1",
        [make_chunk("d1:0", "d1", "east"), make_chunk("d1:1", "d1", "north")],
        [[1.0, 0.0], [0.0, 1.0]],
    )

    results = store.query([1.0, 0.0], top_k=2)

    assert [r.id for r in results] == ["d1:0", "d1:1"]
    assert results[0].text == "east"
    assert results[0].metadata == {"document_id": "d1"}
    assert abs(results[0].score - 1.0) < 1e-3
    assert abs(results[1].score - 0.0) < 1e-3


def test_limits_results_to_top_k(store):
    store.replace_document(
        "d1",
        [make_chunk(f"d1:{i}", "d1", f"t{i}") for i in range(5)],
        [[1.0, float(i)] for i in range(5)],
    )

    assert len(store.query([1.0, 0.0], top_k=3)) == 3


def test_query_on_an_empty_store_returns_nothing(store):
    assert store.query([1.0, 0.0], top_k=3) == []


def test_replacing_a_document_removes_its_old_chunks_only(store):
    store.replace_document("d1", [make_chunk(f"d1:{i}", "d1", "a") for i in range(3)], [[1.0, 0.0]] * 3)
    store.replace_document("d2", [make_chunk("d2:0", "d2", "b")], [[0.0, 1.0]])

    store.replace_document("d1", [make_chunk("d1:0", "d1", "a2")], [[1.0, 0.0]])

    assert store.count() == 2
    assert {r.text for r in store.query([1.0, 0.0], top_k=10)} == {"a2", "b"}
