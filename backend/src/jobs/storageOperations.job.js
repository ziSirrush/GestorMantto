const repository = require('../services/storage/storage-operations.repository');
const operations = require('../services/storage/storage-operations.service');
const logger = require('../shared/logger');

let timer = null;
let running = false;

function enabled_gnral() {
  return String(process.env.CFFAA_STORAGE_RETRY_ENABLED || 'false').trim().toLowerCase() === 'true';
}

async function runCycle_gnral() {
  if (running) return { skipped: true, reason: 'already_running' };
  running = true;

  try {
    const staleMinutes = Math.max(1, Number(process.env.CFFAA_STORAGE_RETRY_STALE_MINUTES || 15));
    await repository.recoverStale_gnral(staleMinutes);

    const batchSize = Math.max(1, Math.min(100, Number(process.env.CFFAA_STORAGE_RETRY_BATCH_SIZE || 20)));
    const batch = await repository.claimBatch_gnral(batchSize);
    let completed = 0;
    let errors = 0;
    let discarded = 0;

    for (const operation of batch) {
      const result = await operations.processOperation_gnral(operation);
      if (result.completed) completed += 1;
      else if (result.exhausted) discarded += 1;
      else errors += 1;
    }

    return { processed: batch.length, completed, errors, discarded };
  } catch (error) {
    logger.error('CFFAA-01D: error en el ciclo de operaciones pendientes de Storage.', error);
    return { processed: 0, completed: 0, errors: 1, error: error.message };
  } finally {
    running = false;
  }
}

function startStorageOperationsJob() {
  if (timer) return timer;
  if (!enabled_gnral()) {
    logger.info('CFFAA-01D: job de operaciones pendientes de Storage inactivo por configuración.');
    return null;
  }

  const intervalMs = Math.max(30000, Number(process.env.CFFAA_STORAGE_RETRY_INTERVAL_MS || 60000));
  runCycle_gnral().catch(error => logger.error('CFFAA-01D: no fue posible ejecutar el primer ciclo.', error));
  timer = setInterval(
    () => runCycle_gnral().catch(error => logger.error('CFFAA-01D: ciclo no controlado.', error)),
    intervalMs
  );
  timer.unref?.();
  logger.info(`CFFAA-01D: job de operaciones pendientes activo cada ${intervalMs} ms.`);
  return timer;
}

function stopStorageOperationsJob() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startStorageOperationsJob,
  stopStorageOperationsJob,
  runCycle_gnral
};
