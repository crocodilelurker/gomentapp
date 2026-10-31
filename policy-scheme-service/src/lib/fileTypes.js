const path = require('node:path');
const { InvalidDocumentError } = require('../errors');

const utf8 = new TextDecoder('utf-8', { fatal: true }); // strips a leading BOM, throws on invalid bytes

// .txt "extraction": strict UTF-8 decode with uniform line endings and Unicode form.
function extractPlainText(buffer) {
  let text;
  try {
    text = utf8.decode(buffer);
  } catch {
    throw new InvalidDocumentError('File must be UTF-8 encoded text');
  }
  text = text.replace(/\r\n?/g, '\n').normalize('NFC');
  if (!text.trim()) throw new InvalidDocumentError('File contains no text');
  return text;
}

// Supported uploads. Adding PDF/DOCX later means adding an entry with its own extractor.
const FILE_TYPES = {
  '.txt': { mimeType: 'text/plain', contentType: 'text/plain; charset=utf-8', extract: extractPlainText },
};

const SUPPORTED_EXTENSIONS = Object.keys(FILE_TYPES);

function resolveFileType(filename) {
  const extension = path.extname(filename).toLowerCase();
  const fileType = FILE_TYPES[extension];
  return fileType ? { extension, ...fileType } : null;
}

module.exports = { SUPPORTED_EXTENSIONS, extractPlainText, resolveFileType };
