const { once } = require('node:events');
const express = require('express');
const request = require('supertest');
const { createApp } = require('../src/app');

// A real upstream server that echoes back what it received,
// so we can assert exactly what the gateway forwarded.
function startEchoServer() {
  const svc = express();
  svc.use(express.json());
  svc.use((req, res) => {
    res.json({ method: req.method, url: req.originalUrl, body: req.body ?? null });
  });
  const server = svc.listen(0, '127.0.0.1');
  return once(server, 'listening').then(() => server);
}

describe('api-gateway', () => {
  let upstream;
  let upstreamUrl;

  beforeAll(async () => {
    upstream = await startEchoServer();
    upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
  });

  afterAll(() => new Promise((resolve) => upstream.close(resolve)));

  test('GET /health reports the gateway status', async () => {
    const res = await request(createApp([])).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'api-gateway', status: 'ok' });
  });

  test('strips the gateway prefix and forwards to the target service', async () => {
    const app = createApp([{ path: '/api/svc', target: upstreamUrl, rewriteTo: '' }]);

    const res = await request(app).get('/api/svc/items?page=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ method: 'GET', url: '/items?page=2' });
  });

  test('replaces the gateway prefix with rewriteTo', async () => {
    const app = createApp([{ path: '/api/svc', target: upstreamUrl, rewriteTo: '/v1' }]);

    const res = await request(app).get('/api/svc/items');

    expect(res.body.url).toBe('/v1/items');
  });

  test('forwards a request to the bare prefix as the target root', async () => {
    const app = createApp([{ path: '/api/svc', target: upstreamUrl, rewriteTo: '' }]);

    const res = await request(app).get('/api/svc');

    expect(res.body.url).toBe('/');
  });

  test('forwards the JSON request body untouched', async () => {
    const app = createApp([{ path: '/api/svc', target: upstreamUrl, rewriteTo: '' }]);

    const res = await request(app).post('/api/svc/items').send({ title: 'x' });

    expect(res.body).toMatchObject({ method: 'POST', url: '/items', body: { title: 'x' } });
  });

  test('routes each prefix to its own target', async () => {
    const app = createApp([
      { path: '/api/a', target: upstreamUrl, rewriteTo: '/a' },
      { path: '/api/b', target: upstreamUrl, rewriteTo: '/b' },
    ]);

    const [a, b] = await Promise.all([
      request(app).get('/api/a/ping'),
      request(app).get('/api/b/ping'),
    ]);

    expect(a.body.url).toBe('/a/ping');
    expect(b.body.url).toBe('/b/ping');
  });

  test('returns 404 for paths that are not mapped', async () => {
    const app = createApp([{ path: '/api/svc', target: upstreamUrl, rewriteTo: '' }]);

    const res = await request(app).get('/api/unknown');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });

  test('returns 502 when the target service is unreachable', async () => {
    const closed = await startEchoServer();
    const deadUrl = `http://127.0.0.1:${closed.address().port}`;
    await new Promise((resolve) => closed.close(resolve));
    const app = createApp([{ path: '/api/svc', target: deadUrl, rewriteTo: '' }]);

    const res = await request(app).get('/api/svc/items');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'Upstream service unavailable' });
  });
});
