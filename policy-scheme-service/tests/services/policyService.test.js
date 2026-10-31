const { createHash } = require('node:crypto');
const {
  InvalidDocumentError,
  NotFoundError,
  RagClientError,
  StorageUnavailableError,
  SummaryNotAvailableError,
  UnsupportedFileTypeError,
  ValidationError,
} = require('../../src/errors');
const { createTestContext } = require('../helpers/testContext');

const RAW = Buffer.from('Plain text content used by the upload tests.\r\nSecond line.', 'utf8');
const PARSED = 'Plain text content used by the upload tests.\nSecond line.';
const ID = createHash('sha256').update(RAW).digest('hex');
const METADATA = { scheme_name: 'test-scheme', department: 'test-department', category: 'test-category', language: 'en' };

const upload = (service, overrides = {}) =>
  service.upload({ buffer: RAW, originalFilename: 'upload.txt', metadata: METADATA, ...overrides });

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const jobTypes = (jobs) => jobs.map((job) => job.type);

describe('PolicyService.upload', () => {
  test('stores the raw file and parsed text under the SHA-256 of the raw bytes', async () => {
    const { service, objectStore } = createTestContext();

    const { document, duplicate } = await upload(service);

    expect(duplicate).toBe(false);
    expect(document.document_id).toBe(ID);
    expect(objectStore.objects.get(`raw/${ID}.txt`).body.equals(RAW)).toBe(true);
    expect(objectStore.objects.get(`parsed/${ID}.txt`).body.toString('utf8')).toBe(PARSED);
  });

  test('returns before processing, with indexing and summarising queued as background jobs', async () => {
    const { service, ragClient, jobs } = createTestContext();

    const result = await upload(service);

    expect(result.document).toMatchObject({ extraction_status: 'PENDING', summary_status: 'PENDING' });
    expect(jobTypes(result.jobs)).toEqual(['INDEX', 'SUMMARIZE']);
    expect(result.jobs.every((job) => job.status === 'PENDING' && job.document_id === ID)).toBe(true);
    expect(jobs.listForDocument(ID)).toHaveLength(2);
    expect(ragClient.calls).toHaveLength(0);
    expect(ragClient.summaryCalls).toHaveLength(0);
  });

  test('catalogues provenance and metatags', async () => {
    const { service, catalog } = createTestContext();

    const { document } = await upload(service);

    expect(document).toMatchObject({
      original_filename: 'upload.txt',
      mime_type: 'text/plain',
      size_bytes: RAW.length,
      storage_path: `s3://test-bucket/raw/${ID}.txt`,
      parsed_text_path: `s3://test-bucket/parsed/${ID}.txt`,
      ...METADATA,
    });
    expect(catalog.findById(ID)).toEqual(document);
  });

  test('does not store, queue or process an identical file uploaded under another name', async () => {
    const { service, catalog, objectStore, jobs } = createTestContext();
    await upload(service);

    const result = await upload(service, { originalFilename: 'renamed.txt' });

    expect(result.duplicate).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(result.document.original_filename).toBe('upload.txt');
    expect(jobs.listForDocument(ID)).toHaveLength(2);
    expect(catalog.list()).toHaveLength(1);
    expect(objectStore.objects.size).toBe(2);
  });

  test('catalogues nothing and queues nothing when storage is unavailable', async () => {
    const { service, catalog, objectStore, jobs } = createTestContext();
    objectStore.failWith = new StorageUnavailableError('Object storage is unavailable');

    await expect(upload(service)).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(catalog.findById(ID)).toBeNull();
    expect(jobs.list()).toHaveLength(0);
  });

  test.each([
    ['an unsupported file type', { originalFilename: 'scheme.pdf' }, UnsupportedFileTypeError],
    ['invalid UTF-8', { buffer: Buffer.from([0x63, 0x61, 0x66, 0xe9]) }, InvalidDocumentError],
    ['missing metatags', { metadata: {} }, ValidationError],
  ])('rejects %s before storing anything', async (_, overrides, ErrorType) => {
    const { service, catalog, objectStore, jobs } = createTestContext();

    await expect(upload(service, overrides)).rejects.toBeInstanceOf(ErrorType);
    expect(objectStore.objects.size).toBe(0);
    expect(catalog.list()).toHaveLength(0);
    expect(jobs.list()).toHaveLength(0);
  });

  test.each(['../../etc/upload.txt', 'C:\\docs\\upload.txt'])('keeps only the base name of %s', async (name) => {
    const { service } = createTestContext();

    const { document } = await upload(service, { originalFilename: name });

    expect(document.original_filename).toBe('upload.txt');
  });
});

