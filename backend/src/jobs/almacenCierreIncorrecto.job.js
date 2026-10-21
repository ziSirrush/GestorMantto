'use strict';

const db = require('../config/db');
const logger = require('../shared/logger');
const sourceEngine = require('../modules/almacen/almacen.source-engine');
const azureStorage = require('../services/storage/azure-storage.service');
const permissionService = require('../services/permissions/effective-permission.service');
const { emitBusinessEventSafe_gnral } = require('../services/notifications/notification-business-emitter.service');

const EVENT_CODE = 'ALMACEN_CIERRE_INCORRECTO_4H';
const LOAD_PERMISSION = 'ALMACEN_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const ARCHIVE_TYPE = sourceEngine.RECORD_TYPES.ARCHIVE;
const TZ = process.env.ALMACEN_CIERRE_ALERT_TZ || 'America/Mexico_City';
const THRESHOLD_MINUTES = 4 * 60;
const INTERVAL_MS = Math.max(60000, Number(process.env.ALMACEN_CIERRE_ALERT_INTERVAL_MS || 300000));
const ENABLED = String(process.env.ALMACEN_CIERRE_ALERT_ENABLED || 'true').toLowerCase() !== 'false';

let timer = null;
let running = false;

function zonedDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:TZ,
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return { year:Number(parts.year), month:Number(parts.month), day:Number(parts.day) };
}

function previousMonthRange(date = new Date()) {
  const current = zonedDateParts(date);
  const lastDay = new Date(Date.UTC(current.year, current.month - 1, 0));
  const year = lastDay.getUTCFullYear();
  const month = lastDay.getUTCMonth() + 1;
  const day = lastDay.getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    year,
    month,
    start:`${year}-${mm}-01`,
    end:`${year}-${mm}-${String(day).padStart(2, '0')}`,
    key:`${year}-${mm}`
  };
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function dateInside(value, range) {
  const normalized = dateOnly(value);
  return Boolean(normalized && normalized >= range.start && normalized <= range.end);
}

function activationIdentity(row) {
  const value = row?.activatedAt;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value || '').trim();
}

async function activeOperationalSource(conn = db) {
  const [rows] = await conn.query(
    `SELECT lote_importacion AS loteImportacion,
            MAX(archivo_origen) AS archivoOrigen,
            MAX(fecha_corte) AS fechaCorte,
            MAX(CASE WHEN tipo_registro<>? THEN updated_at END) AS activatedAt,
            TIMESTAMPDIFF(
              MINUTE,
              MAX(CASE WHEN tipo_registro<>? THEN updated_at END),
              NOW()
            ) AS activeMinutes
       FROM ${sourceEngine.TABLE}
      WHERE activo=1
      GROUP BY lote_importacion
      HAVING MAX(CASE WHEN tipo_registro<>? THEN 1 ELSE 0 END)=1
      ORDER BY activatedAt DESC
      LIMIT 1`,
    [ARCHIVE_TYPE, ARCHIVE_TYPE, ARCHIVE_TYPE]
  );
  return rows[0] || null;
}

async function expectedArchivedSource(range, conn = db) {
  const [rows] = await conn.query(
    `SELECT lote_importacion AS loteImportacion,
            MAX(archivo_origen) AS archivoOrigen,
            MAX(fecha_corte) AS fechaCorte,
            MAX(fecha_importacion) AS fechaImportacion
       FROM ${sourceEngine.TABLE}
      WHERE tipo_registro=?
        AND fecha_corte BETWEEN ? AND ?
      GROUP BY lote_importacion
      ORDER BY MAX(fecha_importacion) DESC
      LIMIT 1`,
    [ARCHIVE_TYPE, range.start, range.end]
  );
  if (!rows.length) return null;

  const record = await sourceEngine.archiveRecordByLot(rows[0].loteImportacion, conn);
  if (!record) return null;
  const exists = await azureStorage.blobExists_gnral(record.metadata.storage_blob_name, {
    containerName:record.metadata.storage_container
  });
  return exists ? rows[0] : null;
}

async function checkAlmacenCierreIncorrecto(date = new Date(), dependencies = {}) {
  if (!ENABLED && dependencies.ignoreEnabled !== true) return { skipped:true, reason:'disabled' };
  if (running) return { skipped:true, reason:'already_running' };
  running = true;
  try {
    const conn = dependencies.db || db;
    const active = await activeOperationalSource(conn);
    if (!active) return { skipped:true, reason:'no_active_source' };

    const range = previousMonthRange(date);
    if (dateInside(active.fechaCorte, range)) {
      return { skipped:true, reason:'correct_previous_month', active, expectedRange:range };
    }
    if (Number(active.activeMinutes || 0) < THRESHOLD_MINUTES) {
      return { skipped:true, reason:'threshold_not_reached', active, expectedRange:range };
    }

    const expected = await expectedArchivedSource(range, conn);
    if (!expected) {
      return { skipped:true, reason:'expected_file_not_loaded', active, expectedRange:range };
    }

    const permissionLookup = dependencies.permissionService || permissionService;
    const recipients = await permissionLookup.listUsersWithEffectivePermission(LOAD_PERMISSION, conn);
    if (!recipients.length) {
      return { skipped:true, reason:'no_authorized_recipients', active, expected, expectedRange:range };
    }

    const emitter = dependencies.emit || emitBusinessEventSafe_gnral;
    const emitted = await emitter({
      codigoEvento:EVENT_CODE,
      destinatarios:recipients,
      titulo:'Archivo de Almacén incorrecto en uso',
      mensaje:`El cierre ${active.archivoOrigen || active.loteImportacion} lleva más de 4 horas activo y no corresponde al mes anterior (${range.key}). El archivo ${expected.archivoOrigen || expected.loteImportacion} ya está cargado; entra a Carga de Información y selecciona “Usar este cierre”.`,
      accion:'ABRIR_MODULO',
      ruta:'almacen-carga',
      zonaOperativaNoAplica:true,
      eventInstanceKey:`${active.loteImportacion}|${activationIdentity(active)}|${expected.loteImportacion}`
    }, { label:'almacen-cierre-incorrecto-4h' });

    return { ok:true, active, expected, expectedRange:range, recipients, emitted };
  } finally {
    running = false;
  }
}

function startAlmacenCierreIncorrectoJob() {
  if (!ENABLED) {
    logger.info('[Almacen] Alerta de cierre incorrecto desactivada por variable de entorno.');
    return null;
  }
  if (timer) return timer;

  logger.info(`[Almacen] Alerta de cierre incorrecto activa: umbral 4 h, revisión cada ${Math.round(INTERVAL_MS / 60000)} min (${TZ}).`);
  checkAlmacenCierreIncorrecto().catch(error => logger.error('[Almacen] Falló la revisión inicial del cierre activo.', error));
  timer = setInterval(() => {
    checkAlmacenCierreIncorrecto().catch(error => logger.error('[Almacen] Falló el job de cierre incorrecto.', error));
  }, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

function stopAlmacenCierreIncorrectoJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  EVENT_CODE,
  LOAD_PERMISSION,
  THRESHOLD_MINUTES,
  previousMonthRange,
  dateInside,
  activeOperationalSource,
  expectedArchivedSource,
  checkAlmacenCierreIncorrecto,
  startAlmacenCierreIncorrectoJob,
  stopAlmacenCierreIncorrectoJob
};
