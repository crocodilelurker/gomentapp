"""Policy summary — three point-wise sections: eligibility, benefits and requirements.

Short documents are summarised in one structured LLM call. Documents longer than `max_chars`
are split into parts, each part is summarised, and the partial lists are merged in a final call.
"""

import json
import re
from dataclasses import asdict, dataclass
from typing import Protocol

from app.pipeline.chunking import split_text
from app.pipeline.generation import GenerationError

SECTIONS = ("eligibility", "benefits", "requirements")
SCHEMA_NAME = "policy_summary"

# Strict JSON schema: the model must return exactly these three lists of strings.
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {section: {"type": "array", "items": {"type": "string"}} for section in SECTIONS},
    "required": list(SECTIONS),
    "additionalProperties": False,
}

INSTRUCTIONS = (
    "You summarise government scheme and policy documents for citizens.\n"
    "Read the document and fill exactly three lists:\n"
    "- eligibility: who is eligible — conditions such as age, income, occupation, residence, landholding, "
    "social category or any other criteria, including who is excluded.\n"
    "- benefits: what an eligible person receives — amounts, subsidies, services, duration and frequency.\n"
    "- requirements: the documents or proofs an applicant must provide.\n"
    "Rules:\n"
    "- Use ONLY what the document states. Never add outside knowledge, assumptions or advice.\n"
    "- One fact per point, written as a short plain-language sentence.\n"
    "- Keep numbers, amounts, dates and limits exactly as written.\n"
    "- Do not add bullets or numbering to the points.\n"
    "- If the document says nothing for a list, return an empty list for it."
)

MERGE_INSTRUCTIONS = (
    "You are given eligibility, benefits and requirements points extracted from consecutive parts of ONE "
    "government scheme document. Merge them into a single set of the same three lists.\n"
    "Rules:\n"
    "- Remove duplicate points and points that repeat the same fact; keep every distinct fact.\n"
    "- Keep numbers, amounts, dates and limits exactly as written.\n"
    "- Use ONLY the given points. Never add anything that is not in them.\n"
    "- Do not add bullets or numbering to the points.\n"
    "- If no part has points for a list, return an empty list for it."
)

# Leading bullet or list marker: "-", "•", "*", "1.", "2)", "(a)", "b)", "(iv)". Uppercase "(SC)" is content, not a marker.
_MARKER = re.compile(r"^(?:[-*•▪◦‣]+|\(?\d{1,3}[.)]|\(?(?:[a-z]|[ivxlc]{1,6})\))(?=\s|$)\s*")


@dataclass(frozen=True)
class PolicySummary:
    eligibility: list[str]
    benefits: list[str]
    requirements: list[str]


class StructuredGenerator(Protocol):
    def generate_json(self, instructions: str, prompt: str, schema_name: str, schema: dict) -> dict: ...


def clean_points(points: list[str]) -> list[str]:
    """One clean sentence per point: no markers, single spaces, no empties, no case-insensitive duplicates."""
    cleaned, seen = [], set()
    for point in points:
        text = " ".join(point.split())
        while (stripped := _MARKER.sub("", text, count=1)) != text:
            text = stripped
        key = text.casefold()
        if text and key not in seen:
            seen.add(key)
            cleaned.append(text)
    return cleaned


def _parse(output) -> PolicySummary:
    if not isinstance(output, dict):
        raise GenerationError("The model returned a summary in an unexpected shape")
    for section in SECTIONS:
        points = output.get(section)
        if not isinstance(points, list) or not all(isinstance(point, str) for point in points):
            raise GenerationError(f"The model returned an invalid '{section}' section")
    return PolicySummary(**{section: clean_points(output[section]) for section in SECTIONS})


class Summarizer:
    def __init__(self, generator: StructuredGenerator, max_chars: int = 60000, part_overlap: int = 500):
        if not 0 <= part_overlap < max_chars:
            raise ValueError("part_overlap must be >= 0 and smaller than max_chars")
        self.generator = generator
        self.max_chars = max_chars
        self.part_overlap = part_overlap

    def summarize(self, text: str, scheme_name: str | None = None) -> PolicySummary:
        header = f"Scheme: {scheme_name}\n\n" if scheme_name else ""
        if len(text) <= self.max_chars:
            return self._extract(f"{header}Document:\n---\n{text}\n---")

        parts = split_text(text, self.max_chars, self.part_overlap)
        partials = [
            self._extract(f"{header}Document (part {i} of {len(parts)}):\n---\n{part}\n---")
            for i, part in enumerate(parts, start=1)
        ]
        points = json.dumps({"parts": [asdict(partial) for partial in partials]}, ensure_ascii=False, indent=2)
        prompt = f"{header}Points extracted from {len(parts)} consecutive parts of one document:\n{points}"
        return _parse(self.generator.generate_json(MERGE_INSTRUCTIONS, prompt, SCHEMA_NAME, SUMMARY_SCHEMA))

    def _extract(self, prompt: str) -> PolicySummary:
        return _parse(self.generator.generate_json(INSTRUCTIONS, prompt, SCHEMA_NAME, SUMMARY_SCHEMA))
