const repository = require('./ventas-cotizaciones.repository');
const azureStorage = require('../../services/storage/azure-storage.service');
const storageAccess = require('../../services/storage/storage-access.service');
const storageAdapters = require('../../services/storage/storage-metadata.adapters');
const ventasVisibility = require('../ventas/ventas-visibility.service');
const historialService = require('../ventas-cotizaciones-historial/ventas-cotizaciones-historial.service');


function changedFields(existing, changes) {
  const result = {};
  for (const [field, nextValue] of Object.entries(changes || {})) {
    if (field === 'updated_by') continue;
    const previousValue = existing?.[field] ?? null;
    const normalizedPrevious = previousValue instanceof Date ? previousValue.toISOString() : previousValue;
    const normalizedNext = nextValue instanceof Date ? nextValue.toISOString() : nextValue;
    if (String(normalizedPrevious ?? '') !== String(normalizedNext ?? '')) {
      result[field] = { anterior: normalizedPrevious, nuevo: normalizedNext };
    }
  }
  return result;
}

function historySnapshots(cambios) {
  const anterior = {};
  const nuevo = {};
  for (const [field, values] of Object.entries(cambios || {})) {
    anterior[field] = values.anterior;
    nuevo[field] = values.nuevo;
  }
  return { anterior, nuevo };
}

function statusAction(previousStatus, nextStatus) {
  if (nextStatus === 'Perdido') return 'CIERRE_PERDIDO';
  if (nextStatus === 'Vendido') return 'CIERRE_VENDIDO';
  if (previousStatus === 'Perdido' && nextStatus !== 'Perdido') return 'REACTIVACION';
  return 'CAMBIO_ESTATUS';
}

const BATCH_SIZE = 300;
const MAX_RECORDS = 5000;

const EMBUDO_STATUSES = Object.freeze([
  'Contacto',
  'En Cotizacion',
  'Sin Respuesta',
  'Seguimiento con Probabilidad',
  'En Espera de Definicion',
  'Pre Asignado',
  'Asignado',
  'En Contrato'
]);

const VENDIDOS_STATUSES = Object.freeze(['Vendido']);
const PERDIDOS_STATUSES = Object.freeze(['Perdido']);

const ESTATUS_CATALOGO = Object.freeze([
  'Contacto',
  'En Cotizacion',
  'Sin Respuesta',
  'Seguimiento con Probabilidad',
  'En Espera de Definicion',
  'Pre Asignado',
  'Asignado',
  'En Contrato',
  'Vendido',
  'Perdido',
  'Siguiente Año',
  'Borrar'
]);

const PROJECTION_STAGES = Object.freeze([
  'En Contrato',
  'Asignado',
  'Pre Asignado',
  'En Espera de Definicion',
  'Seguimiento con Probabilidad'
]);

const PROJECTION_GROUPS = Object.freeze({
  alta: Object.freeze(['Pre Asignado', 'Asignado', 'En Contrato']),
  media: Object.freeze(['Seguimiento con Probabilidad', 'En Espera de Definicion']),
  temprana: Object.freeze(['Contacto', 'En Cotizacion', 'Sin Respuesta'])
});


const EDITABLE_FIELDS = [
  'id_cot_origen',
  'id_cliente',
  'id_contacto',
  'nombre_proyecto',
  'cliente',
  'contacto',
  'telefono',
  'correo',
  'ciudad',
  'estado',
  'tipo_proyecto',
  'numero_equipos',
  'tipo_equipos',
  'informacion_envia',
  'asesor',
  'id_asesor',
  'visualiza',
  'anio_mes_cotizacion',
  'mx',
  'fecha_cotizacion',
  'fecha_solicitud',
  'zona',
  'estatus_proyecto',
  'razon_perdido',
  'admin',
  'id_admin',
  'fecha_cambio_estatus',
  'fecha_cierre',
  'comentario',
  'empresa_vs_perdido',
  'id_equipo_vendido',
  'anio_actual',
  'activo'
];

function httpError(statusCode, message, detalles) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  return error;
}

function badRequest(message, detalles) {
  return httpError(400, message, detalles);
}

function cleanText(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function requiredText(value, maxLength) {
  return cleanText(value, maxLength) || '';
}

function positiveInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function activeValue(value) {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  return ['0', 'false', 'no', 'inactivo'].includes(text) ? 0 : 1;
}

function normalizeEmail(value) {
  const email = cleanText(value, 150);
  if (!email) return null;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) throw badRequest('El correo no tiene un formato válido.');
  return email;
}




async function assertVisibleCotizacion(connection, idCotizacion, actionContext, { includeInactive = false } = {}) {
  const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
  const cotizacion = await repository.findById(connection, idCotizacion, { includeInactive, scope });
  if (!cotizacion) throw httpError(404, 'Cotización no encontrada o fuera de tu alcance.');
  return { cotizacion, scope };
}

function getActorId(actionContext) {
  const actorId = positiveInteger(actionContext?.user?.id_SB);
  if (!actorId) throw httpError(401, 'Sesión requerida.');
  return actorId;
}

function normalizeCrudPayload(payload, { partial = false } = {}) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const normalized = {};

  for (const field of EDITABLE_FIELDS) {
    if (partial && !Object.prototype.hasOwnProperty.call(source, field)) continue;

    switch (field) {
      case 'id_cot_origen': {
        const value = positiveInteger(source[field]);
        if (source[field] !== undefined && source[field] !== null && source[field] !== '' && !value) {
          throw badRequest('id_cot_origen debe ser un entero positivo.');
        }
        normalized[field] = value;
        break;
      }
      case 'id_cliente':
      case 'id_contacto': {
        const value = positiveInteger(source[field]);
        if (source[field] !== undefined && source[field] !== null && source[field] !== '' && !value) {
          throw badRequest(`${field} debe ser un entero positivo.`);
        }
        normalized[field] = value;
        break;
      }
      case 'nombre_proyecto':
        normalized[field] = requiredText(source[field], 200);
        break;
      case 'cliente':
        normalized[field] = requiredText(source[field], 200);
        break;
      case 'contacto':
        normalized[field] = cleanText(source[field], 150);
        break;
      case 'telefono':
        normalized[field] = cleanText(source[field], 50);
        break;
      case 'correo':
        normalized[field] = cleanText(source[field], 150);
        break;
      case 'ciudad':
      case 'estado':
      case 'tipo_proyecto':
      case 'tipo_equipos':
      case 'mx':
      case 'zona':
      case 'id_equipo_vendido':
        normalized[field] = cleanText(source[field], 100);
        break;
      case 'estatus_proyecto': {
        const estatus = cleanText(source[field], 100);
        if (estatus && !ESTATUS_CATALOGO.includes(estatus)) {
          throw badRequest('El estatus_proyecto no pertenece al catálogo autorizado.', { permitidos: ESTATUS_CATALOGO });
        }
        normalized[field] = estatus;
        break;
      }
      case 'numero_equipos': {
        const number = nonNegativeInteger(source[field], partial ? null : 0);
        if (source[field] !== undefined && source[field] !== null && source[field] !== '' && number === null) {
          throw badRequest('numero_equipos debe ser un entero mayor o igual a cero.');
        }
        normalized[field] = number;
        break;
      }
      case 'informacion_envia':
      case 'visualiza':
      case 'razon_perdido':
        normalized[field] = cleanText(source[field], 255);
        break;
      case 'asesor':
      case 'admin':
      case 'anio_mes_cotizacion':
      case 'anio_actual':
        normalized[field] = cleanText(source[field], 20);
        break;
      case 'id_asesor':
      case 'id_admin': {
        const value = positiveInteger(source[field]);
        if (source[field] !== undefined && source[field] !== null && source[field] !== '' && !value) {
          throw badRequest(`${field} debe ser un entero positivo.`);
        }
        normalized[field] = value;
        break;
      }
      case 'fecha_cotizacion':
      case 'fecha_solicitud':
      case 'fecha_cambio_estatus':
      case 'fecha_cierre':
        normalized[field] = cleanText(source[field], 50);
        break;
      case 'comentario':
        normalized[field] = cleanText(source[field]);
        break;
      case 'empresa_vs_perdido':
        normalized[field] = cleanText(source[field], 200);
        break;
      case 'activo':
        normalized[field] = activeValue(source[field]);
        break;
      default:
        break;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(source, 'nombre_proyecto')) {
    if (!normalized.nombre_proyecto) throw badRequest('nombre_proyecto es obligatorio.');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(source, 'cliente')) {
    if (!normalized.cliente) throw badRequest('cliente es obligatorio.');
  }

  return normalized;
}

