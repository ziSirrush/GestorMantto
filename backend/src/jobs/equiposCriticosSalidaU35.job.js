'use strict';

// [Aster | 2026-09-29 | ASTER-MG | EQUIPO_SALE_DE_CRITICO FASE 2 V001]
// Detecta salidas de criticidad causadas exclusivamente por el avance de la
// ventana U35. No depende de un sync de Tickets y no persiste estado historico nuevo.

const db = require('../config/db');
const logger = require('../shared/logger');
const { emitBusinessEventSafe_gnral } = require('../services/notifications/notification-business-emitter.service');
const { siteLabel_gnral } = require('../services/notifications/notification-site-label.service');

const EVENT_CODE = 'EQUIPO_SALE_DE_CRITICO';
const CRITICOS_DIAS = 35;
const CRITICOS_MIN_FALLAS = 3;
const TZ = process.env.CRITICOS_SALIDA_U35_TZ || 'America/Mexico_City';
const HOUR = Number.parseInt(process.env.CRITICOS_SALIDA_U35_HOUR || '0', 10);
const MINUTE = Number.parseInt(process.env.CRITICOS_SALIDA_U35_MINUTE || '10', 10);
const ENABLED = String(process.env.CRITICOS_SALIDA_U35_ENABLED || 'true').toLowerCase() !== 'false';
const INTERVAL_MS = Math.max(30000, Number(process.env.CRITICOS_SALIDA_U35_INTERVAL_MS || 60000));
const RETRY_DELAY_MS = 5 * 60 * 1000;

let timer = null;
let running = false;
let lastRunKey = null;
let lastFailure = null;

function zonedParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    datetime: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
  };
}

function shiftYmd(year, month, day, deltaDays) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    date: date.toISOString().slice(0, 10)
  };
}

function previousYmd(dateText) {
  const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Fecha de corte invalida: ${dateText}`);
  return shiftYmd(Number(match[1]), Number(match[2]), Number(match[3]), -1).date;
}

function latestDueDate(date = new Date()) {
  const parts = zonedParts(date);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const scheduledMinutes = HOUR * 60 + MINUTE;
  const target = currentMinutes >= scheduledMinutes
    ? { year: parts.year, month: parts.month, day: parts.day, date: parts.date }
    : shiftYmd(parts.year, parts.month, parts.day, -1);

  return {
    ...target,
    previous_date: previousYmd(target.date),
    scheduled_datetime: `${target.date} ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')}:00`,
    execution_parts: parts,
    recovery: target.date !== parts.date
  };
}

function uniquePositiveIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

async function listActiveUserIds(conn = db) {
  const [rows] = await conn.query(`
    SELECT u.id_SB
    FROM usuarios u
    WHERE u.estado = 1
    ORDER BY u.id_SB ASC
  `);
  return uniquePositiveIds(rows.map((row) => row.id_SB));
}

