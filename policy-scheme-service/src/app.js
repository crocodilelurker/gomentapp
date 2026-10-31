const { pipeline } = require('node:stream/promises');
const express = require('express');
const multer = require('multer');
const { AppError } = require('./errors');
const { renderSummaryMarkdown } = require('./summary/summaryFormat');

const SUMMARY_FORMATS = ['json', 'markdown'];

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// RFC 6266 / 5987: ASCII fallback plus the exact UTF-8 name.
function contentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function sendFile(res, file) {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', contentDisposition(file.filename));
  if (file.contentLength != null) res.setHeader('Content-Length', file.contentLength);
  await pipeline(file.body, res);
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message });
  }
  if (err instanceof AppError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

function createApp({ policyService, maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES }) {
  const app = express();
  app.disable('x-powered-by');

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1, fields: 20 },
    defParamCharset: 'utf8', // keep non-ASCII file names (e.g. Devanagari) intact
  });

  app.get('/health', (req, res) => {
    res.json({ service: 'policy-scheme-service', status: 'ok' });
  });

  app.post('/policies', upload.single('file'), async (req, res) => {
    if (!req.file) throw new AppError(400, "A policy file is required in the 'file' field");
    const { document, duplicate, jobs } = await policyService.upload({
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      metadata: req.body ?? {},
    });
    // 202: indexing/summarising were queued and run in the background; follow them at /policies/:id/status.
    res.status(jobs.length ? 202 : 200).json({ document, duplicate, jobs });
  });

  app.get('/policies', (req, res) => {
    res.json({ documents: policyService.list(req.query) });
  });

  app.get('/policies/:id', (req, res) => {
    res.json({ document: policyService.get(req.params.id) });
  });

  app.get('/policies/:id/status', (req, res) => {
    res.json(policyService.status(req.params.id));
  });

  app.get('/jobs', (req, res) => {
    res.json({ jobs: policyService.listJobs(req.query) });
  });

  app.get('/policies/:id/file', async (req, res) => {
    await sendFile(res, await policyService.openFile(req.params.id, 'raw'));
  });

  app.get('/policies/:id/parsed', async (req, res) => {
    await sendFile(res, await policyService.openFile(req.params.id, 'parsed'));
  });

  app.post('/policies/:id/reindex', (req, res) => {
    res.status(202).json(policyService.reindex(req.params.id));
  });

  app.get('/policies/:id/summary', async (req, res) => {
    const format = req.query.format ?? 'json';
    if (!SUMMARY_FORMATS.includes(format)) throw new AppError(400, `format must be one of ${SUMMARY_FORMATS.join(', ')}`);
    const summary = await policyService.getSummary(req.params.id);
    if (format === 'markdown') return res.type('text/markdown; charset=utf-8').send(renderSummaryMarkdown(summary));
    return res.json(summary);
  });

  app.post('/policies/:id/summarize', (req, res) => {
    res.status(202).json(policyService.summarize(req.params.id));
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
