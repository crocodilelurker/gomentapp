const { Readable } = require('node:stream');
const { ObjectNotFoundError } = require('../../src/errors');

// Same contract as S3ObjectStore, backed by a Map, so service tests run without MinIO.
class InMemoryObjectStore {
  constructor({ bucket = 'test-bucket' } = {}) {
    this.bucket = bucket;
    this.objects = new Map();
    this.failWith = null;
    this.failWhen = null; // optional (key) => boolean to fail only some keys
  }

  uri(key) {
    return `s3://${this.bucket}/${key}`;
  }

  async putObject(key, body, contentType) {
    if (this.failWith && (!this.failWhen || this.failWhen(key))) throw this.failWith;
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async getObject(key) {
    if (this.failWith) throw this.failWith;
    const object = this.objects.get(key);
    if (!object) throw new ObjectNotFoundError(key);
    return { body: Readable.from([object.body]), contentType: object.contentType, contentLength: object.body.length };
  }
}

module.exports = { InMemoryObjectStore };
