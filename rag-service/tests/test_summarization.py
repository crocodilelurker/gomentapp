"""Policy summary: three point-wise sections (eligibility, benefits, requirements)."""

import pytest

from app.pipeline.chunking import split_text
from app.pipeline.generation import GenerationError
from app.pipeline.summarization import SUMMARY_SCHEMA, PolicySummary, Summarizer, clean_points


def sections(eligibility=(), benefits=(), requirements=()):
    return {"eligibility": list(eligibility), "benefits": list(benefits), "requirements": list(requirements)}


class TestCleanPoints:
    def test_strips_bullets_and_numbering(self):
        raw = ["1. one", "2) two", "- three", "• four", "* five", "(a) six", "(iv) seven", "b) eight"]

        assert clean_points(raw) == ["one", "two", "three", "four", "five", "six", "seven", "eight"]

    def test_keeps_text_that_only_looks_like_a_marker(self):
        raw = ["(SC) and (ST) applicants", "10.5 percent", "Rs. 500 per month", "2026 onwards"]

        assert clean_points(raw) == raw

    def test_collapses_whitespace_and_line_breaks(self):
        assert clean_points(["  two\n   words  "]) == ["two words"]

    def test_drops_empty_points(self):
        assert clean_points(["", "   ", "-", "1."]) == []

    def test_removes_duplicates_case_insensitively_keeping_the_first(self):
        assert clean_points(["Point A", "point a", "Point B"]) == ["Point A", "Point B"]


class TestSchema:
    def test_requires_exactly_the_three_sections_as_lists_of_strings(self):
        assert SUMMARY_SCHEMA["required"] == ["eligibility", "benefits", "requirements"]
        assert SUMMARY_SCHEMA["additionalProperties"] is False
        for key in SUMMARY_SCHEMA["required"]:
            assert SUMMARY_SCHEMA["properties"][key] == {"type": "array", "items": {"type": "string"}}


class TestSummarizer:
    def test_short_document_needs_one_structured_call(self, generator):
        generator.json_responses = [sections(["1. eligibility point"], ["- benefit point"], [])]

        summary = Summarizer(generator, max_chars=1000).summarize("Document body text.")

        assert summary == PolicySummary(eligibility=["eligibility point"], benefits=["benefit point"], requirements=[])
        [call] = generator.json_calls
        assert call["schema_name"] == "policy_summary"
        assert call["schema"] == SUMMARY_SCHEMA
        assert "Document body text." in call["prompt"]
        assert "ONLY" in call["instructions"]

    def test_instructions_cover_all_three_sections(self, generator):
        Summarizer(generator, max_chars=1000).summarize("Document body text.")

        instructions = generator.json_calls[0]["instructions"]
        for phrase in ("eligibility", "benefits", "requirements", "empty list"):
            assert phrase in instructions

    def test_adds_the_scheme_name_to_the_prompt(self, generator):
        Summarizer(generator, max_chars=1000).summarize("Document body text.", scheme_name="test-scheme")

        assert "Scheme: test-scheme" in generator.json_calls[0]["prompt"]

    def test_long_document_is_summarised_in_parts_then_merged(self, generator):
        text = " ".join(f"Sentence {i} of the long document." for i in range(200))
        parts = split_text(text, 1000, 100)
        generator.json_responses = [sections([f"part point {i}"]) for i in range(len(parts))]
        generator.json_responses.append(sections(["merged eligibility"], ["merged benefit"], ["merged requirement"]))

        summary = Summarizer(generator, max_chars=1000, part_overlap=100).summarize(text)

        assert summary == PolicySummary(["merged eligibility"], ["merged benefit"], ["merged requirement"])
        assert len(parts) > 1
        assert len(generator.json_calls) == len(parts) + 1
        for i, call in enumerate(generator.json_calls[:-1], start=1):
            assert f"part {i} of {len(parts)}" in call["prompt"]
        merge = generator.json_calls[-1]
        assert "part point 0" in merge["prompt"]
        assert f"part point {len(parts) - 1}" in merge["prompt"]
        assert "duplicate" in merge["instructions"]

    @pytest.mark.parametrize(
        "output",
        [
            {"eligibility": [], "benefits": []},
            {"eligibility": "not a list", "benefits": [], "requirements": []},
            {"eligibility": [1], "benefits": [], "requirements": []},
            ["not", "an", "object"],
        ],
    )
    def test_rejects_malformed_model_output(self, generator, output):
        generator.json_responses = [output]

        with pytest.raises(GenerationError):
            Summarizer(generator, max_chars=1000).summarize("Document body text.")

    def test_part_overlap_must_be_smaller_than_max_chars(self, generator):
        with pytest.raises(ValueError):
            Summarizer(generator, max_chars=100, part_overlap=100)
