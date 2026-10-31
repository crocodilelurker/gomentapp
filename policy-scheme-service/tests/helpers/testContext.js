const { DocumentCatalog } = require('../../src/catalog/documentCatalog');
const { JobQueue } = require('../../src/jobs/jobQueue');
const { PolicyService } = require('../../src/services/policyService');
const { InMemoryObjectStore } = require('./inMemoryObjectStore');
const { manualClock } = require('./manualClock');
const { RecordingRagClient } = require('./recordingRagClient');

// Real SQLite catalog + job queue, in-memory storage and a recording rag-service client, on one manual clock.
function createTestContext({ maxAttempts = 3, retryBaseMs = 1000 } = {}) {
  const now = manualClock();
  const catalog = new DocumentCatalog(':memory:', { now });
  const jobs = new JobQueue({ db: catalog.db, now, maxAttempts, retryBaseMs });
  const objectStore = new InMemoryObjectStore();
  const ragClient = new RecordingRagClient();
  const service = new PolicyService({ catalog, jobs, objectStore, ragClient, now });

  // Runs every job that is due now, one at a time — what the background worker does.
  async function runQueuedJobs() {
    let job;
    while ((job = jobs.claimNext())) await service.runJob(job);
  }

  return { now, catalog, jobs, objectStore, ragClient, service, runQueuedJobs };
}

module.exports = { createTestContext };
