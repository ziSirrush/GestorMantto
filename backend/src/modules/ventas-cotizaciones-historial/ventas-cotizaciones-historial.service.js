'use strict';

const repository = require('./ventas-cotizaciones-historial.repository');
const ventasVisibility = require('../ventas/ventas-visibility.service');

const ORIGENES_VALIDOS = new Set([
  'CREACION',
  'EDICION',
  'CAMBIO_ESTATUS',
  'CIERRE_VENDIDO',
  'CIERRE_PERDIDO',
  'REACTIVACION',
  'SINCRONIZACION',
  'SISTEMA'
]);

function httpError(statusCode, message, detalles) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (detalles) error.detalles = detalles;
  return error;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function text(value, max = 255) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function pageOptions(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page || query.pagina || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(query.page_size || query.tamano_pagina || '50', 10) || 50));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    accion: text(query.accion, 40),
    search: text(query.buscar || query.search, 200),
    idCotizacion: positiveInteger(query.id_cotizacion),
    desde: text(query.desde, 10),
    hasta: text(query.hasta, 10)
  };
}

function actorId(actionContext) {
  const id = positiveInteger(actionContext?.user?.id_SB);
  if (!id) throw httpError(401, 'Sesión requerida.');
  return id;
}

function safeJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function getStatus(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return text(snapshot.estatus_proyecto, 100);
}

function getChangedFields(anterior, nuevo) {
  const keys = new Set([
    ...Object.keys(anterior && typeof anterior === 'object' ? anterior : {}),
    ...Object.keys(nuevo && typeof nuevo === 'object' ? nuevo : {})
  ]);
  return [...keys].filter(Boolean).join(', ').slice(0, 100) || null;
}

function normalizeOrigin(accion) {
  const normalized = text(accion, 40)?.toUpperCase() || 'SISTEMA';
  if (ORIGENES_VALIDOS.has(normalized)) return normalized;
  if (normalized === 'CAMBIO_ASIGNACION' || normalized === 'DESACTIVACION') return 'EDICION';
  return 'SISTEMA';
}

async function registrarMovimiento(connection, data, actionContext) {
  const idCotizacion = positiveInteger(data?.idCotizacion);
  if (!idCotizacion) throw httpError(400, 'idCotizacion es obligatorio para registrar historial.');
  const accion = text(data?.accion, 40);
  if (!accion) throw httpError(400, 'accion es obligatoria para registrar historial.');

  const anterior = data?.anterior && typeof data.anterior === 'object' ? data.anterior : null;
  const nuevo = data?.nuevo && typeof data.nuevo === 'object' ? data.nuevo : null;

  return repository.create(connection, {
    id_cotizacion: idCotizacion,
    estatus_anterior: getStatus(anterior),
    estatus_nuevo: getStatus(nuevo),
    motivo: text(data?.motivo, 255),
    comentario: text(data?.comentario, 65535),
    campo_origen: getChangedFields(anterior, nuevo),
    valor_anterior: safeJson(anterior),
    valor_nuevo: safeJson(nuevo),
    id_usuario: actorId(actionContext),
    origen_movimiento: normalizeOrigin(accion)
  });
}

async function listByCotizacion(rawId, query, actionContext) {
  const idCotizacion = positiveInteger(rawId);
  if (!idCotizacion) throw httpError(400, 'El id de cotización debe ser un entero positivo.');
  const options = pageOptions(query);
  const connection = await repository.getConnection();
  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const result = await repository.listByCotizacion(connection, idCotizacion, options, scope);
    if (!result.total) {
      const [rows] = await connection.query('SELECT id_cotizacion FROM ventas_cotizaciones_cor WHERE id_cotizacion = ? LIMIT 1', [idCotizacion]);
      if (!rows.length) throw httpError(404, 'Cotización no encontrada.');
    }
    return {
      ok: true,
      source: 'aiven',
      id_cotizacion: idCotizacion,
      historial: result.rows,
      paginacion: {
        pagina: options.page,
        tamano_pagina: options.pageSize,
        total_registros: result.total,
        total_paginas: Math.ceil(result.total / options.pageSize)
      }
    };
  } finally {
    connection.release();
  }
}

async function listGlobal(query, actionContext) {
  const options = pageOptions(query);
  const connection = await repository.getConnection();
  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const result = await repository.listGlobal(connection, options, scope);
    return {
      ok: true,
      source: 'aiven',
      historial: result.rows,
      paginacion: {
        pagina: options.page,
        tamano_pagina: options.pageSize,
        total_registros: result.total,
        total_paginas: Math.ceil(result.total / options.pageSize)
      },
      filtros: {
        accion: options.accion,
        buscar: options.search,
        id_cotizacion: options.idCotizacion,
        desde: options.desde,
        hasta: options.hasta
      }
    };
  } finally {
    connection.release();
  }
}

module.exports = { registrarMovimiento, listByCotizacion, listGlobal };