describe('PolicyService background jobs', () => {
  test('indexing sends the parsed text to rag-service linked by document_id', async () => {
    const { service, ragClient, catalog, runQueuedJobs } = createTestContext();
    await upload(service);

    await runQueuedJobs();

    expect(ragClient.calls).toEqual([
      {
        documentId: ID,
        filename: 'upload.txt',
        text: PARSED,
        metadata: { scheme_name: 'test-scheme', department: 'test-department', category: 'test-category' },
      },
    ]);
    expect(catalog.findById(ID)).toMatchObject({ extraction_status: 'COMPLETED', chunk_count: 3, error_message: null });
  });

  test('summarising stores the 3-section summary', async () => {
    const { service, ragClient, objectStore, catalog, runQueuedJobs } = createTestContext();
    await upload(service);

    await runQueuedJobs();

    expect(ragClient.summaryCalls).toEqual([{ text: PARSED, schemeName: 'test-scheme' }]);
    expect(catalog.findById(ID)).toMatchObject({
      summary_status: 'COMPLETED',
      summary_path: `s3://test-bucket/summaries/${ID}.json`,
      summary_error: null,
    });
    const stored = objectStore.objects.get(`summaries/${ID}.json`);
    expect(stored.contentType).toBe('application/json; charset=utf-8');
    expect(JSON.parse(stored.body.toString('utf8'))).toEqual({
      document_id: ID,
      scheme_name: 'test-scheme',
      generated_at: '2026-01-01T00:00:00.000Z',
      sections: [
        { number: 1, key: 'eligibility', title: 'Eligibility', question: 'Who are eligible', points: ['eligibility point'] },
        { number: 2, key: 'benefits', title: 'Benefits', question: 'What are the benefits', points: ['benefit point'] },
        {
          number: 3,
          key: 'requirements',
          title: 'Requirements',
          question: 'What are the required documents or proofs',
          points: [],
        },
      ],
    });
  });

  test('marks the step and its job PROCESSING while the job runs', async () => {
    const { service, ragClient, catalog, jobs } = createTestContext();
    await upload(service);
    let release;
    ragClient.hold = new Promise((resolve) => {
      release = resolve;
    });

    const job = jobs.claimNext();
    const running = service.runJob(job);
    await new Promise((resolve) => setImmediate(resolve));

    expect(catalog.findById(ID).extraction_status).toBe('PROCESSING');
    expect(jobs.findById(job.job_id).status).toBe('PROCESSING');
    release();
    await running;
    expect(catalog.findById(ID).extraction_status).toBe('COMPLETED');
    expect(jobs.findById(job.job_id).status).toBe('COMPLETED');
  });

  test('a temporary failure is retried later; the step stays PENDING with the last error', async () => {
    const { service, ragClient, catalog, jobs, now, runQueuedJobs } = createTestContext({ retryBaseMs: 1000 });
    await upload(service);
    ragClient.error = new RagClientError('rag-service is unreachable: ECONNREFUSED', undefined);

    await runQueuedJobs();

    expect(catalog.findById(ID)).toMatchObject({
      extraction_status: 'PENDING',
      error_message: 'rag-service is unreachable: ECONNREFUSED',
      summary_status: 'COMPLETED', // the summary does not depend on indexing
    });
    const [, indexJob] = jobs.listForDocument(ID);
    expect(indexJob).toMatchObject({ type: 'INDEX', status: 'PENDING', attempts: 1 });

    ragClient.error = null;
    now.advance(1000);
    await runQueuedJobs();

    expect(catalog.findById(ID)).toMatchObject({ extraction_status: 'COMPLETED', error_message: null });
  });

  test('a step is marked FAILED after its last attempt', async () => {
    const { service, ragClient, catalog, now, runQueuedJobs } = createTestContext({ maxAttempts: 2, retryBaseMs: 1000 });
    await upload(service);
    ragClient.error = new RagClientError('rag-service responded 503: OPENROUTER_API_KEY is not set', 503);

    await runQueuedJobs();
    now.advance(1000);
    await runQueuedJobs();

    expect(catalog.findById(ID)).toMatchObject({
      extraction_status: 'FAILED',
      error_message: 'rag-service responded 503: OPENROUTER_API_KEY is not set',
    });
  });

  test('client errors (4xx) from rag-service are not retried', async () => {
    const { service, ragClient, catalog, jobs, runQueuedJobs } = createTestContext();
    await upload(service);
    ragClient.error = new RagClientError('rag-service responded 400: Document contains no text', 400);

    await runQueuedJobs();

    expect(catalog.findById(ID).extraction_status).toBe('FAILED');
    expect(jobs.listForDocument(ID).find((job) => job.type === 'INDEX')).toMatchObject({ status: 'FAILED', attempts: 1 });
  });

  test('a failed summary does not affect indexing', async () => {
    const { service, ragClient, catalog, runQueuedJobs } = createTestContext({ maxAttempts: 1 });
    await upload(service);
    ragClient.summaryError = new RagClientError('rag-service responded 503: OPENAI_API_KEY is not set', 503);

    await runQueuedJobs();

    expect(catalog.findById(ID)).toMatchObject({
      extraction_status: 'COMPLETED',
      summary_status: 'FAILED',
      summary_error: 'rag-service responded 503: OPENAI_API_KEY is not set',
    });
  });

  test('a summary that cannot be stored is recorded as a failure', async () => {
    const { service, objectStore, catalog, runQueuedJobs } = createTestContext({ maxAttempts: 1 });
    await upload(service);
    objectStore.failWith = new StorageUnavailableError('Could not write to object storage');
    objectStore.failWhen = (key) => key.startsWith('summaries/');

    await runQueuedJobs();

    expect(catalog.findById(ID)).toMatchObject({ summary_status: 'FAILED', summary_error: 'Could not write to object storage' });
  });

  test('a job whose stored text is missing fails at once, without retries', async () => {
    const { service, objectStore, catalog, jobs, runQueuedJobs } = createTestContext();
    await upload(service);
    objectStore.objects.delete(`parsed/${ID}.txt`);

    await runQueuedJobs();

    expect(catalog.findById(ID)).toMatchObject({
      extraction_status: 'FAILED',
      error_message: 'Stored file is missing from object storage',
      summary_status: 'FAILED',
      summary_error: 'Stored file is missing from object storage',
    });
    expect(jobs.listForDocument(ID).map((job) => [job.status, job.attempts])).toEqual([
      ['FAILED', 1],
      ['FAILED', 1],
    ]);
  });

  test('re-uploading a file queues only the steps that FAILED', async () => {
    const { service, ragClient, catalog, runQueuedJobs } = createTestContext();
    await upload(service);
    ragClient.error = new RagClientError('rag-service responded 400: bad', 400);
    await runQueuedJobs();
    ragClient.error = null;

    const result = await upload(service);

    expect(result.duplicate).toBe(true);
    expect(jobTypes(result.jobs)).toEqual(['INDEX']);
    expect(result.document).toMatchObject({ extraction_status: 'PENDING', error_message: null, summary_status: 'COMPLETED' });
    await runQueuedJobs();
    expect(catalog.findById(ID).extraction_status).toBe('COMPLETED');
    expect(ragClient.summaryCalls).toHaveLength(1);
  });

  test('recover re-queues jobs that were interrupted mid-processing', async () => {
    const { service, catalog, jobs } = createTestContext();
    await upload(service);
    const job = jobs.claimNext();
    catalog.markIndexProcessing(ID);

    expect(service.recover()).toBe(1);
    expect(jobs.findById(job.job_id).status).toBe('PENDING');
    expect(catalog.findById(ID).extraction_status).toBe('PENDING');
  });
});

