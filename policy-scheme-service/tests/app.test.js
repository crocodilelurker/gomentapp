const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../src/app');
const { RagClientError, StorageUnavailableError } = require('../src/errors');
const { extractPlainText } = require('../src/lib/fileTypes');
const { createTestContext } = require('./helpers/testContext');

const RAW = Buffer.from('Plain text content used by the API tests.\nSecond line.', 'utf8');
const ID = createHash('sha256').update(RAW).digest('hex');

function setup(options) {
  const context = createTestContext(options);
  const app = createApp({ policyService: context.service, maxUploadBytes: 1024 });
  return { ...context, app };
}

function uploadPolicy(app, { buffer = RAW, filename = 'upload.txt', field = 'file', metadata } = {}) {
  const req = request(app).post('/policies').attach(field, buffer, filename);
  const fields = metadata ?? { scheme_name: 'test-scheme', department: 'test-department' };
  for (const [name, value] of Object.entries(fields)) req.field(name, value);
  return req;
}

describe('policy-scheme-service', () => {
  test('GET /health reports the service status', async () => {
    const res = await request(setup().app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'policy-scheme-service', status: 'ok' });
  });

  test('returns 404 for unknown routes', async () => {
    const res = await request(setup().app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });

  describe('POST /policies', () => {
    test('accepts a new policy with 202 and queues indexing and summarising', async () => {
      const res = await uploadPolicy(setup().app);

      expect(res.status).toBe(202);
      expect(res.body.duplicate).toBe(false);
      expect(res.body.document).toMatchObject({
        document_id: ID,
        original_filename: 'upload.txt',
        scheme_name: 'test-scheme',
        extraction_status: 'PENDING',
        summary_status: 'PENDING',
      });
      expect(res.body.jobs.map((job) => [job.type, job.status])).toEqual([
        ['INDEX', 'PENDING'],
        ['SUMMARIZE', 'PENDING'],
      ]);
    });

    test('returns 200 with duplicate=true and no jobs for an identical file', async () => {
      const { app } = setup();
      await uploadPolicy(app);

      const res = await uploadPolicy(app, { filename: 'renamed.txt' });

      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
      expect(res.body.jobs).toEqual([]);
      expect(res.body.document.original_filename).toBe('upload.txt');
    });

    test('returns 202 when re-uploading a file queues a failed step again', async () => {
      const { app, ragClient, runQueuedJobs } = setup();
      await uploadPolicy(app);
      ragClient.error = new RagClientError('rag-service responded 400: bad', 400);
      await runQueuedJobs();
      ragClient.error = null;

      const res = await uploadPolicy(app);

      expect(res.status).toBe(202);
      expect(res.body.duplicate).toBe(true);
      expect(res.body.jobs.map((job) => job.type)).toEqual(['INDEX']);
    });

    test('keeps UTF-8 file names intact', async () => {
      const res = await uploadPolicy(setup().app, { filename: 'नीति.txt' });

      expect(res.body.document.original_filename).toBe('नीति.txt');
    });

    test('requires a file', async () => {
      const res = await request(setup().app).post('/policies').field('scheme_name', 's').field('department', 'd');

      expect(res.status).toBe(400);
    });

    test('rejects a file sent under the wrong field name', async () => {
      expect((await uploadPolicy(setup().app, { field: 'document' })).status).toBe(400);
    });

    test('rejects unsupported file types with 415', async () => {
      expect((await uploadPolicy(setup().app, { filename: 'scheme.pdf' })).status).toBe(415);
    });

    test('rejects files over the size limit with 413', async () => {
      expect((await uploadPolicy(setup().app, { buffer: Buffer.alloc(2048, 'a') })).status).toBe(413);
    });

    test('rejects invalid metatags with 422 and per-field details', async () => {
      const res = await uploadPolicy(setup().app, { metadata: { department: 'd', release_date: '2026-13-01' } });

      expect(res.status).toBe(422);
      expect(res.body.details).toEqual({
        scheme_name: 'is required',
        release_date: 'must be a valid date in YYYY-MM-DD format',
      });
    });

    test('rejects non-UTF-8 text with 400', async () => {
      expect((await uploadPolicy(setup().app, { buffer: Buffer.from([0x63, 0x61, 0x66, 0xe9]) })).status).toBe(400);
    });

    test('returns 503 when object storage is unavailable', async () => {
      const { app, objectStore } = setup();
      objectStore.failWith = new StorageUnavailableError('Object storage is unavailable');

      expect((await uploadPolicy(app)).status).toBe(503);
    });
  });

  describe('processing status', () => {
    test('GET /policies/:id/status shows the steps queued, then completed', async () => {
      const { app, runQueuedJobs } = setup();
      await uploadPolicy(app);

      const queued = await request(app).get(`/policies/${ID}/status`);
      await runQueuedJobs();
      const done = await request(app).get(`/policies/${ID}/status`);

      expect(queued.status).toBe(200);
      expect(queued.body).toMatchObject({
        document_id: ID,
        processing_status: 'PENDING',
        indexing: { status: 'PENDING' },
        summary: { status: 'PENDING' },
      });
      expect(queued.body.jobs).toHaveLength(2);
      expect(done.body).toMatchObject({
        processing_status: 'COMPLETED',
        indexing: { status: 'COMPLETED', chunk_count: 3, error: null },
        summary: { status: 'COMPLETED', error: null },
      });
      expect(done.body.jobs.every((job) => job.status === 'COMPLETED')).toBe(true);
    });

    test('GET /policies/:id/status shows PROCESSING while a job is running', async () => {
      const { app, jobs, service, ragClient } = setup();
      await uploadPolicy(app);
      let release;
      ragClient.hold = new Promise((resolve) => {
        release = resolve;
      });
      const running = service.runJob(jobs.claimNext());
      await new Promise((resolve) => setImmediate(resolve));

      const res = await request(app).get(`/policies/${ID}/status`);
      release();
      await running;

      expect(res.body.processing_status).toBe('PROCESSING');
      expect(res.body.indexing.status).toBe('PROCESSING');
      expect(res.body.jobs.find((job) => job.type === 'INDEX').status).toBe('PROCESSING');
    });

    test('GET /policies/:id/status returns 404 for an unknown document', async () => {
      expect((await request(setup().app).get(`/policies/${'f'.repeat(64)}/status`)).status).toBe(404);
    });

    test('GET /jobs lists jobs and filters by status', async () => {
      const { app, jobs } = setup();
      await uploadPolicy(app);
      jobs.claimNext();

      const all = await request(app).get('/jobs');
      const processing = await request(app).get('/jobs?status=PROCESSING');

      expect(all.status).toBe(200);
      expect(all.body.jobs).toHaveLength(2);
      expect(processing.body.jobs.map((job) => [job.type, job.document_id])).toEqual([['INDEX', ID]]);
    });

    test('GET /jobs rejects an unknown status', async () => {
      expect((await request(setup().app).get('/jobs?status=QUEUED')).status).toBe(422);
    });
  });

  describe('reading the catalogue', () => {
    test('GET /policies lists documents and applies filters', async () => {
      const { app } = setup();
      await uploadPolicy(app);

      const all = await request(app).get('/policies');
      const none = await request(app).get('/policies?department=other');

      expect(all.status).toBe(200);
      expect(all.body.documents.map((d) => d.document_id)).toEqual([ID]);
      expect(none.body.documents).toEqual([]);
    });

    test('GET /policies rejects an unknown status filter', async () => {
      expect((await request(setup().app).get('/policies?status=DONE')).status).toBe(422);
    });

    test('GET /policies/:id returns the document', async () => {
      const { app } = setup();
      await uploadPolicy(app);

      const res = await request(app).get(`/policies/${ID}`);

      expect(res.status).toBe(200);
      expect(res.body.document.document_id).toBe(ID);
    });

    test('GET /policies/:id returns 404 for an unknown id and 400 for a malformed one', async () => {
      const { app } = setup();

      expect((await request(app).get(`/policies/${'f'.repeat(64)}`)).status).toBe(404);
      expect((await request(app).get('/policies/not-a-hash')).status).toBe(400);
    });

    test('GET /policies/:id/file downloads the original file right after upload', async () => {
      const { app } = setup();
      await uploadPolicy(app);

      const res = await request(app).get(`/policies/${ID}/file`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(res.headers['content-disposition']).toBe(`attachment; filename="upload.txt"; filename*=UTF-8''upload.txt`);
      expect(res.text).toBe(RAW.toString('utf8'));
    });

    test('GET /policies/:id/file encodes non-ASCII file names', async () => {
      const { app } = setup();
      await uploadPolicy(app, { filename: 'नीति.txt' });

      const res = await request(app).get(`/policies/${ID}/file`);

      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="____.txt"; filename*=UTF-8''${encodeURIComponent('नीति.txt')}`,
      );
    });

    test('GET /policies/:id/parsed downloads the parsed text', async () => {
      const { app } = setup();
      await uploadPolicy(app);

      const res = await request(app).get(`/policies/${ID}/parsed`);

      expect(res.status).toBe(200);
      expect(res.text).toBe(RAW.toString('utf8'));
    });

    test('POST /policies/:id/reindex queues re-indexing with 202', async () => {
      const { app, ragClient, runQueuedJobs } = setup();
      await uploadPolicy(app);
      await runQueuedJobs();
      ragClient.chunks = 9;

      const res = await request(app).post(`/policies/${ID}/reindex`);
      await runQueuedJobs();
      const status = await request(app).get(`/policies/${ID}/status`);

      expect(res.status).toBe(202);
      expect(res.body.job).toMatchObject({ type: 'INDEX', status: 'PENDING' });
      expect(res.body.document.extraction_status).toBe('PENDING');
      expect(status.body.indexing).toMatchObject({ status: 'COMPLETED', chunk_count: 9 });
    });
  });

  describe('summaries', () => {
    test('GET /policies/:id/summary returns 404 with the status while it is being prepared', async () => {
      const { app } = setup();
      await uploadPolicy(app);

      const res = await request(app).get(`/policies/${ID}/summary`);

      expect(res.status).toBe(404);
      expect(res.body.details).toEqual({ summary_status: 'PENDING', summary_error: null });
    });

    test('GET /policies/:id/summary returns the three point-wise sections as JSON', async () => {
      const { app, runQueuedJobs } = setup();
      await uploadPolicy(app);
      await runQueuedJobs();

      const res = await request(app).get(`/policies/${ID}/summary`);

      expect(res.status).toBe(200);
      expect(res.body.document_id).toBe(ID);
      expect(res.body.sections.map((s) => [s.number, s.title, s.question, s.points])).toEqual([
        [1, 'Eligibility', 'Who are eligible', ['eligibility point']],
        [2, 'Benefits', 'What are the benefits', ['benefit point']],
        [3, 'Requirements', 'What are the required documents or proofs', []],
      ]);
    });

    test('GET /policies/:id/summary?format=markdown returns numbered Markdown sections', async () => {
      const { app, runQueuedJobs } = setup();
      await uploadPolicy(app);
      await runQueuedJobs();

      const res = await request(app).get(`/policies/${ID}/summary?format=markdown`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(res.text).toBe(
        [
          '# Summary: test-scheme',
          '',
          '## Section 1: Eligibility (Who are eligible)',
          '1. eligibility point',
          '',
          '## Section 2: Benefits (What are the benefits)',
          '1. benefit point',
          '',
          '## Section 3: Requirements (What are the required documents or proofs)',
          'Not stated in the document.',
          '',
        ].join('\n'),
      );
    });

    test('GET /policies/:id/summary rejects an unknown format', async () => {
      const { app } = setup();
      await uploadPolicy(app);

      expect((await request(app).get(`/policies/${ID}/summary?format=xml`)).status).toBe(400);
    });

    test('GET /policies/:id/summary reports a FAILED summary with its error', async () => {
      const { app, ragClient, runQueuedJobs } = setup({ maxAttempts: 1 });
      ragClient.summaryError = new RagClientError('rag-service responded 503: no key', 503);
      await uploadPolicy(app);
      await runQueuedJobs();

      const res = await request(app).get(`/policies/${ID}/summary`);

      expect(res.status).toBe(404);
      expect(res.body.details).toEqual({ summary_status: 'FAILED', summary_error: 'rag-service responded 503: no key' });
    });

    test('POST /policies/:id/summarize queues regeneration with 202', async () => {
      const { app, ragClient, runQueuedJobs } = setup();
      await uploadPolicy(app);
      await runQueuedJobs();
      ragClient.summary = { eligibility: [], benefits: ['regenerated benefit'], requirements: [] };

      const res = await request(app).post(`/policies/${ID}/summarize`);
      await runQueuedJobs();
      const summary = await request(app).get(`/policies/${ID}/summary`);

      expect(res.status).toBe(202);
      expect(res.body.job).toMatchObject({ type: 'SUMMARIZE', status: 'PENDING' });
      expect(summary.body.sections[1].points).toEqual(['regenerated benefit']);
    });
  });
});

// tests/fixtures/sample-policy.txt is a small, clearly labelled fictional policy (also handy for manual curl testing).
describe('sample policy fixture', () => {
  const SAMPLE = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-policy.txt'));
  const SAMPLE_ID = createHash('sha256').update(SAMPLE).digest('hex');

  test('is valid UTF-8 text that is labelled as fictional test data', () => {
    const text = extractPlainText(SAMPLE);

    expect(text.startsWith('TEST DATA - FICTIONAL DOCUMENT')).toBe(true);
    for (const heading of ['Eligibility', 'Benefits', 'Required Documents']) expect(text).toContain(heading);
  });

  test('uploads, processes in the background and is served back unchanged', async () => {
    const context = createTestContext();
    const app = createApp({ policyService: context.service }); // default 10 MiB upload limit

    const res = await request(app)
      .post('/policies')
      .attach('file', SAMPLE, 'sample-policy.txt')
      .field('scheme_name', 'Sample Village Solar Pump Assistance Scheme')
      .field('department', 'Sample Department of Testing')
      .field('release_date', '2026-01-15');
    await context.runQueuedJobs();
    const status = await request(app).get(`/policies/${SAMPLE_ID}/status`);
    const file = await request(app).get(`/policies/${SAMPLE_ID}/file`);

    expect(res.status).toBe(202);
    expect(res.body.document).toMatchObject({ document_id: SAMPLE_ID, release_date: '2026-01-15' });
    expect(status.body.processing_status).toBe('COMPLETED');
    expect(context.ragClient.calls[0]).toMatchObject({
      documentId: SAMPLE_ID,
      filename: 'sample-policy.txt',
      text: SAMPLE.toString('utf8'),
      metadata: { scheme_name: 'Sample Village Solar Pump Assistance Scheme', release_date: '2026-01-15' },
    });
    expect(context.ragClient.summaryCalls[0].text).toBe(SAMPLE.toString('utf8'));
    expect(file.text).toBe(SAMPLE.toString('utf8'));
  });
});
