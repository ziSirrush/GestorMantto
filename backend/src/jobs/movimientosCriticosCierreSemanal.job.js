'use strict';

// [Aster | 2026-10-03 | ASTER-MG | MOVIMIENTOS CRITICOS V001]
// Historico semanal independiente de Movimientos Portafolio.
// Regla corporativa: >= 3 fallas BLT dentro de U35.

const crypto = require('crypto');
const db = require('../config/db');
const logger = require('../shared/logger');

const CRITICOS_DIAS = 35;
const CRITICOS_MIN_FALLAS = 3;
const TZ = process.env.CRITICOS_CIERRE_SEMANAL_TZ || 'America/Mexico_City';
const HOUR = Number.parseInt(process.env.CRITICOS_CIERRE_SEMANAL_HOUR || '12', 10);
const MINUTE = Number.parseInt(process.env.CRITICOS_CIERRE_SEMANAL_MINUTE || '0', 10);
const ENABLED = String(process.env.CRITICOS_CIERRE_SEMANAL_ENABLED || 'true').toLowerCase() !== 'false';
const INTERVAL_MS = Math.max(30000, Number(process.env.CRITICOS_CIERRE_SEMANAL_INTERVAL_MS || 30000));
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
    weekday: 'short',
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
    weekday: parts.weekday,
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

function isoWeekInfoFromYmd(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  const selected = new Date(Date.UTC(year, month - 1, day));
  const selectedDay = selected.getUTCDay() || 7;
  const monday = new Date(selected);
  monday.setUTCDate(selected.getUTCDate() - selectedDay + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    anio_iso: isoYear,
    semana_iso: isoWeek,
    fecha_inicio: monday.toISOString().slice(0, 10),
    fecha_fin: sunday.toISOString().slice(0, 10)
  };
}

