const { DatabaseSync } = require('node:sqlite');
const { JOB_TYPES, JobQueue } = require('../../src/jobs/jobQueue');
const { manualClock } = require('../helpers/manualClock');

const DOC_A = 'a'.repeat(64);
const DOC_B = 'b'.repeat(64);
const T0 = '2026-01-01T00:00:00.000Z';

function setup() {
  const now = manualClock();
  const queue = new JobQueue({ db: new DatabaseSync(':memory:'), now, maxAttempts: 3, retryBaseMs: 1000 });
  return { now, queue };
}

describe('JobQueue', () => {
  test('enqueue creates a PENDING job that can run immediately', () => {
    const { queue } = setup();

    const { job, created } = queue.enqueue(DOC_A, JOB_TYPES.INDEX);

    expect(created).toBe(true);
    expect(job).toEqual({
      job_id: 1,
      document_id: DOC_A,
      type: 'INDEX',
      status: 'PENDING',
      attempts: 0,
      max_attempts: 3,
      error_message: null,
      run_after: T0,
      created_at: T0,
      started_at: null,
      finished_at: null,
      updated_at: T0,
    });
  });

  test('enqueue reuses the active job for the same document and type', () => {
    const { queue } = setup();
    const first = queue.enqueue(DOC_A, JOB_TYPES.INDEX).job;
    queue.claimNext(); // now PROCESSING, still active

    const again = queue.enqueue(DOC_A, JOB_TYPES.INDEX);

    expect(again.created).toBe(false);
    expect(again.job.job_id).toBe(first.job_id);
    expect(queue.enqueue(DOC_A, JOB_TYPES.SUMMARIZE).created).toBe(true);
    expect(queue.enqueue(DOC_B, JOB_TYPES.INDEX).created).toBe(true);
  });

  test('enqueue creates a new job once the previous one has finished', () => {
    const { queue } = setup();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    queue.complete(queue.claimNext().job_id);

    const { job, created } = queue.enqueue(DOC_A, JOB_TYPES.INDEX);

    expect(created).toBe(true);
    expect(job.job_id).toBe(2);
  });

  test('enqueue emits "enqueued" only for new jobs', () => {
    const { queue } = setup();
    const emitted = [];
    queue.on('enqueued', (job) => emitted.push(job.job_id));

    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);

    expect(emitted).toEqual([1]);
  });

  test('claimNext takes the oldest due job, marks it PROCESSING and counts the attempt', () => {
    const { queue, now } = setup();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    queue.enqueue(DOC_B, JOB_TYPES.INDEX);
    now.advance(500);

    const job = queue.claimNext();

    expect(job).toMatchObject({
      job_id: 1,
      status: 'PROCESSING',
      attempts: 1,
      started_at: '2026-01-01T00:00:00.500Z',
    });
    expect(queue.claimNext().job_id).toBe(2);
    expect(queue.claimNext()).toBeNull();
  });

  test('complete marks the job COMPLETED', () => {
    const { queue } = setup();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);

    const job = queue.complete(queue.claimNext().job_id);

    expect(job).toMatchObject({ status: 'COMPLETED', error_message: null, finished_at: T0 });
  });

  test('fail retries with exponential backoff, then marks the job FAILED', () => {
    const { queue, now } = setup();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);

    const first = queue.fail(queue.claimNext().job_id, 'boom 1');
    expect(first).toMatchObject({ status: 'PENDING', attempts: 1, error_message: 'boom 1', run_after: '2026-01-01T00:00:01.000Z' });
    expect(queue.claimNext()).toBeNull(); // not due yet

    now.advance(1000);
    const second = queue.fail(queue.claimNext().job_id, 'boom 2');
    expect(second).toMatchObject({ status: 'PENDING', attempts: 2, run_after: '2026-01-01T00:00:03.000Z' });

    now.advance(2000);
    const third = queue.fail(queue.claimNext().job_id, 'boom 3');
    expect(third).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      error_message: 'boom 3',
      finished_at: '2026-01-01T00:00:03.000Z',
    });
  });

  test('fail without retry marks the job FAILED at once', () => {
    const { queue } = setup();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);

    const job = queue.fail(queue.claimNext().job_id, 'bad request', { retryable: false });

    expect(job).toMatchObject({ status: 'FAILED', attempts: 1, error_message: 'bad request' });
  });

  test('requeueInterrupted puts PROCESSING jobs back in the queue', () => {
    const { queue } = setup();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    queue.enqueue(DOC_B, JOB_TYPES.INDEX);
    queue.claimNext();

    expect(queue.requeueInterrupted()).toBe(1);
    expect(queue.findById(1).status).toBe('PENDING');
    expect(queue.claimNext().job_id).toBe(1);
  });

  test('listForDocument returns the newest first and list filters by status', () => {
    const { queue } = setup();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    queue.enqueue(DOC_A, JOB_TYPES.SUMMARIZE);
    queue.enqueue(DOC_B, JOB_TYPES.INDEX);
    queue.claimNext();

    expect(queue.listForDocument(DOC_A).map((job) => job.type)).toEqual(['SUMMARIZE', 'INDEX']);
    expect(queue.list({ status: 'PROCESSING' }).map((job) => job.job_id)).toEqual([1]);
    expect(queue.list({ status: 'PENDING' }).map((job) => job.job_id)).toEqual([3, 2]);
    expect(queue.list({ limit: 1 }).map((job) => job.job_id)).toEqual([3]);
  });
});
