'use strict';

const cotizacionesService = require('./ventas-cotizaciones.service');
const clientesRepository = require('../ventas-clientes/ventas-clientes.repository');
const contactosRepository = require('../ventas-clientes-contactos/ventas-clientes-contactos.repository');
const ventasVisibility = require('../ventas/ventas-visibility.service');

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function buildClientVisibility(scope) {
  if (!scope || scope.mode === 'ALL') return { sql: '', params: [] };

  const advisorIds = Array.isArray(scope.advisorIds)
    ? scope.advisorIds.filter((id) => Number.isInteger(id) && id > 0)
    : [];

  // El creador del registro no amplía el alcance. La visibilidad se resuelve
  // exclusivamente con Alcance de Información; un alcance vacío es fail-closed.
  if (!advisorIds.length) return { sql: ' AND 1 = 0', params: [] };

  return {
    sql: ` AND EXISTS (
      SELECT 1
        FROM usuarios vu
       WHERE vu.estado = 1
         AND vu.id_SB IN (${advisorIds.map(() => '?').join(', ')})
         AND UPPER(TRIM(vu.iniciales)) = UPPER(TRIM(vc.iniciales))
    )`,
    params: advisorIds
  };
}

async function listLightweightClients(connection, actionContext) {
  const scope = await ventasVisibility.resolveVisibilityScope(connection, actionContext);
  const visibility = buildClientVisibility(scope);

  const [rows] = await connection.query(
    `SELECT
       vc.id_cliente,
       vc.nombre_empresa,
       vc.razon_social,
       vc.ciudad,
       vc.estado,
       vc.iniciales,
       (SELECT MIN(u.id_SB)
          FROM usuarios u
         WHERE u.estado = 1
           AND UPPER(TRIM(u.iniciales)) = UPPER(TRIM(vc.iniciales))) AS id_asesor
     FROM ventas_clientes vc
     WHERE vc.activo = 1
     ${visibility.sql}
     ORDER BY vc.nombre_empresa ASC, vc.id_cliente ASC`,
    visibility.params
  );

  return { rows, scope };
}

async function get(rawId, actionContext) {
  // La cotización (incluidos equipos) mantiene la validación de visibilidad oficial.
  const cotizacionResult = await cotizacionesService.getById(rawId, actionContext);
  const cotizacion = cotizacionResult?.cotizacion || null;
  if (!cotizacion) {
    const error = new Error('La cotización no fue encontrada.');
    error.statusCode = 404;
    throw error;
  }

  // Una sola conexión para toda la información auxiliar del formulario.
  // No se reutiliza clientesService.list() porque esa consulta calcula métricas
  // comerciales por cliente y es innecesariamente pesada para Editar Cotización.
  const connection = await clientesRepository.getConnection();

  try {
    const { rows: clientes, scope } = await listLightweightClients(connection, actionContext);

    const contactos = cotizacion.id_cliente
      ? await contactosRepository.listByClient(connection, Number(cotizacion.id_cliente))
      : [];

    // Se obtiene catálogo de Ventas y Estados en una sola consulta.
    const [catalogRows] = await connection.query(
      `SELECT id_catalogo, area, elemento, articulo, descripcion, orden
         FROM catalogo_general
        WHERE activo = 1
          AND (area = 'Ventas' OR elemento = 'Estado')
        ORDER BY area, elemento, orden, articulo`
    );

    const catalogoGeneral = catalogRows.filter((row) => String(row.area || '').trim() === 'Ventas');
    const estados = catalogRows.filter((row) => String(row.elemento || '').trim() === 'Estado');

    // Para Editar solo se necesita el estatus. Evitamos getCatalogos(), que arma
    // catálogos y relaciones adicionales que esta pantalla no consume.
    const [statusRows] = await connection.query(
      `SELECT DISTINCT TRIM(estatus_proyecto) AS valor
         FROM ventas_cotizaciones_cor
        WHERE activo = 1
          AND NULLIF(TRIM(estatus_proyecto), '') IS NOT NULL
        ORDER BY valor ASC`
    );
    const estatusProyecto = statusRows.map((row) => row.valor).filter(Boolean);

    return {
      ok: true,
      source: 'aiven',
      cotizacion,
      clientes,
      contactos,
      catalogo_general: catalogoGeneral,
      estados,
      catalogos: { estatus_proyecto: estatusProyecto },
      visibilidad: ventasVisibility.toClientVisibility(scope)
    };
  } finally {
    connection.release();
  }
}

module.exports = { get };
