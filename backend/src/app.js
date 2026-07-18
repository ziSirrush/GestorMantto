const express = require('express');
const path = require('path');
const cors = require('cors');

const apiRouter = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { getCorsOptions } = require('./config/http.config');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(getCorsOptions()));
  app.use(express.json({ limit: process.env.JSON_LIMIT || '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: process.env.JSON_LIMIT || '12mb' }));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
