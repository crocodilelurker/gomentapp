const express = require('express');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ service: 'policy-scheme-service', status: 'ok' });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
}

module.exports = { createApp };
