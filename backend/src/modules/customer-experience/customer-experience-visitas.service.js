'use strict';

// [ChatGPT | 2026-10-15 | BLT NOW | CX VISITAS FASE 2 V001]
// Contrato minimo de API basado UNICAMENTE en Fase 1, sin inventar flujo CX.
// Lecturas por alcance del Guard General. Escrituras atomicas + actor real.

const repository = require('./customer-experience-visitas.repository');

const PERMISSIONS_COR = Object.freeze({
  visual: 'CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  list: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER',
  create: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.CREAR',
  edit: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.EDITAR',
  deactivate: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.DESACTIVAR',
  history: 'CUSTOMER_EXPERIENCE_VISITAS_GESTION_REGISTROS.VER_HISTORIAL'
});

const INPUT_FIELDS_COR = Object.freeze({
  titulo: { max: 200, required: true },
  objetivo: { max: 10000 },
  observaciones: { max: 10000 },
  referencia_origen: { max: 40 },
  referencia_id: { max: 120 },
  proyecto_nombre: { max: 200 },
  cliente_nombre: { max: 200 },
  ubicacion: { max: 255 },
  fecha_programada_utc: { type: 'utc' },
  id_usuario_responsable: { type: 'id' }
});

function error_cor(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function id_cor(raw, fieldName = 'id') {
  if (!/^[1-9]\d*$/.test(String(raw ?? ''))) {
    throw error_cor(400, 'CX_VISITAS_ID_INVALIDO', `${fieldName} debe ser un entero positivo.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw error_cor(400, 'CX_VISITAS_ID_INVALIDO', `${fieldName} esta fuera del rango admitido.`);
  }
  return value;
}

function pagination_cor(query = {}) {
  const page = query.page == null ? 1 : id_cor(query.page, 'page');
  const page_size = query.page_size == null ? 25 : id_cor(query.page_size, 'page_size');
  if (page_size > 100 || page > 100000 || (page - 1) * page_size > 1000000) {
    throw error_cor(400, 'CX_VISITAS_PAGINACION_INVALIDA', 'La paginacion supera el limite permitido.');
  }
  return { page, page_size, offset: (page - 1) * page_size };
}

function civilDate_cor(raw, fieldName) {
  if (raw == null || raw === '') return null;
  const value = String(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw error_cor(400, 'CX_VISITAS_FECHA_INVALIDA', `${fieldName} debe tener formato YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw error_cor(400, 'CX_VISITAS_FECHA_INVALIDA', `${fieldName} no representa un dia valido.`);
  }
  return value;
}

function utcInput_cor(value, fieldName) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw error_cor(400, 'CX_VISITAS_FECHA_INVALIDA', `${fieldName} debe ser una fecha ISO-8601 con zona horaria.`);
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) {
    throw error_cor(400, 'CX_VISITAS_FECHA_INVALIDA', `${fieldName} requiere ISO-8601 con Z u offset, por ejemplo 2026-10-15T18:00:00Z.`);
  }
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  civilDate_cor(`${m[1]}-${m[2]}-${m[3]}`, fieldName);
  const offset = m[8];
  const offsetHour = offset === 'Z' ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === 'Z' ? 0 : Number(offset.slice(4, 6));
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
    throw error_cor(400, 'CX_VISITAS_FECHA_INVALIDA', `${fieldName} tiene hora o zona invalida.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1000) {
    throw error_cor(400, 'CX_VISITAS_FECHA_INVALIDA', `${fieldName} no representa una fecha valida.`);
  }
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

function parseText_cor(value, spec, fieldName) {
  if (value === null) {
    if (spec.required) throw error_cor(400, 'CX_VISITAS_CAMPO_REQUERIDO', `${fieldName} no puede ser nulo.`);
    return null;
  }
  if (typeof value !== 'string') {
    throw error_cor(400, 'CX_VISITAS_CAMPO_INVALIDO', `${fieldName} debe ser texto.`);
  }
  const text = value.trim();
  if (!text) {
    if (spec.required) throw error_cor(400, 'CX_VISITAS_CAMPO_REQUERIDO', `${fieldName} es obligatorio.`);
    return null;
  }
  if ([...text].length > spec.max || Buffer.byteLength(text, 'utf8') > (spec.max >= 10000 ? 65000 : spec.max * 4)) {
    throw error_cor(400, 'CX_VISITAS_CAMPO_LARGO', `${fieldName} excede el maximo permitido.`);
  }
  return text;
}

function normalizeBody_cor(raw, create = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype) {
    throw error_cor(400, 'CX_VISITAS_CUERPO_INVALIDO', 'El cuerpo debe ser un objeto JSON.');
  }
  const fields = Object.keys(raw);
  if (!fields.length) throw error_cor(400, 'CX_VISITAS_CUERPO_VACIO', 'No hay campos para guardar.');
  const unknown = fields.filter(key => !Object.hasOwn(INPUT_FIELDS_COR, key));
  if (unknown.length) {
    throw error_cor(400, 'CX_VISITAS_CAMPOS_NO_PERMITIDOS', `Campos no permitidos: ${unknown.join(', ').slice(0, 250)}.`);
  }
  if (create && !Object.hasOwn(raw, 'titulo')) {
    throw error_cor(400, 'CX_VISITAS_CAMPO_REQUERIDO', 'titulo es obligatorio.');
  }
  const data = {};
  for (const key of fields) {
    const spec = INPUT_FIELDS_COR[key];
    const value = raw[key];
    if (spec.type === 'utc') data[key] = utcInput_cor(value, key);
    else if (spec.type === 'id') data[key] = value === null ? null : id_cor(value, key);
    else data[key] = parseText_cor(value, spec, key);
  }
  if (create) {
    for (const key of Object.keys(INPUT_FIELDS_COR)) {
      if (!Object.hasOwn(data, key)) data[key] = null;
    }
  }
  return data;
}

function utcDbComparable_cor(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '');
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)) {
      const [prefix, fractional = ''] = value.split('.');
      return `${prefix}.${fractional.padEnd(3, '0')}`;
    }
  }
  throw error_cor(503, 'CX_VISITAS_FECHA_BD_INVALIDA', 'El backend recibio una fecha fuera del contrato UTC.');
}

function onlyChanges_cor(existing, incoming) {
  const result = {};
  for (const [key, value] of Object.entries(incoming)) {
    const original = key === 'fecha_programada_utc'
      ? utcDbComparable_cor(existing[key])
      : existing[key] == null ? null : key === 'id_usuario_responsable' ? Number(existing[key]) : String(existing[key]);
    if (original !== value) result[key] = value;
  }
  return result;
}

function scope_cor(req, isWrite = false) {
  const information = req?.informationAccess;
  const effective = req?.contextUser || req?.user;
  const actor = req?.actorUser;
  const effectiveId = id_cor(effective?.id_SB || effective?.id, 'usuario efectivo');
  const actorId = id_cor(actor?.id_SB || actor?.id, 'usuario actor');

  if (!information || information.acceso_puerta !== true
      || information.dominio !== 'CORELLIAN'
      || information.agrupacion?.codigo !== 'CUSTOMER_EXPERIENCE'
      || Number(information.effective_user_id) !== effectiveId
      || Number(information.actor_user_id) !== actorId) {
    throw error_cor(403, 'CX_VISITAS_ALCANCE_INVALIDO', 'El alcance CX no esta autorizado.');
  }
  if (isWrite && (req.viewerContext?.active === true || effectiveId !== actorId)) {
    throw error_cor(403, 'VIEWER_READ_ONLY', 'El Visor de usuarios no puede realizar cambios.');
  }

  if (information.acceso_dominio_completo === true && information.requiere_filtro_usuario !== true) {
    return { full: true, users: [], effectiveId, actorId };
  }
  if (information.requiere_filtro_usuario !== true || !Array.isArray(information.usuarios_visibles)) {
    throw error_cor(403, 'CX_VISITAS_ALCANCE_INVALIDO', 'No se pudo determinar el alcance de registros.');
  }
  if (information.usuarios_visibles.length > 2000) {
    throw error_cor(503, 'CX_VISITAS_ALCANCE_EXCESIVO', 'El alcance supera el limite seguro de consulta.');
  }
  const users = [...new Set(information.usuarios_visibles.map(Number))]
    .filter(id => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b);
  if (!users.includes(effectiveId)) {
    throw error_cor(403, 'CX_VISITAS_USUARIO_FUERA_ALCANCE', 'El usuario efectivo no esta dentro del alcance permitido.');
  }
  return { full: false, users, effectiveId, actorId };
}

function filters_cor(query = {}) {
  const pagination = pagination_cor(query);
  const q = query.q == null ? null : parseText_cor(query.q, { max: 100 }, 'q');
  const estado = query.estado == null || query.estado === '' ? null : String(query.estado).trim().toUpperCase();
  if (estado !== null && estado !== 'BORRADOR') {
    throw error_cor(400, 'CX_VISITAS_ESTADO_INVALIDO', 'Fase 2 solo consulta el estado BORRADOR.');
  }
  const responsable = query.id_usuario_responsable == null || query.id_usuario_responsable === ''
    ? null : id_cor(query.id_usuario_responsable, 'id_usuario_responsable');
  const desde = civilDate_cor(query.desde, 'desde');
  const hasta = civilDate_cor(query.hasta, 'hasta');
  if (desde && hasta && desde > hasta) {
    throw error_cor(400, 'CX_VISITAS_RANGO_INVALIDO', 'desde no puede ser posterior a hasta.');
  }
  const hastaFin = hasta ? `${hasta} 23:59:59.999` : null;
  return {
    ...pagination, q, estado, id_usuario_responsable: responsable,
    desde: desde ? `${desde} 00:00:00.000` : null,
    hasta_fin: hastaFin
  };
}

async function withConnection_cor(operation, transactional = false) {
  const connection = await repository.getConnection_cor();
  let begun = false;
  try {
    if (transactional) {
      await connection.beginTransaction();
      begun = true;
    }
    const data = await operation(connection);
    if (begun) {
      await connection.commit();
      begun = false;
    }
    return data;
  } catch (error) {
    if (begun) {
      try { await connection.rollback(); }
      catch (rollbackError) { console.error('[CX_VISITAS_ROLLBACK_ERROR]', rollbackError); }
    }
    throw error;
  } finally {
    connection.release();
  }
}

function mustExist_cor(row) {
  if (!row) throw error_cor(404, 'CX_VISITAS_NO_ENCONTRADA', 'La visita no existe o esta fuera de tu alcance.');
  return row;
}

function canEdit_cor(row, ctx) {
  return ctx.full || Number(row.id_usuario_creador) === ctx.actorId
    || Number(row.id_usuario_responsable) === ctx.actorId;
}

async function validateAssignee_cor(connection, assignee, ctx) {
  if (assignee === null) return;
  if (!ctx.full && !ctx.users.includes(assignee)) {
    throw error_cor(403, 'CX_VISITAS_RESPONSABLE_FUERA_ALCANCE', 'El responsable esta fuera de tu alcance autorizado.');
  }
  const user = await repository.getActiveAssignee_cor(connection, assignee);
  if (!user || !String(user.empresa || '').toUpperCase().includes('CORELLIAN')) {
    throw error_cor(400, 'CX_VISITAS_RESPONSABLE_INVALIDO', 'El responsable debe ser un usuario activo de Corellian.');
  }
}

function enforceReferencePair_cor(record) {
  const origin = record.referencia_origen || null;
  const id = record.referencia_id || null;
  if (Boolean(origin) !== Boolean(id)) {
    throw error_cor(400, 'CX_VISITAS_REFERENCIA_INCOMPLETA', 'referencia_origen y referencia_id deben proporcionarse juntos.');
  }
}

async function list_cor(req, query) {
  const ctx = scope_cor(req);
  const filters = filters_cor(query);
  return withConnection_cor(async connection => {
    const result = await repository.list_cor(connection, filters, ctx);
    return { visitas: result.rows, total: result.total, page: filters.page, page_size: filters.page_size };
  });
}

async function get_cor(req, rawId) {
  const ctx = scope_cor(req);
  const id = id_cor(rawId, 'id_visita');
  return withConnection_cor(async connection => {
    const row = mustExist_cor(await repository.getById_cor(connection, id, ctx));
    return { visita: row };
  });
}

async function history_cor(req, rawId, query) {
  const ctx = scope_cor(req);
  const id = id_cor(rawId, 'id_visita');
  const pagination = pagination_cor(query);
  return withConnection_cor(async connection => {
    // VER_HISTORIAL permite auditar tambien una visita dada de baja,
    // siempre con alcance de registro y permiso visual efectivos.
    mustExist_cor(await repository.getById_cor(connection, id, ctx, { includeInactive: true }));
    const result = await repository.listHistory_cor(connection, id, pagination);
    return { eventos: result.rows, total: result.total, page: pagination.page, page_size: pagination.page_size };
  });
}

async function create_cor(req, rawBody) {
  const ctx = scope_cor(req, true);
  const data = normalizeBody_cor(rawBody, true);
  enforceReferencePair_cor(data);
  return withConnection_cor(async connection => {
    await validateAssignee_cor(connection, data.id_usuario_responsable, ctx);
    const id = await repository.insert_cor(connection, data, ctx.actorId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw error_cor(503, 'CX_VISITAS_ID_NO_GENERADO', 'La base no devolvio un identificador valido.');
    }
    await repository.insertHistory_cor(connection, id, ctx.actorId, 'CREAR', {
      campos: Object.keys(data).filter(key => data[key] !== null),
      estado: 'BORRADOR'
    });
    const created = mustExist_cor(await repository.getById_cor(connection, id, ctx));
    return { visita: created };
  }, true);
}

async function edit_cor(req, rawId, rawBody) {
  const ctx = scope_cor(req, true);
  const id = id_cor(rawId, 'id_visita');
  const data = normalizeBody_cor(rawBody);
  return withConnection_cor(async connection => {
    const existing = mustExist_cor(await repository.getById_cor(connection, id, ctx, { forUpdate: true }));
    if (!canEdit_cor(existing, ctx)) {
      throw error_cor(403, 'CX_VISITAS_EDICION_NO_AUTORIZADA', 'Solo el creador o responsable puede modificar esta visita con alcance limitado.');
    }
    enforceReferencePair_cor({ ...existing, ...data });
    const changed = onlyChanges_cor(existing, data);
    if (Object.hasOwn(changed, 'id_usuario_responsable')) {
      await validateAssignee_cor(connection, changed.id_usuario_responsable, ctx);
    }
    if (!Object.keys(changed).length) return { visita: existing, sin_cambios: true };
    const affected = await repository.update_cor(connection, id, changed, ctx.actorId);
    if (affected !== 1) throw error_cor(409, 'CX_VISITAS_CONFLICTO', 'La visita cambio durante la actualizacion.');
    await repository.insertHistory_cor(connection, id, ctx.actorId, 'EDITAR', {
      campos: Object.keys(changed)
    });
    const modified = mustExist_cor(await repository.getById_cor(connection, id, ctx));
    return { visita: modified, sin_cambios: false };
  }, true);
}

async function deactivate_cor(req, rawId) {
  const ctx = scope_cor(req, true);
  const id = id_cor(rawId, 'id_visita');
  return withConnection_cor(async connection => {
    const existing = mustExist_cor(await repository.getById_cor(connection, id, ctx, { forUpdate: true }));
    if (!canEdit_cor(existing, ctx)) {
      throw error_cor(403, 'CX_VISITAS_BAJA_NO_AUTORIZADA', 'Solo el creador o responsable puede desactivar esta visita con alcance limitado.');
    }
    const affected = await repository.deactivate_cor(connection, id, ctx.actorId);
    if (affected !== 1) throw error_cor(409, 'CX_VISITAS_CONFLICTO', 'La visita cambio durante la baja.');
    await repository.insertHistory_cor(connection, id, ctx.actorId, 'DESACTIVAR', {
      estado_anterior: existing.estado
    });
    return { id_visita: id, inactivo: 1, desactivada: true };
  }, true);
}

module.exports = Object.freeze({
  PERMISSIONS_COR,
  list_cor, get_cor, history_cor, create_cor, edit_cor, deactivate_cor,
  __test: Object.freeze({ id_cor, pagination_cor, utcInput_cor, civilDate_cor,
    normalizeBody_cor, onlyChanges_cor, filters_cor, scope_cor, canEdit_cor })
});
