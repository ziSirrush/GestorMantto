'use strict';

// [Mantto Gestor | 2026-10-13 | COBRANZA_UNI_FK_VALIDADOR_V001]
// Segunda linea de defensa: revalida las tres tablas, incluso si un dato
// se modifico fuera de los endpoints de sincronizacion conocidos.

const validator = require('../services/cobranza-uni/fk-validator.service');
const logger = require('../shared/logger');

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;
let timer = null;
let firstRun = null;
let running = false;

async function runCobranzaUniFkValidatorJob() {
  if (running) return { omitido: 'ejecucion_en_curso' };
  running = true;
  const results = [];
  try {
    // Fallos aislados por tabla. El lock tambien protege contra varias
    // instancias de Azure ejecutando el mismo trabajo a la vez.
    for (const tabla of Object.keys(validator.TABLES_UNI)) {
      try {
        results.push(await validator.reconciliar({ tabla, origen: 'programado' }));
      } catch (error) {
        logger.error(`[COBRANZA_UNI_FK] Fallo periodico en ${tabla}`, error.message);
        results.push({ tabla, error: error.message });
      }
    }
    return { resultados: results };
  } finally {
    running = false;
  }
}

function startCobranzaUniFkValidatorJob() {
  if (timer) return timer;
  firstRun = setTimeout(() => {
    firstRun = null;
    runCobranzaUniFkValidatorJob().catch(error =>
      logger.error('[COBRANZA_UNI_FK] Error en inicio diferido', error.message)
    );
  }, FIRST_RUN_DELAY_MS);
  firstRun.unref?.();

  timer = setInterval(() => {
    runCobranzaUniFkValidatorJob().catch(error =>
      logger.error('[COBRANZA_UNI_FK] Error en ciclo automatico', error.message)
    );
  }, INTERVAL_MS);
  timer.unref?.();
  logger.info('[COBRANZA_UNI_FK] Validador activo: post-sync y respaldo cada 15 minutos.');
  return timer;
}

function stopCobranzaUniFkValidatorJob() {
  if (firstRun) clearTimeout(firstRun);
  if (timer) clearInterval(timer);
  firstRun = null;
  timer = null;
}

module.exports = {
  startCobranzaUniFkValidatorJob,
  stopCobranzaUniFkValidatorJob,
  runCobranzaUniFkValidatorJob
};
