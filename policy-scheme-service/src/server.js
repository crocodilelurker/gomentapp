const { createApp } = require('./app');

const PORT = process.env.PORT || 8000;

createApp().listen(PORT, () => {
  console.log(`policy-scheme-service listening on port ${PORT}`);
});
