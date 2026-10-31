const { STATUS, STATUSES } = require('../catalog/documentCatalog');
const {
  AppError,
  DuplicateDocumentError,
  NotFoundError,
  ObjectNotFoundError,
  RagClientError,
  SummaryNotAvailableError,
  UnsupportedFileTypeError,
  ValidationError,
} = require('../errors');
const { JOB_TYPES } = require('../jobs/jobQueue');
const { SUPPORTED_EXTENSIONS, resolveFileType } = require('../lib/fileTypes');
const { sha256Hex } = require('../lib/hash');
const { buildSummary } = require('../summary/summaryFormat');
const { validatePolicyMetadata } = require('../validation/policyMetadata');

const DOCUMENT_ID_PATTERN = /^[a-f0-9]{64}$/;
const PARSED_CONTENT_TYPE = 'text/plain; charset=utf-8';
const SUMMARY_CONTENT_TYPE = 'application/json; charset=utf-8';
const RAG_METADATA_FIELDS = ['scheme_name', 'department', 'release_date', 'category'];
const MAX_FILENAME_LENGTH = 255;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const NOT_STARTED = 'NOT_STARTED';

// Catalog methods that track each background step's status.
const STEPS = {
  [JOB_TYPES.INDEX]: { queued: 'markIndexQueued', processing: 'markIndexProcessing', failed: 'markIndexFailed' },
  [JOB_TYPES.SUMMARIZE]: { queued: 'markSummaryQueued', processing: 'markSummaryProcessing', failed: 'markSummaryFailed' },
};

// Content-addressed object keys: the same file always lands at the same key.
const rawObjectKey = (documentId, extension) => `raw/${documentId}${extension}`;
const parsedObjectKey = (documentId) => `parsed/${documentId}.txt`;
const summaryObjectKey = (documentId) => `summaries/${documentId}.json`;
const objectKeyFromUri = (uri) => new URL(uri).pathname.slice(1);

const stem = (filename) => filename.replace(/\.[^.]*$/, '');

// Keep only the base name (no directories, no control characters), capped in length but keeping the extension.
function normalizeFilename(filename) {
  const name = String(filename)
    .split(/[\\/]/)
    .pop()
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  if (name.length <= MAX_FILENAME_LENGTH) return name;
  const extension = name.slice(stem(name).length);
  return stem(name).slice(0, MAX_FILENAME_LENGTH - extension.length) + extension;
}

function pickDefined(record, fields) {
  return Object.fromEntries(fields.filter((field) => record[field] != null).map((field) => [field, record[field]]));
}

function parseIntParam(value, { name, fallback, min, max }, errors) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (typeof value !== 'string' || !Number.isInteger(number) || number < min || number > max) {
    errors[name] = max === Infinity ? `must be an integer >= ${min}` : `must be an integer between ${min} and ${max}`;
  }
  return number;
}

// One status for the whole document: anything running wins, then anything waiting, then any failure.
function overallStatus(statuses) {
  for (const status of [STATUS.PROCESSING, STATUS.PENDING, STATUS.FAILED]) {
    if (statuses.includes(status)) return status;
  }
  return statuses.every((status) => status === STATUS.COMPLETED) ? STATUS.COMPLETED : 'INCOMPLETE';
}

// Errors that will not go away by retrying: a 4xx from rag-service or a stored file that is missing.
function isPermanent(error) {
  return error instanceof NotFoundError || (error instanceof RagClientError && error.status >= 400 && error.status < 500);
}

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Owns policy documents across the three stores:
 *   object storage  — immutable raw file, parsed text and summary, keyed by SHA-256
 *   catalog         — provenance, metatags, indexing and summary status
 *   rag-service     — chunks + embeddings (linked back by document_id) and point-wise summaries
 *
 * Uploads return as soon as the files are stored and catalogued. Indexing and summarising run as
 * background jobs (see JobQueue / JobWorker); each step moves PENDING -> PROCESSING -> COMPLETED | FAILED.
 */
class PolicyService {
  constructor({ catalog, jobs, objectStore, ragClient, now = () => new Date() }) {
    this.catalog = catalog;
    this.jobs = jobs;
    this.objectStore = objectStore;
    this.ragClient = ragClient;
    this.now = now;
  }

