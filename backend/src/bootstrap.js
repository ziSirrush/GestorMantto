const http = require('http');

const { createApp } = require('./app');
const db = require('./config/db');
const { validateEnvironment } = require('./config/env.config');
const logger = require('./shared/logger');
const { startPortafolioCierreMensualJob } = require('./jobs/portafolioCierreMensual.job');
const { startPortafolioCierreSemanalJob } = require('./jobs/portafolioCierreSemanal.job');
const { startLogisticaCierreSemanalJob, stopLogisticaCierreSemanalJob } = require('./jobs/logisticaCierreSemanal.job');
const { startPushNotificationsJob, stopPushNotificationsJob } = require('./jobs/pushNotifications.job');
const { startStorageOperationsJob, stopStorageOperationsJob } = require('./jobs/storageOperations.job');
const { startEquiposCriticosSalidaU35Job, stopEquiposCriticosSalidaU35Job } = require('./jobs/equiposCriticosSalidaU35.job');
const { startMovimientosCriticosCierreSemanalJob, stopMovimientosCriticosCierreSemanalJob } = require('./jobs/movimientosCriticosCierreSemanal.job');
const { startInstalacionesAdministracionCalculadosJob, stopInstalacionesAdministracionCalculadosJob } = require('./jobs/instalacionesAdministracionCalculados.job');
const { startCobranzaUniFkValidatorJob, stopCobranzaUniFkValidatorJob } = require('./jobs/cobranzaUniFkValidator.job');
const storageSchema = require('./services/storage/storage-schema.service');

let server = null;
// Los jobs de negocio se activan una sola vez por proceso, aun cuando Aiven
// no estuviera disponible en el arranque inicial del contenedor.
let scheduledJobsStarted = false;
let delayedJobsTimer = null;
let dbRetryDelayMs = 30000;
let shuttingDown = false;


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
    logger.warn('Job salida automática de Equipos Críticos U35 no iniciado porque MySQL no está disponible.');
    logger.warn('Job semanal de Movimientos Críticos no iniciado porque MySQL no está disponible.');
    logger.warn('CFFAA-01D: job de Storage no iniciado porque MySQL no está disponible.');
    logger.warn('Job de calculados de Instalaciones Administracion no iniciado porque MySQL no esta disponible.');
    return;
  }

  try {
    startPortafolioCierreMensualJob();
    startPortafolioCierreSemanalJob();
    startLogisticaCierreSemanalJob();
    logger.info('Jobs de Portafolio inicializados.');
  } catch (error) {
    logger.error('La API inicio, pero los jobs de Portafolio no pudieron inicializarse.', error);
  }

  try {
    startEquiposCriticosSalidaU35Job();
  } catch (error) {
    logger.error('La API inicio, pero el job de salida automática de Equipos Críticos U35 no pudo inicializarse.', error);
  }

  try {
    startMovimientosCriticosCierreSemanalJob();
  } catch (error) {
    logger.error('La API inicio, pero el job semanal de Movimientos Críticos no pudo inicializarse.', error);
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

  // [Mantto Gestor | FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001]
  try {
    startInstalacionesAdministracionCalculadosJob();
  } catch(error) {
    logger.error('No fue posible iniciar calculados diarios de Instalaciones Administracion.',error);
  }
}

function scheduleDatabaseRecovery() {
  if (shuttingDown || scheduledJobsStarted || delayedJobsTimer) return;
  const delay = dbRetryDelayMs;
  dbRetryDelayMs = Math.min(dbRetryDelayMs * 2, 300000);
  delayedJobsTimer = setTimeout(async () => {
    delayedJobsTimer = null;
    if (shuttingDown || scheduledJobsStarted) return;
    try {
      const available = await verifyDatabase();
      if (!available) return scheduleDatabaseRecovery();
      if (shuttingDown || scheduledJobsStarted) return;
      await verifyStorageSchema();
      if (shuttingDown || scheduledJobsStarted) return;
      scheduledJobsStarted = true;
      logger.info('[DB_RECOVERED] Aiven disponible; iniciando jobs omitidos al arranque.');
      startScheduledJobs(true);
    } catch (error) {
      logger.error('[DB_RECOVERY] No se pudo completar la recuperacion de los jobs.', error);
      scheduleDatabaseRecovery();
    }
  }, delay);
  delayedJobsTimer.unref?.();
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
  if (databaseReady) scheduledJobsStarted = true;
  else scheduleDatabaseRecovery();
  // Reintenta aunque Aiven no estuviera disponible durante el arranque.
  try {
    startCobranzaUniFkValidatorJob();
  } catch (error) {
    logger.error('No fue posible iniciar validador FK Cobranza United.', error);
  }
  registerShutdownHandlers();

  return server;
}

function registerShutdownHandlers() {
  const shutdown = async (signal) => {
    logger.info(`Senal ${signal} recibida. Cerrando servidor...`);

    try {
      shuttingDown = true;
      if (delayedJobsTimer) clearTimeout(delayedJobsTimer);
      delayedJobsTimer = null;
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }

      stopPushNotificationsJob();
      stopStorageOperationsJob();
      stopLogisticaCierreSemanalJob();
      stopEquiposCriticosSalidaU35Job();
      stopMovimientosCriticosCierreSemanalJob();
      stopInstalacionesAdministracionCalculadosJob();
      stopCobranzaUniFkValidatorJob();
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
