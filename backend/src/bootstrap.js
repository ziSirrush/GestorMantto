const http = require('http');

const { createApp } = require('./app');
const db = require('./config/db');
const { validateEnvironment } = require('./config/env.config');
const logger = require('./shared/logger');
const { startPortafolioCierreMensualJob } = require('./jobs/portafolioCierreMensual.job');
const { startPortafolioCierreSemanalJob } = require('./jobs/portafolioCierreSemanal.job');
const { startPushNotificationsJob, stopPushNotificationsJob } = require('./jobs/pushNotifications.job');
const { startStorageOperationsJob, stopStorageOperationsJob } = require('./jobs/storageOperations.job');
const storageSchema = require('./services/storage/storage-schema.service');

let server = null;

async function verifyStorageSchema() {
  try {
    const status = await storageSchema.readSchemaStatus_gnral(true);
    if (status.ready) {
      logger.info('CFFAA-00: esquema de metadatos Azure Storage alineado.');
      return true;
    }

    const missing = Object.entries(status.tables)
      .filter(([, value]) => !value.ready)
      .map(([table, value]) => `${table}: ${value.missing.join(', ')}`)
      .join(' | ');
    logger.warn(`CFFAA-00: cargas de archivos bloqueadas hasta alinear la base. ${missing}`);
    return false;
  } catch (error) {
    logger.warn(`CFFAA-00: no fue posible validar el esquema de Storage: ${error.message}`);
    return false;
  }
}

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

function startScheduledJobs(databaseReady) {
  if (!databaseReady) {
    logger.warn('Jobs de Portafolio no iniciados porque MySQL no está disponible.');
    logger.warn('Job global de notificaciones push no iniciado porque MySQL no está disponible.');
    logger.warn('CFFAA-01D: job de Storage no iniciado porque MySQL no está disponible.');
    return;
  }

  try {
    startPortafolioCierreMensualJob();
    startPortafolioCierreSemanalJob();
    logger.info('Jobs de Portafolio inicializados.');
  } catch (error) {
    logger.error('La API inicio, pero los jobs de Portafolio no pudieron inicializarse.', error);
  }

  try {
    startPushNotificationsJob();
  } catch (error) {
    logger.error('La API inicio, pero el job de notificaciones push no pudo inicializarse.', error);
  }

  try {
    startStorageOperationsJob();
  } catch (error) {
    logger.error('La API inicio, pero el job de operaciones pendientes de Storage no pudo inicializarse.', error);
  }
}

async function startServer() {
  validateEnvironment();

  const app = createApp();
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '0.0.0.0';

  const databaseReady = await verifyDatabase();
  if (databaseReady) await verifyStorageSchema();

  server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  logger.info(`Mantto Gestor API escuchando en http://localhost:${port}`);
  startScheduledJobs(databaseReady);
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

      stopPushNotificationsJob();
      stopStorageOperationsJob();
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
