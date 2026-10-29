const express = require('express');
const cors = require('cors');
const { captureRawBody } = require('./middleware/raw-body.middleware');

const apiRouter = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { getCorsOptions } = require('./config/http.config');
const { viewerReadOnlyGuard } = require('./middleware/viewer-readonly.middleware');
const { interactionTrackingMiddleware_gnral } = require('./middleware/interaction-tracking.middleware');
const { loadTestTelemetryMiddleware } = require('./modules/panel-control-prueba-carga/panel-control-prueba-carga.telemetry');

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
  app.use(loadTestTelemetryMiddleware);
  app.use(viewerReadOnlyGuard);
  app.use(interactionTrackingMiddleware_gnral);

  // [Lumbre | 2026-10-29 | LUMBRE-MG | L02_RETIRO_UPLOADS_PUBLICO_V001]
  // Los archivos se entregan exclusivamente por el flujo autorizado de Azure.
  // No reintroducir servidores estáticos para carpetas de cargas históricas.
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
