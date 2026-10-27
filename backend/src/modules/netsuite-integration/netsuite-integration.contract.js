'use strict';

// NS Integration V001 - Contrato compatible con BLTNOW_NS_Emisor_MR_V001.js.
// Valida solicitudes antes de definir almacenamiento. Nunca escribe en Aiven.
const crypto = require('crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_SHA256 = /^[0-9a-f]{64}$/i;
const DATASET = /^[A-Z][A-Z0-9_-]{1,59}$/;
const MAX_PAGE_SIZE = 300;
const MAX_PAGES = 200;
const MAX_ROWS = MAX_PAGE_SIZE * MAX_PAGES;
const MAX_COLUMNS = 160;

function invalid(message, code = 'NS_CONTRACT_INVALID', statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(`${label} debe ser un objeto JSON.`);
  }
  return value;
}

function exactInteger(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw invalid(`${label} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function string(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw invalid(`${label} debe ser texto no vacio de hasta ${max} caracteres.`);
  }
  return value;
}

function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw invalid('Identificador de lote UUID invalido.', 'NS_LOTE_ID_INVALID');
  }
  return value.toLowerCase();
}

function digest(value, label) {
  if (typeof value !== 'string' || !HEX_SHA256.test(value)) {
    throw invalid(`${label} debe ser SHA-256 hexadecimal.`, 'NS_HASH_INVALID');
  }
  return value.toLowerCase();
}

function verifyIsoUtc(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw invalid('fechaExtraccionUtc debe ser ISO 8601 UTC valido.');
  }
}

function columns(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_COLUMNS) {
    throw invalid(`columnas debe contener de 1 a ${MAX_COLUMNS} entradas.`);
  }
  input.forEach((col, i) => {
    object(col, `columnas[${i}]`);
    if (col.indice !== i) throw invalid(`Indice de columna ${i} incorrecto.`);
    string(col.nombre, `columnas[${i}].nombre`, 128);
    for (const key of ['join', 'summary', 'label']) {
      if (col[key] !== null && col[key] !== undefined &&
          (typeof col[key] !== 'string' || col[key].length > 512)) {
        throw invalid(`columnas[${i}].${key} debe ser texto o null.`);
      }
    }
  });
  return input.length;
}

function validateBegin(body) {
  object(body, 'Cuerpo de inicio');
  if (body.versionContrato !== 1) throw invalid('versionContrato debe ser 1.', 'NS_VERSION_UNSUPPORTED');
  const loteId = uuid(body.loteId);
  if (body.origen !== 'NETSUITE') throw invalid('origen debe ser NETSUITE.');
  if (typeof body.dataset !== 'string' || !DATASET.test(body.dataset)) {
    throw invalid('dataset invalido.', 'NS_DATASET_INVALID');
  }
  if (body.modoCarga !== 'COMPLETA') throw invalid('Solo se admite modoCarga COMPLETA en V001.');
  string(body.busquedaGuardada, 'busquedaGuardada', 128);
  verifyIsoUtc(body.fechaExtraccionUtc);
  exactInteger(body.filasEsperadas, 1, MAX_ROWS, 'filasEsperadas');
  exactInteger(body.tamanoPagina, MAX_PAGE_SIZE, MAX_PAGE_SIZE, 'tamanoPagina');
  const paginasEsperadas = exactInteger(body.paginasEsperadas, 1, MAX_PAGES, 'paginasEsperadas');
  if (paginasEsperadas !== Math.ceil(body.filasEsperadas / MAX_PAGE_SIZE)) {
    throw invalid('Numero de paginas inconsistente con filasEsperadas.', 'NS_PAGE_COUNT_INVALID');
  }
  const numeroColumnas = columns(body.columnas);
  return { loteId, dataset: body.dataset, paginasEsperadas, numeroColumnas };
}

function validJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(v =>
    v === null || typeof v === 'string' || typeof v === 'boolean' ||
    (typeof v === 'number' && Number.isFinite(v)));
  return false;
}

function validatePage(loteIdParam, body) {
  const loteId = uuid(loteIdParam);
  object(body, 'Cuerpo de pagina');
  const pagina = exactInteger(body.pagina, 1, MAX_PAGES, 'pagina');
  if (!Array.isArray(body.filas) || body.filas.length < 1 || body.filas.length > MAX_PAGE_SIZE) {
    throw invalid(`filas debe contener de 1 a ${MAX_PAGE_SIZE} registros.`);
  }
  const hashPagina = digest(body.hashPagina, 'hashPagina');
  const actual = crypto.createHash('sha256').update(JSON.stringify(body.filas), 'utf8').digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(hashPagina, 'hex'), Buffer.from(actual, 'hex'))) {
    throw invalid('El hash de la pagina no coincide con sus filas.', 'NS_PAGE_HASH_MISMATCH');
  }
  body.filas.forEach((row, i) => {
    object(row, `filas[${i}]`);
    const expectedPosition = (pagina - 1) * MAX_PAGE_SIZE + i + 1;
    if (row.posicion !== expectedPosition) throw invalid(`Posicion de fila ${i} incorrecta.`);
    if (row.idOrigen !== null && row.idOrigen !== undefined) string(row.idOrigen, 'idOrigen', 128);
    if (row.tipoOrigen !== null && row.tipoOrigen !== undefined) string(row.tipoOrigen, 'tipoOrigen', 128);
    if (!Array.isArray(row.valores) || row.valores.length > MAX_COLUMNS ||
        row.valores.length < 1 || !row.valores.every(validJsonValue)) {
      throw invalid(`Los valores de filas[${i}] no son validos.`);
    }
  });
  return { loteId, pagina, hashPagina, cantidad: body.filas.length };
}

function validateFinish(loteIdParam, body) {
  const loteId = uuid(loteIdParam);
  object(body, 'Cuerpo de finalizacion');
  if (uuid(body.loteId) !== loteId) {
    throw invalid('El lote del cuerpo no corresponde a la ruta.', 'NS_LOTE_MISMATCH');
  }
  const filasEsperadas = exactInteger(body.filasEsperadas, 1, MAX_ROWS, 'filasEsperadas');
  const paginasEsperadas = exactInteger(body.paginasEsperadas, 1, MAX_PAGES, 'paginasEsperadas');
  if (paginasEsperadas !== Math.ceil(filasEsperadas / MAX_PAGE_SIZE)) {
    throw invalid('Numero de paginas inconsistente con filasEsperadas.', 'NS_PAGE_COUNT_INVALID');
  }
  return { loteId, filasEsperadas, paginasEsperadas, hashCarga: digest(body.hashCarga, 'hashCarga') };
}

// Recuperacion segura: solo se permite cancelar el MISMO lote autenticado.
// La operacion nunca borra registros ni cambia el esquema de Aiven.
function validateAbort(loteIdParam, body) {
  const loteId = uuid(loteIdParam);
  object(body, 'Cuerpo de cancelacion');
  if (uuid(body.loteId) !== loteId) {
    throw invalid('El lote del cuerpo no corresponde a la ruta.', 'NS_LOTE_MISMATCH');
  }
  if (Object.keys(body).some(key => key !== 'loteId')) {
    throw invalid('La cancelacion solo admite loteId.', 'NS_ABORT_BODY_INVALID');
  }
  return { loteId };
}

module.exports = { validateBegin, validatePage, validateFinish, validateAbort, MAX_PAGE_SIZE, MAX_PAGES };
