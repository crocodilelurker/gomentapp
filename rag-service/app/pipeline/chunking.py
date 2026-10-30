"""Step 2 — Semantic chunking.

Splits clean text into self-contained, overlapping segments tagged with provenance.
"""

import re
from dataclasses import dataclass, field

# Tried in order: paragraphs, lines (bullets), sentences (incl. Devanagari danda), clauses, words, characters.
SEPARATORS = ("\n\n", "\n", ". ", "। ", "? ", "! ", "; ", ", ", " ", "")

_WHITESPACE = re.compile(r"\s")


@dataclass(frozen=True)
class Chunk:
    id: str
    text: str
    metadata: dict = field(default_factory=dict)


def split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Split text along logical boundaries (2.1), then prefix each chunk with the tail of the previous one (2.2).

    Every chunk, overlap included, is at most `chunk_size` characters.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if not 0 <= chunk_overlap < chunk_size:
        raise ValueError("chunk_overlap must be >= 0 and smaller than chunk_size")

    text = text.strip()
    if not text:
        return []

    # Reserve room for the overlap prefix so the final chunk still fits in chunk_size.
    pieces = [p.strip() for p in _split(text, chunk_size - chunk_overlap, SEPARATORS)]
    pieces = [p for p in pieces if p]

    chunks = pieces[:1]
    for prev, piece in zip(pieces, pieces[1:]):
        tail = _overlap_tail(prev, chunk_overlap - 1)  # -1 for the joining space
        chunks.append(f"{tail} {piece}" if tail else piece)
    return chunks


def chunk_document(text: str, document_id: str, metadata: dict, chunk_size: int, chunk_overlap: int) -> list[Chunk]:
    """Split a document and tag every chunk with its provenance and position (2.3)."""
    texts = split_text(text, chunk_size, chunk_overlap)
    provenance = {key: value for key, value in metadata.items() if value not in (None, "")}
    return [
        Chunk(
            id=f"{document_id}:{index}",
            text=chunk_text,
            metadata={**provenance, "document_id": document_id, "chunk_index": index, "total_chunks": len(texts)},
        )
        for index, chunk_text in enumerate(texts)
    ]


def _split(text: str, size: int, separators: tuple[str, ...]) -> list[str]:
    if len(text.strip()) <= size:
        return [text]

    index = next(i for i, sep in enumerate(separators) if sep == "" or sep in text)
    separator, finer = separators[index], separators[index + 1 :]

    if separator == "":
        text = text.strip()
        return [text[i : i + size] for i in range(0, len(text), size)]

    chunks, current = [], ""
    for piece in _split_keeping_separator(text, separator):
        if len(piece.rstrip()) > size:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(_split(piece, size, finer))
        elif len((current + piece).rstrip()) <= size:
            current += piece
        else:
            chunks.append(current)
            current = piece
    if current:
        chunks.append(current)
    return chunks


def _split_keeping_separator(text: str, separator: str) -> list[str]:
    parts = text.split(separator)
    pieces = [part + separator for part in parts[:-1]] + [parts[-1]]
    return [piece for piece in pieces if piece]


def _overlap_tail(prev: str, budget: int) -> str:
    """Up to `budget` trailing characters of `prev`, starting on a word boundary."""
    if budget <= 0:
        return ""
    if len(prev) <= budget:
        return prev
    tail = prev[-budget:]
    if prev[-budget - 1].isspace():
        return tail.lstrip()
    match = _WHITESPACE.search(tail)
    return tail[match.end() :].lstrip() if match else ""
