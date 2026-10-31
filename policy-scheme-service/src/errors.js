// Errors carrying an HTTP status; the app's error handler turns them into JSON responses.
class AppError extends Error {
  constructor(status, message, { details, cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    if (details) this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(422, message, { details });
  }
}

class InvalidDocumentError extends AppError {
  constructor(message) {
    super(400, message);
  }
}

class UnsupportedFileTypeError extends AppError {
  constructor(message) {
    super(415, message);
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(404, message);
  }
}

class StorageUnavailableError extends AppError {
  constructor(message = 'Object storage is unavailable', options = {}) {
    super(503, message, options);
  }
}

class SummaryNotAvailableError extends AppError {
  constructor(document) {
    super(404, `Summary is not available (status: ${document.summary_status ?? 'NOT_GENERATED'})`, {
      details: { summary_status: document.summary_status, summary_error: document.summary_error },
    });
  }
}

// Internal errors, translated by the service layer.
class ObjectNotFoundError extends Error {
  constructor(key) {
    super(`Object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
    this.key = key;
  }
}

class DuplicateDocumentError extends Error {
  constructor(documentId) {
    super(`Document already catalogued: ${documentId}`);
    this.name = 'DuplicateDocumentError';
  }
}

class RagClientError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'RagClientError';
    this.status = status;
  }
}

module.exports = {
  AppError,
  DuplicateDocumentError,
  InvalidDocumentError,
  NotFoundError,
  ObjectNotFoundError,
  RagClientError,
  StorageUnavailableError,
  SummaryNotAvailableError,
  UnsupportedFileTypeError,
  ValidationError,
};
