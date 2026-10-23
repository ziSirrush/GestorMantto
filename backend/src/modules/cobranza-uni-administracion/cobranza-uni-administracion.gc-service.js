'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_3_V001]
// Consulta paginada de gestion_credito. Respeta el alcance oficial por cuartos,
// no reutiliza la consulta legacy sin filtro y NO realiza escrituras SQL.
const db = require('../../config/db');
const cobranzaScope = require('../../services/cobranza-uni-scope.service');
const { GC_COLUMNS_UNI } = require('./cobranza-uni-administracion.constants');
const { parseListQuery_uni, buildGestionCreditoQuery_uni } =
  require('./cobranza-uni-administracion.gc-query');

async function listGestionCredito_uni(req, dependencies = {}) {
  const params = parseListQuery_uni(req.query || {});
  const scopeBuilder = dependencies.scopeBuilder || cobranzaScope.buildCobranzaProjectScopeSql_uni;
  const sql = buildGestionCreditoQuery_uni(params, scopeBuilder(req, 'gc'));
  const conn = dependencies.connection || await db.getConnection();
  try {
    const [countRows] = await conn.query(sql.countSql, sql.countParams);
    const rawTotal = countRows && countRows[0] && countRows[0].total;
    const total = Number(rawTotal);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error('Conteo de registros no confiable.');
    }
    // El filtrado territorial y por campos sigue vigente incluso con total cero.
    const [rows] = total > 0 && (params.page - 1) * params.pageSize < total
      ? await conn.query(sql.selectSql, sql.selectParams)
      : [[]];
    return {
      ok: true,
      source: 'aiven',
      table: 'gestion_credito',
      primary_key: 'id_gc',
      readonly: true,
      columns: GC_COLUMNS_UNI,
      rows,
      total,
      page: params.page,
      page_size: params.pageSize,
      pages: Math.ceil(total / params.pageSize),
      sort: params.sort,
      order: params.order
    };
  } finally {
    if (!dependencies.connection) conn.release();
  }
}

module.exports = Object.freeze({listGestionCredito_uni});