function latestDueSunday(date = new Date()) {
  const parts = zonedParts(date);
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  if (weekdayIndex === undefined) throw new Error(`Dia de semana no reconocido para ${TZ}: ${parts.weekday}`);

  const scheduledMinutes = HOUR * 60 + MINUTE;
  const currentMinutes = parts.hour * 60 + parts.minute;
  const currentSundayIsDue = weekdayIndex === 0 && currentMinutes >= scheduledMinutes;
  const daysBack = currentSundayIsDue ? 0 : (weekdayIndex === 0 ? 7 : weekdayIndex);
  const target = shiftYmd(parts.year, parts.month, parts.day, -daysBack);

  return {
    ...target,
    ...isoWeekInfoFromYmd(target.year, target.month, target.day),
    scheduled_datetime: `${target.date} ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')}:00`,
    execution_parts: parts,
    recovery: target.date !== parts.date || !currentSundayIsDue
  };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function equipmentKey(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function compareEquipment(left, right) {
  return equipmentKey(left?.equipo).localeCompare(equipmentKey(right?.equipo), 'es-MX');
}

async function loadCurrentSnapshot(targetDate, conn = db) {
  const [rows] = await conn.query(`
    SELECT
      ap.numero_equipo,
      ap.proyecto,
      ap.identificacion_sitio,
      ap.zona_id,
      z.zona,
      ap.supervisor,
      COUNT(DISTINCT t.id) AS fallas_blt_u35,
      MAX(t.fecha_reporte) AS ultimo_blt
    FROM (
      SELECT
        p.numero_equipo,
        MAX(p.proyecto) AS proyecto,
        MAX(p.identificacion_sitio) AS identificacion_sitio,
        MIN(p.zona_id) AS zona_id,
        MAX(p.supervisor_zona) AS supervisor,
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
    INNER JOIN z_op z
      ON z.id_zona = ap.zona_id
     AND z.estado = 1
    LEFT JOIN tickets t
      ON t.codigo_equipo = ap.numero_equipo
     AND t.fecha_reporte IS NOT NULL
     AND t.fecha_reporte >= DATE_SUB(?, INTERVAL ${CRITICOS_DIAS} DAY)
     AND t.fecha_reporte < DATE_ADD(?, INTERVAL 1 DAY)
     AND UPPER(COALESCE(t.responsabilidad, '')) LIKE '%BLT%'
    GROUP BY
      ap.numero_equipo,
      ap.proyecto,
      ap.identificacion_sitio,
      ap.zona_id,
      z.zona,
      ap.supervisor
    ORDER BY ap.numero_equipo ASC
  `, [targetDate, targetDate]);

  return rows.map((row) => {
    const fallas = Number(row.fallas_blt_u35 || 0);
    return {
      equipo: String(row.numero_equipo || '').trim(),
      proyecto: row.proyecto || '',
      referencia_en_sitio: row.identificacion_sitio || '',
      zona_id: Number(row.zona_id) || null,
      zona: row.zona || '',
      supervisor: row.supervisor || '',
      fallas_blt_u35: fallas,
      es_critico: fallas >= CRITICOS_MIN_FALLAS,
      ultimo_blt: row.ultimo_blt || null
    };
  }).sort(compareEquipment);
}

async function getPreviousClosedCut(anioIso, semanaIso, conn = db) {
  const [rows] = await conn.query(`
    SELECT id_corte, anio_iso, semana_iso
    FROM criticos_cortes_semanales FORCE INDEX (uq_criticos_semana)
    WHERE estado = 'CERRADO'
      AND (anio_iso < ? OR (anio_iso = ? AND semana_iso < ?))
    ORDER BY anio_iso DESC, semana_iso DESC
    LIMIT 1
  `, [anioIso, anioIso, semanaIso]);

  if (!rows.length) return null;

  const previous = rows[0];
  const [snapshotRows] = await conn.query(`
    SELECT snapshot_json
    FROM criticos_cortes_semanales
    WHERE id_corte = ?
      AND estado = 'CERRADO'
    LIMIT 1
  `, [previous.id_corte]);

  if (!snapshotRows.length) {
    throw new Error(`No fue posible recuperar el snapshot del corte critico anterior ${previous.id_corte}.`);
  }

  return { ...previous, snapshot_json: snapshotRows[0].snapshot_json };
}

function buildMovements(previousSnapshot, currentSnapshot, timestamp) {
  const previousMap = new Map(
    previousSnapshot.map((row) => [equipmentKey(row.equipo), row])
  );
  const movements = [];

  for (const current of currentSnapshot) {
    const previous = previousMap.get(equipmentKey(current.equipo));
    if (!previous) continue;

    const before = Number(previous.fallas_blt_u35 || 0);
    const after = Number(current.fallas_blt_u35 || 0);
    const wasCritical = Boolean(previous.es_critico) || before >= CRITICOS_MIN_FALLAS;
    const isCritical = Boolean(current.es_critico) || after >= CRITICOS_MIN_FALLAS;

    let tipo = null;
    if (!wasCritical && isCritical) tipo = 'ENTRA_CRITICO';
    else if (wasCritical && !isCritical) tipo = 'SALE_CRITICO';
    if (!tipo) continue;

    movements.push({
      tipo,
      equipo: current.equipo,
      proyecto: current.proyecto,
      referencia_en_sitio: current.referencia_en_sitio,
      zona_id: current.zona_id,
      zona: current.zona,
      supervisor: current.supervisor,
      fallas_anterior: before,
      fallas_actual: after,
      fecha_movimiento: timestamp
    });
  }

  return movements.sort(compareEquipment);
}

async function runWeeklyClose(date = new Date(), generatedBy = null, targetDate = null, conn = db) {
  const parts = zonedParts(date);
  const target = targetDate || {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    date: parts.date
  };
  const iso = isoWeekInfoFromYmd(target.year, target.month, target.day);

  const [existingRows] = await conn.query(
    `SELECT id_corte, estado FROM criticos_cortes_semanales WHERE anio_iso = ? AND semana_iso = ? LIMIT 1`,
    [iso.anio_iso, iso.semana_iso]
  );
  if (existingRows.length && existingRows[0].estado === 'CERRADO') {
    return { skipped: true, reason: 'already_closed', id_corte: existingRows[0].id_corte, ...iso };
  }

  const currentSnapshot = await loadCurrentSnapshot(target.date, conn);
  const previousCut = await getPreviousClosedCut(iso.anio_iso, iso.semana_iso, conn);
  const previousSnapshot = previousCut ? parseJson(previousCut.snapshot_json, null) : [];
  if (previousCut && !Array.isArray(previousSnapshot)) {
    throw new Error(`El snapshot del corte critico anterior ${previousCut.id_corte} no contiene un arreglo JSON valido.`);
  }

  const movements = previousCut
    ? buildMovements(previousSnapshot, currentSnapshot, parts.datetime)
    : [];

  const totals = movements.reduce((acc, row) => {
    acc.total += 1;
    if (row.tipo === 'ENTRA_CRITICO') acc.entradas += 1;
    else if (row.tipo === 'SALE_CRITICO') acc.salidas += 1;
    return acc;
  }, { total: 0, entradas: 0, salidas: 0 });

  const totalCriticos = currentSnapshot.reduce(
    (acc, row) => acc + (row.es_critico ? 1 : 0),
    0
  );

  const snapshotJson = JSON.stringify(currentSnapshot);
  const movementsJson = JSON.stringify(movements);
  const hash = crypto.createHash('sha256').update(snapshotJson + '|' + movimientosJson).digest('hex');

  const values = [
    iso.anio_iso,
    iso.semana_iso,
    iso.fecha_inicio,
    iso.fecha_fin,
    parts.datetime,
    previousCut ? previousCut.id_corte : null,
    currentSnapshot.length,
    totalCriticos,
    totals.total,
    totals.entradas,
    totals.salidas,
    CRITICOS_MIN_FALLAS,
    CRITICOS_DIAS,
    snapshotJson,
    movimientosJson,
    'CERRADO',
    hash,
    generatedBy
  ];

  await conn.query(`
    INSERT INTO criticos_cortes_semanales (
      anio_iso, semana_iso, fecha_inicio, fecha_fin, fecha_corte,
      id_corte_anterior, total_equipos_evaluados, total_equipos_criticos,
      total_movimientos, total_entradas, total_salidas,
      criterio_fallas, criterio_dias,
      snapshot_json, movimientos_json, estado, hash_contenido, generado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      fecha_inicio = VALUES(fecha_inicio),
      fecha_fin = VALUES(fecha_fin),
      fecha_corte = VALUES(fecha_corte),
      id_corte_anterior = VALUES(id_corte_anterior),
      total_equipos_evaluados = VALUES(total_equipos_evaluados),
      total_equipos_criticos = VALUES(total_equipos_criticos),
      total_movimientos = VALUES(total_movimientos),
      total_entradas = VALUES(total_entradas),
      total_salidas = VALUES(total_salidas),
      criterio_fallas = VALUES(criterio_fallas),
      criterio_dias = VALUES(criterio_dias),
      snapshot_json = VALUES(snapshot_json),
      movimientos_json = VALUES(movimientos_json),
      estado = VALUES(estado),
      hash_contenido = VALUES(hash_contenido),
      generado_por = COALESCE(generado_por, VALUES(generado_por))
  `, values);

  logger.info('[MOVIMIENTOS_CRITICOS_CIERRE_SEMANAL]', {
    anio_iso: iso.anio_iso,
    semana_iso: iso.semana_iso,
    fecha_programada: target.date,
    fecha_corte_real: parts.datetime,
    recuperacion: target.date !== parts.date,
    total_equipos_evaluados: currentSnapshot.length,
    total_equipos_criticos: totalCriticos,
    total_movimientos: totals.total,
    total_entradas: totals.entradas,
    total_salidas: totals.salidas,
    linea_base: !previousCut
  });

  return {
    ok: true,
    ...iso,
    fecha_programada: target.date,
    fecha_corte_real: parts.datetime,
    recuperacion: target.date !== parts.date,
    total_equipos_evaluados: currentSnapshot.length,
    total_equipos_criticos: totalCriticos,
    total_movimientos: totals.total,
    total_entradas: totals.entradas,
    total_salidas: totals.salidas,
    criterio_fallas: CRITICOS_MIN_FALLAS,
    criterio_dias: CRITICOS_DIAS,
    linea_base: !previousCut
  };
}

async function checkWeeklyClose(date = new Date()) {
  if (!ENABLED) return { skipped: true, reason: 'disabled' };
  if (running) return { skipped: true, reason: 'already_running' };

  const due = latestDueSunday(date);
  const runKey = `${due.anio_iso}-${String(due.semana_iso).padStart(2, '0')}`;

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
    const result = await runWeeklyClose(date, null, due);
    if (lastFailure?.runKey === runKey) lastFailure = null;
    return { ...result, due };
  } catch (error) {
    lastRunKey = null;
    lastFailure = { runKey, at: Date.now() };
    logger.error('[Movimientos Criticos] Error ejecutando cierre semanal.', error);
    return { ok: false, error: error.message, due };
  } finally {
    running = false;
  }
}

function startMovimientosCriticosCierreSemanalJob() {
  if (!ENABLED) {
    logger.info('[Movimientos Criticos] Cierre semanal desactivado por variable de entorno.');
    return null;
  }
  if (timer) return timer;

  logger.info(`[Movimientos Criticos] Cierre semanal activo: domingo ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')} (${TZ}), con recuperacion del ultimo corte pendiente.`);
  checkWeeklyClose().catch((error) => logger.error('[Movimientos Criticos] Fallo revision inicial.', error));
  timer = setInterval(() => {
    checkWeeklyClose().catch((error) => logger.error('[Movimientos Criticos] Fallo job semanal.', error));
  }, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

function stopMovimientosCriticosCierreSemanalJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  CRITICOS_DIAS,
  CRITICOS_MIN_FALLAS,
  isoWeekInfoFromYmd,
  latestDueSunday,
  loadCurrentSnapshot,
  buildMovements,
  runWeeklyClose,
  checkWeeklyClose,
  startMovimientosCriticosCierreSemanalJob,
  stopMovimientosCriticosCierreSemanalJob
};