async function validateClientAndContact(connection, record, actionContext) {
  if (!record.id_cliente) throw badRequest('id_cliente es obligatorio.');
  if (!record.id_contacto) throw badRequest('id_contacto es obligatorio.');

  const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
  const actorId = getActorId(actionContext);
  const advisorIds = scope.mode === 'ALL' ? [] : scope.advisorIds;
  const params = [record.id_cliente];
  let visibilitySql = '';
  if (advisorIds.length) {
    visibilitySql = ` AND EXISTS (
      SELECT 1 FROM usuarios vu
       WHERE vu.estado = 1
         AND vu.id_SB IN (${advisorIds.map(() => '?').join(', ')})
         AND UPPER(TRIM(vu.iniciales)) = UPPER(TRIM(vc.iniciales))
    )`;
    params.push(...advisorIds);
  }
  const [clients] = await connection.query(
    `SELECT vc.*, (SELECT MIN(u.id_SB) FROM usuarios u WHERE u.estado=1 AND UPPER(TRIM(u.iniciales))=UPPER(TRIM(vc.iniciales))) AS id_asesor_rel
       FROM ventas_clientes vc
      WHERE vc.id_cliente = ? AND vc.activo = 1 ${visibilitySql}
      LIMIT 1`,
    params
  );
  const client = clients[0];
  if (!client) throw httpError(404, 'Cliente no encontrado o fuera de tu alcance.');

  const [contacts] = await connection.query(
    `SELECT * FROM ventas_clientes_contactos
      WHERE id_contacto = ? AND id_cliente = ? AND activo = 1 LIMIT 1`,
    [record.id_contacto, record.id_cliente]
  );
  const contact = contacts[0];
  if (!contact) throw badRequest('El contacto no pertenece al cliente seleccionado.');

  record.cliente = client.nombre_empresa;
  record.contacto = contact.nombre_contacto;
  record.telefono = record.telefono || contact.telefono || null;
  record.correo = record.correo || contact.email || null;
  record.ciudad = record.ciudad || client.ciudad || null;
  record.estado = record.estado || client.estado || null;
  if (!record.id_asesor && client.id_asesor_rel) record.id_asesor = Number(client.id_asesor_rel);
  if (!record.asesor && client.iniciales) record.asesor = client.iniciales;
  if (!record.fecha_solicitud) record.fecha_solicitud = new Date().toISOString();
  if (!record.created_by) record.created_by = actorId;
}

async function validateRelatedUsers(connection, record) {
  const requested = [...new Set([record.id_asesor, record.id_admin].filter(Boolean))];
  if (!requested.length) return;

  const existing = await repository.findExistingUserIds(connection, requested);
  const missing = requested.filter((id) => !existing.has(id));
  if (missing.length) {
    throw badRequest(`Usuarios inexistentes o inactivos: ${missing.join(', ')}.`);
  }
}

function normalizeRecord(row, index) {
  const sourceId = positiveInteger(row?.id_cot ?? row?.id_cot_origen ?? row?.id_cotizacion);
  if (!sourceId) {
    return {
      ok: false,
      error: {
        fila: index + 2,
        id_cot: row?.id_cot ?? null,
        motivo: 'id_cot es obligatorio y debe ser un entero positivo.'
      }
    };
  }

  const nombreProyecto = requiredText(row?.nombre_proyecto, 200);
  if (!nombreProyecto) {
    return {
      ok: false,
      error: {
        fila: index + 2,
        id_cot: sourceId,
        motivo: 'nombre_proyecto es obligatorio.'
      }
    };
  }

  return {
    ok: true,
    value: {
      id_cot_origen: sourceId,
      nombre_proyecto: nombreProyecto,
      cliente: requiredText(row?.cliente, 200),
      contacto: cleanText(row?.contacto, 150),
      telefono: cleanText(row?.telefono, 50),
      correo: cleanText(row?.correo, 150),
      ciudad: cleanText(row?.ciudad, 100),
      estado: cleanText(row?.estado, 100),
      tipo_proyecto: cleanText(row?.tipo_proyecto, 100),
      numero_equipos: nonNegativeInteger(row?.numero_equipos, 0),
      tipo_equipos: cleanText(row?.tipo_equipos, 100),
      informacion_envia: cleanText(row?.informacion_envia, 255),
      asesor: cleanText(row?.asesor, 20),
      id_asesor: positiveInteger(row?.id_asesor),
      visualiza: cleanText(row?.visualiza, 255),
      anio_mes_cotizacion: cleanText(row?.anio_mes_cotizacion, 20),
      mx: cleanText(row?.mx, 100),
      fecha_cotizacion: cleanText(row?.fecha_cotizacion, 50),
      fecha_solicitud: cleanText(row?.fecha_solicitud, 50),
      zona: cleanText(row?.zona, 100),
      estatus_proyecto: cleanText(row?.estatus_proyecto, 100),
      razon_perdido: cleanText(row?.razon_perdido, 255),
      admin: cleanText(row?.admin, 20),
      id_admin: positiveInteger(row?.id_admin),
      fecha_cambio_estatus: cleanText(row?.fecha_cambio_estatus, 50),
      fecha_cierre: cleanText(row?.fecha_cierre, 50),
      comentario: cleanText(row?.comentario),
      empresa_vs_perdido: cleanText(row?.empresa_vs_perdido, 200),
      id_equipo_vendido: cleanText(row?.id_equipo_vendido, 100),
      anio_actual: cleanText(row?.anio_actual, 20),
      activo: activeValue(row?.activo),
      created_by: positiveInteger(row?.created_by),
      updated_by: positiveInteger(row?.updated_by)
    }
  };
}

function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  return null;
}

function splitBatches(records) {
  const batches = [];
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    batches.push(records.slice(index, index + BATCH_SIZE));
  }
  return batches;
}


const LIST_FILTER_FIELDS = [
  'id_cliente',
  'cliente',
  'estatus_proyecto',
  'asesor',
  'id_asesor',
  'admin',
  'id_admin',
  'zona',
  'estado',
  'ciudad',
  'tipo_proyecto',
  'tipo_equipos',
  'anio_mes_cotizacion',
  'anio_actual',
  'mx',
  'razon_perdido',
  'activo'
];

const SORT_FIELDS = new Set([
  'id_cotizacion',
  'nombre_proyecto',
  'cliente',
  'fecha_cotizacion',
  'fecha_solicitud',
  'fecha_cambio_estatus',
  'fecha_cierre',
  'estatus_proyecto',
  'asesor',
  'admin',
  'zona',
  'numero_equipos',
  'created_at',
  'updated_at'
]);

