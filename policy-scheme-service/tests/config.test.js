const { loadConfig } = require('../src/config');

describe('loadConfig', () => {
  test('uses defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      port: 8000,
      ragServiceUrl: 'http://rag-service:8000',
      ragTimeoutMs: 120000,
      ragSummaryTimeoutMs: 300000,
      catalogDbPath: '/app/data/catalog.db',
      maxUploadBytes: 10 * 1024 * 1024,
      jobs: { concurrency: 1, pollIntervalMs: 2000, maxAttempts: 3, retryBaseMs: 10000 },
      s3: {
        endpoint: 'http://minio:9000',
        region: 'us-east-1',
        bucket: 'policies',
        accessKeyId: '',
        secretAccessKey: '',
        forcePathStyle: true,
      },
    });
  });

  test('reads values from the environment', () => {
    const config = loadConfig({
      PORT: '9000',
      RAG_SERVICE_URL: 'http://rag:1',
      RAG_REQUEST_TIMEOUT_MS: '5000',
      RAG_SUMMARY_TIMEOUT_MS: '6000',
      CATALOG_DB_PATH: '/tmp/c.db',
      MAX_UPLOAD_BYTES: '2048',
      JOB_CONCURRENCY: '2',
      JOB_POLL_INTERVAL_MS: '500',
      JOB_MAX_ATTEMPTS: '5',
      JOB_RETRY_BASE_MS: '100',
      S3_ENDPOINT: 'http://s3:1',
      S3_REGION: 'ap-south-1',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'false',
    });

    expect(config).toEqual({
      port: 9000,
      ragServiceUrl: 'http://rag:1',
      ragTimeoutMs: 5000,
      ragSummaryTimeoutMs: 6000,
      catalogDbPath: '/tmp/c.db',
      maxUploadBytes: 2048,
      jobs: { concurrency: 2, pollIntervalMs: 500, maxAttempts: 5, retryBaseMs: 100 },
      s3: {
        endpoint: 'http://s3:1',
        region: 'ap-south-1',
        bucket: 'b',
        accessKeyId: 'id',
        secretAccessKey: 'secret',
        forcePathStyle: false,
      },
    });
  });
});
