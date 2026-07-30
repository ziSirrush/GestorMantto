const repository = require('./ventas-cotizaciones-historial.repository');
const ventasVisibility = require('../ventas/ventas-visibility.service');

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

async function registrarMovimiento(connection, data, actionContext) {
  const idCotizacion = positiveInteger(data?.idCotizacion);
  if (!idCotizacion) throw httpError(400, 'idCotizacion es obligatorio para registrar historial.');
  const accion = text(data?.accion, 40);
  if (!accion) throw httpError(400, 'accion es obligatoria para registrar historial.');

  return repository.create(connection, {
    id_cotizacion: idCotizacion,
    accion,
    comentario: text(data?.comentario, 5000),
    motivo: text(data?.motivo, 5000),
    detalle_anterior: safeJson(data?.anterior),
    detalle_nuevo: safeJson(data?.nuevo),
    proxima_fecha: data?.proximaFecha || null,
    id_usuario: actorId(actionContext),
    ip: text(actionContext?.ip, 45),
    user_agent: text(actionContext?.userAgent, 255)
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