function boundedInteger(value, fallback, min, max, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`${fieldName} debe ser un entero entre ${min} y ${max}.`);
  }
  return number;
}

function normalizeListQuery(query) {
  const page = boundedInteger(query.page ?? query.pagina, 1, 1, 1000000, 'page');
  const pageSize = boundedInteger(
    query.pageSize ?? query.page_size ?? query.limite,
    25,
    1,
    100,
    'pageSize'
  );

  const sortBy = cleanText(query.sortBy ?? query.ordenar_por, 50) || 'updated_at';
  if (!SORT_FIELDS.has(sortBy)) {
    throw badRequest(`sortBy no permitido. Valores válidos: ${[...SORT_FIELDS].join(', ')}.`);
  }

  const sortDirection = String(query.sortDirection ?? query.direccion ?? 'desc').trim().toLowerCase();
  if (!['asc', 'desc'].includes(sortDirection)) {
    throw badRequest('sortDirection debe ser asc o desc.');
  }

  const filters = {};
  for (const field of LIST_FILTER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(query, field)) continue;

    if (field === 'id_cliente' || field === 'id_asesor' || field === 'id_admin') {
      const value = positiveInteger(query[field]);
      if (!value) throw badRequest(`${field} debe ser un entero positivo.`);
      filters[field] = value;
      continue;
    }

    if (field === 'activo') {
      const raw = String(query[field]).trim().toLowerCase();
      if (!['0', '1', 'true', 'false', 'activo', 'inactivo', 'todos'].includes(raw)) {
        throw badRequest('activo debe ser 1, 0, true, false, activo, inactivo o todos.');
      }
      if (raw !== 'todos') filters.activo = ['1', 'true', 'activo'].includes(raw) ? 1 : 0;
      continue;
    }

    const value = cleanText(query[field], 150);
    if (value) filters[field] = value;
  }

  if (!Object.prototype.hasOwnProperty.call(filters, 'activo')) filters.activo = 1;

  const currentYear = new Date().getFullYear();
  const rawYear = query.anio ?? query.year;
  let year = currentYear;
  if (rawYear !== undefined && rawYear !== null && String(rawYear).trim() !== '') {
    const normalizedYear = String(rawYear).trim().toLowerCase();
    if (['todos', 'all'].includes(normalizedYear)) {
      year = null;
    } else {
      year = boundedInteger(rawYear, currentYear, 1900, 2200, 'anio');
    }
  }

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search: cleanText(query.buscar ?? query.search ?? query.q, 200),
    filters,
    year,
    sortBy,
    sortDirection
  };
}


function normalizeKpiQuery(query) {
  const normalized = normalizeListQuery({
    ...query,
    page: 1,
    pageSize: 1,
    sortBy: 'updated_at',
    sortDirection: 'desc'
  });

  return {
    search: normalized.search,
    filters: normalized.filters,
    year: normalized.year
  };
}


function buildPaginationResult(options, rows, total) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / options.pageSize);
  return {
    cotizaciones: rows,
    paginacion: {
      pagina: options.page,
      tamano_pagina: options.pageSize,
      total_registros: total,
      total_paginas: totalPages,
      tiene_anterior: options.page > 1,
      tiene_siguiente: options.page < totalPages
    },
    orden: { campo: options.sortBy, direccion: options.sortDirection },
    filtros: { buscar: options.search, anio: options.year ?? 'todos', ...options.filters }
  };
}

async function listSpecialized(query, statuses, tipo, actionContext) {
  const options = normalizeListQuery(query);
  const connection = await repository.getConnection();

  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const { rows, total } = await repository.listByStatuses(connection, options, statuses, scope);
    return {
      ok: true,
      source: 'aiven',
      tipo,
      estatus_incluidos: statuses,
      ...buildPaginationResult(options, rows, total)
    };
  } finally {
    connection.release();
  }
}

async function getEmbudo(query, actionContext) {
  const options = normalizeListQuery(query);
  const connection = await repository.getConnection();

  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const [{ rows, total }, summary] = await Promise.all([
      repository.listByStatuses(connection, options, EMBUDO_STATUSES, scope),
      repository.summarizeByStatuses(connection, options, EMBUDO_STATUSES, scope)
    ]);
    const summaryTotal = Number(summary.resumen.total_cotizaciones || 0);

    return {
      ok: true,
      source: 'aiven',
      tipo: 'EMBUDO_ACTIVO',
      estatus_incluidos: EMBUDO_STATUSES,
      resumen: {
        total_cotizaciones: summaryTotal,
        total_equipos: Number(summary.resumen.total_equipos || 0),
        promedio_equipos: Number(Number(summary.resumen.promedio_equipos || 0).toFixed(2))
      },
      por_estatus: summary.por_estatus.map((item) => ({
        estatus: item.estatus,
        total_cotizaciones: Number(item.total_cotizaciones || 0),
        total_equipos: Number(item.total_equipos || 0),
        porcentaje: summaryTotal
          ? Number(((Number(item.total_cotizaciones || 0) / summaryTotal) * 100).toFixed(2))
          : 0
      })),
      ...buildPaginationResult(options, rows, total)
    };
  } finally {
    connection.release();
  }
}

async function getVendidos(query, actionContext) {
  const options = normalizeListQuery(query);
  const connection = await repository.getConnection();
  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const result = await repository.listVendidos(connection, options, scope);
    return {
      ok: true,
      source: 'aiven',
      tipo: 'VENDIDOS',
      estatus_incluidos: VENDIDOS_STATUSES,
      resumen: {
        total_cotizaciones: Number(result.resumen.total_cotizaciones || 0),
        total_equipos: Number(result.resumen.total_equipos || 0),
        con_fecha_cierre: Number(result.resumen.con_fecha_cierre || 0),
        sin_fecha_cierre: Number(result.resumen.sin_fecha_cierre || 0)
      },
      ...buildPaginationResult(options, result.rows.map((row) => ({
        ...row,
        id_cotizacion: Number(row.id_cotizacion)
      })), result.total)
    };
  } finally {
    connection.release();
  }
}

async function getPerdidos(query, actionContext) {
  const options = normalizeListQuery(query);
  const connection = await repository.getConnection();
  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const result = await repository.listPerdidos(connection, options, scope);
    return {
      ok: true,
      source: 'aiven',
      tipo: 'PERDIDOS',
      estatus_incluidos: PERDIDOS_STATUSES,
      resumen: {
        total_cotizaciones: Number(result.resumen.total_cotizaciones || 0),
        total_equipos: Number(result.resumen.total_equipos || 0),
        con_razon: Number(result.resumen.con_razon || 0),
        sin_razon: Number(result.resumen.sin_razon || 0)
      },
      ...buildPaginationResult(options, result.rows, result.total)
    };
  } finally {
    connection.release();
  }
}

