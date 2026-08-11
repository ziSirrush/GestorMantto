const express = require('express');
const path = require('path');
const cors = require('cors');
const { captureRawBody } = require('./middleware/raw-body.middleware');

const apiRouter = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { getCorsOptions } = require('./config/http.config');
const { viewerReadOnlyGuard } = require('./middleware/viewer-readonly.middleware');

function enabled(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(getCorsOptions()));
  app.use(express.json({
    limit: process.env.JSON_LIMIT || '12mb',
    verify: captureRawBody
  }));
  app.use(express.urlencoded({
    extended: true,
    limit: process.env.JSON_LIMIT || '12mb',
    verify: captureRawBody
  }));
  app.use(viewerReadOnlyGuard);

  if (enabled(process.env.CFFAA_LEGACY_UPLOADS_ENABLED, true)) {
    app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  }

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
