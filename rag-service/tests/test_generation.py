"""Step 5 — Context injection and generative synthesis."""

from types import SimpleNamespace

import openai
import pytest

from app.pipeline.generation import (
    GenerationError,
    GeneratorNotConfiguredError,
    OpenAIGenerator,
    build_prompt,
)
from app.pipeline.vector_store import RetrievedChunk


def retrieved(text, **metadata):
    return RetrievedChunk(id="x", text=text, metadata=metadata, score=0.9)


class TestBuildPrompt:
    """Substep 5.1 — assembling the grounded prompt."""

    def test_instructions_restrict_the_model_to_the_excerpts(self):
        instructions, _ = build_prompt("q", [retrieved("t")])

        assert "ONLY the policy excerpts" in instructions
        assert "information is unavailable" in instructions

    def test_prompt_contains_numbered_excerpts_and_the_question(self):
        _, prompt = build_prompt("Who can apply?", [retrieved("first text"), retrieved("second text")])

        assert prompt.index("[Chunk 1") < prompt.index("first text") < prompt.index("[Chunk 2")
        assert prompt.index("[Chunk 2") < prompt.index("second text")
        assert prompt.rstrip().endswith("User Question: Who can apply?")

    def test_prompt_labels_each_excerpt_with_its_provenance(self):
        chunk = retrieved("t", scheme_name="S", department="D", release_date="2026-01-01", source="f.txt")

        _, prompt = build_prompt("q", [chunk])

        assert "[Chunk 1 | Scheme: S | Department: D | Released: 2026-01-01 | Source: f.txt]" in prompt

    def test_prompt_omits_provenance_fields_that_are_missing(self):
        _, prompt = build_prompt("q", [retrieved("t", source="f.txt")])

        assert "[Chunk 1 | Source: f.txt]" in prompt


class FakeResponses:
    def __init__(self, error=None, output_text="model answer"):
        self.error = error
        self.output_text = output_text
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return SimpleNamespace(output_text=self.output_text)


class TestOpenAIGenerator:
    """Substep 5.2 — inference."""

    def test_sends_the_grounded_prompt_to_the_configured_model(self):
        responses = FakeResponses()
        generator = OpenAIGenerator(api_key="key", model="gpt-4o-mini", client=SimpleNamespace(responses=responses))

        answer = generator.generate("instructions", "prompt")

        assert answer == "model answer"
        assert responses.kwargs == {
            "model": "gpt-4o-mini",
            "instructions": "instructions",
            "input": "prompt",
            "temperature": 0,
        }

    def test_raises_when_no_api_key_is_configured(self):
        with pytest.raises(GeneratorNotConfiguredError):
            OpenAIGenerator(api_key="", model="gpt-4o-mini").generate("i", "p")

    def test_wraps_openai_errors(self):
        responses = FakeResponses(error=openai.OpenAIError("boom"))
        generator = OpenAIGenerator(api_key="key", model="gpt-4o-mini", client=SimpleNamespace(responses=responses))

        with pytest.raises(GenerationError):
            generator.generate("i", "p")


class TestOpenAIGeneratorStructuredOutput:
    def make(self, responses):
        return OpenAIGenerator(api_key="key", model="gpt-4o-mini", client=SimpleNamespace(responses=responses))

    def test_requests_strict_json_schema_output_and_parses_it(self):
        responses = FakeResponses(output_text='{"eligibility": ["a"]}')

        result = self.make(responses).generate_json("instructions", "prompt", "policy_summary", {"type": "object"})

        assert result == {"eligibility": ["a"]}
        assert responses.kwargs == {
            "model": "gpt-4o-mini",
            "instructions": "instructions",
            "input": "prompt",
            "temperature": 0,
            "text": {"format": {"type": "json_schema", "name": "policy_summary", "schema": {"type": "object"}, "strict": True}},
        }

    def test_raises_on_output_that_is_not_json(self):
        with pytest.raises(GenerationError):
            self.make(FakeResponses(output_text="not json")).generate_json("i", "p", "n", {})

    def test_wraps_openai_errors(self):
        with pytest.raises(GenerationError):
            self.make(FakeResponses(error=openai.OpenAIError("boom"))).generate_json("i", "p", "n", {})

    def test_raises_when_no_api_key_is_configured(self):
        with pytest.raises(GeneratorNotConfiguredError):
            OpenAIGenerator(api_key="", model="gpt-4o-mini").generate_json("i", "p", "n", {})
