const { DatabaseSync } = require('node:sqlite');
const { DuplicateDocumentError } = require('../errors');

// Shared by document steps (indexing, summary) and background jobs.
const STATUS = { PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED', FAILED: 'FAILED' };
const STATUSES = Object.values(STATUS);

const statusCheck = (column) => `CHECK (${column} IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))`;

const SQLITE_CONSTRAINT_PRIMARYKEY = 1555;

// Relational metadata ledger: provenance and processing state of every uploaded file.
// Raw bytes live in object storage; chunks and embeddings live in the vector DB.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS document_catalog (
  document_id       TEXT PRIMARY KEY,          -- SHA-256 of the raw file bytes
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  storage_path      TEXT NOT NULL,             -- s3://<bucket>/raw/<document_id>.<ext>
  parsed_text_path  TEXT,                      -- s3://<bucket>/parsed/<document_id>.txt
  scheme_name       TEXT NOT NULL,
  department        TEXT NOT NULL,
  release_date      TEXT,
  category          TEXT,
  language          TEXT,
  jurisdiction      TEXT,
  source_url        TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'PENDING' ${statusCheck('extraction_status')},
  chunk_count       INTEGER,
  error_message     TEXT,
  summary_status    TEXT ${statusCheck('summary_status')},
  summary_path      TEXT,                      -- s3://<bucket>/summaries/<document_id>.json
  summary_error     TEXT,
  uploaded_at       TEXT NOT NULL,
  updated_at        TEXT NOT NULL
)`;

// Columns added after the first release; ALTERed into catalogues created before them.
const ADDED_COLUMNS = {
  summary_status: `TEXT ${statusCheck('summary_status')}`,
  summary_path: 'TEXT',
  summary_error: 'TEXT',
};

const COLUMNS = [
  'document_id',
  'original_filename',
  'mime_type',
  'size_bytes',
  'storage_path',
  'parsed_text_path',
  'scheme_name',
  'department',
  'release_date',
  'category',
  'language',
  'jurisdiction',
  'source_url',
  'extraction_status',
  'chunk_count',
  'error_message',
  'summary_status',
  'summary_path',
  'summary_error',
  'uploaded_at',
  'updated_at',
];

const INSERTABLE = COLUMNS.slice(0, COLUMNS.indexOf('source_url') + 1);
const FILTER_COLUMNS = { department: 'department', category: 'category', status: 'extraction_status' };

class DocumentCatalog {
  constructor(path = ':memory:', { now = () => new Date() } = {}) {
    this.db = new DatabaseSync(path);
    this.now = now;
    this.db.exec(SCHEMA);
    this.#addMissingColumns();
    this.#upgradeStatusChecks();
  }

  insert(record) {
    const now = this.now().toISOString();
    const row = Object.fromEntries(COLUMNS.map((column) => [column, null]));
    for (const column of INSERTABLE) row[column] = record[column] ?? null;
    Object.assign(row, {
      extraction_status: STATUS.PENDING,
      summary_status: STATUS.PENDING,
      uploaded_at: now,
      updated_at: now,
    });

    try {
      this.db
        .prepare(`INSERT INTO document_catalog (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => `$${c}`).join(', ')})`)
        .run(row);
    } catch (error) {
      if (error.errcode === SQLITE_CONSTRAINT_PRIMARYKEY) throw new DuplicateDocumentError(record.document_id);
      throw error;
    }
    return this.findById(record.document_id);
  }

  findById(documentId) {
    const row = this.db.prepare('SELECT * FROM document_catalog WHERE document_id = $id').get({ id: documentId });
    return row ? { ...row } : null;
  }

  list({ department, category, status, limit = 50, offset = 0 } = {}) {
    const filters = { department, category, status };
    const where = [];
    const params = { limit, offset };
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined) continue;
      where.push(`${FILTER_COLUMNS[key]} = $${key}`);
      params[key] = value;
    }
    const sql = `SELECT * FROM document_catalog
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY uploaded_at DESC, rowid DESC
      LIMIT $limit OFFSET $offset`;
    return this.db
      .prepare(sql)
      .all(params)
      .map((row) => ({ ...row }));
  }

  // Indexing step (chunks + embeddings in rag-service). `error` on a queued step is the last attempt's error.
  markIndexQueued(documentId, error = null) {
    return this.#update(documentId, { extraction_status: STATUS.PENDING, error_message: error });
  }

  markIndexProcessing(documentId) {
    return this.#update(documentId, { extraction_status: STATUS.PROCESSING });
  }

  markIndexCompleted(documentId, chunkCount) {
    return this.#update(documentId, { extraction_status: STATUS.COMPLETED, chunk_count: chunkCount, error_message: null });
  }

  markIndexFailed(documentId, message) {
    return this.#update(documentId, { extraction_status: STATUS.FAILED, error_message: message });
  }

  // Summary step.
  markSummaryQueued(documentId, error = null) {
    return this.#update(documentId, { summary_status: STATUS.PENDING, summary_error: error });
  }

  markSummaryProcessing(documentId) {
    return this.#update(documentId, { summary_status: STATUS.PROCESSING });
  }

  markSummaryCompleted(documentId, summaryPath) {
    return this.#update(documentId, { summary_status: STATUS.COMPLETED, summary_path: summaryPath, summary_error: null });
  }

  markSummaryFailed(documentId, message) {
    return this.#update(documentId, { summary_status: STATUS.FAILED, summary_error: message });
  }

  // After a restart, steps left PROCESSING were interrupted; their jobs are re-queued, so they are PENDING again.
  resetInterrupted() {
    const now = this.now().toISOString();
    this.db
      .prepare(`UPDATE document_catalog SET extraction_status = 'PENDING', updated_at = $now WHERE extraction_status = 'PROCESSING'`)
      .run({ now });
    this.db
      .prepare(`UPDATE document_catalog SET summary_status = 'PENDING', updated_at = $now WHERE summary_status = 'PROCESSING'`)
      .run({ now });
  }

  close() {
    this.db.close();
  }

  #update(documentId, fields) {
    const assignments = Object.keys(fields).map((column) => `${column} = $${column}`);
    this.db
      .prepare(`UPDATE document_catalog SET ${assignments.join(', ')}, updated_at = $updated_at WHERE document_id = $id`)
      .run({ ...fields, updated_at: this.now().toISOString(), id: documentId });
    return this.findById(documentId);
  }

  // SQLite cannot alter a CHECK constraint, so catalogues created before PROCESSING existed are rebuilt once.
  #upgradeStatusChecks() {
    const { sql } = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'document_catalog'").get();
    if (sql.includes(statusCheck('extraction_status'))) return;

    const columns = COLUMNS.join(', ');
    this.db.exec('BEGIN');
    try {
      this.db.exec(SCHEMA.replace('document_catalog', 'document_catalog_upgrade'));
      this.db.exec(`INSERT INTO document_catalog_upgrade (${columns}) SELECT ${columns} FROM document_catalog`);
      this.db.exec('DROP TABLE document_catalog');
      this.db.exec('ALTER TABLE document_catalog_upgrade RENAME TO document_catalog');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  #addMissingColumns() {
    const existing = new Set(
      this.db
        .prepare('PRAGMA table_info(document_catalog)')
        .all()
        .map((column) => column.name),
    );
    for (const [name, definition] of Object.entries(ADDED_COLUMNS)) {
      if (!existing.has(name)) this.db.exec(`ALTER TABLE document_catalog ADD COLUMN ${name} ${definition}`);
    }
  }
}

module.exports = { DocumentCatalog, STATUS, STATUSES };
