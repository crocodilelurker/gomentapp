const { SUMMARY_SECTIONS, buildSummary, renderSummaryMarkdown } = require('../../src/summary/summaryFormat');

const ID = 'a'.repeat(64);
const GENERATED_AT = '2026-01-01T00:00:00.000Z';

function build(points) {
  return buildSummary({ documentId: ID, schemeName: 'test-scheme', generatedAt: GENERATED_AT, points });
}

describe('summary format', () => {
  test('defines the three sections in order', () => {
    expect(SUMMARY_SECTIONS).toEqual([
      { number: 1, key: 'eligibility', title: 'Eligibility', question: 'Who are eligible' },
      { number: 2, key: 'benefits', title: 'Benefits', question: 'What are the benefits' },
      { number: 3, key: 'requirements', title: 'Requirements', question: 'What are the required documents or proofs' },
    ]);
  });

  test('buildSummary arranges the points into the numbered sections', () => {
    const summary = build({ eligibility: ['e1'], benefits: ['b1', 'b2'], requirements: [] });

    expect(summary).toEqual({
      document_id: ID,
      scheme_name: 'test-scheme',
      generated_at: GENERATED_AT,
      sections: [
        { number: 1, key: 'eligibility', title: 'Eligibility', question: 'Who are eligible', points: ['e1'] },
        { number: 2, key: 'benefits', title: 'Benefits', question: 'What are the benefits', points: ['b1', 'b2'] },
        {
          number: 3,
          key: 'requirements',
          title: 'Requirements',
          question: 'What are the required documents or proofs',
          points: [],
        },
      ],
    });
  });

  test('buildSummary tidies points: trims, collapses whitespace and drops empty ones', () => {
    const summary = build({ eligibility: ['  two\n   words ', '', '   '], benefits: [], requirements: [] });

    expect(summary.sections[0].points).toEqual(['two words']);
  });

  test('renders numbered points per section and marks empty sections', () => {
    const markdown = renderSummaryMarkdown(build({ eligibility: ['e1'], benefits: ['b1', 'b2'], requirements: [] }));

    expect(markdown).toBe(
      [
        '# Summary: test-scheme',
        '',
        '## Section 1: Eligibility (Who are eligible)',
        '1. e1',
        '',
        '## Section 2: Benefits (What are the benefits)',
        '1. b1',
        '2. b2',
        '',
        '## Section 3: Requirements (What are the required documents or proofs)',
        'Not stated in the document.',
        '',
      ].join('\n'),
    );
  });
});
