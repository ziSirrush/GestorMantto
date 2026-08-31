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

function cleanPublicValue_gnral(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? text.slice(0, 180) : null;
}

function isTechnicalDescription_gnral(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^(accion|acción)\s+(post|put|patch|delete)\b.*(completad[ao]|correctamente)/i.test(text) ||
    /\bhttp\s*(post|put|patch|delete)\b/i.test(text) ||
    /\bendpoint\b/i.test(text);
}

function isInvalidReference_gnral(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || [
    'detalle', 'general', 'equipos', 'tickets', 'proyectos', 'archivos', 'archivo',
    'comentarios', 'comentario', 'adjuntos', 'adjunto', 'dashboard', 'resumen'
  ].includes(text);
}

function entityLabel_gnral(entity, route) {
  const labels = {
    tarea: 'Tarea',
    ticket: 'Ticket',
    cotizacion: 'Cotización',
    prospeccion: 'Prospección',
    redes: 'Asignación a Redes',
    soporte: 'Solicitud de Soporte',
    proyecto: 'Proyecto',
    proyecto_instalaciones: 'Proyecto de Instalación',
    equipo: 'Equipo'
  };
  return labels[String(entity || '').toLowerCase()] || String(route || 'Registro').replace(/[-_]+/g, ' ');
}

function entityFromPublicRow_gnral(row, payload) {
  const direct = String(row?.entidad || '').trim().toLowerCase();
  if (direct) return direct;
  const type = String(payload?.type || '').trim().toLowerCase();
  if (['ticket', 'proyecto', 'equipo'].includes(type)) return type;
  const route = String(row?.ruta_destino || row?.modulo || '').toLowerCase();
  if (route.includes('ticket')) return 'ticket';
  if (route.includes('proyecto')) return 'proyecto';
  if (route.includes('portafolio') || route.includes('equipo')) return 'equipo';
  if (route.includes('cotizacion')) return 'cotizacion';
  if (route.includes('prospeccion')) return 'prospeccion';
  if (route.includes('soporte')) return 'soporte';
  return null;
}

function contextFromPublicRow_gnral(row, payload, detail) {
  const entity = entityFromPublicRow_gnral(row, payload);
  const reference = isInvalidReference_gnral(row?.id_referencia) ? null : cleanPublicValue_gnral(row?.id_referencia);
  const stored = detail?.contexto && typeof detail.contexto === 'object' ? detail.contexto : {};

  const ticket = cleanPublicValue_gnral(
    stored.ticket || payload?.ticket ||
    (entity === 'ticket' ? (payload?.id || reference) : null)
  );
  const proyecto = cleanPublicValue_gnral(
    stored.proyecto || payload?.proyecto || payload?.project ||
    (entity === 'proyecto' || entity === 'proyecto_instalaciones' ? (payload?.id || reference) : null)
  );
  const equipo = cleanPublicValue_gnral(
    stored.equipo || payload?.equipo ||
    (entity === 'equipo' ? (payload?.id || reference) : null)
  );

  return { entity, reference, ticket, proyecto, equipo };
}

function ticketLabel_gnral(value) {
  const text = cleanPublicValue_gnral(value);
  if (!text) return null;
  return /^#/.test(text) ? `Ticket ${text}` : `Ticket #${text}`;
}

function actionVerb_gnral(type, originalTitle) {
  const normalized = String(type || '').toUpperCase();
  const original = String(originalTitle || '');
  const image = /cargaste\s+imagen/i.test(original);
  const verbs = {
    CREAR: 'Creaste',
    EDITAR: 'Editaste',
    ACTUALIZAR: 'Actualizaste',
    COMENTAR: 'Comentaste en',
    CAMBIAR_ESTATUS: 'Cambiaste el estatus de',
    CAMBIAR_PRIORIDAD: 'Cambiaste la prioridad de',
    ASIGNAR: 'Asignaste en',
    VALIDAR: 'Validaste',
    VOBO: 'Registraste Vo.Bo. en',
    ADJUNTAR: image ? 'Cargaste imagen en' : 'Adjuntaste archivo en',
    ELIMINAR: 'Eliminaste'
  };
  return verbs[normalized] || 'Actualizaste';
}

