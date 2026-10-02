'use strict';

const db = require('../../config/db');
const pagosSyncRepository = require('./cobranza-cor-pagos.repository');

const TABLE_PAGOS_COR = pagosSyncRepository.TABLE_PAGOS_COR;
const TABLE_FUENTE_COR = 'cobranza_fuente_cor';

// El catalogo de proyectos del modulo Pagos se alimenta EXCLUSIVAMENTE
// de Fuente y se agrupa por PPNS/id_proyecto_origen.
const PROJECTS_SQL_COR = `
  SELECT
    UPPER(TRIM(f.id_proyecto_origen)) AS ppns_key,
    MAX(NULLIF(TRIM(f.id_proyecto_origen), '')) AS ppns,
    GROUP_CONCAT(DISTINCT NULLIF(TRIM(f.proyecto), '') ORDER BY NULLIF(TRIM(f.proyecto), '') SEPARATOR ' - ') AS proyecto,
    GROUP_CONCAT(DISTINCT NULLIF(TRIM(f.cliente), '') ORDER BY NULLIF(TRIM(f.cliente), '') SEPARATOR ' - ') AS cliente
  FROM ${TABLE_FUENTE_COR} f
  WHERE f.activo = 1
    AND NULLIF(TRIM(COALESCE(f.id_proyecto_origen, '')), '') IS NOT NULL
    AND UPPER(TRIM(COALESCE(f.id_proyecto_origen, ''))) NOT IN ('-', 'N/A', 'NA', 'N.A.', 'S/P', 'S/PP', 'SIN PP', 'SIN PPNS')
  GROUP BY UPPER(TRIM(f.id_proyecto_origen))
`;

const SELECT_PAGO_COR = `
  p.id_pago_cor,
  p.no_factura,
  NULLIF(TRIM(p.id_pp), '') AS ppns_relacionado,
  pr.proyecto AS proyecto_relacionado,
  pr.cliente AS cliente_relacionado,
  p.cliente,
  p.limite_credito,
  p.proyecto,
  DATE_FORMAT(p.fecha_servicio, '%Y-%m-%d') AS fecha_servicio,
  p.estado,
  p.facturado,
  p.pagado,
  p.saldo,
  p.dias_retraso,
  DATE_FORMAT(p.fecha_emision, '%Y-%m-%d') AS fecha_emision,
  DATE_FORMAT(p.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
  p.terminos,
  p.zona_adm,
  p.subsidiaria,
  p.clase,
  p.creado_desde,
  DATE_FORMAT(p.fecha_creacion_ov, '%Y-%m-%d %H:%i:%s') AS fecha_creacion_ov,
  p.complemento_pago,
  DATE_FORMAT(p.fecha_complemento_pago, '%Y-%m-%d') AS fecha_complemento_pago,
  p.importe_complemento_pago
`;

function buildWherePagos_cor(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.buscar) {
    const like = `%${filters.buscar}%`;
    clauses.push(`(
      p.no_factura LIKE ?
      OR p.cliente LIKE ?
      OR p.proyecto LIKE ?
      OR p.complemento_pago LIKE ?
      OR p.creado_desde LIKE ?
      OR p.id_pp LIKE ?
      OR pr.proyecto LIKE ?
      OR pr.cliente LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }

  if (filters.estado) {
    clauses.push('p.estado = ?');
    params.push(filters.estado);
  }

  if (filters.zonaAdm) {
    clauses.push('p.zona_adm = ?');
    params.push(filters.zonaAdm);
  }

  if (filters.relacionProyecto === 'CON_PROYECTO') {
    clauses.push("NULLIF(TRIM(COALESCE(p.id_pp, '')), '') IS NOT NULL");
  } else if (filters.relacionProyecto === 'SIN_PROYECTO') {
    clauses.push("NULLIF(TRIM(COALESCE(p.id_pp, '')), '') IS NULL");
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function pagosFromSql_cor() {
  return `FROM ${TABLE_PAGOS_COR} p
          LEFT JOIN (${PROJECTS_SQL_COR}) pr
            ON pr.ppns_key = UPPER(TRIM(p.id_pp))`;
}

async function countPagosModulo_cor(connection, filters = {}) {
  const where = buildWherePagos_cor(filters);
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
       ${pagosFromSql_cor()}
       ${where.sql}`,
    where.params
  );
  return Number(rows?.[0]?.total || 0);
}

