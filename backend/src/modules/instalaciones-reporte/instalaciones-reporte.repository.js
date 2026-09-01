'use strict';

const db = require('../../config/db');
const informationRecordScope = require('../../services/information-record-scope-gnral.service');

const REPORT_CURRENT_STATUSES = Object.freeze([
  '01-SUS',
  '02-OC',
  '03-PM',
  '04-M',
  '05-PA',
  '06-A',
  '07-PE'
]);

const REPORT_ACTIVE_STATUSES = Object.freeze([
  '02-OC',
  '03-PM',
  '04-M',
  '05-PA',
  '06-A',
  '07-PE'
]);

const REPORT_STATUSES = Object.freeze([
  ...REPORT_CURRENT_STATUSES,
  '08-T'
]);

function statusPlaceholders() {
  return REPORT_STATUSES.map(() => '?').join(', ');
}

function activeStatusPlaceholders() {
  return REPORT_ACTIVE_STATUSES.map(() => '?').join(', ');
}

function reportStatusExpression() {
  return {
    sql: 'f.estatus',
    params: []
  };
}

function reportSelect(deliveredYear) {
  const reportStatus = reportStatusExpression(deliveredYear);

  return {
    sql: `
      f.id_ins_fl,
      f.id_proyecto,
      f.proyecto,
      f.referencia_sitio,
      ${reportStatus.sql} AS estatus,
      f.estado,
      f.ciudad,
      f.cliente,
      f.id_sup,
      f.supervisor_fl,
      f.id_asesor,
      f.vendedor,
      f.fecha_visita,
      f.comentarios_fl,
      f.avance_oc,
      f.avance_mo,
      f.fecha_cpvp,
      f.estatus_produccion,
      f.fecha_descarga,
      f.fecha_ccnr,
      f.dias_sin_ccnr,
      f.dias_sin_visita,
      f.fecha_posible_recepcion_cubo,
      f.fecha_ccr,
      f.subcontratista,
      f.fecha_inicio_montaje,
      f.fecha_fin_montaje_planeado,
      f.fecha_fin_montaje_modificado,
      f.fecha_fin_montaje_real,
      f.dias_restantes,
      f.fecha_revision_supervisor,
      f.fecha_minuta_revision_ajuste,
      f.fecha_liberacion_ajuste,
      f.fecha_cti,
      f.fecha_posible_inicio_ajuste,
      f.ajustador,
      f.fecha_inicio_ajuste,
      f.fecha_fin_ajuste_planeado,
      f.fecha_fin_ajuste_modificado,
      f.fecha_protocolo_aceptacion,
      f.estatus_inspeccion_calidad,
      f.pendientes_calidad,
      f.fecha_entrega_cliente,
      f.formato_caf_pg,
      f.estatus_equipo_entrega,
      f.anio_termino,
      f.activo,
      f.updated_at
    `,
    params: reportStatus.params
  };
}

function buildPopulationWhere(deliveredYear, informationAccess) {
  const params = [];
  const scope = informationRecordScope.buildInsFlScopeSql_gnral(informationAccess, 'f');

  if (deliveredYear !== null && deliveredYear !== undefined) {
    params.push(...REPORT_ACTIVE_STATUSES, deliveredYear, ...scope.params);
    return {
      sql: `WHERE (
        f.estatus = '01-SUS'
        OR (f.activo = 1 AND f.estatus IN (${activeStatusPlaceholders()}))
        OR (f.estatus = '08-T' AND CAST(TRIM(f.anio_termino) AS UNSIGNED) = ?)
      ) AND ${scope.sql}`,
      params
    };
  }

  params.push(...REPORT_ACTIVE_STATUSES, ...scope.params);
  return {
    sql: `WHERE (
      f.estatus = '01-SUS'
      OR (f.activo = 1 AND f.estatus IN (${activeStatusPlaceholders()}))
    ) AND ${scope.sql}`,
    params
  };
}

