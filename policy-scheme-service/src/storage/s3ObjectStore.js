const {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { ObjectNotFoundError, StorageUnavailableError } = require('../errors');

const isNotFound = (error) => error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;

// S3-compatible object storage (MinIO locally; AWS S3 or Cloudflare R2 by changing config only).
class S3ObjectStore {
  constructor({ client, bucket }) {
    this.client = client;
    this.bucket = bucket;
    this.bucketReady = null;
  }

  static fromConfig({ endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle }) {
    const client = new S3Client({
      endpoint,
      region,
      forcePathStyle, // MinIO serves buckets as paths, not subdomains
      credentials: { accessKeyId, secretAccessKey },
      // Only send/validate checksums when the API requires them, for compatibility with non-AWS S3 servers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return new S3ObjectStore({ client, bucket });
  }

  uri(key) {
    return `s3://${this.bucket}/${key}`;
  }

  async putObject(key, body, contentType) {
    await this.#ensureBucket();
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    } catch (error) {
      throw new StorageUnavailableError('Could not write to object storage', { cause: error });
    }
  }

  async getObject(key) {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return { body: response.Body, contentType: response.ContentType, contentLength: response.ContentLength };
    } catch (error) {
      if (isNotFound(error)) throw new ObjectNotFoundError(key);
      throw new StorageUnavailableError('Could not read from object storage', { cause: error });
    }
  }

  // Creates the bucket on first write; a failed attempt is retried on the next write.
  #ensureBucket() {
    this.bucketReady ??= this.#createBucketIfMissing().catch((error) => {
      this.bucketReady = null;
      throw new StorageUnavailableError('Object storage is unavailable', { cause: error });
    });
    return this.bucketReady;
  }

  async #createBucketIfMissing() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
}

module.exports = { S3ObjectStore };