async function resumenPagosModulo_cor(connection, filters = {}) {
  const where = buildWherePagos_cor(filters);
  const [rows] = await connection.query(
    `SELECT
       COUNT(*) AS registros,
       SUM(CASE WHEN NULLIF(TRIM(COALESCE(p.id_pp, '')), '') IS NULL THEN 1 ELSE 0 END) AS sin_proyecto,
       SUM(CASE WHEN NULLIF(TRIM(COALESCE(p.id_pp, '')), '') IS NOT NULL THEN 1 ELSE 0 END) AS con_proyecto
       ${pagosFromSql_cor()}
       ${where.sql}`,
    where.params
  );
  const row = rows?.[0] || {};
  return {
    registros: Number(row.registros || 0),
    sin_proyecto: Number(row.sin_proyecto || 0),
    con_proyecto: Number(row.con_proyecto || 0)
  };
}

async function listPagosModulo_cor(connection, filters = {}, pagination = {}) {
  const where = buildWherePagos_cor(filters);
  const limit = Number(pagination.limit);
  const offset = Number(pagination.offset);
  const [rows] = await connection.query(
    `SELECT ${SELECT_PAGO_COR}
       ${pagosFromSql_cor()}
       ${where.sql}
      ORDER BY p.id_pago_cor DESC
      LIMIT ? OFFSET ?`,
    [...where.params, limit, offset]
  );
  return rows;
}

async function getPagoModulo_cor(connection, idPagoCor) {
  const [rows] = await connection.query(
    `SELECT ${SELECT_PAGO_COR}
       ${pagosFromSql_cor()}
      WHERE p.id_pago_cor = ?
      LIMIT 1`,
    [idPagoCor]
  );
  return rows[0] || null;
}

async function listProyectosPagos_cor(connection, buscar = null) {
  const params = [];
  let where = '';
  if (buscar) {
    const like = `%${buscar}%`;
    where = `WHERE p.ppns LIKE ? OR p.proyecto LIKE ? OR p.cliente LIKE ?`;
    params.push(like, like, like);
  }
  const [rows] = await connection.query(
    `SELECT p.ppns, p.proyecto, p.cliente
       FROM (${PROJECTS_SQL_COR}) p
       ${where}
      ORDER BY COALESCE(p.proyecto, ''), p.ppns`,
    params
  );
  return rows;
}

async function getProyectoPagoByPpns_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT p.ppns, p.proyecto, p.cliente
       FROM (${PROJECTS_SQL_COR}) p
      WHERE p.ppns_key = UPPER(TRIM(?))
      LIMIT 1`,
    [ppns]
  );
  return rows[0] || null;
}

async function lockPagoProyecto_cor(connection, idPagoCor) {
  const [rows] = await connection.query(
    `SELECT id_pago_cor, NULLIF(TRIM(id_pp), '') AS ppns_relacionado
       FROM ${TABLE_PAGOS_COR}
      WHERE id_pago_cor = ?
      FOR UPDATE`,
    [idPagoCor]
  );
  return rows[0] || null;
}

async function lockPagosProyecto_cor(connection, idsPagoCor) {
  const ids = Array.isArray(idsPagoCor) ? idsPagoCor : [];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_pago_cor, NULLIF(TRIM(id_pp), '') AS ppns_relacionado
       FROM ${TABLE_PAGOS_COR}
      WHERE id_pago_cor IN (${placeholders})
      FOR UPDATE`,
    ids
  );
  return rows;
}

async function listRelacionesPagoProyecto_cor(connection, idPagoCor) {
  return pagosSyncRepository.listRelacionesPagoForUpdate_cor(connection, idPagoCor);
}

async function updatePagoProyecto_cor(connection, idPagoCor, ppns) {
  const [result] = await connection.query(
    `UPDATE ${TABLE_PAGOS_COR}
        SET id_pp = ?
      WHERE id_pago_cor = ?`,
    [ppns, idPagoCor]
  );
  return Number(result?.affectedRows || 0);
}

async function updatePagosProyecto_cor(connection, idsPagoCor, ppns) {
  const ids = Array.isArray(idsPagoCor) ? idsPagoCor : [];
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE ${TABLE_PAGOS_COR}
        SET id_pp = ?
      WHERE id_pago_cor IN (${placeholders})`,
    [ppns, ...ids]
  );
  return Number(result?.affectedRows || 0);
}

module.exports = {
  TABLE_PAGOS_COR,
  TABLE_FUENTE_COR,
  PROJECTS_SQL_COR,
  getConnection_cor: () => db.getConnection(),
  countPagosModulo_cor,
  resumenPagosModulo_cor,
  listPagosModulo_cor,
  getPagoModulo_cor,
  listProyectosPagos_cor,
  getProyectoPagoByPpns_cor,
  lockPagoProyecto_cor,
  lockPagosProyecto_cor,
  listRelacionesPagoProyecto_cor,
  updatePagoProyecto_cor,
  updatePagosProyecto_cor
};
