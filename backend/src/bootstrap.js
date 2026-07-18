const http = require('http');

const { createApp } = require('./app');
const db = require('./config/db');
const { validateEnvironment } = require('./config/env.config');
const logger = require('./shared/logger');
const { startPortafolioCierreMensualJob } = require('./jobs/portafolioCierreMensual.job');
const { startPortafolioCierreSemanalJob } = require('./jobs/portafolioCierreSemanal.job');

let server = null;

async function verifyDatabase() {
  try {
    const result = await db.testConnection();
    logger.info(`Base de datos conectada. Hora del servidor: ${result.server_time}`);
    return true;
  } catch (error) {
    logger.error('La API inicio, pero no fue posible conectar con MySQL.', error);
    return false;
  }
}

function startScheduledJobs() {
  try {
    startPortafolioCierreMensualJob();
    startPortafolioCierreSemanalJob();
    logger.info('Jobs de Portafolio inicializados.');
  } catch (error) {
    logger.error('La API inicio, pero uno o mas jobs no pudieron inicializarse.', error);
  }
}

async function startServer() {
  validateEnvironment();

  const app = createApp();
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '0.0.0.0';

  await verifyDatabase();

  server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  logger.info(`Mantto Gestor API escuchando en http://localhost:${port}`);
  startScheduledJobs();
  registerShutdownHandlers();

  return server;
}

function registerShutdownHandlers() {
  const shutdown = async (signal) => {
    logger.info(`Senal ${signal} recibida. Cerrando servidor...`);

    try {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }

      await db.close();
      logger.info('Servidor y pool MySQL cerrados correctamente.');
      process.exit(0);
    } catch (error) {
      logger.error('Error durante el cierre controlado.', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { startServer };
