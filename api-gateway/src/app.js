const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

function createProxy({ target, rewriteTo }) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // Express has already stripped the mount path, so `path` is the remainder.
    pathRewrite: (path) => `${rewriteTo}${path}`,
    on: {
      error: (err, req, res) => {
        if (res.headersSent) return res.end();
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upstream service unavailable' }));
      },
    },
  });
}

function createApp(routes) {
  const app = express();
  app.disable('x-powered-by');

  // No body parser here: request bodies must stream through to the services untouched.

  app.get('/health', (req, res) => {
    res.json({ service: 'api-gateway', status: 'ok' });
  });

  for (const route of routes) {
    app.use(route.path, createProxy(route));
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
}

module.exports = { createApp };
