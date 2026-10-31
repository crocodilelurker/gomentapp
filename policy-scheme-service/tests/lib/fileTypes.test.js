const { resolveFileType, extractPlainText } = require('../../src/lib/fileTypes');
const { InvalidDocumentError } = require('../../src/errors');

describe('resolveFileType', () => {
  test('recognises .txt case-insensitively', () => {
    expect(resolveFileType('notes.TXT')).toMatchObject({ extension: '.txt', mimeType: 'text/plain' });
  });

  test.each(['scheme.pdf', 'scheme.docx', 'no-extension'])('rejects %s', (filename) => {
    expect(resolveFileType(filename)).toBeNull();
  });
});

describe('extractPlainText', () => {
  test('decodes UTF-8 including non-Latin scripts', () => {
    expect(extractPlainText(Buffer.from('नमस्ते café', 'utf8'))).toBe('नमस्ते café');
  });

  test('strips a UTF-8 byte order mark', () => {
    expect(extractPlainText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello')]))).toBe('hello');
  });

  test('normalises line endings to \\n', () => {
    expect(extractPlainText(Buffer.from('a\r\nb\rc'))).toBe('a\nb\nc');
  });

  test('normalises Unicode to NFC', () => {
    expect(extractPlainText(Buffer.from('é', 'utf8'))).toBe('é');
  });

  test('rejects bytes that are not valid UTF-8', () => {
    expect(() => extractPlainText(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toThrow(InvalidDocumentError);
  });

  test('rejects whitespace-only content', () => {
    expect(() => extractPlainText(Buffer.from(' \n\t '))).toThrow(InvalidDocumentError);
  });
});
