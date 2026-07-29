const crypto = require('crypto');
const repository = require('./ventas-clientes.repository');
const ventasVisibility = require('../ventas/ventas-visibility.service');

const BATCH_SIZE = 300;

function httpError(statusCode, message, detalles) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  return error;
}

function cleanText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function activeValue(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  return ['0', 'false', 'no', 'inactivo'].includes(text) ? 0 : 1;
}

function positiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeForKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function makeSyncKey(record) {
  const source = [
    normalizeForKey(record.nombre_empresa),
    normalizeForKey(record.nombre_contacto),
    normalizeForKey(record.email),
    normalizeForKey(record.telefono)
  ].join('|');
  return crypto.createHash('sha256').update(source).digest('hex');
}

function normalizePayload(source, { partial = false } = {}) {
  const aliases = {
    id_cliente_origen: ['id_cliente_origen', 'row_id', 'Row ID', '🔒 Row ID'],
    nombre_empresa: ['nombre_empresa', 'Nombre de la Empresa'],
    razon_social: ['razon_social', 'Razon Social', 'Razón Social'],
    ciudad: ['ciudad', 'Ciudad'],
    estado: ['estado', 'Estado'],
    ubicacion: ['ubicacion', 'Ubicacion', 'Ubicación'],
    nombre_contacto: ['nombre_contacto', 'Nombre del Contacto'],
    email: ['email', 'Email', 'correo'],
    telefono: ['telefono', 'Telefono', 'Teléfono'],
    tipo_cliente: ['tipo_cliente', 'Tipo de Cliente'],
    estatus_cliente: ['estatus_cliente', 'Estatus con Cliente'],
    proyecto_vendido: ['proyecto_vendido', 'Proyecto Vendido'],
    iniciales: ['iniciales', 'Iniciales'],
    visualiza: ['visualiza', 'Visualiza'],
    comentarios: ['comentarios', 'Comentarios'],
    activo: ['activo']
  };

  function read(field) {
    for (const alias of aliases[field]) {
      if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
    }
    return undefined;
  }

  const normalized = {};
  const textFields = {
    id_cliente_origen: 100,
    nombre_empresa: 200,
    razon_social: 250,
    ciudad: 120,
    estado: 120,
    ubicacion: 500,
    nombre_contacto: 200,
    email: 200,
    telefono: 80,
    tipo_cliente: 100,
    estatus_cliente: 100,
    proyecto_vendido: 500,
    iniciales: 30,
    visualiza: 255,
    comentarios: null
  };

  for (const [field, maxLength] of Object.entries(textFields)) {
    const value = read(field);
    if (partial && value === undefined) continue;
    normalized[field] = cleanText(value, maxLength);
  }

  const active = read('activo');
  if (!partial || active !== undefined) normalized.activo = activeValue(active);

  if (!partial || Object.prototype.hasOwnProperty.call(normalized, 'nombre_empresa')) {
    if (!normalized.nombre_empresa) throw httpError(400, 'nombre_empresa es obligatorio.');
  }

  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    throw httpError(400, 'El email no tiene un formato válido.');
  }

  if (!partial) normalized.clave_sync = makeSyncKey(normalized);
  return normalized;
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  return null;
}

function parseListOptions(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(query.page_size || query.pageSize, 10) || 50));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: cleanText(query.search || query.buscar, 200),
    sortBy: cleanText(query.sort_by || query.sortBy, 50) || 'nombre_empresa',
    sortDirection: String(query.sort_direction || query.sortDirection || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
    filters: {
      tipo_cliente: cleanText(query.tipo_cliente, 100),
      estatus_cliente: cleanText(query.estatus_cliente, 100),
      ciudad: cleanText(query.ciudad, 120),
      estado: cleanText(query.estado, 120),
      iniciales: cleanText(query.iniciales, 30)
    }
  };
}

function actorId(actionContext) {
  const id = positiveInteger(actionContext?.user?.id_SB);
  if (!id) throw httpError(401, 'Sesión requerida.');
  return id;
}

async function resolveScope(connection, actionContext) {
  return ventasVisibility.resolveVisibilityScope(connection, actionContext);
}

async function list(query, actionContext) {
  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const options = parseListOptions(query);
    const result = await repository.list(connection, options, scope, actorId(actionContext));
    return {
      ok: true,
      source: 'aiven',
      data: result.rows,
      pagination: {
        page: options.page,
        page_size: options.pageSize,
        total: result.total,
        total_pages: Math.max(1, Math.ceil(result.total / options.pageSize))
      }
    };
  } finally {
    connection.release();
  }
}

async function getKpis(query, actionContext) {
  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const options = parseListOptions(query);
    const data = await repository.getKpis(connection, options, scope, actorId(actionContext));
    return {
      ok: true,
      source: 'aiven',
      kpis: {
        total_clientes: Number(data.total_clientes || 0),
        con_estatus: Number(data.con_estatus || 0),
        con_proyecto_vendido: Number(data.con_proyecto_vendido || 0),
        tipos_cliente: Number(data.tipos_cliente || 0),
        estados: Number(data.estados || 0)
      }
    };
  } finally {
    connection.release();
  }
}

