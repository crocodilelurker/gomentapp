"""Step 1 — Text ingestion and sanitization.

Turns raw uploaded bytes into clean, uniform UTF-8 text for the chunker.
"""

import re
import unicodedata
from itertools import pairwise

# Control characters except \t and \n, plus zero-width space and stray BOMs.
# ZWJ/ZWNJ (‌, ‍) are deliberately kept: Indic scripts depend on them.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f​﻿]")
_SPACES = re.compile(r"[ \t   -   　]+")
_WORD_CHAR = re.compile(r"\w")
_PAGE_NUMBER = re.compile(r"^(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?$|^-\s*\d+\s*-$", re.IGNORECASE)
_HYPHENATED_WORD = re.compile(r"([^\W\d_])-\n([^\W\d_])")
_LIST_ITEM = re.compile(r"^(?:[-*•▪◦‣]|\d+[.)]|\([a-zA-Z0-9]{1,4}\))\s")


class EncodingError(ValueError):
    """The uploaded file is not valid UTF-8 text."""


def decode_text(raw: bytes) -> str:
    """Substep 1.1 — decode bytes as UTF-8 and standardize line endings and Unicode form."""
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise EncodingError("File must be UTF-8 encoded text") from exc
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return unicodedata.normalize("NFC", text)


def sanitize_text(text: str) -> str:
    """Substep 1.2 — strip whitespace noise, OCR specks, page numbers and orphan line breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\f", "\n\n")
    text = _CONTROL_CHARS.sub("", text)
    text = _SPACES.sub(" ", text)

    lines = [line.strip() for line in text.split("\n")]
    lines = [line for line in lines if not _is_noise(line)]
    text = _HYPHENATED_WORD.sub(r"\1\2", "\n".join(lines))

    paragraphs, current = [], []
    for line in text.split("\n"):
        if line:
            current.append(line)
        elif current:
            paragraphs.append(current)
            current = []
    if current:
        paragraphs.append(current)

    return "\n\n".join(_join_paragraph(lines) for lines in paragraphs)


def _is_noise(line: str) -> bool:
    if not line:
        return False  # blank lines mark paragraph breaks
    return not _WORD_CHAR.search(line) or bool(_PAGE_NUMBER.match(line))


def _join_paragraph(lines: list[str]) -> str:
    """Re-flow hard-wrapped lines, keeping breaks before list items and after headings ending in ':'."""
    text = lines[0]
    for prev, line in pairwise(lines):
        text += ("\n" if prev.endswith(":") or _LIST_ITEM.match(line) else " ") + line
    return text
