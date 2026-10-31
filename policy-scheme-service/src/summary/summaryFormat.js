// Fixed layout of every policy summary: three numbered, point-wise sections.
const SUMMARY_SECTIONS = [
  { number: 1, key: 'eligibility', title: 'Eligibility', question: 'Who are eligible' },
  { number: 2, key: 'benefits', title: 'Benefits', question: 'What are the benefits' },
  { number: 3, key: 'requirements', title: 'Requirements', question: 'What are the required documents or proofs' },
];

const SUMMARY_KEYS = SUMMARY_SECTIONS.map((section) => section.key);

const EMPTY_SECTION_NOTE = 'Not stated in the document.';

const tidy = (points) => points.map((point) => point.replace(/\s+/g, ' ').trim()).filter(Boolean);

// `points` is rag-service's { eligibility: [], benefits: [], requirements: [] }.
function buildSummary({ documentId, schemeName, generatedAt, points }) {
  return {
    document_id: documentId,
    scheme_name: schemeName,
    generated_at: generatedAt,
    sections: SUMMARY_SECTIONS.map((section) => ({ ...section, points: tidy(points[section.key]) })),
  };
}

function renderSummaryMarkdown(summary) {
  const lines = [`# Summary: ${summary.scheme_name}`, ''];
  for (const section of summary.sections) {
    lines.push(`## Section ${section.number}: ${section.title} (${section.question})`);
    if (section.points.length) section.points.forEach((point, i) => lines.push(`${i + 1}. ${point}`));
    else lines.push(EMPTY_SECTION_NOTE);
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { SUMMARY_KEYS, SUMMARY_SECTIONS, buildSummary, renderSummaryMarkdown };
