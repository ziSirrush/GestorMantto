'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_3_V001]
// Constructor de SQL SOLO LECTURA con identificadores SQL de lista blanca.
// El alcance oficial (UNITED) se recibe exclusivamente desde el servicio
// cobranza-uni-scope.service; nunca se deriva de parametros del navegador.

const { GC_COLUMNS_UNI } = require('./cobranza-uni-administracion.constants');

const FIELD_SET = new Set(GC_COLUMNS_UNI.map(({name}) => name));
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100000;
const GLOBAL_SEARCH_FIELDS = Object.freeze([
  'id_gc', 'idns', 'proyecto', 'cliente', 'subsidiaria',
  'region', 'estado', 'z_oper', 'z_adm', 'categoria', 'prioridad'
]);

function invalidInput(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'COBRANZA_UNI_ADMIN_CONSULTA_INVALIDA';
  return error;
}

function integerParam(value, fallback, min, max, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  if (!/^\d{1,9}$/.test(text)) throw invalidInput(`Parametro ${name} invalido.`);
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw invalidInput(`Parametro ${name} fuera de rango.`);
  }
  return n;
}

function shortText(value, name, maxLength = 120) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw invalidInput(`Parametro ${name} invalido.`);
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    throw invalidInput(`Parametro ${name} contiene caracteres invalidos.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw invalidInput(`Parametro ${name} excede longitud o contiene caracteres invalidos.`);
  }
  return trimmed;
}

function parseListQuery_uni(query = {}) {
  const page = integerParam(query.page, 1, 1, MAX_PAGE, 'page');
  const pageSize = integerParam(query.page_size, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, 'page_size');
  const search = shortText(query.search, 'search');
  const filterValue = shortText(query.filter_value, 'filter_value');
  const filterColumn = shortText(query.filter_column, 'filter_column', 80);
  const sort = shortText(query.sort, 'sort', 80) || 'id_gc';
  const order = (shortText(query.order, 'order', 4) || 'asc').toLowerCase();
  if (!FIELD_SET.has(sort)) throw invalidInput('Columna de orden no permitida.');
  if (filterColumn && !FIELD_SET.has(filterColumn)) throw invalidInput('Columna de filtro no permitida.');
  if (filterValue && !filterColumn) throw invalidInput('Selecciona una columna para filtrar.');
  if (order !== 'asc' && order !== 'desc') throw invalidInput('Orden no permitido.');
  return Object.freeze({page, pageSize, search, filterColumn, filterValue, sort, order});
}

function escapedLike(value) {
  // En MySQL, ESCAPE '!' permite tratar %, _ y ! como literales.
  return '%' + String(value).replace(/[!%_]/g, (m) => '!' + m) + '%';
}

function columnSql(name) {
  // Los valores proceden EXCLUSIVAMENTE de FIELD_SET.
  if (!FIELD_SET.has(name)) throw invalidInput('Identificador SQL no permitido.');
  return `gc.\`${name}\``;
}

function buildGestionCreditoQuery_uni(params, trustedScopeSql) {
  if (!params || typeof params !== 'object') throw invalidInput('Filtros invalidos.');
  if (typeof trustedScopeSql !== 'string' || !trustedScopeSql.trim()) {
    throw new Error('Alcance UNITED no disponible; consulta denegada.');
  }
  const clauses = [`(${trustedScopeSql})`];
  const values = [];
  if (params.search) {
    clauses.push('(' + GLOBAL_SEARCH_FIELDS.map((field) => {
      return `CAST(${columnSql(field)} AS CHAR) LIKE ? ESCAPE '!'`;
    }).join(' OR ') + ')');
    const pattern = escapedLike(params.search);
    GLOBAL_SEARCH_FIELDS.forEach(() => values.push(pattern));
  }
  if (params.filterColumn && params.filterValue) {
    clauses.push(`CAST(${columnSql(params.filterColumn)} AS CHAR) LIKE ? ESCAPE '!'`);
    values.push(escapedLike(params.filterValue));
  }
  const whereSql = `FROM \`gestion_credito\` gc WHERE ${clauses.join(' AND ')}`;
  const fields = GC_COLUMNS_UNI.map(({name}) => {
    const field = columnSql(name);
    // Los BIGINT no deben pasar por Number de JavaScript: se envian como texto.
    if (name === 'id_gc' || name === 'id_proyecto_cobranza') {
      return `CAST(${field} AS CHAR) AS \`${name}\``;
    }
    return field;
  }).join(', ');
  const orderSql = `ORDER BY ${columnSql(params.sort)} ${params.order.toUpperCase()}`
    + (params.sort === 'id_gc' ? '' : ', gc.`id_gc` ASC');
  const selectSql = `SELECT ${fields} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) AS total ${whereSql}`;
  return Object.freeze({
    selectSql,
    countSql,
    selectParams: [...values, params.pageSize, (params.page - 1) * params.pageSize],
    countParams: [...values]
  });
}

module.exports = Object.freeze({
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, GLOBAL_SEARCH_FIELDS,
  parseListQuery_uni, buildGestionCreditoQuery_uni, escapedLike
});
