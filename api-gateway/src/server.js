const { createApp } = require('./app');
const { ROUTES } = require('./constants/routes');

const PORT = process.env.PORT || 8000;

createApp(ROUTES).listen(PORT, () => {
  console.log(`api-gateway listening on port ${PORT}`);
});
