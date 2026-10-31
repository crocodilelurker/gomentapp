const { createHash } = require('node:crypto');

// Content address of a file: identical bytes always map to the same id.
function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

module.exports = { sha256Hex };
