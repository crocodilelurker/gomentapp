const { once } = require('node:events');
const express = require('express');
const multer = require('multer');
const { RagClient } = require('../../src/clients/ragClient');
const { RagClientError } = require('../../src/errors');

const ID = 'a'.repeat(64);

// A real local HTTP server standing in for rag-service's POST /ingest and POST /summarize.
async function startRagServer(handler, summarizeHandler = (req, res) => res.status(404).end()) {
  const app = express();
  app.post('/ingest', multer().single('file'), handler);
  app.post('/summarize', express.json(), summarizeHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const close = (server) => new Promise((resolve) => server.close(resolve));

describe('RagClient', () => {
  test('posts the text as a .txt file with document_id and metadata', async () => {
    let received;
    const { server, url } = await startRagServer((req, res) => {
      received = {
        filename: req.file.originalname,
        content: req.file.buffer.toString('utf8'),
        mimetype: req.file.mimetype,
        fields: { ...req.body },
      };
      res.status(201).json({ document_id: req.body.document_id, chunks: 7 });
    });

    try {
      const result = await new RagClient({ baseUrl: url }).ingest({
        documentId: ID,
        filename: 'upload.txt',
        text: 'नमस्ते text',
        metadata: { scheme_name: 's', department: 'd', release_date: null },
      });

      expect(result).toEqual({ chunks: 7, documentId: ID });
      expect(received).toEqual({
        filename: 'upload.txt',
        content: 'नमस्ते text',
        mimetype: 'text/plain',
        fields: { document_id: ID, scheme_name: 's', department: 'd' },
      });
    } finally {
      await close(server);
    }
  });

  test('raises RagClientError with the status and detail on an error response', async () => {
    const { server, url } = await startRagServer((req, res) => res.status(503).json({ detail: 'OPENROUTER_API_KEY is not set' }));

    try {
      const error = await new RagClient({ baseUrl: url })
        .ingest({ documentId: ID, filename: 'upload.txt', text: 't', metadata: {} })
        .catch((e) => e);

      expect(error).toBeInstanceOf(RagClientError);
      expect(error.status).toBe(503);
      expect(error.message).toContain('OPENROUTER_API_KEY is not set');
    } finally {
      await close(server);
    }
  });

  test('raises RagClientError when rag-service is unreachable', async () => {
    const { server, url } = await startRagServer((req, res) => res.end());
    await close(server);

    await expect(
      new RagClient({ baseUrl: url }).ingest({ documentId: ID, filename: 'upload.txt', text: 't', metadata: {} }),
    ).rejects.toBeInstanceOf(RagClientError);
  });
});

describe('RagClient.summarize', () => {
  const noIngest = (req, res) => res.status(404).end();

  test('posts the text and scheme name as JSON and returns the three sections', async () => {
    let received;
    const sections = { eligibility: ['e'], benefits: [], requirements: ['r'] };
    const { server, url } = await startRagServer(noIngest, (req, res) => {
      received = req.body;
      res.json(sections);
    });

    try {
      const result = await new RagClient({ baseUrl: url }).summarize({ text: 'नमस्ते text', schemeName: 's' });

      expect(result).toEqual(sections);
      expect(received).toEqual({ text: 'नमस्ते text', scheme_name: 's' });
    } finally {
      await close(server);
    }
  });

  test('omits the scheme name when there is none', async () => {
    let received;
    const { server, url } = await startRagServer(noIngest, (req, res) => {
      received = req.body;
      res.json({ eligibility: [], benefits: [], requirements: [] });
    });

    try {
      await new RagClient({ baseUrl: url }).summarize({ text: 't' });

      expect(received).toEqual({ text: 't' });
    } finally {
      await close(server);
    }
  });

  test('raises RagClientError with the status and detail on an error response', async () => {
    const { server, url } = await startRagServer(noIngest, (req, res) =>
      res.status(503).json({ detail: 'OPENAI_API_KEY is not set' }),
    );

    try {
      const error = await new RagClient({ baseUrl: url }).summarize({ text: 't' }).catch((e) => e);

      expect(error).toBeInstanceOf(RagClientError);
      expect(error.status).toBe(503);
      expect(error.message).toContain('OPENAI_API_KEY is not set');
    } finally {
      await close(server);
    }
  });

  test.each([
    { eligibility: [], benefits: [] },
    { eligibility: 'x', benefits: [], requirements: [] },
    { eligibility: [1], benefits: [], requirements: [] },
  ])('raises RagClientError for a malformed summary %o', async (body) => {
    const { server, url } = await startRagServer(noIngest, (req, res) => res.json(body));

    try {
      await expect(new RagClient({ baseUrl: url }).summarize({ text: 't' })).rejects.toBeInstanceOf(RagClientError);
    } finally {
      await close(server);
    }
  });
});