async function getProyeccion(query, actionContext) {
  const options = normalizeKpiQuery(query);
  const requestedStatus = cleanText(query.estatus ?? query.etapa, 100);
  const page = boundedInteger(query.pagina ?? query.page ?? 1, 1, 1, 100000, 'pagina');
  const pageSize = boundedInteger(query.tamano_pagina ?? query.pageSize ?? 10, 10, 1, 50, 'tamano_pagina');

  if (requestedStatus && !PROJECTION_STAGES.includes(requestedStatus)) {
    throw badRequest('La etapa de Proyección no es válida.');
  }

  const connection = await repository.getConnection();

  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const statuses = requestedStatus ? [requestedStatus] : PROJECTION_STAGES;
    const stages = [];

    for (const status of statuses) {
      const result = await repository.getProjectionStagePage(
        connection,
        options,
        status,
        scope,
        requestedStatus ? page : 1,
        pageSize
      );
      const currentPage = requestedStatus ? page : 1;
      const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / pageSize);

      stages.push({
        estatus: status,
        total_cotizaciones: result.total,
        total_equipos: result.totalEquipos,
        cotizaciones: result.rows.map((row) => ({
          ...row,
          id_cotizacion: Number(row.id_cotizacion),
          numero_equipos: Number(row.numero_equipos || 0)
        })),
        paginacion: {
          pagina: currentPage,
          tamano_pagina: pageSize,
          total_registros: result.total,
          total_paginas: totalPages,
          tiene_anterior: currentPage > 1,
          tiene_siguiente: currentPage < totalPages
        }
      });
    }

    const totalCotizaciones = stages.reduce((sum, item) => sum + item.total_cotizaciones, 0);
    const totalEquipos = stages.reduce((sum, item) => sum + item.total_equipos, 0);

    return {
      ok: true,
      source: 'aiven',
      criterio: 'PROYECCION_PAGINADA_POR_ETAPA',
      etapas: stages,
      resumen: {
        total_cotizaciones: totalCotizaciones,
        total_equipos: totalEquipos
      },
      visibilidad: ventasVisibility.toClientVisibility(scope),
      filtros: {
        buscar: options.search,
        anio: options.year ?? 'todos',
        estatus: requestedStatus || null,
        ...options.filters
      }
    };
  } finally {
    connection.release();
  }
}

async function getCatalogos(actionContext) {
  const connection = await repository.getConnection();

  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const catalogos = await repository.getCatalogos(connection);
    return {
      ok: true,
      source: 'aiven',
      catalogos,
      visibilidad: ventasVisibility.toClientVisibility(scope)
    };
  } finally {
    connection.release();
  }
}

async function getKpis(query, actionContext) {
  const options = normalizeKpiQuery(query);
  const connection = await repository.getConnection();

  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const data = await repository.getKpis(connection, options, scope);
    const summary = data.resumen || {};
    const total = Number(summary.total_cotizaciones || 0);

    const totalsByStatus = new Map(
      data.por_estatus.map((item) => [
        cleanText(item.estatus, 100) || 'SIN ESTATUS',
        Number(item.total || 0)
      ])
    );

    const sumStatuses = (statuses) => statuses.reduce(
      (accumulator, status) => accumulator + Number(totalsByStatus.get(status) || 0),
      0
    );

    const embudoActivo = sumStatuses(EMBUDO_STATUSES);
    // Las métricas cerradas usan sus fechas oficiales de evento.
    const vendidas = Number(data.vendidas_periodo || 0);
    const equiposVendidos = Number(data.equipos_vendidos_periodo || 0);
    const perdidas = Number(data.perdidas_periodo || 0);

    return {
      ok: true,
      source: 'aiven',
      kpis: {
        total_cotizaciones: total,
        embudo_activo: embudoActivo,
        total_embudo: embudoActivo,
        vendidas,
        total_vendidas: vendidas,
        perdidas,
        total_perdidas: perdidas,
        activas: Number(summary.activas || 0),
        inactivas: Number(summary.inactivas || 0),
        total_equipos: Number(summary.total_equipos || 0),
        equipos_vendidos: equiposVendidos,
        total_equipos_vendidos: equiposVendidos,
        promedio_equipos: Number(Number(summary.promedio_equipos || 0).toFixed(2)),
        con_asesor: Number(summary.con_asesor || 0),
        sin_asesor: Number(summary.sin_asesor || 0),
        con_administrativo: Number(summary.con_administrativo || 0),
        sin_administrativo: Number(summary.sin_administrativo || 0),
        con_estatus: Number(summary.con_estatus || 0),
        sin_estatus: Number(summary.sin_estatus || 0)
      },
      distribuciones: {
        por_estatus: data.por_estatus.map((item) => ({
          estatus: item.estatus,
          total: Number(item.total || 0),
          equipos: Number(item.equipos || 0),
          porcentaje: total ? Number(((Number(item.total || 0) / total) * 100).toFixed(2)) : 0
        })),
        por_asesor: data.por_asesor.map((item) => ({
          id_asesor: item.id_asesor === null ? null : Number(item.id_asesor),
          asesor: item.asesor,
          total: Number(item.total || 0),
          equipos: Number(item.equipos || 0),
          porcentaje: total ? Number(((Number(item.total || 0) / total) * 100).toFixed(2)) : 0
        }))
      },
      filtros: {
        buscar: options.search,
        ...options.filters
      }
    };
  } finally {
    connection.release();
  }
}

async function list(query, actionContext) {
  const options = normalizeListQuery(query);
  const connection = await repository.getConnection();

  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const { rows, total } = await repository.list(connection, options, scope);
    const totalPages = total === 0 ? 0 : Math.ceil(total / options.pageSize);

    return {
      ok: true,
      source: 'aiven',
      cotizaciones: rows,
      paginacion: {
        pagina: options.page,
        tamano_pagina: options.pageSize,
        total_registros: total,
        total_paginas: totalPages,
        tiene_anterior: options.page > 1,
        tiene_siguiente: options.page < totalPages
      },
      orden: {
        campo: options.sortBy,
        direccion: options.sortDirection
      },
      filtros: {
        buscar: options.search,
        ...options.filters
      }
    };
  } finally {
    connection.release();
  }
}

async function getById(rawId, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');

  const connection = await repository.getConnection();
  try {
    const { cotizacion } = await assertVisibleCotizacion(connection, idCotizacion, actionContext);

    return { ok: true, source: 'aiven', cotizacion };
  } finally {
    connection.release();
  }
}

async function create(payload, actionContext) {
  const actorId = getActorId(actionContext);

  const record = normalizeCrudPayload(payload);
  record.created_by = actorId;
  record.updated_by = actorId;

  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();
    await validateClientAndContact(connection, record, actionContext);
    await validateRelatedUsers(connection, record);

    if (record.id_cot_origen) {
      const duplicate = await repository.findByOriginId(connection, record.id_cot_origen);
      if (duplicate) throw httpError(409, 'Ya existe una cotización con ese id_cot_origen.');
    }

    const result = await repository.create(connection, record);
    const created = await repository.findById(connection, result.insertId, { includeInactive: true });
    await historialService.registrarMovimiento(connection, {
      idCotizacion: result.insertId,
      accion: 'CREACION',
      motivo: 'Alta de cotización',
      anterior: null,
      nuevo: { estatus_proyecto: created?.estatus_proyecto || null, activo: created?.activo ?? 1 }
    }, actionContext);
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      message: 'Cotización creada correctamente.',
      cotizacion: created
    };
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'La cotización entra en conflicto con un registro existente.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function update(rawId, payload, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');

  const actorId = getActorId(actionContext);

  const changes = normalizeCrudPayload(payload, { partial: true });
  if (!Object.keys(changes).length) throw badRequest('No se recibieron campos editables.');
  changes.updated_by = actorId;

  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();

    const { cotizacion: existing } = await assertVisibleCotizacion(connection, idCotizacion, actionContext, { includeInactive: true });

    await validateRelatedUsers(connection, changes);

    if (changes.id_cot_origen) {
      const duplicate = await repository.findByOriginId(
        connection,
        changes.id_cot_origen,
        idCotizacion
      );
      if (duplicate) throw httpError(409, 'Ya existe otra cotización con ese id_cot_origen.');
    }

    await repository.update(connection, idCotizacion, changes);
    const updated = await repository.findById(connection, idCotizacion, { includeInactive: true });
    const cambios = changedFields(existing, changes);
    if (Object.keys(cambios).length) {
      const snapshots = historySnapshots(cambios);
      const accion = cambios.estatus_proyecto
        ? statusAction(cambios.estatus_proyecto.anterior, cambios.estatus_proyecto.nuevo)
        : 'EDICION';
      await historialService.registrarMovimiento(connection, {
        idCotizacion, accion, motivo: payload?.motivo || null, comentario: payload?.comentario_historial || null,
        anterior: snapshots.anterior, nuevo: snapshots.nuevo
      }, actionContext);
    }
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      message: 'Cotización actualizada correctamente.',
      cotizacion: updated
    };
  } catch (error) {
    await connection.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'La cotización entra en conflicto con un registro existente.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function remove(rawId, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');

  const actorId = getActorId(actionContext);

  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();

    const { cotizacion: existing } = await assertVisibleCotizacion(connection, idCotizacion, actionContext, { includeInactive: true });
    if (Number(existing.activo) !== 1) throw httpError(409, 'La cotización ya está inactiva.');

    await repository.softDelete(connection, idCotizacion, actorId);
    await historialService.registrarMovimiento(connection, {
      idCotizacion, accion: 'DESACTIVACION', motivo: 'Baja lógica de cotización',
      anterior: { activo: existing.activo }, nuevo: { activo: 0 }
    }, actionContext);
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      message: 'Cotización desactivada correctamente.',
      id_cotizacion: idCotizacion
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


