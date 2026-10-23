'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMIN_MP_FASE_2_V001]
// Solo SELECT/COUNT de MP principal. Scope UNITED proveniente del servidor;
// lista blanca de SQL desde el contrato MP F1, sin busquedas por nombre para JOIN.
const { MP_COLUMNS_UNI } = require('./cobranza-uni-administracion.constants');

const FIELDS_UNI = new Set(MP_COLUMNS_UNI.map(c => c.name));
const GLOBAL_SEARCH_FIELDS_UNI = Object.freeze([
  'id_dmp','idns','proyecto','cliente','zona_adm','periodicidad',
  'momento_facturacion','estado','z_oper','forma_pago','estatus_cartera'
]);
const DEFAULT_PAGE_SIZE_UNI = 50;
const MAX_PAGE_SIZE_UNI = 100;
const MAX_PAGE_UNI = 100000;

function invalid_uni(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'COBRANZA_UNI_MP_ADMIN_CONSULTA_INVALIDA';
  return err;
}
function int_uni(value, fallback, min, max, name) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object' || !/^\d{1,9}$/.test(String(value))) throw invalid_uni('Parametro '+name+' invalido.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw invalid_uni('Parametro '+name+' fuera de rango.');
  return n;
}
function text_uni(value, name, max = 120) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) throw invalid_uni('Parametro '+name+' invalido.');
  const result = value.trim();
  if (result.length > max) throw invalid_uni('Parametro '+name+' excede longitud.');
  return result;
}
function column_uni(field) {
  if (!FIELDS_UNI.has(field)) throw invalid_uni('Columna SQL no permitida.');
  return `mp.\`${field}\``;
}
function like_uni(value) { return '%' + String(value).replace(/[!%_]/g, x => '!'+x) + '%'; }
function parseListMpQuery_uni(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw invalid_uni('Consulta invalida.');
  const page = int_uni(query.page, 1, 1, MAX_PAGE_UNI, 'page');
  const pageSize = int_uni(query.page_size, DEFAULT_PAGE_SIZE_UNI, 1, MAX_PAGE_SIZE_UNI, 'page_size');
  const search = text_uni(query.search,'search');
  const filterColumn = text_uni(query.filter_column,'filter_column',80);
  const filterValue = text_uni(query.filter_value,'filter_value');
  const sort = text_uni(query.sort,'sort',80) || 'id_dmp';
  const order = (text_uni(query.order,'order',4) || 'asc').toLowerCase();
  const status = text_uni(query.estatus,'estatus',40); // exacto, sin LIKE
  const pending = text_uni(query.pendientes,'pendientes',30) || 'todos';
  if (!FIELDS_UNI.has(sort) || (filterColumn && !FIELDS_UNI.has(filterColumn))) throw invalid_uni('Columna no permitida.');
  if (filterValue && !filterColumn) throw invalid_uni('Selecciona columna para filtrar.');
  if (!['asc','desc'].includes(order)) throw invalid_uni('Orden no permitido.');
  if (!['','Activo','Inactivo','Sin estado'].includes(status)) throw invalid_uni('Estatus no permitido.');
  if (!['todos','importe','facturas','ambos'].includes(pending)) throw invalid_uni('Filtro de pendientes no permitido.');
  return Object.freeze({page,pageSize,search,filterColumn,filterValue,sort,order,status,pending});
}
function buildMpListQuery_uni(params, trustedScopeSql) {
  if (!params || typeof params !== 'object') throw invalid_uni('Parametros invalidos.');
  if (typeof trustedScopeSql !== 'string' || !trustedScopeSql.trim())
    throw new Error('Alcance UNITED no disponible; consulta denegada.');
  const where = [`(${trustedScopeSql})`];
  const values = [];
  if (params.search) {
    where.push('('+GLOBAL_SEARCH_FIELDS_UNI.map(name=>
      `CAST(${column_uni(name)} AS CHAR) LIKE ? ESCAPE '!'`).join(' OR ')+')');
    for (const name of GLOBAL_SEARCH_FIELDS_UNI) values.push(like_uni(params.search));
  }
  if (params.filterColumn && params.filterValue) {
    where.push(`CAST(${column_uni(params.filterColumn)} AS CHAR) LIKE ? ESCAPE '!'`);
    values.push(like_uni(params.filterValue));
  }
  if (params.status === 'Sin estado') {
    where.push('(mp.`estatus_cartera` IS NULL OR TRIM(mp.`estatus_cartera`) = \'\')');
  } else if (params.status) {
    where.push('mp.`estatus_cartera` = ?');
    values.push(params.status);
  }
  if (params.pending === 'importe' || params.pending === 'ambos')
    where.push('COALESCE(mp.`pendiente`, 0) > 0');
  if (params.pending === 'facturas' || params.pending === 'ambos')
    where.push('COALESCE(mp.`facturas_pendientes`, 0) > 0');

  const fromSql = `FROM \`detalle_mp_2026\` mp WHERE ${where.join(' AND ')}`;
  const select = MP_COLUMNS_UNI.map(({name}) => {
    const field = column_uni(name);
    return name === 'id_dmp' || name === 'id_proyecto_cobranza'
      ? `CAST(${field} AS CHAR) AS \`${name}\`` : field;
  }).join(', ');
  const orderSql = `ORDER BY ${column_uni(params.sort)} ${params.order.toUpperCase()}` +
    (params.sort === 'id_dmp' ? '' : ', mp.`id_dmp` ASC');
  return Object.freeze({
    countSql: `SELECT COUNT(*) AS total ${fromSql}`,
    selectSql: `SELECT ${select} ${fromSql} ${orderSql} LIMIT ? OFFSET ?`,
    countParams: [...values],
    selectParams: [...values,params.pageSize,(params.page-1)*params.pageSize]
  });
}
module.exports = Object.freeze({
  DEFAULT_PAGE_SIZE_UNI,MAX_PAGE_SIZE_UNI,MAX_PAGE_UNI,GLOBAL_SEARCH_FIELDS_UNI,
  parseListMpQuery_uni,buildMpListQuery_uni,like_uni
});