describe('PolicyService.status', () => {
  test('reports PENDING right after upload, with the queued jobs', async () => {
    const { service } = createTestContext();
    await upload(service);

    const status = service.status(ID);

    expect(status).toMatchObject({
      document_id: ID,
      processing_status: 'PENDING',
      indexing: { status: 'PENDING', chunk_count: null, error: null },
      summary: { status: 'PENDING', error: null },
    });
    expect(jobTypes(status.jobs)).toEqual(['SUMMARIZE', 'INDEX']);
  });

  test('reports PROCESSING while any step is running', async () => {
    const { service, catalog } = createTestContext();
    await upload(service);
    catalog.markSummaryProcessing(ID);

    expect(service.status(ID).processing_status).toBe('PROCESSING');
  });

  test('reports COMPLETED once both steps are done', async () => {
    const { service, runQueuedJobs } = createTestContext();
    await upload(service);
    await runQueuedJobs();

    expect(service.status(ID)).toMatchObject({
      processing_status: 'COMPLETED',
      indexing: { status: 'COMPLETED', chunk_count: 3 },
      summary: { status: 'COMPLETED' },
    });
  });

  test('reports FAILED when a step failed and nothing is still running', async () => {
    const { service, ragClient, runQueuedJobs } = createTestContext({ maxAttempts: 1 });
    await upload(service);
    ragClient.summaryError = new RagClientError('upstream', 502);
    await runQueuedJobs();

    expect(service.status(ID)).toMatchObject({ processing_status: 'FAILED', summary: { status: 'FAILED', error: 'upstream' } });
  });

  test('reports a summary that was never generated as NOT_STARTED', async () => {
    const { service, catalog, runQueuedJobs } = createTestContext();
    await upload(service);
    await runQueuedJobs();
    catalog.db.prepare('UPDATE document_catalog SET summary_status = NULL').run();

    expect(service.status(ID)).toMatchObject({ processing_status: 'INCOMPLETE', summary: { status: 'NOT_STARTED' } });
  });
});

