const { EventEmitter } = require('node:events');

const JOB_TYPES = { INDEX: 'INDEX', SUMMARIZE: 'SUMMARIZE' };

// Durable background job queue in the catalog's SQLite database, so queued work survives restarts.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS processing_jobs (
  job_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('INDEX', 'SUMMARIZE')),
  status        TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL,
  error_message TEXT,
  run_after     TEXT NOT NULL,                 -- earliest time the job may run (later for retries)
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  finished_at   TEXT,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS processing_jobs_due ON processing_jobs (status, run_after);
CREATE INDEX IF NOT EXISTS processing_jobs_document ON processing_jobs (document_id, type);
`;

/**
 * PENDING -> PROCESSING -> COMPLETED, or back to PENDING with a delay (retry), or FAILED after the last attempt.
 * Emits 'enqueued' with the job whenever a new job is added.
 */
class JobQueue extends EventEmitter {
  constructor({ db, now = () => new Date(), maxAttempts = 3, retryBaseMs = 10000 }) {
    super();
    this.db = db;
    this.now = now;
    this.maxAttempts = maxAttempts;
    this.retryBaseMs = retryBaseMs;
    this.db.exec(SCHEMA);
  }

  // Adds a job unless the same document already has an active (PENDING/PROCESSING) job of that type.
  enqueue(documentId, type) {
    const active = this.db
      .prepare(
        `SELECT * FROM processing_jobs
         WHERE document_id = $documentId AND type = $type AND status IN ('PENDING', 'PROCESSING')
         ORDER BY job_id DESC LIMIT 1`,
      )
      .get({ documentId, type });
    if (active) return { job: { ...active }, created: false };

    const now = this.#timestamp();
    const { lastInsertRowid } = this.db
      .prepare(
        `INSERT INTO processing_jobs (document_id, type, status, attempts, max_attempts, run_after, created_at, updated_at)
         VALUES ($documentId, $type, 'PENDING', 0, $maxAttempts, $now, $now, $now)`,
      )
      .run({ documentId, type, maxAttempts: this.maxAttempts, now });
    const job = this.findById(Number(lastInsertRowid));
    this.emit('enqueued', job);
    return { job, created: true };
  }

  // Takes the oldest due job, marks it PROCESSING and counts the attempt. Returns null when nothing is due.
  claimNext() {
    const now = this.#timestamp();
    const due = this.db
      .prepare(
        `SELECT job_id FROM processing_jobs WHERE status = 'PENDING' AND run_after <= $now
         ORDER BY run_after, job_id LIMIT 1`,
      )
      .get({ now });
    if (!due) return null;
    this.db
      .prepare(
        `UPDATE processing_jobs SET status = 'PROCESSING', attempts = attempts + 1, started_at = $now, updated_at = $now
         WHERE job_id = $id`,
      )
      .run({ now, id: due.job_id });
    return this.findById(due.job_id);
  }

  complete(jobId) {
    const now = this.#timestamp();
    this.db
      .prepare(
        `UPDATE processing_jobs SET status = 'COMPLETED', error_message = NULL, finished_at = $now, updated_at = $now
         WHERE job_id = $id`,
      )
      .run({ now, id: jobId });
    return this.findById(jobId);
  }

  // Retries after retryBaseMs * 2^(attempt-1) while attempts remain (and the error is retryable); otherwise FAILED.
  fail(jobId, message, { retryable = true } = {}) {
    const job = this.findById(jobId);
    const now = this.now();
    if (retryable && job.attempts < job.max_attempts) {
      const runAfter = new Date(now.getTime() + this.retryBaseMs * 2 ** (job.attempts - 1)).toISOString();
      this.db
        .prepare(
          `UPDATE processing_jobs SET status = 'PENDING', error_message = $message, run_after = $runAfter, updated_at = $now
           WHERE job_id = $id`,
        )
        .run({ message, runAfter, now: now.toISOString(), id: jobId });
    } else {
      this.db
        .prepare(
          `UPDATE processing_jobs SET status = 'FAILED', error_message = $message, finished_at = $now, updated_at = $now
           WHERE job_id = $id`,
        )
        .run({ message, now: now.toISOString(), id: jobId });
    }
    return this.findById(jobId);
  }

  // After a restart, jobs left PROCESSING were interrupted: put them back in the queue.
  requeueInterrupted() {
    const now = this.#timestamp();
    const { changes } = this.db
      .prepare(`UPDATE processing_jobs SET status = 'PENDING', run_after = $now, updated_at = $now WHERE status = 'PROCESSING'`)
      .run({ now });
    return Number(changes);
  }

  findById(jobId) {
    const row = this.db.prepare('SELECT * FROM processing_jobs WHERE job_id = $id').get({ id: jobId });
    return row ? { ...row } : null;
  }

  listForDocument(documentId) {
    return this.db
      .prepare('SELECT * FROM processing_jobs WHERE document_id = $documentId ORDER BY job_id DESC')
      .all({ documentId })
      .map((row) => ({ ...row }));
  }

  list({ status, limit = 50 } = {}) {
    const where = status === undefined ? '' : 'WHERE status = $status';
    const params = status === undefined ? { limit } : { status, limit };
    return this.db
      .prepare(`SELECT * FROM processing_jobs ${where} ORDER BY job_id DESC LIMIT $limit`)
      .all(params)
      .map((row) => ({ ...row }));
  }

  #timestamp() {
    return this.now().toISOString();
  }
}

module.exports = { JOB_TYPES, JobQueue };
