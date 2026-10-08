'use strict';

// [Aster | 2026-10-08 | ASTER-MG | FIX CX MANTENIMIENTO SYNC V001]
// Contrato y validacion de la sincronizacion Sheets -> Aiven para CX Mantenimiento.

const repository = require('./customer-experience-sync.repository');

const MAX_BATCH_SIZE_COR = 300;
const EXPECTED_SOURCE_COR = 'CX_MANTENIMIENTO_SHEETS';
const EXPECTED_TABLE_COR = repository.MT_SYNC_TABLE_COR;
const EXPECTED_KEY_COR = repository.MT_SYNC_KEY_COR;
const EXPECTED_MODE_COR = 'FULL_ROW_UPSERT';
const EXPECTED_FIELDS_COR = repository.MT_SYNC_FIELDS_COR;
const EXPECTED_FIELD_SET_COR = new Set(EXPECTED_FIELDS_COR);

function httpError_cor(statusCode, code, message) {
  const error = new Error(message);
  error.status = statusCode;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function requiredContractValue_cor(payload, field, expected) {
  const value = String(payload?.[field] == null ? '' : payload[field]).trim();
  if (value !== expected) {
    throw httpError_cor(
      400,
      'CX_MTTO_SYNC_CONTRACT_INVALID',
      `${field} debe ser exactamente "${expected}".`
    );
  }
}

function isPlainObject_cor(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCell_cor(value, field) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  throw httpError_cor(
    400,
    'CX_MTTO_SYNC_VALUE_INVALID',
    `El campo ${field} debe ser texto, numero, booleano o null.`
  );
}

function normalizeRecord_cor(source, index) {
  if (!isPlainObject_cor(source)) {
    throw httpError_cor(
      400,
      'CX_MTTO_SYNC_ROW_INVALID',
      'Cada elemento de registros debe ser un objeto JSON.'
    );
  }

  const keys = Object.keys(source);
  const missing = EXPECTED_FIELDS_COR.filter(field => !Object.prototype.hasOwnProperty.call(source, field));
  const extras = keys.filter(field => !EXPECTED_FIELD_SET_COR.has(field));

  if (missing.length || extras.length) {
    throw httpError_cor(
      400,
      'CX_MTTO_SYNC_FIELDS_INVALID',
      `Contrato de columnas invalido. Faltan=[${missing.join(', ')}] Sobran=[${extras.join(', ')}].`
    );
  }

  const record = {};
  for (const field of EXPECTED_FIELDS_COR) {
    record[field] = normalizeCell_cor(source[field], field);
  }

  const idEncuesta = String(record[EXPECTED_KEY_COR] == null ? '' : record[EXPECTED_KEY_COR]).trim();
  if (!idEncuesta) {
    throw httpError_cor(
      400,
      'CX_MTTO_SYNC_KEY_REQUIRED',
      `${EXPECTED_KEY_COR} es obligatorio.`
    );
  }
  record[EXPECTED_KEY_COR] = idEncuesta;

  return { indice: index + 1, record };
}

async function syncMantenimiento_cor(payload) {
  requiredContractValue_cor(payload, 'source', EXPECTED_SOURCE_COR);
  requiredContractValue_cor(payload, 'table', EXPECTED_TABLE_COR);
  requiredContractValue_cor(payload, 'key', EXPECTED_KEY_COR);
  requiredContractValue_cor(payload, 'mode', EXPECTED_MODE_COR);

  if (!Array.isArray(payload?.registros)) {
    throw httpError_cor(
      400,
      'CX_MTTO_SYNC_RECORDS_REQUIRED',
      'registros debe ser un arreglo.'
    );
  }

  if (payload.registros.length > MAX_BATCH_SIZE_COR) {
    throw httpError_cor(
      413,
      'CX_MTTO_SYNC_BATCH_TOO_LARGE',
      `El bloque excede el maximo de ${MAX_BATCH_SIZE_COR} registros.`
    );
  }

  const erroresValidacion = [];
  const validRecords = [];
  const keysInBatch = new Set();

  payload.registros.forEach((source, index) => {
    try {
      const normalized = normalizeRecord_cor(source, index);
      const key = normalized.record[EXPECTED_KEY_COR];

      if (keysInBatch.has(key)) {
        throw httpError_cor(
          400,
          'CX_MTTO_SYNC_DUPLICATE_BATCH_KEY',
          `${EXPECTED_KEY_COR} duplicado dentro del bloque: ${key}.`
        );
      }

      keysInBatch.add(key);
      validRecords.push(normalized);
    } catch (error) {
      erroresValidacion.push({
        indice: index + 1,
        id_de_encuesta: isPlainObject_cor(source)
          ? String(source[EXPECTED_KEY_COR] == null ? '' : source[EXPECTED_KEY_COR]).trim() || null
          : null,
        codigo: error.code || 'CX_MTTO_SYNC_ROW_INVALID',
        motivo: error.message
      });
    }
  });

  const persisted = validRecords.length
    ? await repository.syncMantenimientoBatch_cor(validRecords)
    : {
        insertados: 0,
        actualizados: 0,
        sin_cambios: 0,
        rechazados: 0,
        errores: []
      };

  const errores = erroresValidacion.concat(persisted.errores || []);
  const rechazados = errores.length;

  return {
    ok: true,
    parcial: rechazados > 0,
    source: 'aiven',
    endpoint: '/api/customer-experience/mantenimiento/sync',
    total_recibidos: payload.registros.length,
    insertados: persisted.insertados || 0,
    actualizados: persisted.actualizados || 0,
    sin_cambios: persisted.sin_cambios || 0,
    rechazados,
    bloques_procesados: 1,
    tamano_bloque: MAX_BATCH_SIZE_COR,
    errores
  };
}

module.exports = Object.freeze({
  MAX_BATCH_SIZE_COR,
  EXPECTED_SOURCE_COR,
  EXPECTED_TABLE_COR,
  EXPECTED_KEY_COR,
  EXPECTED_MODE_COR,
  syncMantenimiento_cor
});
