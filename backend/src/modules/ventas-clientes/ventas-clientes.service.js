// [Aster | 2026-08-12 | ASTER-MG | PATCH: FASE_4_BACKEND_FLEXIBLE_REGISTRO_V001]
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

function normalizePayload(source, { partial = false } = {}) {
  const aliases = {
    nombre_empresa: ['nombre_empresa', 'Nombre de la Empresa'],
    razon_social: ['razon_social', 'Razon Social', 'Razón Social'],
    ciudad: ['ciudad', 'Ciudad'],
    estado: ['estado', 'Estado'],
    ubicacion: ['ubicacion', 'Ubicacion', 'Ubicación'],
    nombre_contacto: ['nombre_contacto', 'Nombre del Contacto'],
    puesto_contacto: ['puesto_contacto', 'Puesto del Contacto', 'Puesto Contacto'],
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
    nombre_empresa: 200,
    razon_social: 250,
    ciudad: 120,
    estado: 120,
    ubicacion: 500,
    nombre_contacto: 200,
    puesto_contacto: 150,
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

  if (Object.prototype.hasOwnProperty.call(normalized, 'estatus_cliente') && normalized.estatus_cliente) {
    normalized.estatus_cliente = normalized.estatus_cliente.toUpperCase();
  }

  const active = read('activo');
  if (!partial || active !== undefined) normalized.activo = activeValue(active);

  if (!partial || Object.prototype.hasOwnProperty.call(normalized, 'nombre_empresa')) {
    if (!normalized.nombre_empresa) throw httpError(400, 'nombre_empresa es obligatorio.');
  }


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
  const pageSize = Math.min(
    5000,
    Math.max(
      1,
      Number.parseInt(query.page_size || query.pageSize, 10) || 50
    )
  );
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

function advisorDto(row) {
  const initials = String(row?.iniciales || '').trim().toUpperCase();
  const name = String(row?.nombre || '').trim();
  return {
    id_usuario: Number(row?.id_SB),
    nombre: name,
    iniciales: initials,
    puesto: row?.puesto || null,
    etiqueta: name ? `${initials} · ${name}` : initials
  };
}

async function resolveAssignmentOptions(connection, actionContext) {
  const actor = actorId(actionContext);

  // La relación administrativa tiene prioridad sobre cualquier permiso amplio.
  // Un admin solo puede asignar clientes a los asesores vinculados en
  // usuarios_rel_admin, aunque su usuario también tenga alcance ALL.
  const isAdmin = await repository.isAdminInRelations(connection, actor);
  if (isAdmin) {
    const rows = await repository.listAdminAdvisors(connection, actor);
    return { mode: 'ADMIN_REL', rows };
  }

  const scope = await resolveScope(connection, actionContext);
  if (scope.mode === 'ALL') {
    const rows = await repository.listAssignableCommercialUsers(connection);
    return { mode: 'ALL', rows };
  }

  const current = await repository.findActiveUserById(connection, actor);
  return { mode: 'SELF', rows: current && current.iniciales ? [current] : [] };
}

async function validateAssignedInitials(connection, initials, actionContext) {
  const requested = cleanText(initials, 30);
  if (!requested) throw httpError(400, 'iniciales es obligatorio.');

  const actor = actorId(actionContext);
  const selected = await repository.findActiveUserByInitials(connection, requested);
  if (!selected) throw httpError(400, 'Las iniciales seleccionadas no corresponden a un usuario activo.');

  // La relación administrativa se valida antes que el alcance ALL.
  const isAdmin = await repository.isAdminInRelations(connection, actor);
  if (isAdmin) {
    const allowed = await repository.isAdvisorLinkedToAdmin(connection, actor, Number(selected.id_SB));
    if (!allowed) {
      throw httpError(403, 'El asesor seleccionado no está relacionado contigo en usuarios_rel_admin.');
    }
    return String(selected.iniciales).trim().toUpperCase();
  }

  const scope = await resolveScope(connection, actionContext);
  if (scope.mode === 'ALL') {
    const allowed = await repository.isAssignableCommercialUser(connection, Number(selected.id_SB));
    if (!allowed) {
      throw httpError(403, 'Acceso total solo puede asignar clientes a Asesores Comerciales, Gerentes Comerciales o Director Ventas.');
    }
    return String(selected.iniciales).trim().toUpperCase();
  }

  const current = await repository.findActiveUserById(connection, actor);
  const ownInitials = String(current?.iniciales || '').trim().toUpperCase();
  if (!ownInitials) throw httpError(400, 'Tu usuario no tiene iniciales configuradas.');
  if (ownInitials !== String(selected.iniciales || '').trim().toUpperCase()) {
    throw httpError(403, 'Solo puedes asignar el cliente a tus propias iniciales.');
  }
  return ownInitials;
}

async function getAssignableAdvisors(actionContext) {
  const connection = await repository.getConnection();
  try {
    const result = await resolveAssignmentOptions(connection, actionContext);
    return {
      ok: true,
      source: 'aiven',
      mode: result.mode,
      data: result.rows.map(advisorDto)
    };
  } finally {
    connection.release();
  }
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
    data.iniciales = await validateAssignedInitials(connection, data.iniciales, actionContext);
    // La relación de proyecto vendido se obtiene desde la cotización vendida mediante id_equipo_vendido.
    data.proyecto_vendido = null;
    data.visualiza = null;
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

      for (let position = 0; position < batch.length; position += 1) {
        const item = batch[position];
        const { _fila, ...record } = item;
        const savepoint = `ventas_clientes_${position}`;

        try {
          await connection.query(`SAVEPOINT ${savepoint}`);
          await repository.insert(connection, record);
          inserted += 1;
          await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (rowError) {
          try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_rollbackError) {}
          try { await connection.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_releaseError) {}
          errors.push({ fila: _fila, motivo: rowError.message });
        }
      }

      await connection.commit();
      processedBatches += 1;
    } catch (error) {
      await connection.rollback();
      throw httpError(500, `Falló estructuralmente el bloque ${processedBatches + 1}: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  return {
    ok: true,
    parcial: errors.length > 0,
    source: 'aiven',
    total_recibidos: records.length,
    total_validos: inserted + updated,
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
  getAssignableAdvisors,
  getById,
  create,
  update,
  remove,
  sync
};
