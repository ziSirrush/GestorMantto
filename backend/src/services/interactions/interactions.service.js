'use strict';

const repository = require('./interactions.repository');

function positiveId_gnral(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function text_gnral(value, maxLength, fallback = null) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function jsonObject_gnral(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }
  return value && typeof value === 'object' ? value : null;
}

function jsonForDb_gnral(value) {
  const objectValue = jsonObject_gnral(value);
  if (!objectValue) return null;
  const json = JSON.stringify(objectValue);
  if (Buffer.byteLength(json, 'utf8') > 65535) return null;
  return json;
}

function parseDbJson_gnral(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    return null;
  }
}

function normalizeType_gnral(value) {
  const normalized = text_gnral(value, 50, 'INTERACCION')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return normalized || 'INTERACCION';
}

function normalizeLimit_gnral(value, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(200, Math.max(1, Math.trunc(parsed)));
}

function normalizeOffset_gnral(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

function requestIp_gnral(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return text_gnral(forwarded || req.ip || req.socket?.remoteAddress, 45, null);
}

function actorFromRequest_gnral(req) {
  return req.actorUser || req.user || req.contextUser || {};
}

function contextFromRequest_gnral(req) {
  return req.contextUser || req.user || req.actorUser || {};
}

async function record_gnral(input, options = {}) {
  const data = input || {};
  const userId = positiveId_gnral(data.id_usuario || data.userId);
  if (!userId) {
    const error = new Error('Usuario inválido para registrar interacción.');
    error.status = 400;
    throw error;
  }

  const tipo = normalizeType_gnral(data.tipo_interaccion || data.tipo);
  const modulo = text_gnral(data.modulo, 120, 'general');
  const titulo = text_gnral(data.titulo, 255, `${tipo} en ${modulo}`);

  const row = {
    id_usuario: userId,
    tipo_interaccion: tipo,
    modulo,
    entidad: text_gnral(data.entidad, 100, null),
    id_referencia: text_gnral(data.id_referencia, 150, null),
    titulo,
    descripcion: text_gnral(data.descripcion, 500, null),
    empresa_contexto: text_gnral(data.empresa_contexto, 150, null),
    ruta_destino: text_gnral(data.ruta_destino, 500, null),
    payload_json: jsonForDb_gnral(data.payload_json),
    detalle_json: jsonForDb_gnral(data.detalle_json),
    metodo_http: text_gnral(data.metodo_http, 10, null)?.toUpperCase() || null,
    endpoint: text_gnral(data.endpoint, 500, null),
    ip_address: text_gnral(data.ip_address, 45, null),
    user_agent: text_gnral(data.user_agent, 500, null)
  };

  const id = await repository.insert_gnral(row, options.executor);
  return { id_interaccion: id, ...row, payload_json: jsonObject_gnral(data.payload_json), detalle_json: jsonObject_gnral(data.detalle_json) };
}

async function recordFromRequest_gnral(req, input, options = {}) {
  const actor = actorFromRequest_gnral(req);
  const context = contextFromRequest_gnral(req);
  return record_gnral({
    ...(input || {}),
    id_usuario: actor.id_SB || actor.id,
    empresa_contexto: input?.empresa_contexto || context.empresa || actor.empresa || null,
    ip_address: requestIp_gnral(req),
    user_agent: req.get ? req.get('user-agent') : req.headers?.['user-agent']
  }, options);
}

async function listForUser_gnral(userId, options = {}) {
  const id = positiveId_gnral(userId);
  if (!id) return [];

  const rows = await repository.listForUser_gnral({
    userId: id,
    limit: normalizeLimit_gnral(options.limit, 100),
    offset: normalizeOffset_gnral(options.offset)
  });

  return rows.map(row => ({
    ...row,
    payload_json: parseDbJson_gnral(row.payload_json),
    detalle_json: parseDbJson_gnral(row.detalle_json)
  }));
}

module.exports = {
  record_gnral,
  recordFromRequest_gnral,
  listForUser_gnral
};
