'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_VA_ADMIN_FASE_2_V001]
// Constructor de SELECT/COUNT. La lista blanca viene del contrato F1.
// El alcance territorial es generado por el backend; nunca por el navegador.
const {PC_COLUMNS_UNI} = require('./cobranza-uni-administracion.constants');

const FIELD_SET_UNI = new Set(PC_COLUMNS_UNI.map(column => column.name));
const DEFAULT_PAGE_SIZE_UNI = 30;
const MAX_PAGE_SIZE_UNI = 100;
const MAX_PAGE_UNI = 100000;
const GLOBAL_SEARCH_FIELDS_UNI = Object.freeze([
  'id_pc','proyecto','cliente','ov','concepto','no_factura',
  'estatus','estatus_administrativo','estatus_operativo','estatus_cartera'
]);

function badInput_uni(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'COBRANZA_UNI_VA_ADMIN_CONSULTA_INVALIDA';
  return error;
}
function integer_uni(value, fallback, min, max, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim();
  if (!/^\d{1,9}$/.test(raw)) throw badInput_uni(`Parametro ${name} invalido.`);
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    throw badInput_uni(`Parametro ${name} fuera de rango.`);
  }
  return num;
}
function shortText_uni(value, name, max = 120) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) {
    throw badInput_uni(`Parametro ${name} invalido.`);
  }
  const text = value.trim();
  if (text.length > max) throw badInput_uni(`Parametro ${name} demasiado largo.`);
  return text;
}
function parseListPcQuery_uni(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw badInput_uni('Consulta invalida.');
  }
  const page = integer_uni(query.page, 1, 1, MAX_PAGE_UNI, 'page');
  const pageSize = integer_uni(query.page_size, DEFAULT_PAGE_SIZE_UNI, 1, MAX_PAGE_SIZE_UNI, 'page_size');
  const search = shortText_uni(query.search, 'search');
  const filterColumn = shortText_uni(query.filter_column, 'filter_column', 80);
  const filterValue = shortText_uni(query.filter_value, 'filter_value');
  const sort = shortText_uni(query.sort, 'sort', 80) || 'id_pc';
  const order = (shortText_uni(query.order, 'order', 4) || 'desc').toLowerCase();
  if (!FIELD_SET_UNI.has(sort) || (filterColumn && !FIELD_SET_UNI.has(filterColumn))) {
    throw badInput_uni('Columna no permitida.');
  }
  if (filterValue && !filterColumn) throw badInput_uni('Selecciona columna para el filtro.');
  if (!['asc','desc'].includes(order)) throw badInput_uni('Orden invalido.');
  return Object.freeze({page, pageSize, search, filterColumn, filterValue, sort, order});
}
function escapedLikePc_uni(value) {
  return '%' + String(value).replace(/[!%_]/g, char => '!' + char) + '%';
}
function columnSql_uni(name) {
  if (!FIELD_SET_UNI.has(name)) throw badInput_uni('Identificador SQL no permitido.');
  return `pc.\`${name}\``;
}
function buildPcListQuery_uni(params, scopeSql) {
  if (!params || typeof params !== 'object') throw badInput_uni('Filtros invalidos.');
  if (typeof scopeSql !== 'string' || !scopeSql.trim()) {
    throw new Error('Alcance UNITED no disponible; consulta denegada.');
  }
  const clauses = [`(${scopeSql})`];
  const values = [];
  if (params.search) {
    clauses.push('(' + GLOBAL_SEARCH_FIELDS_UNI.map(field =>
      `CAST(${columnSql_uni(field)} AS CHAR) LIKE ? ESCAPE '!'`
    ).join(' OR ') + ')');
    for (const _field of GLOBAL_SEARCH_FIELDS_UNI) values.push(escapedLikePc_uni(params.search));
  }
  if (params.filterColumn && params.filterValue) {
    clauses.push(`CAST(${columnSql_uni(params.filterColumn)} AS CHAR) LIKE ? ESCAPE '!'`);
    values.push(escapedLikePc_uni(params.filterValue));
  }
  const fromSql = `FROM \`pc\` pc WHERE ${clauses.join(' AND ')}`;
  const fields = PC_COLUMNS_UNI.map(({name}) => {
    const sql = columnSql_uni(name);
    return name === 'id_pc' || name === 'id_proyecto_cobranza'
      ? `CAST(${sql} AS CHAR) AS \`${name}\`` : sql;
  }).join(', ');
  const orderSql = `ORDER BY ${columnSql_uni(params.sort)} ${params.order.toUpperCase()}` +
    (params.sort === 'id_pc' ? '' : ', pc.`id_pc` ASC');
  return Object.freeze({
    countSql: `SELECT COUNT(*) AS total ${fromSql}`,
    selectSql: `SELECT ${fields} ${fromSql} ${orderSql} LIMIT ? OFFSET ?`,
    countParams: [...values],
    selectParams: [...values, params.pageSize, (params.page-1)*params.pageSize]
  });
}
module.exports = Object.freeze({
  DEFAULT_PAGE_SIZE_UNI, MAX_PAGE_SIZE_UNI, MAX_PAGE_UNI,
  GLOBAL_SEARCH_FIELDS_UNI, parseListPcQuery_uni,
  buildPcListQuery_uni, escapedLikePc_uni
});