async function listTimeExpiredTransitions(targetDate, conn = db) {
  const currentDate = String(targetDate || '').trim();
  const previousDate = previousYmd(currentDate);

  const [rows] = await conn.query(`
    SELECT
      ap.id_portafolio,
      ap.numero_equipo,
      ap.proyecto,
      ap.identificacion_sitio,
      ap.zona_id,
      COUNT(DISTINCT CASE
        WHEN t.fecha_reporte >= DATE_SUB(?, INTERVAL ${CRITICOS_DIAS} DAY)
         AND t.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)
        THEN t.id ELSE NULL END
      ) AS fallas_blt_antes,
      COUNT(DISTINCT CASE
        WHEN t.fecha_reporte >= DATE_SUB(?, INTERVAL ${CRITICOS_DIAS} DAY)
         AND t.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)
        THEN t.id ELSE NULL END
      ) AS fallas_blt_despues
    FROM (
      SELECT
        MIN(p.id_portafolio) AS id_portafolio,
        p.numero_equipo,
        MAX(p.proyecto) AS proyecto,
        MAX(p.identificacion_sitio) AS identificacion_sitio,
        MIN(p.zona_id) AS zona_id,
        SUM(CASE WHEN p.zona_id IS NULL THEN 1 ELSE 0 END) AS zonas_nulas,
        COUNT(DISTINCT p.zona_id) AS zonas_distintas
      FROM portafolio p
      WHERE p.estado_registro = 1
        AND (p.inactivo IS NULL OR UPPER(TRIM(CAST(p.inactivo AS CHAR))) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
        AND UPPER(TRIM(COALESCE(p.estatus_servicio, ''))) NOT LIKE '%NO EN SERVICIO%'
        AND p.numero_equipo IS NOT NULL
        AND TRIM(p.numero_equipo) <> ''
      GROUP BY p.numero_equipo
      HAVING zonas_nulas = 0
         AND zonas_distintas = 1
    ) ap
    LEFT JOIN tickets t
      ON t.codigo_equipo = ap.numero_equipo
     AND t.fecha_reporte IS NOT NULL
     AND t.fecha_reporte >= DATE_SUB(?, INTERVAL ${CRITICOS_DIAS + 1} DAY)
     AND t.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)
     AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
    GROUP BY
      ap.id_portafolio,
      ap.numero_equipo,
      ap.proyecto,
      ap.identificacion_sitio,
      ap.zona_id
    HAVING fallas_blt_antes >= ${CRITICOS_MIN_FALLAS}
       AND fallas_blt_despues < ${CRITICOS_MIN_FALLAS}
    ORDER BY ap.numero_equipo ASC
  `, [
    previousDate,
    previousDate,
    currentDate,
    currentDate,
    currentDate,
    currentDate
  ]);

  return rows.map((row) => ({
    id_portafolio: Number(row.id_portafolio) || null,
    numero_equipo: String(row.numero_equipo || '').trim(),
    proyecto: row.proyecto || null,
    identificacion_sitio: row.identificacion_sitio || null,
    zona_id: Number(row.zona_id) || null,
    fallas_blt_antes: Number(row.fallas_blt_antes || 0),
    fallas_blt_despues: Number(row.fallas_blt_despues || 0),
    fecha_anterior: previousDate,
    fecha_actual: currentDate,
    transicion: 'CRITICO_A_NO_CRITICO_POR_U35'
  }));
}

function eventInstanceKey(row, targetDate) {
  return [
    'critical-exit-u35',
    String(row?.numero_equipo || '').trim(),
    `date:${targetDate}`,
    `from:${Number(row?.fallas_blt_antes || 0)}`,
    `to:${Number(row?.fallas_blt_despues || 0)}`
  ].join(':');
}

async function emitTransition(row, targetDate, activeUserIds, dependencies = {}) {
  const emitter = dependencies.emit || emitBusinessEventSafe_gnral;
  const equipment = String(row?.numero_equipo || '').trim();
  const zoneId = Number(row?.zona_id || 0) || null;
  if (!equipment || !zoneId) {
    return {
      ok: true,
      created: 0,
      skipped: Array.isArray(activeUserIds) ? activeUserIds.length : 0,
      reason: 'EQUIPO_O_ZONA_NO_RESUELTOS',
      trace_id: null
    };
  }

  const site = siteLabel_gnral(row || {});
  const beforeCount = Number(row.fallas_blt_antes || 0);
  const afterCount = Number(row.fallas_blt_despues || 0);
  const key = eventInstanceKey(row, targetDate);

  return emitter({
    codigoEvento: EVENT_CODE,
    destinatarios: activeUserIds || [],
    zonaOperativaId: zoneId,
    requireRoleMatrix: true,
    allowMissingEvent: true,
    titulo: 'Equipo dejó de ser crítico',
    mensaje: `Se generó salida automática de condición crítica · ${site}. Actualmente registra ${afterCount} fallas BLT en los últimos ${CRITICOS_DIAS} días.`,
    icono: '✅',
    accion: 'ABRIR_MODULO',
    ruta: 'criticos',
    eventInstanceKey: key,
    contextoSeguimiento: {
      dominio: 'UNITED',
      tipo: 'EQUIPO',
      id_portafolio: Number(row.id_portafolio) || null,
      numero_equipo: equipment,
      proyecto: row.proyecto || null,
      zona_id: zoneId,
      identificador_operacion: key
    }
  }, {
    label: `critical-exit-u35:${EVENT_CODE}`
  });
}

