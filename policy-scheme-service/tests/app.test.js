const request = require('supertest');
const { createApp } = require('../src/app');

describe('policy-scheme-service', () => {
  test('GET /health reports the service status', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'policy-scheme-service', status: 'ok' });
  });

  test('returns 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });
});
