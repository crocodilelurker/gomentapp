function int(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 8000),
    ragServiceUrl: env.RAG_SERVICE_URL || 'http://rag-service:8000',
    ragTimeoutMs: int(env.RAG_REQUEST_TIMEOUT_MS, 120000),
    ragSummaryTimeoutMs: int(env.RAG_SUMMARY_TIMEOUT_MS, 300000),
    catalogDbPath: env.CATALOG_DB_PATH || '/app/data/catalog.db',
    maxUploadBytes: int(env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    jobs: {
      concurrency: int(env.JOB_CONCURRENCY, 1),
      pollIntervalMs: int(env.JOB_POLL_INTERVAL_MS, 2000),
      maxAttempts: int(env.JOB_MAX_ATTEMPTS, 3),
      retryBaseMs: int(env.JOB_RETRY_BASE_MS, 10000),
    },
    s3: {
      endpoint: env.S3_ENDPOINT || 'http://minio:9000',
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || 'policies',
      accessKeyId: env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    },
  };
}

module.exports = { loadConfig };
