'use strict';

// [BLT NOW | 2026-10-22 | RENDIMIENTO_FASE_2_COBRANZA_UNI_FK_V001]
// Segunda linea de defensa del FK United.
// La reconciliacion post-sync sigue siendo dirigida por IDs. El respaldo
// programado rota una tabla por tick para evitar tres barridos consecutivos.

const validator = require('../services/cobranza-uni/fk-validator.service');
const logger = require('../shared/logger');

const TABLES = Object.freeze(Object.keys(validator.TABLES_UNI));
// Node reduce a 1 ms los temporizadores NaN o superiores a este limite.
const MAX_TIMER_MS = 2147483647;
function boundedTimerMs(value, fallback, minimum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(Math.min(Math.max(parsed, minimum), MAX_TIMER_MS));
}

const FIRST_RUN_DELAY_MS = boundedTimerMs(process.env.COBRANZA_UNI_FK_FIRST_RUN_DELAY_MS, 60000, 15000);
const TICK_INTERVAL_MS = boundedTimerMs(
  process.env.COBRANZA_UNI_FK_TICK_INTERVAL_MS,
  15 * 60 * 1000,
  5 * 60 * 1000
);
const FULL_CYCLE_INTERVAL_MS = TICK_INTERVAL_MS * TABLES.length;
const RESIDUAL_AUDIT_EVERY_CYCLES = Math.max(
  1,
  Math.floor(Number(process.env.COBRANZA_UNI_FK_RESIDUAL_AUDIT_EVERY_CYCLES || 8)) || 8
);

let timer = null;
let firstRun = null;
let running = false;
let nextTableIndex = 0;

function shouldRunResidualAudit(tableIndex, nowMs = Date.now()) {
  const cycle = Math.floor(Number(nowMs) / FULL_CYCLE_INTERVAL_MS);
  return ((cycle + tableIndex) % RESIDUAL_AUDIT_EVERY_CYCLES) === 0;
}

async function runOneTable(tabla, { auditarResiduales = false } = {}) {
  try {
    return await validator.reconciliar({
      tabla,
      origen: 'programado',
      auditarResiduales,
      capturarMuestra: false
    });
  } catch (error) {
    logger.error(`[COBRANZA_UNI_FK] Fallo periodico en ${tabla}`, error.message);
    return { tabla, error: error.message };
  }
}

// Ejecucion manual/completa conservada para QA y recuperacion controlada.
// No es la ruta usada por el timer automatico.
async function runCobranzaUniFkValidatorJob() {
  if (running) return { omitido: 'ejecucion_en_curso' };
  running = true;
  const results = [];
  try {
    for (const tabla of TABLES) {
      results.push(await runOneTable(tabla, { auditarResiduales: true }));
    }
    return { resultados: results };
  } finally {
    running = false;
  }
}

// Ruta automatica: una sola tabla por tick. Cada tabla conserva una revision
// residual periodica, pero no en cada reconciliacion horaria.
async function runCobranzaUniFkValidatorTick(nowMs = Date.now()) {
  if (running) return { omitido: 'ejecucion_en_curso' };
  running = true;
  try {
    const tableIndex = nextTableIndex % TABLES.length;
    nextTableIndex = (nextTableIndex + 1) % TABLES.length;
    const tabla = TABLES[tableIndex];
    const auditarResiduales = shouldRunResidualAudit(tableIndex, nowMs);
    const result = await runOneTable(tabla, { auditarResiduales });
    return { tabla, auditarResiduales, resultado: result };
  } finally {
    running = false;
  }
}

function executeTick() {
  runCobranzaUniFkValidatorTick().catch(error =>
    logger.error('[COBRANZA_UNI_FK] Error en ciclo automatico', error.message)
  );
}

function startCobranzaUniFkValidatorJob() {
  if (timer || firstRun) return timer || firstRun;

  firstRun = setTimeout(() => {
    firstRun = null;
    executeTick();
  }, FIRST_RUN_DELAY_MS);
  firstRun.unref?.();

  timer = setInterval(executeTick, TICK_INTERVAL_MS);
  timer.unref?.();
  logger.info(
    `[COBRANZA_UNI_FK] Validador activo: una tabla cada ${Math.round(TICK_INTERVAL_MS / 60000)} min; ` +
    `ciclo completo aproximado ${Math.round(FULL_CYCLE_INTERVAL_MS / 60000)} min; ` +
    `auditoria residual cada ${RESIDUAL_AUDIT_EVERY_CYCLES} ciclos por tabla.`
  );
  return timer;
}

function stopCobranzaUniFkValidatorJob() {
  if (firstRun) clearTimeout(firstRun);
  if (timer) clearInterval(timer);
  firstRun = null;
  timer = null;
  nextTableIndex = 0;
}

module.exports = {
  TABLES,
  FIRST_RUN_DELAY_MS,
  FULL_CYCLE_INTERVAL_MS,
  TICK_INTERVAL_MS,
  RESIDUAL_AUDIT_EVERY_CYCLES,
  shouldRunResidualAudit,
  startCobranzaUniFkValidatorJob,
  stopCobranzaUniFkValidatorJob,
  runCobranzaUniFkValidatorJob,
  runCobranzaUniFkValidatorTick
};