describe('PolicyService queries', () => {
  test('get returns a catalogued document', async () => {
    const { service } = createTestContext();
    await upload(service);

    expect(service.get(ID).document_id).toBe(ID);
  });

  test('get rejects unknown and malformed ids', () => {
    const { service } = createTestContext();

    expect(() => service.get('f'.repeat(64))).toThrow(NotFoundError);
    expect(() => service.get('not-a-hash')).toThrow(expect.objectContaining({ status: 400 }));
  });

  test('list filters the catalogue', async () => {
    const { service } = createTestContext();
    await upload(service);

    expect(service.list({ department: 'test-department' })).toHaveLength(1);
    expect(service.list({ status: 'PENDING' })).toHaveLength(1);
    expect(service.list({ department: 'other' })).toHaveLength(0);
  });

  test.each([{ status: 'DONE' }, { limit: '0' }, { limit: '101' }, { offset: '-1' }, { limit: 'abc' }])(
    'list rejects invalid query %o',
    (query) => {
      expect(() => createTestContext().service.list(query)).toThrow(ValidationError);
    },
  );

  test('listJobs filters jobs by status', async () => {
    const { service, jobs } = createTestContext();
    await upload(service);
    jobs.claimNext();

    expect(jobTypes(service.listJobs({ status: 'PROCESSING' }))).toEqual(['INDEX']);
    expect(jobTypes(service.listJobs({ status: 'PENDING' }))).toEqual(['SUMMARIZE']);
    expect(service.listJobs()).toHaveLength(2);
  });

  test.each([{ status: 'QUEUED' }, { limit: '0' }])('listJobs rejects invalid query %o', (query) => {
    expect(() => createTestContext().service.listJobs(query)).toThrow(ValidationError);
  });
});

