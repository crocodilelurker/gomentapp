const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('./app');
const { DocumentCatalog } = require('./catalog/documentCatalog');
const { RagClient } = require('./clients/ragClient');
const { loadConfig } = require('./config');
const { JobQueue } = require('./jobs/jobQueue');
const { JobWorker } = require('./jobs/jobWorker');
const { PolicyService } = require('./services/policyService');
const { S3ObjectStore } = require('./storage/s3ObjectStore');

const config = loadConfig(process.env);

if (!config.s3.accessKeyId || !config.s3.secretAccessKey) {
  console.warn('S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not set; uploads will fail until they are.');
}
if (config.catalogDbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(config.catalogDbPath), { recursive: true });
}

const catalog = new DocumentCatalog(config.catalogDbPath);
const jobs = new JobQueue({ db: catalog.db, maxAttempts: config.jobs.maxAttempts, retryBaseMs: config.jobs.retryBaseMs });

const policyService = new PolicyService({
  catalog,
  jobs,
  objectStore: S3ObjectStore.fromConfig(config.s3),
  ragClient: new RagClient({
    baseUrl: config.ragServiceUrl,
    timeoutMs: config.ragTimeoutMs,
    summaryTimeoutMs: config.ragSummaryTimeoutMs,
  }),
});

const recovered = policyService.recover();
if (recovered) console.log(`Re-queued ${recovered} job(s) interrupted by the last shutdown`);

const worker = new JobWorker({
  queue: jobs,
  runJob: (job) => policyService.runJob(job),
  concurrency: config.jobs.concurrency,
  pollIntervalMs: config.jobs.pollIntervalMs,
});
worker.start();

const server = createApp({ policyService, maxUploadBytes: config.maxUploadBytes }).listen(config.port, () => {
  console.log(`policy-scheme-service listening on port ${config.port}`);
});

// Finish running jobs before exiting; anything still queued resumes on the next start.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    server.close();
    await worker.stop();
    catalog.close();
    process.exit(0);
  });
}
