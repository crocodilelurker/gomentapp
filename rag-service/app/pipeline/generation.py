"""Step 5 — Context injection (5.1) and generative synthesis (5.2) with an OpenAI model."""

import json
from typing import Protocol

from openai import OpenAI, OpenAIError

from app.pipeline.vector_store import RetrievedChunk

INSTRUCTIONS = (
    "You are an expert civic scheme advisor.\n"
    "Answer the applicant's question using ONLY the policy excerpts below.\n"
    "If the answer is not delineated in the text, state that the information is unavailable."
)

_PROVENANCE_LABELS = (
    ("scheme_name", "Scheme"),
    ("department", "Department"),
    ("release_date", "Released"),
    ("source", "Source"),
)


class GeneratorNotConfiguredError(RuntimeError):
    """The LLM cannot be called because it has no credentials."""


class GenerationError(RuntimeError):
    """The LLM provider returned an error."""


class Generator(Protocol):
    def generate(self, instructions: str, prompt: str) -> str: ...


def build_prompt(question: str, chunks: list[RetrievedChunk]) -> tuple[str, str]:
    """Substep 5.1 — returns (instructions, prompt) with numbered, source-labelled excerpts."""
    excerpts = "\n\n".join(f"{_label(i, chunk)}\n{chunk.text}" for i, chunk in enumerate(chunks, start=1))
    prompt = f"Policy Excerpts:\n---\n{excerpts}\n---\n\nUser Question: {question}"
    return INSTRUCTIONS, prompt


def _label(number: int, chunk: RetrievedChunk) -> str:
    parts = [f"Chunk {number}"]
    parts += [f"{label}: {chunk.metadata[key]}" for key, label in _PROVENANCE_LABELS if chunk.metadata.get(key)]
    return f"[{' | '.join(parts)}]"


class OpenAIGenerator:
    """Substep 5.2 — sends the grounded prompt to an OpenAI model via the Responses API."""

    def __init__(self, api_key: str, model: str, client=None):
        self.api_key = api_key
        self.model = model
        self._client = client

    def _get_client(self):
        if self._client is None:
            if not self.api_key:
                raise GeneratorNotConfiguredError("OPENAI_API_KEY is not set")
            self._client = OpenAI(api_key=self.api_key)
        return self._client

    def generate(self, instructions: str, prompt: str) -> str:
        client = self._get_client()
        try:
            response = client.responses.create(
                model=self.model,
                instructions=instructions,
                input=prompt,
                temperature=0,  # stick to the excerpts; no creative drift
            )
        except OpenAIError as exc:
            raise GenerationError(str(exc)) from exc
        return response.output_text

    def generate_json(self, instructions: str, prompt: str, schema_name: str, schema: dict) -> dict:
        """Structured output: the model must answer with JSON matching `schema` (strict mode)."""
        client = self._get_client()
        try:
            response = client.responses.create(
                model=self.model,
                instructions=instructions,
                input=prompt,
                temperature=0,
                text={"format": {"type": "json_schema", "name": schema_name, "schema": schema, "strict": True}},
            )
        except OpenAIError as exc:
            raise GenerationError(str(exc)) from exc
        try:
            return json.loads(response.output_text)
        except (TypeError, json.JSONDecodeError) as exc:
            raise GenerationError("The model did not return valid JSON") from exc
