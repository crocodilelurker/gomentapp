const { DatabaseSync } = require('node:sqlite');
const { JOB_TYPES, JobQueue } = require('../../src/jobs/jobQueue');
const { JobWorker } = require('../../src/jobs/jobWorker');

const DOC_A = 'a'.repeat(64);
const DOC_B = 'b'.repeat(64);

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const newQueue = () => new JobQueue({ db: new DatabaseSync(':memory:') });
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('JobWorker', () => {
  test('drain runs every queued job', async () => {
    const queue = newQueue();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    queue.enqueue(DOC_A, JOB_TYPES.SUMMARIZE);
    const ran = [];
    const worker = new JobWorker({
      queue,
      runJob: async (job) => {
        ran.push(job.type);
        queue.complete(job.job_id);
      },
    });

    await worker.drain();

    expect(ran).toEqual(['INDEX', 'SUMMARIZE']);
  });

  test('never runs more jobs at once than its concurrency', async () => {
    const queue = newQueue();
    for (const doc of [DOC_A, DOC_B]) {
      queue.enqueue(doc, JOB_TYPES.INDEX);
      queue.enqueue(doc, JOB_TYPES.SUMMARIZE);
    }
    let running = 0;
    let maxRunning = 0;
    let finished = 0;
    const worker = new JobWorker({
      queue,
      concurrency: 2,
      runJob: async (job) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await nextTick();
        running -= 1;
        finished += 1;
        queue.complete(job.job_id);
      },
    });

    await worker.drain();

    expect(maxRunning).toBe(2);
    expect(finished).toBe(4);
  });

  test('keeps going when a job throws, and logs the error', async () => {
    const queue = newQueue();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    queue.enqueue(DOC_A, JOB_TYPES.SUMMARIZE);
    const logged = [];
    const ran = [];
    const worker = new JobWorker({
      queue,
      logger: { error: (...args) => logged.push(args) },
      runJob: async (job) => {
        if (job.type === JOB_TYPES.INDEX) throw new Error('boom');
        ran.push(job.type);
        queue.complete(job.job_id);
      },
    });

    await worker.drain();

    expect(ran).toEqual(['SUMMARIZE']);
    expect(logged).toHaveLength(1);
  });

  test('start() picks up a newly queued job without waiting for the poll interval', async () => {
    const queue = newQueue();
    const done = deferred();
    const worker = new JobWorker({
      queue,
      pollIntervalMs: 60 * 60 * 1000,
      runJob: async (job) => {
        queue.complete(job.job_id);
        done.resolve(job);
      },
    });
    worker.start();

    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    const job = await done.promise;

    expect(job.type).toBe('INDEX');
    await worker.stop();
  });

  test('stop() waits for running jobs and stops claiming new ones', async () => {
    const queue = newQueue();
    const started = deferred();
    const release = deferred();
    let finished = false;
    const worker = new JobWorker({
      queue,
      pollIntervalMs: 60 * 60 * 1000,
      runJob: async (job) => {
        started.resolve();
        await release.promise;
        finished = true;
        queue.complete(job.job_id);
      },
    });
    worker.start();
    queue.enqueue(DOC_A, JOB_TYPES.INDEX);
    await started.promise;

    const stopping = worker.stop();
    queue.enqueue(DOC_B, JOB_TYPES.INDEX);
    release.resolve();
    await stopping;
    await nextTick();

    expect(finished).toBe(true);
    expect(queue.listForDocument(DOC_B)[0].status).toBe('PENDING');
  });
});