describe('PolicyService.openFile', () => {
  test('streams the original file right after upload, before processing', async () => {
    const { service } = createTestContext();
    await upload(service);

    const file = await service.openFile(ID, 'raw');

    expect(file.filename).toBe('upload.txt');
    expect(file.contentType).toBe('text/plain; charset=utf-8');
    expect((await readAll(file.body)).equals(RAW)).toBe(true);
  });

  test('streams the parsed text', async () => {
    const { service } = createTestContext();
    await upload(service);

    const file = await service.openFile(ID, 'parsed');

    expect(file.filename).toBe('upload.parsed.txt');
    expect((await readAll(file.body)).toString('utf8')).toBe(PARSED);
  });

  test('reports a catalogued file missing from storage as not found', async () => {
    const { service, objectStore } = createTestContext();
    await upload(service);
    objectStore.objects.clear();

    await expect(service.openFile(ID, 'raw')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('PolicyService reindex and summarize', () => {
  test('reindex queues an INDEX job that re-sends the stored parsed text', async () => {
    const { service, ragClient, catalog, runQueuedJobs } = createTestContext();
    await upload(service);
    await runQueuedJobs();
    ragClient.chunks = 5;

    const { document, job } = service.reindex(ID);

    expect(job).toMatchObject({ type: 'INDEX', status: 'PENDING' });
    expect(document.extraction_status).toBe('PENDING');
    await runQueuedJobs();
    expect(catalog.findById(ID)).toMatchObject({ extraction_status: 'COMPLETED', chunk_count: 5 });
    expect(ragClient.calls[1]).toMatchObject({ documentId: ID, text: PARSED });
  });

  test('reindex returns the job already queued instead of queuing a second one', async () => {
    const { service, jobs } = createTestContext();
    const { jobs: queued } = await upload(service);

    const { job } = service.reindex(ID);

    expect(job.job_id).toBe(queued[0].job_id);
    expect(jobs.listForDocument(ID)).toHaveLength(2);
  });

  test('summarize queues a SUMMARIZE job that regenerates the summary', async () => {
    const { service, ragClient, runQueuedJobs } = createTestContext();
    await upload(service);
    await runQueuedJobs();
    ragClient.summary = { eligibility: ['new eligibility point'], benefits: [], requirements: ['new requirement'] };

    const { job } = service.summarize(ID);
    await runQueuedJobs();

    expect(job).toMatchObject({ type: 'SUMMARIZE', status: 'PENDING' });
    const summary = await service.getSummary(ID);
    expect(summary.sections.map((section) => section.points)).toEqual([['new eligibility point'], [], ['new requirement']]);
  });

  test.each(['reindex', 'summarize'])('%s rejects unknown documents', (method) => {
    expect(() => createTestContext().service[method]('f'.repeat(64))).toThrow(NotFoundError);
  });
});

describe('PolicyService.getSummary', () => {
  test('returns the stored summary once its job has run', async () => {
    const { service, runQueuedJobs } = createTestContext();
    await upload(service);
    await runQueuedJobs();

    const summary = await service.getSummary(ID);

    expect(summary.sections.map((section) => section.title)).toEqual(['Eligibility', 'Benefits', 'Requirements']);
  });

  test('reports a summary that is still being prepared', async () => {
    const { service } = createTestContext();
    await upload(service);

    const error = await service.getSummary(ID).catch((e) => e);

    expect(error).toBeInstanceOf(SummaryNotAvailableError);
    expect(error.status).toBe(404);
    expect(error.details).toEqual({ summary_status: 'PENDING', summary_error: null });
  });
});