  // Returns { document, duplicate, jobs } — `jobs` are the background jobs queued by this upload.
  async upload({ buffer, originalFilename, metadata }) {
    const filename = normalizeFilename(originalFilename ?? '');
    const fileType = resolveFileType(filename);
    if (!fileType) throw new UnsupportedFileTypeError(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    const tags = validatePolicyMetadata(metadata);
    const text = fileType.extract(buffer);
    const documentId = sha256Hex(buffer);

    // Idempotency: an identical file is never stored or processed twice. Only FAILED (or never-run) steps are queued again.
    const existing = this.catalog.findById(documentId);
    if (existing) {
      const types = [];
      if (existing.extraction_status === STATUS.FAILED) types.push(JOB_TYPES.INDEX);
      if (existing.summary_status === STATUS.FAILED || existing.summary_status === null) types.push(JOB_TYPES.SUMMARIZE);
      const jobs = types.map((type) => this.#queue(documentId, type));
      return { document: this.catalog.findById(documentId), duplicate: true, jobs };
    }

    const rawKey = rawObjectKey(documentId, fileType.extension);
    const parsedKey = parsedObjectKey(documentId);
    // Files first, catalog second: a catalog row always points at objects that exist.
    await this.objectStore.putObject(rawKey, buffer, fileType.contentType);
    await this.objectStore.putObject(parsedKey, Buffer.from(text, 'utf8'), PARSED_CONTENT_TYPE);
    try {
      this.catalog.insert({
        document_id: documentId,
        original_filename: filename,
        mime_type: fileType.mimeType,
        size_bytes: buffer.length,
        storage_path: this.objectStore.uri(rawKey),
        parsed_text_path: this.objectStore.uri(parsedKey),
        ...tags,
      });
    } catch (error) {
      if (!(error instanceof DuplicateDocumentError)) throw error;
      return { document: this.catalog.findById(documentId), duplicate: true, jobs: [] }; // concurrent identical upload won
    }

    const jobs = [JOB_TYPES.INDEX, JOB_TYPES.SUMMARIZE].map((type) => this.#queue(documentId, type));
    return { document: this.catalog.findById(documentId), duplicate: false, jobs };
  }

  get(documentId) {
    if (!DOCUMENT_ID_PATTERN.test(documentId)) throw new AppError(400, 'Invalid document id');
    const document = this.catalog.findById(documentId);
    if (!document) throw new NotFoundError('Document not found');
    return document;
  }

  list(query = {}) {
    const errors = {};
    const filters = {};
    for (const key of ['department', 'category']) {
      if (query[key] === undefined) continue;
      if (typeof query[key] === 'string') filters[key] = query[key];
      else errors[key] = 'must be a single value';
    }
    if (query.status !== undefined) {
      if (STATUSES.includes(query.status)) filters.status = query.status;
      else errors.status = `must be one of ${STATUSES.join(', ')}`;
    }
    filters.limit = parseIntParam(query.limit, { name: 'limit', fallback: DEFAULT_LIST_LIMIT, min: 1, max: MAX_LIST_LIMIT }, errors);
    filters.offset = parseIntParam(query.offset, { name: 'offset', fallback: 0, min: 0, max: Infinity }, errors);

    if (Object.keys(errors).length) throw new ValidationError('Invalid query parameters', errors);
    return this.catalog.list(filters);
  }

  // Where a document is in its background processing.
  status(documentId) {
    const document = this.get(documentId);
    const indexing = document.extraction_status;
    const summary = document.summary_status ?? NOT_STARTED;
    return {
      document_id: documentId,
      processing_status: overallStatus([indexing, summary]),
      indexing: { status: indexing, chunk_count: document.chunk_count, error: document.error_message },
      summary: { status: summary, error: document.summary_error },
      jobs: this.jobs.listForDocument(documentId),
    };
  }

  listJobs(query = {}) {
    const errors = {};
    const filters = {};
    if (query.status !== undefined) {
      if (STATUSES.includes(query.status)) filters.status = query.status;
      else errors.status = `must be one of ${STATUSES.join(', ')}`;
    }
    filters.limit = parseIntParam(query.limit, { name: 'limit', fallback: DEFAULT_LIST_LIMIT, min: 1, max: MAX_LIST_LIMIT }, errors);

    if (Object.keys(errors).length) throw new ValidationError('Invalid query parameters', errors);
    return this.jobs.list(filters);
  }

  async openFile(documentId, kind) {
    const document = this.get(documentId);
    const isRaw = kind === 'raw';
    const object = await this.#getObject(isRaw ? document.storage_path : document.parsed_text_path);
    return {
      body: object.body,
      contentLength: object.contentLength,
      contentType: object.contentType ?? (isRaw ? document.mime_type : PARSED_CONTENT_TYPE),
      filename: isRaw ? document.original_filename : `${stem(document.original_filename)}.parsed.txt`,
    };
  }

  // Queues re-indexing; returns { document, job }. An already queued or running job is returned instead of a new one.
  reindex(documentId) {
    this.get(documentId);
    const job = this.#queue(documentId, JOB_TYPES.INDEX);
    return { document: this.catalog.findById(documentId), job };
  }

  // Queues summary regeneration; returns { document, job }.
  summarize(documentId) {
    this.get(documentId);
    const job = this.#queue(documentId, JOB_TYPES.SUMMARIZE);
    return { document: this.catalog.findById(documentId), job };
  }

  // The stored summary: { document_id, scheme_name, generated_at, sections: [eligibility, benefits, requirements] }.
  async getSummary(documentId) {
    const document = this.get(documentId);
    if (document.summary_status !== STATUS.COMPLETED) throw new SummaryNotAvailableError(document);
    const { body } = await this.#getObject(document.summary_path);
    return JSON.parse((await readAll(body)).toString('utf8'));
  }

  // Executes one claimed background job and records its outcome on the job and on the document.
  async runJob(job) {
    const step = STEPS[job.type];
    const documentId = job.document_id;
    this.catalog[step.processing](documentId);
    try {
      const document = this.catalog.findById(documentId);
      const text = await this.#readParsedText(document);
      if (job.type === JOB_TYPES.INDEX) await this.#index(document, text);
      else await this.#summarize(document, text);
      this.jobs.complete(job.job_id);
    } catch (error) {
      if (!(error instanceof RagClientError || error instanceof AppError)) console.error(error);
      const outcome = this.jobs.fail(job.job_id, error.message, { retryable: !isPermanent(error) });
      if (outcome.status === STATUS.FAILED) this.catalog[step.failed](documentId, error.message);
      else this.catalog[step.queued](documentId, error.message); // retry scheduled
    }
  }

  // On startup: work interrupted by a restart goes back in the queue. Returns the number of re-queued jobs.
  recover() {
    this.catalog.resetInterrupted();
    return this.jobs.requeueInterrupted();
  }

  #queue(documentId, type) {
    const { job, created } = this.jobs.enqueue(documentId, type);
    if (created) this.catalog[STEPS[type].queued](documentId);
    return job;
  }

  async #index(document, text) {
    const { chunks } = await this.ragClient.ingest({
      documentId: document.document_id,
      filename: `${stem(document.original_filename)}.txt`,
      text,
      metadata: pickDefined(document, RAG_METADATA_FIELDS),
    });
    this.catalog.markIndexCompleted(document.document_id, chunks);
  }

  async #summarize(document, text) {
    const points = await this.ragClient.summarize({ text, schemeName: document.scheme_name });
    const summary = buildSummary({
      documentId: document.document_id,
      schemeName: document.scheme_name,
      generatedAt: this.now().toISOString(),
      points,
    });
    const key = summaryObjectKey(document.document_id);
    await this.objectStore.putObject(key, Buffer.from(JSON.stringify(summary, null, 2), 'utf8'), SUMMARY_CONTENT_TYPE);
    this.catalog.markSummaryCompleted(document.document_id, this.objectStore.uri(key));
  }

  async #readParsedText(document) {
    const { body } = await this.#getObject(document.parsed_text_path);
    return (await readAll(body)).toString('utf8');
  }

  async #getObject(uri) {
    try {
      return await this.objectStore.getObject(objectKeyFromUri(uri));
    } catch (error) {
      if (error instanceof ObjectNotFoundError) throw new NotFoundError('Stored file is missing from object storage');
      throw error;
    }
  }
}

module.exports = { PolicyService };
