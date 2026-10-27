'use strict';

// BLT NOW | Experimental NS | F3 | Lectura exclusivamente de tablas NS.
const db = require('../../config/db');
const base = require('./experimental-ns.repository');
const scope = require('./experimental-ns.scope');

const MAX_ROWS = 50000;
const FETCH_LIMIT = MAX_ROWS + 1;

function projectZoneDisplaySql(alias) {
  // Sólo para etiqueta visual; el control de acceso ya lo aplica ticketsScope.
  // Si proyectos diferentes apuntan a más de una zona, NO se adivina una etiqueta.
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
  await base.requireSchema(); // Sin estructura completa, falla cerrado (503).
  const pScope = scope.portafolioScope(req);
  const tScope = scope.ticketsScope(req);

  const sqlPortafolio = `
    SELECT p.*, NULLIF(TRIM(p.zona_operativa), '') AS zona_oficial
    FROM ns_portafolio_pruebas p
    WHERE (${pScope.sql})
    ORDER BY p.id_portafolio DESC
    LIMIT ${FETCH_LIMIT}`;

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
    WHERE (${tScope.sql})
    ORDER BY t.fecha_reporte DESC, t.id DESC
    LIMIT ${FETCH_LIMIT}`;

  scope.assertNoProductionTables(sqlPortafolio);
  scope.assertNoProductionTables(sqlTickets);

  const [pResult, tResult] = await Promise.all([
    db.query(sqlPortafolio, pScope.params),
    db.query(sqlTickets, tScope.params)
  ]);
  const pRows = Array.isArray(pResult?.[0]) ? pResult[0] : [];
  const tRows = Array.isArray(tResult?.[0]) ? tResult[0] : [];

  // El valor libre zona_operativa es una etiqueta informativa, NUNCA una puerta.
  // No consultar z_op productiva ni otros endpoints operativos.
  return {
    portafolio: pRows.slice(0, MAX_ROWS),
    tickets: tRows.slice(0, MAX_ROWS),
    truncado: pRows.length > MAX_ROWS || tRows.length > MAX_ROWS,
    limites: { portafolio: MAX_ROWS, tickets: MAX_ROWS }
  };
}

module.exports = { getInitialData, projectZoneDisplaySql, MAX_ROWS };