async function runCriticalExitU35(targetDate, dependencies = {}) {
  const conn = dependencies.db || db;
  const loadTransitions = dependencies.listTransitions || listTimeExpiredTransitions;
  const loadUsers = dependencies.listUsers || listActiveUserIds;
  const rows = await loadTransitions(targetDate, conn);

  const summary = {
    ok: true,
    fecha_corte: targetDate,
    fecha_anterior: previousYmd(targetDate),
    transiciones: rows.length,
    notificaciones_creadas: 0,
    notificaciones_omitidas: 0,
    eventos: []
  };

  if (!rows.length) return summary;

  const activeUserIds = await loadUsers(conn);
  for (const row of rows) {
    let result;
    try {
      result = await emitTransition(row, targetDate, activeUserIds, dependencies);
    } catch (error) {
      logger.error('[CRITICOS_SALIDA_U35_EMIT_FAILED]', {
        codigo_evento: EVENT_CODE,
        numero_equipo: row.numero_equipo,
        fecha_corte: targetDate,
        error: error.message
      });
      result = {
        ok: false,
        created: 0,
        skipped: activeUserIds.length,
        reason: 'ERROR_EMISION',
        trace_id: null,
        error: error.message
      };
    }

    summary.notificaciones_creadas += Number(result?.created || 0);
    summary.notificaciones_omitidas += Number(result?.skipped || 0);
    summary.eventos.push({
      codigo_evento: EVENT_CODE,
      numero_equipo: row.numero_equipo,
      fallas_blt_antes: row.fallas_blt_antes,
      fallas_blt_despues: row.fallas_blt_despues,
      zona_id: row.zona_id,
      event_instance_key: eventInstanceKey(row, targetDate),
      created: Number(result?.created || 0),
      skipped: Number(result?.skipped || 0),
      reason: result?.reason || null,
      trace_id: result?.trace_id || null
    });
  }

  logger.info('[CRITICOS_SALIDA_U35_RUN]', {
    fecha_corte: targetDate,
    fecha_anterior: summary.fecha_anterior,
    transiciones: summary.transiciones,
    notificaciones_creadas: summary.notificaciones_creadas,
    notificaciones_omitidas: summary.notificaciones_omitidas
  });

  return summary;
}

async function checkCriticalExitU35(date = new Date(), dependencies = {}) {
  if (!ENABLED && dependencies.ignoreEnabled !== true) return { skipped: true, reason: 'disabled' };
  if (running) return { skipped: true, reason: 'already_running' };

  const due = latestDueDate(date);
  const runKey = due.date;
  if (
    lastFailure &&
    lastFailure.runKey === runKey &&
    (Date.now() - lastFailure.at) < RETRY_DELAY_MS
  ) {
    return {
      skipped: true,
      reason: 'retry_backoff',
      retry_in_ms: RETRY_DELAY_MS - (Date.now() - lastFailure.at),
      due
    };
  }
  if (lastRunKey === runKey) return { skipped: true, reason: 'already_ran_in_process', due };

  running = true;
  lastRunKey = runKey;
  try {
    const result = await runCriticalExitU35(runKey, dependencies);
    if (lastFailure?.runKey === runKey) lastFailure = null;
    return { ...result, due };
  } catch (error) {
    lastRunKey = null;
    lastFailure = { runKey, at: Date.now() };
    logger.error('[Criticos] Error ejecutando salida automática U35.', error);
    return { ok: false, error: error.message, due };
  } finally {
    running = false;
  }
}

function startEquiposCriticosSalidaU35Job() {
  if (!ENABLED) {
    logger.info('[Criticos] Job salida automática U35 desactivado por variable de entorno.');
    return null;
  }
  if (timer) return timer;

  logger.info(`[Criticos] Job salida automática U35 activo: ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')} (${TZ}), con recuperación del último día pendiente.`);
  checkCriticalExitU35().catch((error) => logger.error('[Criticos] Falló revisión inicial salida U35.', error));
  timer = setInterval(() => {
    checkCriticalExitU35().catch((error) => logger.error('[Criticos] Falló job salida U35.', error));
  }, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

function stopEquiposCriticosSalidaU35Job() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  EVENT_CODE,
  CRITICOS_DIAS,
  CRITICOS_MIN_FALLAS,
  latestDueDate,
  previousYmd,
  listTimeExpiredTransitions,
  eventInstanceKey,
  emitTransition,
  runCriticalExitU35,
  checkCriticalExitU35,
  startEquiposCriticosSalidaU35Job,
  stopEquiposCriticosSalidaU35Job
};
