const { validatePolicyMetadata } = require('../../src/validation/policyMetadata');
const { ValidationError } = require('../../src/errors');

const REQUIRED = { scheme_name: 's', department: 'd' };

function detailsFor(input) {
  try {
    validatePolicyMetadata(input);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error.details;
  }
  throw new Error('expected a ValidationError');
}

describe('validatePolicyMetadata', () => {
  test('trims values and drops empty optional fields', () => {
    expect(validatePolicyMetadata({ scheme_name: '  s ', department: 'd', category: '', language: undefined })).toEqual(REQUIRED);
  });

  test('accepts every supported metatag', () => {
    const input = {
      scheme_name: 's',
      department: 'd',
      release_date: '2026-01-31',
      category: 'c',
      language: 'hi-IN',
      jurisdiction: 'j',
      source_url: 'https://example.gov.in/policy',
    };

    expect(validatePolicyMetadata(input)).toEqual(input);
  });

  test('requires scheme_name and department', () => {
    expect(detailsFor({})).toEqual({ scheme_name: 'is required', department: 'is required' });
  });

  test('treats non-string values as missing', () => {
    expect(detailsFor({ scheme_name: ['a', 'b'], department: 'd' })).toEqual({ scheme_name: 'is required' });
  });

  test.each(['2026-02-30', '30-01-2026', '2026-1-5', 'yesterday'])('rejects release_date %s', (releaseDate) => {
    expect(detailsFor({ ...REQUIRED, release_date: releaseDate })).toHaveProperty('release_date');
  });

  test('accepts a leap day', () => {
    expect(validatePolicyMetadata({ ...REQUIRED, release_date: '2028-02-29' }).release_date).toBe('2028-02-29');
  });

  test.each(['English', 'e', 'en_IN'])('rejects language %s', (language) => {
    expect(detailsFor({ ...REQUIRED, language })).toHaveProperty('language');
  });

  test.each(['ftp://example.gov.in/x', 'not a url'])('rejects source_url %s', (sourceUrl) => {
    expect(detailsFor({ ...REQUIRED, source_url: sourceUrl })).toHaveProperty('source_url');
  });

  test('enforces maximum lengths', () => {
    expect(detailsFor({ ...REQUIRED, scheme_name: 'x'.repeat(201) })).toHaveProperty('scheme_name');
  });

  test('ignores fields that are not metatags', () => {
    expect(validatePolicyMetadata({ ...REQUIRED, extra: 'x' })).toEqual(REQUIRED);
  });
});
