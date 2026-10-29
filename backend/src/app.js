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
  // [Aster | 2026-10-29 | ASTER-MG | AST-06 HTTP BODY LIMITS V001]
  const { chooseBodyLimit_aster } = require('./middleware/body-limit.middleware');
  const jsonParsers = new Map();
  const formParsers = new Map();
  for (const limit of ['64kb', '1mb', '12mb']) {
    jsonParsers.set(limit, express.json({limit,verify:captureRawBody}));
    formParsers.set(limit, express.urlencoded({extended:true,limit,verify:captureRawBody}));
  }
  app.use((req,res,next)=>{
    const limit=chooseBodyLimit_aster(req);
    jsonParsers.get(limit)(req,res,err=>{
      if(err) return next(err);
      formParsers.get(limit)(req,res,next);
    });
  });
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