function publicCopy_gnral(row, payload, detail) {
  const context = contextFromPublicRow_gnral(row, payload, detail);
  const label = entityLabel_gnral(context.entity, row?.ruta_destino || row?.modulo);
  let primary = null;

  if (context.entity === 'ticket') primary = ticketLabel_gnral(context.ticket || context.reference);
  else if (context.entity === 'proyecto' || context.entity === 'proyecto_instalaciones') {
    primary = context.proyecto ? `Proyecto ${context.proyecto}` : (context.reference ? `${label} ${context.reference}` : label);
  } else if (context.entity === 'equipo') {
    primary = context.equipo ? `Equipo ${context.equipo}` : (context.reference ? `Equipo ${context.reference}` : 'Equipo');
  } else {
    primary = context.reference ? `${label} ${context.reference}` : label;
  }

  const originalTitle = String(row?.titulo || '').trim();
  const rebuiltTitle = `${actionVerb_gnral(row?.tipo_interaccion, originalTitle)} ${primary}`.replace(/\s+/g, ' ').trim();
  const knownTypes = new Set([
    'CREAR', 'EDITAR', 'ACTUALIZAR', 'COMENTAR', 'CAMBIAR_ESTATUS',
    'CAMBIAR_PRIORIDAD', 'ASIGNAR', 'VALIDAR', 'VOBO', 'ADJUNTAR', 'ELIMINAR'
  ]);
  const title = (knownTypes.has(String(row?.tipo_interaccion || '').toUpperCase())
    ? rebuiltTitle
    : (originalTitle || rebuiltTitle)).slice(0, 255);

  const parts = [];
  if (context.ticket) parts.push(ticketLabel_gnral(context.ticket));
  if (context.proyecto) parts.push(`Proyecto ${context.proyecto}`);
  if (context.equipo) parts.push(`Equipo ${context.equipo}`);
  const unique = [];
  parts.filter(Boolean).forEach(part => { if (!unique.includes(part)) unique.push(part); });
  const contextualDescription = (unique.length ? unique.join(' · ') : primary).slice(0, 500);

  const originalDescription = String(row?.descripcion || '').trim();
  const description = (!originalDescription || isTechnicalDescription_gnral(originalDescription))
    ? contextualDescription
    : originalDescription.slice(0, 500);

  return { title, description };
}

function safeDetailForClient_gnral(detail) {
  const context = detail?.contexto && typeof detail.contexto === 'object' ? detail.contexto : null;
  if (!context) return null;
  return {
    contexto: {
      ticket: cleanPublicValue_gnral(context.ticket),
      proyecto: cleanPublicValue_gnral(context.proyecto),
      equipo: cleanPublicValue_gnral(context.equipo)
    }
  };
}

function toPublicInteraction_gnral(row) {
  const payload = parseDbJson_gnral(row?.payload_json);
  const detail = parseDbJson_gnral(row?.detalle_json);
  const copy = publicCopy_gnral(row, payload, detail);

  // No se exponen datos técnicos del transporte/auditoría al navegador.
  // Permanecen almacenados en Aiven para diagnóstico interno.
  const {
    metodo_http: _method,
    endpoint: _endpoint,
    ip_address: _ip,
    user_agent: _ua,
    detalle_json: _detail,
    ...publicRow
  } = row || {};

  return {
    ...publicRow,
    titulo: copy.title,
    descripcion: copy.description,
    payload_json: payload,
    detalle_json: safeDetailForClient_gnral(detail)
  };
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
  return {
    id_interaccion: id,
    ...row,
    payload_json: jsonObject_gnral(data.payload_json),
    detalle_json: jsonObject_gnral(data.detalle_json)
  };
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

  return rows.map(toPublicInteraction_gnral);
}

module.exports = {
  record_gnral,
  recordFromRequest_gnral,
  listForUser_gnral
};
