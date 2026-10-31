import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIST = path.resolve(__dirname, 'test-dist');

describe('frontend service server', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Create temporary test-dist with a dummy index.html and asset
    fs.mkdirSync(TEST_DIST, { recursive: true });
    fs.writeFileSync(path.join(TEST_DIST, 'index.html'), '<!doctype html><html><body>Root</body></html>');
    fs.writeFileSync(path.join(TEST_DIST, 'style.css'), 'body { margin: 0; }');

    server = createServer(TEST_DIST);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(TEST_DIST, { recursive: true, force: true });
  });

  test('GET /health reports service status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { service: 'frontend', status: 'ok' });
  });

  test('GET / serves index.html with text/html content-type', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));
    const text = await res.text();
    assert.strictEqual(text, '<!doctype html><html><body>Root</body></html>');
  });

  test('GET static asset serves file with correct MIME type', async () => {
    const res = await fetch(`${baseUrl}/style.css`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/css'));
    const text = await res.text();
    assert.strictEqual(text, 'body { margin: 0; }');
  });

  test('GET client route /app falls back to index.html for SPA', async () => {
    const res = await fetch(`${baseUrl}/app`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));
    const text = await res.text();
    assert.strictEqual(text, '<!doctype html><html><body>Root</body></html>');
  });
});

