"""Step 2 — Semantic chunking."""

import pytest

from app.pipeline.chunking import chunk_document, split_text


def sentences(count):
    return " ".join(f"Sentence number {i} describes rule {i}." for i in range(count))


class TestBoundaryAwareSplitting:
    """Substep 2.1."""

    def test_short_text_is_a_single_chunk(self):
        assert split_text("One rule.", chunk_size=500, chunk_overlap=50) == ["One rule."]

    def test_empty_text_has_no_chunks(self):
        assert split_text("   ", chunk_size=500, chunk_overlap=50) == []

    def test_no_chunk_exceeds_chunk_size(self):
        chunks = split_text(sentences(200), chunk_size=120, chunk_overlap=20)

        assert len(chunks) > 1
        assert all(len(chunk) <= 120 for chunk in chunks)

    def test_prefers_paragraph_boundaries(self):
        first = "A" * 150 + "."
        second = "B" * 150 + "."

        chunks = split_text(f"{first}\n\n{second}", chunk_size=300, chunk_overlap=0)

        assert chunks == [first, second]

    def test_falls_back_to_sentence_boundaries(self):
        chunks = split_text(sentences(20), chunk_size=100, chunk_overlap=0)

        assert all(chunk.endswith(".") for chunk in chunks)

    def test_keeps_a_bullet_list_together_when_it_fits(self):
        bullet_list = "Eligibility:\n- Rule one.\n- Rule two.\n- Rule three."
        text = "C" * 480 + ".\n\n" + bullet_list

        chunks = split_text(text, chunk_size=500, chunk_overlap=0)

        assert bullet_list in chunks

    def test_never_cuts_words_when_spaces_are_available(self):
        text = sentences(100)
        original_words = set(text.split())

        chunks = split_text(text, chunk_size=90, chunk_overlap=15)

        for chunk in chunks:
            assert set(chunk.split()) <= original_words

    def test_hard_splits_a_single_word_longer_than_chunk_size(self):
        chunks = split_text("X" * 250, chunk_size=100, chunk_overlap=0)

        assert "".join(chunks) == "X" * 250
        assert all(len(chunk) <= 100 for chunk in chunks)


class TestContextualOverlap:
    """Substep 2.2."""

    def test_consecutive_chunks_share_overlapping_text(self):
        overlap = 30
        chunks = split_text(sentences(60), chunk_size=150, chunk_overlap=overlap)

        for prev, cur in zip(chunks, chunks[1:]):
            assert any(cur.startswith(prev[-k:] + " ") for k in range(1, overlap + 1))

    def test_overlap_must_be_smaller_than_chunk_size(self):
        with pytest.raises(ValueError):
            split_text("text", chunk_size=50, chunk_overlap=50)

    def test_overlap_cannot_be_negative(self):
        with pytest.raises(ValueError):
            split_text("text", chunk_size=50, chunk_overlap=-1)


class TestMetadataTagging:
    """Substep 2.3."""

    def test_tags_every_chunk_with_provenance_and_position(self):
        chunks = chunk_document(
            sentences(30),
            document_id="doc1",
            metadata={"source": "policy.txt", "scheme_name": "scheme", "department": "dept", "release_date": "2026-01-01"},
            chunk_size=150,
            chunk_overlap=20,
        )

        assert len(chunks) > 1
        for index, chunk in enumerate(chunks):
            assert chunk.id == f"doc1:{index}"
            assert chunk.metadata == {
                "source": "policy.txt",
                "scheme_name": "scheme",
                "department": "dept",
                "release_date": "2026-01-01",
                "document_id": "doc1",
                "chunk_index": index,
                "total_chunks": len(chunks),
            }

    def test_drops_missing_metadata_values(self):
        [chunk] = chunk_document(
            "Short text.",
            document_id="doc1",
            metadata={"source": "policy.txt", "department": None, "release_date": ""},
            chunk_size=150,
            chunk_overlap=20,
        )

        assert "department" not in chunk.metadata
        assert "release_date" not in chunk.metadata
