'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_2_V001]
// F4: vista previa matematica de monto anual y diagnostico de pendiente.
// Fuente: filas ya autorizadas MP. NO JOIN Zona 1 ni escrituras.
const db = require('../../config/db');
const cobranzaScope = require('../../services/cobranza-uni-scope.service');
const { MP_COLUMNS_UNI } = require('./cobranza-uni-administracion.constants');
const {buildMpFormulaPreview_uni}=require('./cobranza-uni-administracion.mp-formulas');
const {parseListMpQuery_uni,buildMpListQuery_uni} =
  require('./cobranza-uni-administracion.mp-query');

async function listMantenimientoPreventivoAdmin_uni(req, dependencies={}) {
  const params = parseListMpQuery_uni(req.query || {});
  const scopeBuilder = dependencies.scopeBuilder || cobranzaScope.buildCobranzaProjectScopeSql_uni;
  const sql = buildMpListQuery_uni(params,scopeBuilder(req,'mp'));
  const conn = dependencies.connection || await db.getConnection();
  try {
    const [countRows] = await conn.query(sql.countSql,sql.countParams);
    const total = Number(countRows && countRows[0] && countRows[0].total);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Conteo MP no confiable.');
    const offset = (params.page-1)*params.pageSize;
    const [rows] = total>offset ? await conn.query(sql.selectSql,sql.selectParams) : [[]];
    if (!Array.isArray(rows)) throw new Error('Datos MP no confiables.');
    return {
      ok:true,source:'aiven',table:'detalle_mp_2026',primary_key:'id_dmp',
      readonly:true,columns:MP_COLUMNS_UNI,rows,total,
      formula_preview:buildMpFormulaPreview_uni(rows),
      page:params.page,page_size:params.pageSize,pages:Math.ceil(total/params.pageSize),
      sort:params.sort,order:params.order
    };
  } finally {
    if (!dependencies.connection) conn.release();
  }
}
module.exports = Object.freeze({listMantenimientoPreventivoAdmin_uni});
