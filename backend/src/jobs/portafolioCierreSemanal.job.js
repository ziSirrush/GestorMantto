const crypto = require('crypto');
const db = require('../config/db');

const TZ = process.env.PORTAFOLIO_CIERRE_SEMANAL_TZ || 'America/Mexico_City';
const HOUR = Number.parseInt(process.env.PORTAFOLIO_CIERRE_SEMANAL_HOUR || '12', 10);
const MINUTE = Number.parseInt(process.env.PORTAFOLIO_CIERRE_SEMANAL_MINUTE || '0', 10);
const ENABLED = String(process.env.PORTAFOLIO_CIERRE_SEMANAL_ENABLED || 'true').toLowerCase() !== 'false';

let lastRunKey = null;
let timer = null;

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
  const fmt = value => value.toISOString().slice(0, 10);
  return { anio_iso: isoYear, semana_iso: isoWeek, fecha_inicio: fmt(monday), fecha_fin: fmt(sunday) };
}

function normalizeStatus(value) {
  return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isService(value) {
  const status = normalizeStatus(value);
  return status === 'en servicio' || status === 'servicio';
}

function movementType(previous, current) {
  if (isService(previous) && !isService(current)) return 'DEGRADADO';
  if (!isService(previous) && isService(current)) return 'RECUPERADO';
  return 'CAMBIO';
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (error) { return fallback; }
}

async function loadCurrentSnapshot() {
  const [rows] = await db.query(`
    SELECT
      p.numero_equipo,
      p.proyecto AS proyecto_codigo,
      COALESCE(NULLIF(TRIM(p.proyecto_cc_x_port), ''), p.proyecto) AS proyecto,
      p.zona_operativa AS zona,
      p.supervisor_zona AS supervisor,
      p.estatus_servicio AS estatus
    FROM portafolio p
    WHERE p.estado_registro = 1
      AND (p.inactivo IS NULL OR UPPER(p.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
      AND p.numero_equipo IS NOT NULL
      AND TRIM(p.numero_equipo) <> ''
    ORDER BY p.numero_equipo ASC
  `);

  return rows.map(row => ({
    equipo: row.numero_equipo,
    estatus: row.estatus || '',
    proyecto_codigo: row.proyecto_codigo || '',
    proyecto: row.proyecto || row.proyecto_codigo || '',
    zona: row.zona || '',
    supervisor: row.supervisor || ''
  }));
}

async function getPreviousClosedCut(anioIso, semanaIso) {
  const [rows] = await db.query(`
    SELECT id_corte, anio_iso, semana_iso, snapshot_json
    FROM portafolio_cortes_semanales
    WHERE estado = 'CERRADO'
      AND (anio_iso < ? OR (anio_iso = ? AND semana_iso < ?))
    ORDER BY anio_iso DESC, semana_iso DESC
    LIMIT 1
  `, [anioIso, anioIso, semanaIso]);
  return rows[0] || null;
}

function buildMovements(previousSnapshot, currentSnapshot, timestamp) {
  const previousMap = new Map(previousSnapshot.map(row => [String(row.equipo), row]));
  const movements = [];

  currentSnapshot.forEach(current => {
    const previous = previousMap.get(String(current.equipo));
    if (!previous) return;
    if (normalizeStatus(previous.estatus) === normalizeStatus(current.estatus)) return;

    movements.push({
      tipo: movementType(previous.estatus, current.estatus),
      equipo: current.equipo,
      proyecto_codigo: current.proyecto_codigo,
      proyecto: current.proyecto,
      zona: current.zona,
      estatus_anterior: previous.estatus,
      estatus_actual: current.estatus,
      supervisor: current.supervisor,
      fecha_movimiento: timestamp
    });
  });

  return movements;
}

async function runWeeklyClose(date = new Date(), generatedBy = null) {
  const parts = zonedParts(date);
  const iso = isoWeekInfoFromYmd(parts.year, parts.month, parts.day);

  const [existingRows] = await db.query(
    `SELECT id_corte, estado FROM portafolio_cortes_semanales WHERE anio_iso = ? AND semana_iso = ? LIMIT 1`,
    [iso.anio_iso, iso.semana_iso]
  );
  if (existingRows.length && existingRows[0].estado === 'CERRADO') {
    return { skipped: true, reason: 'already_closed', id_corte: existingRows[0].id_corte, ...iso };
  }

  const currentSnapshot = await loadCurrentSnapshot();
  const previousCut = await getPreviousClosedCut(iso.anio_iso, iso.semana_iso);
  const previousSnapshot = previousCut ? parseJson(previousCut.snapshot_json, []) : [];
  const movements = previousCut ? buildMovements(previousSnapshot, currentSnapshot, parts.datetime) : [];

  const totals = movements.reduce((acc, row) => {
    acc.total += 1;
    if (row.tipo === 'DEGRADADO') acc.salidas += 1;
    else if (row.tipo === 'RECUPERADO') acc.regresos += 1;
    else acc.cambios += 1;
    return acc;
  }, { total: 0, salidas: 0, regresos: 0, cambios: 0 });

  const snapshotJson = JSON.stringify(currentSnapshot);
  const movementsJson = JSON.stringify(movements);
  const hash = crypto.createHash('sha256').update(snapshotJson + '|' + movementsJson).digest('hex');

  const values = [
    iso.anio_iso,
    iso.semana_iso,
    iso.fecha_inicio,
    iso.fecha_fin,
    parts.datetime,
    previousCut ? previousCut.id_corte : null,
    currentSnapshot.length,
    totals.total,
    totals.salidas,
    totals.regresos,
    totals.cambios,
    snapshotJson,
    movementsJson,
    'CERRADO',
    hash,
    generatedBy
  ];

  await db.query(`
    INSERT INTO portafolio_cortes_semanales (
      anio_iso, semana_iso, fecha_inicio, fecha_fin, fecha_corte,
      id_corte_anterior, total_portafolio, total_movimientos,
      total_salidas, total_regresos, total_cambios,
      snapshot_json, movimientos_json, estado, hash_contenido, generado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      fecha_inicio = VALUES(fecha_inicio),
      fecha_fin = VALUES(fecha_fin),
      fecha_corte = VALUES(fecha_corte),
      id_corte_anterior = VALUES(id_corte_anterior),
      total_portafolio = VALUES(total_portafolio),
      total_movimientos = VALUES(total_movimientos),
      total_salidas = VALUES(total_salidas),
      total_regresos = VALUES(total_regresos),
      total_cambios = VALUES(total_cambios),
      snapshot_json = VALUES(snapshot_json),
      movimientos_json = VALUES(movimientos_json),
      estado = VALUES(estado),
      hash_contenido = VALUES(hash_contenido),
      generado_por = VALUES(generado_por)
  `, values);

  console.log('[Portafolio] Cierre semanal ejecutado:', {
    anio_iso: iso.anio_iso,
    semana_iso: iso.semana_iso,
    total_portafolio: currentSnapshot.length,
    total_movimientos: totals.total,
    linea_base: !previousCut
  });

  return { ok: true, ...iso, total_portafolio: currentSnapshot.length, ...totals, linea_base: !previousCut };
}

async function checkWeeklyClose(date = new Date()) {
  if (!ENABLED) return { skipped: true, reason: 'disabled' };
  const parts = zonedParts(date);
  const iso = isoWeekInfoFromYmd(parts.year, parts.month, parts.day);
  const runKey = `${iso.anio_iso}-${String(iso.semana_iso).padStart(2, '0')}`;
  const scheduledMinutes = HOUR * 60 + MINUTE;
  const currentMinutes = parts.hour * 60 + parts.minute;
  const shouldRun = parts.weekday === 'Sun' && currentMinutes >= scheduledMinutes;

  if (!shouldRun) return { skipped: true, reason: 'not_scheduled_time', parts, iso };
  if (lastRunKey === runKey) return { skipped: true, reason: 'already_ran_in_process', parts, iso };

  lastRunKey = runKey;
  try {
    return await runWeeklyClose(date);
  } catch (error) {
    lastRunKey = null;
    console.error('[Portafolio] Error ejecutando cierre semanal:', error.message);
    return { ok: false, error: error.message, parts, iso };
  }
}

function startPortafolioCierreSemanalJob() {
  if (!ENABLED) {
    console.log('[Portafolio] Cierre semanal automático desactivado por variable de entorno.');
    return null;
  }
  if (timer) return timer;

  console.log(`[Portafolio] Cierre semanal automático activo: domingo ${String(HOUR).padStart(2, '0')}:${String(MINUTE).padStart(2, '0')} (${TZ}).`);
  timer = setInterval(() => {
    checkWeeklyClose().catch(error => console.error('[Portafolio] Error en job semanal:', error.message));
  }, 30000);
  timer.unref?.();
  return timer;
}

module.exports = {
  startPortafolioCierreSemanalJob,
  checkWeeklyClose,
  runWeeklyClose,
  isoWeekInfoFromYmd
};
