const logger = require('../../shared/logger');

function enabled_gnral(value = process.env.CFFAA_STORAGE_METRICS_ENABLED, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function cleanText(value, max = 255) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, max);
}

function sanitizeDetails_gnral(details) {
  if (!details || typeof details !== 'object') return null;
  const forbidden = new Set(['url', 'access_url', 'sas', 'sig', 'token', 'authorization', 'password', 'secret']);
  const safe = {};
  for (const [key, value] of Object.entries(details)) {
    if (forbidden.has(String(key).toLowerCase())) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') safe[key] = cleanText(JSON.stringify(value), 1000);
    else safe[key] = cleanText(value, 1000);
  }
  return Object.keys(safe).length ? safe : null;
}

function normalizeEvent_gnral(event = {}) {
  const type = cleanText(event.tipo_evento, 40);
  if (!type) throw new Error('tipo_evento es obligatorio para registrar una métrica de Storage.');

  const size = Number(event.tamano_bytes);
  return {
    tipo_evento: type,
    storage_provider: cleanText(event.storage_provider, 30),
    storage_container: cleanText(event.storage_container, 150),
    storage_blob_name: cleanText(event.storage_blob_name, 1024),
    modulo: cleanText(event.modulo, 100),
    entidad_tipo: cleanText(event.entidad_tipo, 100),
    entidad_id: cleanText(event.entidad_id, 150),
    archivo_id: cleanText(event.archivo_id, 150),
    usuario_id: Number.isInteger(Number(event.usuario_id)) && Number(event.usuario_id) > 0 ? Number(event.usuario_id) : null,
    codigo: cleanText(event.codigo, 100),
    tamano_bytes: Number.isFinite(size) && size >= 0 ? Math.floor(size) : null,
    http_method: cleanText(event.http_method, 10),
    request_path: cleanText(event.request_path, 255),
    detalle_json: sanitizeDetails_gnral(event.detalle_json)
  };
}

async function recordEvent_gnral(event) {
  if (!enabled_gnral()) return { recorded: false, disabled: true };
  const repository = require('./storage-metrics.repository');
  const normalized = normalizeEvent_gnral(event);
  const id = await repository.insertEvent_gnral(normalized);
  return { recorded: true, id_evento: id };
}

async function recordEventSafe_gnral(event) {
  try {
    return await recordEvent_gnral(event);
  } catch (error) {
    logger.warn('CFFAA-06: no fue posible registrar una métrica de Storage.', {
      tipo_evento: event && event.tipo_evento,
      error: error.message
    });
    return { recorded: false, error: error.message };
  }
}

async function summary_gnral(days) {
  const repository = require('./storage-metrics.repository');
  return repository.summary_gnral(days);
}

module.exports = {
  enabled_gnral,
  sanitizeDetails_gnral,
  normalizeEvent_gnral,
  recordEvent_gnral,
  recordEventSafe_gnral,
  summary_gnral
};
