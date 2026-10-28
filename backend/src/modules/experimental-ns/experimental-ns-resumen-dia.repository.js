'use strict';

// BLT NOW | Experimental NS | Resumen de UN dia por peticion, sin descargar historico.
const db = require('../../config/db');
const base = require('./experimental-ns.repository');
const scope = require('./experimental-ns.scope');
const periods = require('./experimental-ns-periodos');

// Proteccion exclusiva del numero de tickets de UN dia, nunca del total historico.
const MAX_ROWS = 10000;
const MAX_PORTAFOLIO = 50000;

function unavailable(code, message) {
  const e = new Error(message); e.code=code; e.statusCode=503; return e;
}

function projectZoneDisplaySql(alias) {
  // Solo para etiqueta visual; el control de acceso ya lo aplica ticketsScope.
  // Ante homonimos de proyectos en varias zonas NO se inventa ubicacion.
  return `(SELECT CASE
    WHEN COUNT(*) > 0 AND COUNT(DISTINCT p_ns_project.zona_id) = 1
      AND SUM(CASE WHEN p_ns_project.zona_id IS NULL THEN 1 ELSE 0 END) = 0
    THEN MIN(NULLIF(TRIM(p_ns_project.zona_operativa), ''))
    ELSE NULL END
    FROM ns_portafolio_pruebas p_ns_project
    WHERE p_ns_project.estado_registro = 1
      AND (
        (NULLIF(TRIM(COALESCE(${alias}.proyecto, '')), '') IS NOT NULL
          AND LOWER(TRIM(p_ns_project.proyecto)) = LOWER(TRIM(${alias}.proyecto)))
        OR
        (NULLIF(TRIM(COALESCE(${alias}.proyecto_padre, '')), '') IS NOT NULL
          AND LOWER(TRIM(p_ns_project.proyecto)) = LOWER(TRIM(${alias}.proyecto_padre)))
      ))`;
}

async function getInitialData(req) {
  scope.assertScope(req);
  const fecha = periods.requestedDate(req);
  const {inicio,fin} = periods.dayWindow(fecha);
  await base.requireSchema();
  const pScope = scope.portafolioScope(req);
  const tScope = scope.ticketsScope(req);

  const sqlPortafolio = `
    SELECT p.*, NULLIF(TRIM(p.zona_operativa), '') AS zona_oficial
    FROM ns_portafolio_pruebas p
    WHERE (${pScope.sql})
    ORDER BY p.id_portafolio DESC LIMIT ?`;

  const sqlTickets = `
    SELECT t.*,
      CASE
        WHEN NULLIF(TRIM(COALESCE(t.codigo_equipo, '')), '') IS NOT NULL
        THEN NULLIF(TRIM(p_ns_equipo.zona_operativa), '')
        ELSE ${projectZoneDisplaySql('t')}
      END AS zona_oficial
    FROM ns_tickets_pruebas t
    LEFT JOIN ns_portafolio_pruebas p_ns_equipo
      ON p_ns_equipo.estado_registro = 1
     AND TRIM(p_ns_equipo.numero_equipo) = TRIM(t.codigo_equipo)
    WHERE t.fecha_reporte >= ? AND t.fecha_reporte < ? AND (${tScope.sql})
    ORDER BY t.fecha_reporte DESC, t.id DESC LIMIT ?`;

  // Navegacion a dias con tickets, sin SELECT DISTINCT del historico.
  const sqlPrevious = `SELECT DATE_FORMAT(t.fecha_reporte,'%Y-%m-%d') AS fecha
    FROM ns_tickets_pruebas t
    WHERE t.fecha_reporte < ? AND (${tScope.sql})
    ORDER BY t.fecha_reporte DESC LIMIT 1`;
  const sqlNext = `SELECT DATE_FORMAT(t.fecha_reporte,'%Y-%m-%d') AS fecha
    FROM ns_tickets_pruebas t
    WHERE t.fecha_reporte >= ? AND (${tScope.sql})
    ORDER BY t.fecha_reporte ASC LIMIT 1`;

  for (const sql of [sqlPortafolio,sqlTickets,sqlPrevious,sqlNext]) scope.assertNoProductionTables(sql);
  // Secuencial para evitar agotar las conexiones compartidas de Azure.
  const [pResult]=await db.query(sqlPortafolio,[...pScope.params,MAX_PORTAFOLIO+1]);
  if (!Array.isArray(pResult)||pResult.length>MAX_PORTAFOLIO) throw unavailable(
    'EXPERIMENTAL_NS_RESUMEN_PORTAFOLIO_LIMIT', 'El portafolio NS excede el limite de lectura segura.');
  const [tResult]=await db.query(sqlTickets,[inicio,fin,...tScope.params,MAX_ROWS+1]);
  if (!Array.isArray(tResult)||tResult.length>MAX_ROWS) throw unavailable(
    'EXPERIMENTAL_NS_RESUMEN_DIA_LIMIT', 'La fecha solicitada supera el limite seguro de tickets diarios.');
  const [previous] = await db.query(sqlPrevious,[inicio,...tScope.params]);
  const [next] = await db.query(sqlNext,[fin,...tScope.params]);
  return {
    fecha,anterior:previous?.[0]?.fecha||null,siguiente:next?.[0]?.fecha||null,
    portafolio:pResult,tickets:tResult,truncado:false,
    limites:{portafolio:MAX_PORTAFOLIO,tickets:MAX_ROWS}
  };
}

module.exports={getInitialData,projectZoneDisplaySql,MAX_ROWS,MAX_PORTAFOLIO};
