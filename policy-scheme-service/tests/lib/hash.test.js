const { sha256Hex } = require('../../src/lib/hash');

describe('sha256Hex', () => {
  test('matches the FIPS 180-2 test vector for "abc"', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('hashes an empty buffer', () => {
    expect(sha256Hex(Buffer.alloc(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