async function getCatalogos(actionContext) {
  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const data = await repository.getCatalogos(connection, scope, actorId(actionContext));
    return { ok: true, source: 'aiven', catalogos: data };
  } finally {
    connection.release();
  }
}

async function getById(id, actionContext) {
  const idCliente = positiveInteger(id);
  if (!idCliente) throw httpError(400, 'id_cliente inválido.');

  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const row = await repository.findById(connection, idCliente, {
      scope,
      actorId: actorId(actionContext)
    });
    if (!row) throw httpError(404, 'Cliente no encontrado o fuera de tu alcance.');
    return { ok: true, source: 'aiven', cliente: row };
  } finally {
    connection.release();
  }
}

async function create(payload, actionContext) {
  const actor = actorId(actionContext);
  const data = normalizePayload(payload || {});
  data.created_by = actor;
  data.updated_by = actor;

  const connection = await repository.getConnection();
  try {
    const existing = await repository.findBySyncKey(connection, data.clave_sync);
    if (existing) throw httpError(409, 'Ya existe un cliente con la misma empresa y contacto.', { id_cliente: existing.id_cliente });
    const idCliente = await repository.insert(connection, data);
    return { ok: true, source: 'aiven', id_cliente: idCliente };
  } finally {
    connection.release();
  }
}

async function update(id, payload, actionContext) {
  const idCliente = positiveInteger(id);
  if (!idCliente) throw httpError(400, 'id_cliente inválido.');
  const actor = actorId(actionContext);

  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const current = await repository.findById(connection, idCliente, {
      includeInactive: true,
      scope,
      actorId: actor
    });
    if (!current) throw httpError(404, 'Cliente no encontrado o fuera de tu alcance.');

    const changes = normalizePayload(payload || {}, { partial: true });
    const merged = { ...current, ...changes };
    changes.clave_sync = makeSyncKey(merged);
    changes.updated_by = actor;
    await repository.update(connection, idCliente, changes);
    return { ok: true, source: 'aiven', id_cliente: idCliente };
  } finally {
    connection.release();
  }
}

async function remove(id, actionContext) {
  const idCliente = positiveInteger(id);
  if (!idCliente) throw httpError(400, 'id_cliente inválido.');
  const actor = actorId(actionContext);

  const connection = await repository.getConnection();
  try {
    const scope = await resolveScope(connection, actionContext);
    const current = await repository.findById(connection, idCliente, { scope, actorId: actor });
    if (!current) throw httpError(404, 'Cliente no encontrado o fuera de tu alcance.');
    await repository.softDelete(connection, idCliente, actor);
    return { ok: true, source: 'aiven', id_cliente: idCliente, eliminado: true };
  } finally {
    connection.release();
  }
}

async function sync(payload) {
  const records = extractRecords(payload);
  if (!records) throw httpError(400, 'Se esperaba un arreglo en registros o records.');
  if (!records.length) {
    return {
      ok: true, source: 'aiven', total_recibidos: 0, total_validos: 0,
      insertados: 0, actualizados: 0, rechazados: 0,
      bloques_procesados: 0, tamano_bloque: BATCH_SIZE, errores: []
    };
  }

  const valid = [];
  const errors = [];
  records.forEach((row, index) => {
    try {
      const value = normalizePayload(row || {});
      value.created_by = positiveInteger(row?.created_by);
      value.updated_by = positiveInteger(row?.updated_by);
      valid.push({ ...value, _fila: index + 2 });
    } catch (error) {
      errors.push({ fila: index + 2, motivo: error.message });
    }
  });

  let inserted = 0;
  let updated = 0;
  let processedBatches = 0;

  for (let start = 0; start < valid.length; start += BATCH_SIZE) {
    const batch = valid.slice(start, start + BATCH_SIZE);
    const connection = await repository.getConnection();
    try {
      await connection.beginTransaction();
      for (const item of batch) {
        const { _fila, ...record } = item;
        const existing = await repository.findBySyncKey(connection, record.clave_sync);
        if (existing) updated += 1;
        else inserted += 1;
      }
      await repository.upsertBatch(connection, batch.map(({ _fila, ...record }) => record));
      await connection.commit();
      processedBatches += 1;
    } catch (error) {
      await connection.rollback();
      throw httpError(500, `Falló el bloque ${processedBatches + 1}: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  return {
    ok: true,
    source: 'aiven',
    total_recibidos: records.length,
    total_validos: valid.length,
    insertados: inserted,
    actualizados: updated,
    rechazados: errors.length,
    bloques_procesados: processedBatches,
    tamano_bloque: BATCH_SIZE,
    errores: errors
  };
}

module.exports = {
  list,
  getKpis,
  getCatalogos,
  getById,
  create,
  update,
  remove,
  sync
};
