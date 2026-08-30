'use strict';

const cotizacionesRepository = require('./ventas-cotizaciones.repository');
const interestRepository = require('./ventas-cotizaciones-interes.repository');
const ventasVisibility = require('../ventas/ventas-visibility.service');

function httpError(statusCode, message) {
  const error = new Error(message);
  error.status = statusCode;
  error.statusCode = statusCode;
  return error;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw httpError(400, `${field} debe ser un entero positivo.`);
  return number;
}

function actorId(actionContext) {
  return positiveInteger(
    actionContext?.user?.id_SB || actionContext?.user?.id || actionContext?.user?.user_id,
    'usuario autenticado'
  );
}

function parseInterest(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw httpError(400, 'activo debe ser true o false.');
}

function normalizeListQuery(query) {
  const page = Math.max(1, Number.parseInt(query?.pagina ?? query?.page ?? '1', 10) || 1);
  const requested = Number.parseInt(query?.tamano_pagina ?? query?.page_size ?? '30', 10) || 30;
  return {
    page,
    // Regla global del Dashboard/ventas: 30 registros por página.
    pageSize: Math.min(30, Math.max(1, requested)),
    search: String(query?.buscar ?? query?.search ?? '').trim().slice(0, 120)
  };
}

async function visibleQuotation(connection, rawId, actionContext) {
  const idCotizacion = positiveInteger(rawId, 'id_cotizacion');
  const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
  const cotizacion = await cotizacionesRepository.findById(connection, idCotizacion, { scope });
  if (!cotizacion) throw httpError(404, 'Cotización no encontrada o fuera de tu alcance.');
  return { idCotizacion, cotizacion };
}

function responseState(idCotizacion, event) {
  return {
    ok: true,
    source: 'aiven',
    id_cotizacion: idCotizacion,
    proyecto_interes: interestRepository.interestIsActive(event),
    personal: true,
    ultima_interaccion: event
      ? {
          id_interaccion: Number(event.id_interaccion || 0) || null,
          fecha: event.created_at || null
        }
      : null
  };
}

async function getProjectInterest(rawId, actionContext) {
  const idUsuario = actorId(actionContext);
  const connection = await cotizacionesRepository.getConnection();
  try {
    const { idCotizacion } = await visibleQuotation(connection, rawId, actionContext);
    const event = await interestRepository.getLatestProjectInterest(connection, idUsuario, idCotizacion);
    return responseState(idCotizacion, event);
  } finally {
    connection.release();
  }
}

async function setProjectInterest(rawId, payload, actionContext) {
  const idUsuario = actorId(actionContext);
  if (!Object.prototype.hasOwnProperty.call(payload || {}, 'activo')) {
    throw httpError(400, 'Debes indicar activo=true o activo=false.');
  }
  const activo = parseInterest(payload.activo);
  const connection = await cotizacionesRepository.getConnection();
  try {
    await connection.beginTransaction();
    const { idCotizacion, cotizacion } = await visibleQuotation(connection, rawId, actionContext);
    const current = await interestRepository.getLatestProjectInterest(connection, idUsuario, idCotizacion);
    const currentActive = interestRepository.interestIsActive(current);

    if (current && currentActive === activo) {
      await connection.commit();
      return {
        ...responseState(idCotizacion, current),
        cambio: false,
        message: activo ? 'El proyecto ya está marcado como de interés.' : 'El proyecto ya no está marcado como de interés.'
      };
    }

    const idInteraccion = await interestRepository.insertProjectInterestEvent(connection, {
      id_usuario: idUsuario,
      id_cotizacion: idCotizacion,
      activo,
      descripcion: cotizacion.nombre_proyecto || cotizacion.cliente || `Cotización ${idCotizacion}`,
      empresa_contexto: actionContext?.contextUser?.empresa || actionContext?.user?.empresa || null,
      detalle: {
        id_cotizacion: idCotizacion,
        nombre_proyecto: cotizacion.nombre_proyecto || null,
        cliente: cotizacion.cliente || null,
        estatus_proyecto: cotizacion.estatus_proyecto || null
      },
      ip_address: actionContext?.ip || null,
      user_agent: actionContext?.userAgent || null
    });
    await connection.commit();

    return {
      ok: true,
      source: 'aiven',
      id_cotizacion: idCotizacion,
      proyecto_interes: activo,
      personal: true,
      cambio: true,
      id_interaccion: idInteraccion,
      message: activo ? 'Proyecto marcado como de interés.' : 'Proyecto retirado de tus proyectos de interés.'
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    connection.release();
  }
}

async function listProjectInterests(query, actionContext) {
  const idUsuario = actorId(actionContext);
  const normalized = normalizeListQuery(query);
  const connection = await cotizacionesRepository.getConnection();
  try {
    const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
    const result = await interestRepository.listProjectInterests(connection, {
      idUsuario,
      scope,
      page: normalized.page,
      pageSize: normalized.pageSize,
      search: normalized.search
    });

    return {
      ok: true,
      source: 'aiven',
      personal: true,
      data: result.rows,
      total: result.total,
      paginacion: {
        pagina: result.page,
        tamano_pagina: result.pageSize,
        total: result.total,
        total_paginas: result.totalPages
      },
      alcance: ventasVisibility.toClientVisibility(scope)
    };
  } finally {
    connection.release();
  }
}

module.exports = {
  getProjectInterest,
  setProjectInterest,
  listProjectInterests
};
