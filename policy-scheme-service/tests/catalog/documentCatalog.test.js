const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DocumentCatalog } = require('../../src/catalog/documentCatalog');

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);
const ID_C = 'c'.repeat(64);

function record(overrides = {}) {
  return {
    document_id: ID_A,
    original_filename: 'upload.txt',
    mime_type: 'text/plain',
    size_bytes: 10,
    storage_path: `s3://bucket/raw/${ID_A}.txt`,
    parsed_text_path: `s3://bucket/parsed/${ID_A}.txt`,
    scheme_name: 's',
    department: 'd',
    ...overrides,
  };
}

// Each call advances one second, so ordering by time is deterministic.
function steppingClock() {
  let seconds = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds++));
}

function withTempDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-'));
  try {
    return fn(path.join(dir, 'catalog.db'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('DocumentCatalog', () => {
  let catalog;

  beforeEach(() => {
    catalog = new DocumentCatalog(':memory:', { now: steppingClock() });
  });

  afterEach(() => catalog.close());

  test('insert stores the record with both steps PENDING and timestamps', () => {
    expect(catalog.insert(record())).toEqual({
      ...record(),
      release_date: null,
      category: null,
      language: null,
      jurisdiction: null,
      source_url: null,
      extraction_status: 'PENDING',
      chunk_count: null,
      error_message: null,
      summary_status: 'PENDING',
      summary_path: null,
      summary_error: null,
      uploaded_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  });

  test('findById returns the stored record, or null when unknown', () => {
    const inserted = catalog.insert(record({ category: 'c' }));

    expect(catalog.findById(ID_A)).toEqual(inserted);
    expect(catalog.findById(ID_B)).toBeNull();
  });

  test('rejects a second record with the same document_id', () => {
    catalog.insert(record());

    expect(() => catalog.insert(record({ original_filename: 'other.txt' }))).toThrow();
  });

  describe('indexing status', () => {
    beforeEach(() => catalog.insert(record()));

    test('moves through PROCESSING to COMPLETED with the chunk count', () => {
      expect(catalog.markIndexProcessing(ID_A).extraction_status).toBe('PROCESSING');

      const completed = catalog.markIndexCompleted(ID_A, 12);

      expect(completed).toMatchObject({ extraction_status: 'COMPLETED', chunk_count: 12, error_message: null });
      expect(completed.uploaded_at).toBe('2026-01-01T00:00:00.000Z');
      expect(completed.updated_at).toBe('2026-01-01T00:00:02.000Z');
    });

    test('markIndexQueued sets PENDING and keeps the last error for a scheduled retry', () => {
      expect(catalog.markIndexQueued(ID_A, 'rag-service is unreachable')).toMatchObject({
        extraction_status: 'PENDING',
        error_message: 'rag-service is unreachable',
      });
      expect(catalog.markIndexQueued(ID_A).error_message).toBeNull();
    });

    test('markIndexFailed records the error', () => {
      expect(catalog.markIndexFailed(ID_A, 'boom')).toMatchObject({ extraction_status: 'FAILED', error_message: 'boom' });
    });
  });

  describe('summary status', () => {
    beforeEach(() => catalog.insert(record()));

    test('moves through PROCESSING to COMPLETED with the storage path', () => {
      expect(catalog.markSummaryProcessing(ID_A).summary_status).toBe('PROCESSING');

      expect(catalog.markSummaryCompleted(ID_A, `s3://bucket/summaries/${ID_A}.json`)).toMatchObject({
        summary_status: 'COMPLETED',
        summary_path: `s3://bucket/summaries/${ID_A}.json`,
        summary_error: null,
        extraction_status: 'PENDING',
      });
    });

    test('markSummaryQueued and markSummaryFailed record errors without touching indexing', () => {
      catalog.markIndexCompleted(ID_A, 4);

      expect(catalog.markSummaryQueued(ID_A, 'temporary')).toMatchObject({ summary_status: 'PENDING', summary_error: 'temporary' });
      expect(catalog.markSummaryFailed(ID_A, 'boom')).toMatchObject({
        summary_status: 'FAILED',
        summary_error: 'boom',
        extraction_status: 'COMPLETED',
        chunk_count: 4,
      });
    });
  });

  test('resetInterrupted turns PROCESSING steps back into PENDING', () => {
    catalog.insert(record());
    catalog.insert(record({ document_id: ID_B }));
    catalog.markIndexProcessing(ID_A);
    catalog.markSummaryProcessing(ID_A);
    catalog.markIndexCompleted(ID_B, 1);

    catalog.resetInterrupted();

    expect(catalog.findById(ID_A)).toMatchObject({ extraction_status: 'PENDING', summary_status: 'PENDING' });
    expect(catalog.findById(ID_B).extraction_status).toBe('COMPLETED');
  });

  describe('list', () => {
    beforeEach(() => {
      catalog.insert(record({ document_id: ID_A, department: 'd1', category: 'c1' }));
      catalog.insert(record({ document_id: ID_B, department: 'd2', category: 'c1' }));
      catalog.insert(record({ document_id: ID_C, department: 'd2', category: 'c2' }));
      catalog.markIndexCompleted(ID_C, 1);
      catalog.markIndexProcessing(ID_B);
    });

    const ids = (rows) => rows.map((row) => row.document_id);

    test('returns the newest uploads first', () => {
      expect(ids(catalog.list())).toEqual([ID_C, ID_B, ID_A]);
    });

    test('filters by department, category and indexing status', () => {
      expect(ids(catalog.list({ department: 'd2' }))).toEqual([ID_C, ID_B]);
      expect(ids(catalog.list({ category: 'c1' }))).toEqual([ID_B, ID_A]);
      expect(ids(catalog.list({ status: 'COMPLETED' }))).toEqual([ID_C]);
      expect(ids(catalog.list({ status: 'PROCESSING' }))).toEqual([ID_B]);
      expect(ids(catalog.list({ department: 'd2', category: 'c1' }))).toEqual([ID_B]);
    });

    test('paginates with limit and offset', () => {
      expect(ids(catalog.list({ limit: 2 }))).toEqual([ID_C, ID_B]);
      expect(ids(catalog.list({ limit: 2, offset: 2 }))).toEqual([ID_A]);
    });
  });

  test('upgrades a catalogue created before summaries and PROCESSING existed', () => {
    withTempDb((file) => {
      const old = new DatabaseSync(file);
      old.exec(`CREATE TABLE document_catalog (
        document_id TEXT PRIMARY KEY, original_filename TEXT NOT NULL, mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, storage_path TEXT NOT NULL, parsed_text_path TEXT,
        scheme_name TEXT NOT NULL, department TEXT NOT NULL, release_date TEXT, category TEXT,
        language TEXT, jurisdiction TEXT, source_url TEXT,
        extraction_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (extraction_status IN ('PENDING', 'COMPLETED', 'FAILED')),
        chunk_count INTEGER, error_message TEXT, uploaded_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
      old.exec(`INSERT INTO document_catalog (document_id, original_filename, mime_type, size_bytes, storage_path,
        scheme_name, department, extraction_status, chunk_count, uploaded_at, updated_at)
        VALUES ('${ID_A}', 'upload.txt', 'text/plain', 10, 's3://bucket/raw/a.txt', 's', 'd', 'COMPLETED', 7, 't', 't')`);
      old.close();

      const upgraded = new DocumentCatalog(file);
      expect(upgraded.findById(ID_A)).toMatchObject({
        original_filename: 'upload.txt',
        extraction_status: 'COMPLETED',
        chunk_count: 7,
        summary_status: null,
        summary_path: null,
        summary_error: null,
      });
      expect(upgraded.markIndexProcessing(ID_A).extraction_status).toBe('PROCESSING');
      expect(upgraded.markSummaryProcessing(ID_A).summary_status).toBe('PROCESSING');
      upgraded.close();
    });
  });

  test('persists records to a database file', () => {
    withTempDb((file) => {
      const first = new DocumentCatalog(file);
      first.insert(record());
      first.close();

      const reopened = new DocumentCatalog(file);
      expect(reopened.findById(ID_A)).toMatchObject({ document_id: ID_A, original_filename: 'upload.txt' });
      reopened.close();
    });
  });
});