async function updateEstatus(rawId, payload, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');
  const actorId = getActorId(actionContext);
  const estatus = cleanText(payload?.estatus_proyecto, 100);
  if (!estatus) throw badRequest('estatus_proyecto es obligatorio.');
  if (!ESTATUS_CATALOGO.includes(estatus)) {
    throw badRequest('El estatus_proyecto no pertenece al catálogo autorizado.', { permitidos: ESTATUS_CATALOGO });
  }

  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();
    const { cotizacion: existing } = await assertVisibleCotizacion(connection, idCotizacion, actionContext, { includeInactive: true });
    if (Number(existing.activo) !== 1) throw httpError(409, 'No se puede modificar una cotización inactiva.');
    if (existing.estatus_proyecto === estatus) throw httpError(409, 'La cotización ya tiene ese estatus.');

    const changes = {
      estatus_proyecto: estatus,
      fecha_cambio_estatus: new Date(),
      updated_by: actorId
    };
    for (const field of ['razon_perdido', 'empresa_vs_perdido', 'fecha_cierre', 'id_equipo_vendido']) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        changes[field] = normalizeCrudPayload({ [field]: payload[field] }, { partial: true })[field];
      }
    }

    await repository.update(connection, idCotizacion, changes);
    const updated = await repository.findById(connection, idCotizacion, { includeInactive: true });
    const cambios = changedFields(existing, changes);
    const snapshots = historySnapshots(cambios);
    await historialService.registrarMovimiento(connection, {
      idCotizacion,
      accion: statusAction(existing.estatus_proyecto, estatus),
      motivo: payload?.motivo || payload?.razon_perdido || null,
      comentario: payload?.comentario_historial || payload?.comentario || null,
      anterior: snapshots.anterior,
      nuevo: snapshots.nuevo,
      proximaFecha: payload?.proxima_fecha || null
    }, actionContext);
    await connection.commit();
    return { ok: true, source: 'aiven', message: 'Estatus actualizado correctamente.', cotizacion: updated };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAsignacion(rawId, payload, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');
  const actorId = getActorId(actionContext);
  const hasAsesor = Object.prototype.hasOwnProperty.call(payload || {}, 'id_asesor');
  const hasAdmin = Object.prototype.hasOwnProperty.call(payload || {}, 'id_admin');
  if (!hasAsesor && !hasAdmin) throw badRequest('Debe enviarse id_asesor o id_admin.');

  const requested = {};
  if (hasAsesor) {
    requested.id_asesor = positiveInteger(payload.id_asesor);
    if (!requested.id_asesor) throw badRequest('id_asesor debe ser un entero positivo.');
  }
  if (hasAdmin) {
    requested.id_admin = positiveInteger(payload.id_admin);
    if (!requested.id_admin) throw badRequest('id_admin debe ser un entero positivo.');
  }

  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();
    const { cotizacion: existing } = await assertVisibleCotizacion(connection, idCotizacion, actionContext, { includeInactive: true });
    if (Number(existing.activo) !== 1) throw httpError(409, 'No se puede modificar una cotización inactiva.');

    const users = await repository.findUsersByIds(connection, Object.values(requested));
    const missing = Object.values(requested).filter((id) => !users.has(id));
    if (missing.length) throw badRequest(`Usuarios inexistentes o inactivos: ${missing.join(', ')}.`);

    const changes = { updated_by: actorId };
    if (hasAsesor) {
      const user = users.get(requested.id_asesor);
      changes.id_asesor = requested.id_asesor;
      changes.asesor = cleanText(payload.asesor, 20) || user.iniciales || null;
    }
    if (hasAdmin) {
      const user = users.get(requested.id_admin);
      changes.id_admin = requested.id_admin;
      changes.admin = cleanText(payload.admin, 20) || user.iniciales || null;
    }

    const cambios = changedFields(existing, changes);
    if (!Object.keys(cambios).length) throw httpError(409, 'La asignación recibida no genera cambios.');
    await repository.update(connection, idCotizacion, changes);
    const updated = await repository.findById(connection, idCotizacion, { includeInactive: true });
    const snapshots = historySnapshots(cambios);
    await historialService.registrarMovimiento(connection, {
      idCotizacion, accion: 'CAMBIO_ASIGNACION', motivo: payload?.motivo || null,
      anterior: snapshots.anterior, nuevo: snapshots.nuevo
    }, actionContext);
    await connection.commit();
    return { ok: true, source: 'aiven', message: 'Asignación actualizada correctamente.', cotizacion: updated };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function assertCotizacion(connection, idCotizacion, actionContext) {
  const { cotizacion } = await assertVisibleCotizacion(connection, idCotizacion, actionContext, { includeInactive: true });
  if (Number(cotizacion.activo) !== 1) throw httpError(409, 'La cotización está inactiva.');
  return cotizacion;
}

async function listComentarios(rawId, query, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');
  const page = boundedInteger(query?.page, 1, 1, 100000, 'page');
  const pageSize = boundedInteger(query?.page_size, 50, 1, 200, 'page_size');
  const connection = await repository.getConnection();
  try {
    await assertCotizacion(connection, idCotizacion, actionContext);
    const result = await repository.listComentarios(connection, idCotizacion, { page, pageSize });
    const ids = result.rows.map((row) => Number(row.id_comentario)).filter(Boolean);
    const files = await repository.listArchivosByComentarioIds(connection, ids);
    const byComment = new Map();

    for (const file of files) {
      const key = Number(file.id_comentario);
      if (!byComment.has(key)) byComment.set(key, []);
      byComment.get(key).push(presentCotizacionArchivo_gnral(file, idCotizacion));
    }

    const comentarios = result.rows.map((row) => ({
      ...row,
      archivos: byComment.get(Number(row.id_comentario)) || []
    }));

    return {
      ok: true,
      source: 'aiven',
      id_cotizacion: idCotizacion,
      comentarios,
      paginacion: {
        pagina: page,
        tamano_pagina: pageSize,
        total_registros: result.total,
        total_paginas: Math.ceil(result.total / pageSize)
      }
    };
  } finally {
    connection.release();
  }
}

function parseBoolean_gnral(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeLegacyFileUrl_gnral(value) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : null;
}

function presentCotizacionArchivo_gnral(archivo, idCotizacion) {
  if (!archivo) return null;
  const provider = String(archivo.storage_provider || (archivo.drive_url ? 'GOOGLE_DRIVE' : 'LEGACY'))
    .trim()
    .toUpperCase();
  const azure = provider === azureStorage.PROVIDER && Boolean(String(archivo.storage_blob_name || '').trim());
  const base = {
    id_archivo: Number(archivo.id_archivo),
    id_cotizacion: Number(archivo.id_cotizacion || idCotizacion),
    id_comentario: archivo.id_comentario == null ? null : Number(archivo.id_comentario),
    id_usuario: archivo.id_usuario == null ? null : Number(archivo.id_usuario),
    nombre_archivo: archivo.nombre_archivo || null,
    nombre_original: archivo.nombre_original || archivo.nombre_archivo || 'Archivo',
    extension: archivo.extension || null,
    mime_type: archivo.mime_type || null,
    tamanio_bytes: archivo.tamanio_bytes == null ? null : Number(archivo.tamanio_bytes),
    storage_provider: provider,
    tipo_archivo: archivo.tipo_archivo || null,
    descripcion: archivo.descripcion || null,
    version_numero: Number(archivo.version_numero || 1),
    id_archivo_anterior: archivo.id_archivo_anterior == null ? null : Number(archivo.id_archivo_anterior),
    usuario_nombre: archivo.usuario_nombre || null,
    usuario_iniciales: archivo.usuario_iniciales || null,
    created_at: archivo.created_at || null,
    updated_at: archivo.updated_at || null,
    activo: Number(archivo.activo ?? 1)
  };

  if (azure) {
    return {
      ...base,
      legacy: false,
      disponible: true,
      legacy_url: null,
      access_endpoint: `/api/ventas/cotizaciones/${encodeURIComponent(idCotizacion)}/archivos/${encodeURIComponent(archivo.id_archivo)}/acceso`
    };
  }

  const legacyUrl = normalizeLegacyFileUrl_gnral(archivo.drive_url)
    || normalizeLegacyFileUrl_gnral(archivo.storage_url);
  return {
    ...base,
    legacy: true,
    disponible: Boolean(legacyUrl),
    legacy_url: legacyUrl,
    access_endpoint: null
  };
}

function internalStorageCompany_gnral(actionContext) {
  const company = cleanText(actionContext?.contextUser?.empresa || actionContext?.user?.empresa, 150);
  if (!company) {
    throw httpError(409, 'El usuario no tiene una empresa interna definida para clasificar el archivo.');
  }
  return company;
}

async function cleanupAzureFiles_gnral(files, context = {}) {
  const cleanup = [];
  for (const file of files || []) {
    if (String(file?.storage_provider || '').toUpperCase() !== azureStorage.PROVIDER || !file?.storage_blob_name) {
      continue;
    }
    const item = {
      id_archivo: Number(file.id_archivo || 0) || null,
      attempted: true,
      completed: false,
      queued_operation_id: null
    };
    try {
      const result = await azureStorage.deleteBlob_gnral(file.storage_blob_name, {
        containerName: file.storage_container,
        queueOnFailure: true,
        queueContext: context
      });
      item.completed = result.queued !== true;
      item.queued_operation_id = result.id_operacion || null;
    } catch (error) {
      item.error = error.message;
      item.queued_operation_id = error.queue_operation_id || null;
    }
    cleanup.push(item);
  }
  return cleanup;
}

async function validateVersionReference_gnral(connection, idCotizacion, payload, currentFileId = null) {
  const previousId = positiveInteger(payload?.id_archivo_anterior);
  if (!previousId) return { previous: null, version: positiveInteger(payload?.version_numero) || 1 };
  if (currentFileId && previousId === currentFileId) {
    throw badRequest('Un archivo no puede declararse como versión anterior de sí mismo.');
  }
  const previous = await repository.findArchivo(connection, idCotizacion, previousId);
  if (!previous) throw badRequest('El archivo anterior no pertenece a la cotización o ya no está disponible.');
  const requestedVersion = positiveInteger(payload?.version_numero);
  const minimumVersion = Number(previous.version_numero || 1) + 1;
  return {
    previous,
    version: requestedVersion && requestedVersion >= minimumVersion ? requestedVersion : minimumVersion
  };
}

async function createComentario(rawId, payload, file, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const actorId = getActorId(actionContext);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');

  const comentario = cleanText(payload?.comentario, 4000);
  if (!comentario && !file) {
    throw badRequest('Escribe un comentario o adjunta un archivo.');
  }

  const padre = positiveInteger(payload?.id_comentario_padre);
  const connection = await repository.getConnection();
  let uploaded = null;

  try {
    await connection.beginTransaction();
    await assertCotizacion(connection, idCotizacion, actionContext);
    if (padre && !(await repository.findComentario(connection, idCotizacion, padre))) {
      throw badRequest('El comentario padre no pertenece a la cotización.');
    }

    const result = await repository.createComentario(connection, {
      id_cotizacion: idCotizacion,
      id_usuario: actorId,
      comentario: comentario || '',
      id_comentario_padre: padre
    });
    const idComentario = Number(result.insertId);
    let createdFile = null;

    if (file) {
      const version = await validateVersionReference_gnral(connection, idCotizacion, payload);
      uploaded = await azureStorage.uploadPrivate_gnral({
        file,
        empresa: internalStorageCompany_gnral(actionContext),
        modulo: 'ventas',
        entidadTipo: 'cotizacion',
        entidadId: idCotizacion,
        subruta: `comentarios-${idComentario}`,
        policyName: 'GENERAL',
        metadata: {
          uploaded_by: actorId,
          quotation_id: idCotizacion,
          comment_id: idComentario
        }
      });

      const record = {
        ...storageAdapters.forVentasCotizaciones_gnral(uploaded),
        id_cotizacion: idCotizacion,
        id_usuario: actorId,
        id_comentario: idComentario,
        tipo_archivo: cleanText(payload?.tipo_archivo, 100) || uploaded.mime_type,
        descripcion: cleanText(payload?.descripcion, 500),
        version_numero: version.version,
        id_archivo_anterior: version.previous?.id_archivo || null,
        drive_file_id: null,
        drive_folder_id: null,
        drive_url: null,
        activo: 1
      };
      const fileResult = await repository.createArchivo(connection, record);
      createdFile = await repository.findArchivo(connection, idCotizacion, fileResult.insertId);
    }

    const createdComment = await repository.findComentario(connection, idCotizacion, idComentario);
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      message: file ? 'Interacción registrada con archivo.' : 'Comentario registrado correctamente.',
      comentario: {
        ...createdComment,
        archivos: createdFile ? [presentCotizacionArchivo_gnral(createdFile, idCotizacion)] : []
      },
      interaccion: {
        id_comentario: idComentario,
        id_archivo: createdFile ? Number(createdFile.id_archivo) : null,
        tipo: file && comentario ? 'COMENTARIO_Y_ARCHIVO' : (file ? 'ARCHIVO' : 'COMENTARIO')
      }
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (uploaded?.storage_blob_name) {
      await cleanupAzureFiles_gnral([uploaded], {
        modulo: 'ventas',
        entidad_tipo: 'cotizacion',
        entidad_id: idCotizacion,
        solicitado_por: actorId,
        motivo: 'Compensación por fallo al registrar interacción de cotización.'
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateComentario(rawId, rawComentario, payload, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const idComentario = positiveInteger(rawComentario);
  const actorId = getActorId(actionContext);
  if (!idCotizacion || !idComentario) throw badRequest('Los identificadores deben ser enteros positivos.');
  const comentario = cleanText(payload?.comentario, 4000);
  if (!comentario) throw badRequest('comentario es obligatorio.');
  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();
    await assertCotizacion(connection, idCotizacion, actionContext);
    const existing = await repository.findComentario(connection, idCotizacion, idComentario);
    if (!existing) throw httpError(404, 'Comentario no encontrado.');
    if (Number(existing.id_usuario) !== actorId) throw httpError(403, 'Solo el autor puede editar el comentario.');
    await repository.updateComentario(connection, idCotizacion, idComentario, comentario);
    const updated = await repository.findComentario(connection, idCotizacion, idComentario);
    await connection.commit();
    return { ok: true, source: 'aiven', message: 'Comentario actualizado correctamente.', comentario: updated };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteComentario(rawId, rawComentario, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const idComentario = positiveInteger(rawComentario);
  const actorId = getActorId(actionContext);
  if (!idCotizacion || !idComentario) throw badRequest('Los identificadores deben ser enteros positivos.');
  const connection = await repository.getConnection();
  let files = [];

  try {
    await connection.beginTransaction();
    await assertCotizacion(connection, idCotizacion, actionContext);
    const existing = await repository.findComentario(connection, idCotizacion, idComentario);
    if (!existing) throw httpError(404, 'Comentario no encontrado.');
    if (Number(existing.id_usuario) !== actorId) throw httpError(403, 'Solo el autor puede eliminar el comentario.');

    files = await repository.listArchivosByComentario(connection, idCotizacion, idComentario, { forUpdate: true });
    if (files.length) await repository.softDeleteArchivosByComentario(connection, idCotizacion, idComentario);
    await repository.softDeleteComentario(connection, idCotizacion, idComentario);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }

  const cleanup = await cleanupAzureFiles_gnral(files, {
    modulo: 'ventas',
    entidad_tipo: 'cotizacion_comentario',
    entidad_id: idComentario,
    solicitado_por: actorId,
    motivo: 'Baja coordinada de comentario y archivos de cotización.'
  });

  return {
    ok: true,
    source: 'aiven',
    message: 'Comentario y archivos relacionados eliminados correctamente.',
    id_comentario: idComentario,
    archivos_desactivados: files.length,
    cleanup
  };
}

function normalizeArchivoPayload(payload, { partial = false } = {}) {
  const fields = ['id_comentario', 'tipo_archivo', 'descripcion', 'version_numero', 'id_archivo_anterior'];
  const out = {};
  for (const field of fields) {
    if (partial && !Object.prototype.hasOwnProperty.call(payload || {}, field)) continue;
    if (['id_comentario', 'version_numero', 'id_archivo_anterior'].includes(field)) {
      out[field] = positiveInteger(payload?.[field]);
    } else {
      out[field] = cleanText(payload?.[field], field === 'descripcion' ? 500 : 100);
    }
  }
  return out;
}

async function listArchivos(rawId, query, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');
  const page = boundedInteger(query?.page, 1, 1, 100000, 'page');
  const pageSize = boundedInteger(query?.page_size, 50, 1, 200, 'page_size');
  const connection = await repository.getConnection();
  try {
    await assertCotizacion(connection, idCotizacion, actionContext);
    const result = await repository.listArchivos(connection, idCotizacion, { page, pageSize });
    return {
      ok: true,
      source: 'aiven',
      id_cotizacion: idCotizacion,
      archivos: result.rows.map((row) => presentCotizacionArchivo_gnral(row, idCotizacion)),
      paginacion: {
        pagina: page,
        tamano_pagina: pageSize,
        total_registros: result.total,
        total_paginas: Math.ceil(result.total / pageSize)
      }
    };
  } finally {
    connection.release();
  }
}

async function createArchivo(rawId, payload, file, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const actorId = getActorId(actionContext);
  if (!idCotizacion) throw badRequest('El id de cotización debe ser un entero positivo.');
  if (!file) throw badRequest('Selecciona un archivo.');
  if (positiveInteger(payload?.id_comentario)) {
    throw badRequest('Para adjuntar un archivo a un comentario usa la interacción multipart de comentarios.');
  }

  const connection = await repository.getConnection();
  let uploaded = null;
  try {
    await connection.beginTransaction();
    await assertCotizacion(connection, idCotizacion, actionContext);
    const version = await validateVersionReference_gnral(connection, idCotizacion, payload);
    uploaded = await azureStorage.uploadPrivate_gnral({
      file,
      empresa: internalStorageCompany_gnral(actionContext),
      modulo: 'ventas',
      entidadTipo: 'cotizacion',
      entidadId: idCotizacion,
      subruta: 'archivos',
      policyName: 'GENERAL',
      metadata: { uploaded_by: actorId, quotation_id: idCotizacion }
    });

    const record = {
      ...storageAdapters.forVentasCotizaciones_gnral(uploaded),
      id_cotizacion: idCotizacion,
      id_usuario: actorId,
      id_comentario: null,
      tipo_archivo: cleanText(payload?.tipo_archivo, 100) || uploaded.mime_type,
      descripcion: cleanText(payload?.descripcion, 500),
      version_numero: version.version,
      id_archivo_anterior: version.previous?.id_archivo || null,
      drive_file_id: null,
      drive_folder_id: null,
      drive_url: null,
      activo: 1
    };
    const result = await repository.createArchivo(connection, record);
    const created = await repository.findArchivo(connection, idCotizacion, result.insertId);
    await connection.commit();
    return {
      ok: true,
      source: 'aiven',
      message: 'Archivo cargado correctamente en Azure.',
      archivo: presentCotizacionArchivo_gnral(created, idCotizacion)
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    if (uploaded?.storage_blob_name) {
      await cleanupAzureFiles_gnral([uploaded], {
        modulo: 'ventas',
        entidad_tipo: 'cotizacion',
        entidad_id: idCotizacion,
        solicitado_por: actorId,
        motivo: 'Compensación por fallo al registrar archivo de cotización.'
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function getArchivo(rawId, rawArchivo, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const idArchivo = positiveInteger(rawArchivo);
  if (!idCotizacion || !idArchivo) throw badRequest('Los identificadores deben ser enteros positivos.');
  const connection = await repository.getConnection();
  try {
    await assertCotizacion(connection, idCotizacion, actionContext);
    const archivo = await repository.findArchivo(connection, idCotizacion, idArchivo);
    if (!archivo) throw httpError(404, 'Archivo no encontrado.');
    return { ok: true, source: 'aiven', archivo: presentCotizacionArchivo_gnral(archivo, idCotizacion) };
  } finally {
    connection.release();
  }
}

async function getArchivoAccess(rawId, rawArchivo, query, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const idArchivo = positiveInteger(rawArchivo);
  if (!idCotizacion || !idArchivo) throw badRequest('Los identificadores deben ser enteros positivos.');
  const connection = await repository.getConnection();
  try {
    const cotizacion = await assertCotizacion(connection, idCotizacion, actionContext);
    const archivo = await repository.findArchivo(connection, idCotizacion, idArchivo);
    if (!archivo) throw httpError(404, 'Archivo no encontrado o ya no disponible.');

    if (String(archivo.storage_provider || '').toUpperCase() === azureStorage.PROVIDER && archivo.storage_blob_name) {
      const data = await storageAccess.createReadAccess_gnral({
        actorUser: actionContext?.user,
        contextUser: actionContext?.contextUser || actionContext?.user,
        reference: archivo,
        context: {
          modulo: 'ventas',
          entidadTipo: 'cotizacion',
          entidadId: idCotizacion,
          archivoId: idArchivo
        },
        authorize: async () => ({
          allowed: true,
          metadata: {
            id_asesor: cotizacion.id_asesor || null,
            id_admin: cotizacion.id_admin || null
          }
        }),
        download: parseBoolean_gnral(query?.download)
      });
      return { ok: true, source: 'azure', data: { ...data, url: data.access_url, legacy: false } };
    }

    const legacyUrl = normalizeLegacyFileUrl_gnral(archivo.drive_url)
      || normalizeLegacyFileUrl_gnral(archivo.storage_url);
    if (!legacyUrl) throw httpError(404, 'El archivo histórico no tiene una referencia HTTPS disponible.');
    return {
      ok: true,
      source: 'legacy',
      data: {
        url: legacyUrl,
        access_url: legacyUrl,
        legacy: true,
        nombre_original: archivo.nombre_original || archivo.nombre_archivo,
        mime_type: archivo.mime_type || null,
        tamano_bytes: archivo.tamanio_bytes == null ? null : Number(archivo.tamanio_bytes)
      }
    };
  } finally {
    connection.release();
  }
}

async function updateArchivo(rawId, rawArchivo, payload, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const idArchivo = positiveInteger(rawArchivo);
  getActorId(actionContext);
  if (!idCotizacion || !idArchivo) throw badRequest('Los identificadores deben ser enteros positivos.');
  const changes = normalizeArchivoPayload(payload, { partial: true });
  if (!Object.keys(changes).length) throw badRequest('No se recibieron campos editables.');
  const connection = await repository.getConnection();
  try {
    await connection.beginTransaction();
    await assertCotizacion(connection, idCotizacion, actionContext);
    if (!(await repository.findArchivo(connection, idCotizacion, idArchivo))) throw httpError(404, 'Archivo no encontrado.');
    if (changes.id_comentario && !(await repository.findComentario(connection, idCotizacion, changes.id_comentario))) {
      throw badRequest('El comentario no pertenece a la cotización.');
    }
    if (changes.id_archivo_anterior) {
      const version = await validateVersionReference_gnral(connection, idCotizacion, changes, idArchivo);
      changes.id_archivo_anterior = version.previous.id_archivo;
      if (!changes.version_numero || changes.version_numero < version.version) changes.version_numero = version.version;
    }
    await repository.updateArchivo(connection, idCotizacion, idArchivo, changes);
    const updated = await repository.findArchivo(connection, idCotizacion, idArchivo);
    await connection.commit();
    return {
      ok: true,
      source: 'aiven',
      message: 'Archivo actualizado correctamente.',
      archivo: presentCotizacionArchivo_gnral(updated, idCotizacion)
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteArchivo(rawId, rawArchivo, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  const idArchivo = positiveInteger(rawArchivo);
  const actorId = getActorId(actionContext);
  if (!idCotizacion || !idArchivo) throw badRequest('Los identificadores deben ser enteros positivos.');
  const connection = await repository.getConnection();
  let existing = null;
  try {
    await connection.beginTransaction();
    await assertCotizacion(connection, idCotizacion, actionContext);
    existing = await repository.findArchivo(connection, idCotizacion, idArchivo, { forUpdate: true });
    if (!existing) throw httpError(404, 'Archivo no encontrado.');
    await repository.softDeleteArchivo(connection, idCotizacion, idArchivo);
    await connection.commit();
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }

  const cleanup = await cleanupAzureFiles_gnral([existing], {
    modulo: 'ventas',
    entidad_tipo: 'cotizacion_archivo',
    entidad_id: idArchivo,
    solicitado_por: actorId,
    motivo: 'Baja individual de archivo de cotización.'
  });

  return {
    ok: true,
    source: 'aiven',
    message: 'Archivo eliminado correctamente.',
    id_archivo: idArchivo,
    cleanup
  };
}

async function sync(payload) {
  const input = extractRecords(payload);

  if (!input) {
    throw badRequest('El cuerpo debe ser un arreglo o contener registros: [...].');
  }
  if (!input.length) throw badRequest('No se recibieron registros para sincronizar.');
  if (input.length > MAX_RECORDS) {
    throw badRequest(`La petición excede el máximo de ${MAX_RECORDS} registros.`);
  }

  const normalized = [];
  const rejected = [];
  const seen = new Set();

  input.forEach((row, index) => {
    const result = normalizeRecord(row, index);
    if (!result.ok) {
      rejected.push(result.error);
      return;
    }

    if (seen.has(result.value.id_cot_origen)) {
      rejected.push({
        fila: index + 2,
        id_cot: result.value.id_cot_origen,
        motivo: 'id_cot duplicado dentro de la misma petición.'
      });
      return;
    }

    seen.add(result.value.id_cot_origen);
    normalized.push(result.value);
  });

  const connection = await repository.getConnection();
  let inserted = 0;
  let updated = 0;
  let processedBatches = 0;

  try {
    const originIds = normalized.map((row) => row.id_cot_origen);
    const existingIds = await repository.findExistingCotizacionOriginIds(connection, originIds);

    const requestedUserIds = [...new Set(
      normalized
        .flatMap((row) => [row.id_asesor, row.id_admin, row.created_by, row.updated_by])
        .filter(Boolean)
    )];
    const existingUserIds = await repository.findExistingUserIds(connection, requestedUserIds);

    const valid = [];
    for (const row of normalized) {
      const missingUsers = [
        ['id_asesor', row.id_asesor],
        ['id_admin', row.id_admin],
        ['created_by', row.created_by],
        ['updated_by', row.updated_by]
      ].filter(([, id]) => id && !existingUserIds.has(id));

      if (missingUsers.length) {
        rejected.push({
          id_cot: row.id_cot_origen,
          motivo: `IDs de usuario inexistentes: ${missingUsers
            .map(([field, id]) => `${field}=${id}`)
            .join(', ')}.`
        });
        continue;
      }

      valid.push(row);
    }

    for (const batch of splitBatches(valid)) {
      await connection.beginTransaction();
      try {
        await repository.upsertMany(connection, batch);
        await connection.commit();
        processedBatches += 1;

        for (const row of batch) {
          if (existingIds.has(row.id_cot_origen)) updated += 1;
          else inserted += 1;
        }
      } catch (error) {
        await connection.rollback();
        error.message = `Falló el bloque ${processedBatches + 1}: ${error.message}`;
        throw error;
      }
    }
  } finally {
    connection.release();
  }

  return {
    ok: true,
    source: 'aiven',
    total_recibidos: input.length,
    total_validos: inserted + updated,
    insertados: inserted,
    actualizados: updated,
    rechazados: rejected.length,
    bloques_procesados: processedBatches,
    tamano_bloque: BATCH_SIZE,
    errores: rejected
  };
}

module.exports = { sync, list, getKpis, getEmbudo, getVendidos, getPerdidos, getProyeccion,
  getCatalogos, getById, create, update, remove, updateEstatus, updateAsignacion,
  listComentarios, createComentario, updateComentario, deleteComentario,
  listArchivos, createArchivo, getArchivo, getArchivoAccess, updateArchivo, deleteArchivo,
  presentCotizacionArchivo_gnral, normalizeLegacyFileUrl_gnral };
