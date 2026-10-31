const { ValidationError } = require('../errors');

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Metatags accepted with an uploaded policy. Values are trimmed; empty optional values are dropped.
const FIELDS = {
  scheme_name: { required: true, maxLength: 200 },
  department: { required: true, maxLength: 200 },
  release_date: { check: isIsoDate, message: 'must be a valid date in YYYY-MM-DD format' },
  category: { maxLength: 100 },
  language: { check: (v) => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v), message: 'must be a language code such as "en" or "hi-IN"' },
  jurisdiction: { maxLength: 100 },
  source_url: { maxLength: 2048, check: isHttpUrl, message: 'must be an http(s) URL' },
};

const POLICY_METADATA_FIELDS = Object.keys(FIELDS);

function validatePolicyMetadata(input = {}) {
  const metadata = {};
  const errors = {};

  for (const [field, rule] of Object.entries(FIELDS)) {
    const raw = input[field];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (!value) {
      if (rule.required) errors[field] = 'is required';
    } else if (rule.maxLength && value.length > rule.maxLength) {
      errors[field] = `must be at most ${rule.maxLength} characters`;
    } else if (rule.check && !rule.check(value)) {
      errors[field] = rule.message;
    } else {
      metadata[field] = value;
    }
  }

  if (Object.keys(errors).length) throw new ValidationError('Invalid policy metadata', errors);
  return metadata;
}

module.exports = { POLICY_METADATA_FIELDS, validatePolicyMetadata };
