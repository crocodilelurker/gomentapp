const { S3ObjectStore } = require('../../src/storage/s3ObjectStore');
const { ObjectNotFoundError, StorageUnavailableError } = require('../../src/errors');

// Records every command sent; handlers keyed by command class name can return or throw.
class FakeS3Client {
  constructor(handlers = {}) {
    this.sent = [];
    this.handlers = handlers;
  }

  async send(command) {
    const name = command.constructor.name;
    this.sent.push({ name, input: command.input });
    const handler = this.handlers[name];
    return handler ? handler(command.input) : {};
  }

  names() {
    return this.sent.map((command) => command.name);
  }
}

function s3Error(name, httpStatusCode) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

describe('S3ObjectStore', () => {
  test('builds s3:// URIs for keys', () => {
    const store = new S3ObjectStore({ client: new FakeS3Client(), bucket: 'policies' });

    expect(store.uri('raw/x.txt')).toBe('s3://policies/raw/x.txt');
  });

  test('creates the bucket before the first write when it does not exist', async () => {
    const client = new FakeS3Client({
      HeadBucketCommand: () => {
        throw s3Error('NotFound', 404);
      },
    });
    const store = new S3ObjectStore({ client, bucket: 'policies' });

    await store.putObject('raw/x.txt', Buffer.from('x'), 'text/plain');

    expect(client.names()).toEqual(['HeadBucketCommand', 'CreateBucketCommand', 'PutObjectCommand']);
    expect(client.sent[1].input).toEqual({ Bucket: 'policies' });
  });

  test('checks the bucket only once', async () => {
    const client = new FakeS3Client();
    const store = new S3ObjectStore({ client, bucket: 'policies' });

    await store.putObject('a', Buffer.from('a'), 'text/plain');
    await store.putObject('b', Buffer.from('b'), 'text/plain');

    expect(client.names()).toEqual(['HeadBucketCommand', 'PutObjectCommand', 'PutObjectCommand']);
  });

  test('retries the bucket check after a failure', async () => {
    let attempts = 0;
    const client = new FakeS3Client({
      HeadBucketCommand: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('connect ECONNREFUSED');
        return {};
      },
    });
    const store = new S3ObjectStore({ client, bucket: 'policies' });

    await expect(store.putObject('a', Buffer.from('a'), 'text/plain')).rejects.toBeInstanceOf(StorageUnavailableError);
    await store.putObject('a', Buffer.from('a'), 'text/plain');

    expect(client.names()).toEqual(['HeadBucketCommand', 'HeadBucketCommand', 'PutObjectCommand']);
  });

  test('puts objects with their content type', async () => {
    const client = new FakeS3Client();
    const store = new S3ObjectStore({ client, bucket: 'policies' });
    const body = Buffer.from('hello');

    await store.putObject('raw/x.txt', body, 'text/plain; charset=utf-8');

    expect(client.sent[1].input).toEqual({
      Bucket: 'policies',
      Key: 'raw/x.txt',
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
    });
  });

  test('wraps write failures as StorageUnavailableError', async () => {
    const client = new FakeS3Client({
      PutObjectCommand: () => {
        throw s3Error('InternalError', 500);
      },
    });
    const store = new S3ObjectStore({ client, bucket: 'policies' });

    await expect(store.putObject('a', Buffer.from('a'), 'text/plain')).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  test('gets an object with its body, content type and length', async () => {
    const body = { stream: true };
    const client = new FakeS3Client({
      GetObjectCommand: () => ({ Body: body, ContentType: 'text/plain', ContentLength: 5 }),
    });
    const store = new S3ObjectStore({ client, bucket: 'policies' });

    const object = await store.getObject('raw/x.txt');

    expect(object).toEqual({ body, contentType: 'text/plain', contentLength: 5 });
    expect(client.sent[0].input).toEqual({ Bucket: 'policies', Key: 'raw/x.txt' });
  });

  test('reports a missing object as ObjectNotFoundError', async () => {
    const client = new FakeS3Client({
      GetObjectCommand: () => {
        throw s3Error('NoSuchKey', 404);
      },
    });
    const store = new S3ObjectStore({ client, bucket: 'policies' });

    await expect(store.getObject('raw/missing.txt')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  test('wraps other read failures as StorageUnavailableError', async () => {
    const client = new FakeS3Client({
      GetObjectCommand: () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    const store = new S3ObjectStore({ client, bucket: 'policies' });

    await expect(store.getObject('raw/x.txt')).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  test('fromConfig builds a path-style S3 client for MinIO', async () => {
    const store = S3ObjectStore.fromConfig({
      endpoint: 'http://minio:9000',
      region: 'us-east-1',
      bucket: 'policies',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      forcePathStyle: true,
    });

    expect(store.bucket).toBe('policies');
    expect(store.client.config.forcePathStyle).toBe(true);
    expect(await store.client.config.region()).toBe('us-east-1');
  });
});
