"""Step 1 — Text ingestion and sanitization."""

import pytest

from app.pipeline.ingestion import EncodingError, decode_text, sanitize_text


class TestDecodeText:
    """Substep 1.1 — file reading and UTF-8 enforcement."""

    def test_decodes_utf8_including_non_latin_scripts(self):
        assert decode_text("नमस्ते café".encode("utf-8")) == "नमस्ते café"

    def test_strips_byte_order_mark(self):
        assert decode_text(b"\xef\xbb\xbfhello") == "hello"

    def test_normalizes_line_endings(self):
        assert decode_text(b"a\r\nb\rc") == "a\nb\nc"

    def test_normalizes_unicode_to_nfc(self):
        assert decode_text("é".encode("utf-8")) == "é"

    def test_rejects_bytes_that_are_not_utf8(self):
        with pytest.raises(EncodingError):
            decode_text("café".encode("latin-1"))


class TestSanitizeText:
    """Substep 1.2 — stripping noise and artifacts."""

    def test_collapses_repeated_spaces_and_tabs(self):
        assert sanitize_text("a  \t  b") == "a b"

    def test_converts_non_breaking_spaces(self):
        assert sanitize_text("a b") == "a b"

    def test_removes_control_characters(self):
        assert sanitize_text("a\x00b\x07c") == "abc"

    def test_keeps_zero_width_joiners_used_by_indic_scripts(self):
        assert sanitize_text("क्‍ष") == "क्‍ष"

    def test_treats_form_feed_as_a_paragraph_break(self):
        assert sanitize_text("Page one ends.\fPage two starts.") == "Page one ends.\n\nPage two starts."

    def test_joins_orphan_line_breaks_inside_a_paragraph(self):
        assert sanitize_text("The applicant must\nbe a resident.") == "The applicant must be a resident."

    def test_keeps_paragraph_breaks(self):
        assert sanitize_text("Para one.\n\nPara two.") == "Para one.\n\nPara two."

    def test_collapses_runs_of_blank_lines(self):
        assert sanitize_text("a.\n\n\n\n\nb.") == "a.\n\nb."

    def test_keeps_bullet_points_on_their_own_lines(self):
        text = "Documents:\n- Proof of identity\n- Proof of address\n• Bank details"
        assert sanitize_text(text) == text

    def test_keeps_numbered_and_lettered_items_on_their_own_lines(self):
        text = "1. First item\n2) Second item\n(a) Sub item\n(iv) Roman item"
        assert sanitize_text(text) == text

    def test_keeps_a_break_after_a_line_ending_with_colon(self):
        assert sanitize_text("Eligibility:\nAll applicants qualify.") == "Eligibility:\nAll applicants qualify."

    def test_rejoins_words_hyphenated_across_lines(self):
        assert sanitize_text("eligi-\nbility") == "eligibility"

    def test_removes_lines_made_only_of_scanning_specks(self):
        assert sanitize_text("First para.\n\n~ . |\n\nSecond para.") == "First para.\n\nSecond para."

    def test_removes_page_number_lines(self):
        text = "End of page.\n\nPage 3 of 10\n\n- 4 -\n\n12\n\nNext page."
        assert sanitize_text(text) == "End of page.\n\nNext page."

    def test_keeps_numbered_list_items_that_look_like_numbers(self):
        assert sanitize_text("1. Applicant") == "1. Applicant"

    def test_strips_surrounding_whitespace(self):
        assert sanitize_text("  \n\n hello \n\n ") == "hello"

    def test_returns_empty_string_for_noise_only_input(self):
        assert sanitize_text(" \n ~~ \n . \n") == ""