function buildWhere(filters, deliveredYear, informationAccess) {
  const population = buildPopulationWhere(deliveredYear, informationAccess);
  const clauses = [population.sql.replace(/^WHERE\s+/i, '')];
  const params = [...population.params];

  if (filters.estatus) {
    const reportStatus = reportStatusExpression(deliveredYear);
    clauses.push(`${reportStatus.sql} = ?`);
    params.push(...reportStatus.params, filters.estatus);
  }

  if (filters.id_sup) {
    clauses.push('f.id_sup = ?');
    params.push(filters.id_sup);
  }

  if (filters.supervisor) {
    clauses.push("TRIM(COALESCE(f.supervisor_fl, '')) = ?");
    params.push(filters.supervisor);
  }

  if (filters.id_asesor) {
    clauses.push('f.id_asesor = ?');
    params.push(filters.id_asesor);
  }

  if (filters.asesor) {
    clauses.push("TRIM(COALESCE(f.vendedor, '')) = ?");
    params.push(filters.asesor);
  }

  return {
    sql: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}

async function getRulesDate() {
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS fecha_actual`
  );

  const row = rows[0] || {};
  return String(row.fecha_actual || '').trim() || new Date().toISOString().slice(0, 10);
}

async function getDeliveredYears(informationAccess) {
  const scope = informationRecordScope.buildInsFlScopeSql_gnral(informationAccess, 'f');
  const [rows] = await db.query(
    `SELECT years.anio
       FROM (
         SELECT DISTINCT TRIM(f.anio_termino) AS anio
           FROM ins_fl f
          WHERE NULLIF(TRIM(f.anio_termino), '') IS NOT NULL
            AND ${scope.sql}
       ) AS years
      ORDER BY CAST(years.anio AS UNSIGNED) DESC,
               years.anio DESC`,
    scope.params
  );

  return rows
    .map(row => Number(row.anio))
    .filter(year => Number.isInteger(year) && year > 0);
}

async function listReportRows(filters, deliveredYear, informationAccess) {
  const select = reportSelect(deliveredYear);
  const where = buildWhere(filters, deliveredYear, informationAccess);
  const [rows] = await db.query(
    `SELECT ${select.sql}
       FROM ins_fl f
       ${where.sql}
       ORDER BY
         FIELD(f.estatus, ${statusPlaceholders()}),
         f.estado ASC,
         f.proyecto ASC,
         f.referencia_sitio ASC,
         f.id_ins_fl ASC
       LIMIT ? OFFSET ?`,
    [
      ...select.params,
      ...where.params,
      ...REPORT_STATUSES,
      filters.limit,
      filters.offset
    ]
  );
  return rows;
}

async function countReportRowsByStatus(filters, deliveredYear, informationAccess) {
  const where = buildWhere(filters, deliveredYear, informationAccess);
  const [rows] = await db.query(
    `SELECT f.estatus AS estatus, COUNT(*) AS total
       FROM ins_fl f
       ${where.sql}
       GROUP BY f.estatus
       ORDER BY FIELD(f.estatus, ${statusPlaceholders()})`,
    [
      ...where.params,
      ...REPORT_STATUSES
    ]
  );
  return rows;
}

async function getFilterOptions(deliveredYear, informationAccess) {
  const population = buildPopulationWhere(deliveredYear, informationAccess);
  const [rows] = await db.query(
    `SELECT tipo, id_valor, nombre, codigo, total
       FROM (
         SELECT
           'SUPERVISOR' AS tipo,
           CASE
             WHEN COUNT(DISTINCT f.id_sup) = 1 THEN CAST(MAX(f.id_sup) AS CHAR)
             ELSE NULL
           END AS id_valor,
           TRIM(f.supervisor_fl) AS nombre,
           NULL AS codigo,
           COUNT(*) AS total
         FROM ins_fl f
         ${population.sql}
           AND NULLIF(TRIM(f.supervisor_fl), '') IS NOT NULL
         GROUP BY TRIM(f.supervisor_fl)

         UNION ALL

         SELECT
           'ASESOR' AS tipo,
           CASE
             WHEN COUNT(DISTINCT f.id_asesor) = 1 THEN CAST(MAX(f.id_asesor) AS CHAR)
             ELSE NULL
           END AS id_valor,
           TRIM(f.vendedor) AS nombre,
           NULL AS codigo,
           COUNT(*) AS total
         FROM ins_fl f
         ${population.sql}
           AND NULLIF(TRIM(f.vendedor), '') IS NOT NULL
         GROUP BY TRIM(f.vendedor)

         UNION ALL

         SELECT
           'ESTATUS' AS tipo,
           NULL AS id_valor,
           NULL AS nombre,
           f.estatus AS codigo,
           COUNT(*) AS total
         FROM ins_fl f
         ${population.sql}
         GROUP BY f.estatus
       ) opciones
       ORDER BY tipo ASC, nombre ASC, codigo ASC`,
    [
      ...population.params,
      ...population.params,
      ...population.params
    ]
  );
  return rows;
}

async function getVisualStates(codes) {
  const normalizedCodes = Array.from(new Set(
    (Array.isArray(codes) ? codes : [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
  ));

  if (!normalizedCodes.length) return [];

  const placeholders = normalizedCodes.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT
       ev.id_estado_visual,
       ev.codigo,
       ev.nombre,
       ev.descripcion,
       ev.categoria,
       ev.emoji,
       ev.icono,
       ev.color_texto,
       ev.color_fondo,
       ev.color_borde,
       ev.prioridad
     FROM estados_visuales ev
     WHERE ev.activo = 1
       AND ev.codigo IN (${placeholders})
     ORDER BY ev.prioridad ASC, ev.codigo ASC`,
    normalizedCodes
  );

  return rows;
}

module.exports = {
  REPORT_STATUSES,
  getRulesDate,
  getDeliveredYears,
  listReportRows,
  countReportRowsByStatus,
  getFilterOptions,
  getVisualStates
};
