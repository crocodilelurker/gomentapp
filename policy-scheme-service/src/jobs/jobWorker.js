/**
 * Runs queued jobs in the background, at most `concurrency` at a time.
 * Wakes up as soon as a job is queued; the poll interval only catches retries that become due later.
 * `runJob` owns the job's outcome (complete/fail); anything it throws is logged and the worker carries on.
 */
class JobWorker {
  constructor({ queue, runJob, concurrency = 1, pollIntervalMs = 2000, logger = console }) {
    this.queue = queue;
    this.runJob = runJob;
    this.concurrency = concurrency;
    this.pollIntervalMs = pollIntervalMs;
    this.logger = logger;
    this.active = new Set();
    this.timer = null;
    this.stopped = false;
    // Deferred so the code that queued the job finishes its own bookkeeping first.
    this.wake = () => setImmediate(() => this.#fill());
  }

  start() {
    if (this.timer) return;
    this.stopped = false;
    this.queue.on('enqueued', this.wake);
    this.timer = setInterval(() => this.#fill(), this.pollIntervalMs);
    this.timer.unref();
    this.#fill();
  }

  // Stops claiming new jobs and waits for the running ones to finish.
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = null;
    this.queue.off('enqueued', this.wake);
    await Promise.allSettled([...this.active]);
  }

  // Runs until no job is due and none is running.
  async drain() {
    for (;;) {
      this.#fill();
      if (this.active.size === 0) return;
      await Promise.race(this.active);
    }
  }

  #fill() {
    while (!this.stopped && this.active.size < this.concurrency) {
      const job = this.queue.claimNext();
      if (!job) return;
      const run = this.#run(job);
      this.active.add(run);
      run.finally(() => {
        this.active.delete(run);
        this.#fill();
      });
    }
  }

  async #run(job) {
    try {
      await this.runJob(job);
    } catch (error) {
      this.logger.error(`Job ${job.job_id} (${job.type} ${job.document_id}) crashed:`, error);
    }
  }
}

module.exports = { JobWorker };
