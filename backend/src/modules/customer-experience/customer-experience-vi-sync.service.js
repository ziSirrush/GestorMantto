'use strict';

// [Aster | 2026-10-09 | ASTER-MG | FIX CX VI BACKEND SYNC V001]
// Valida la foto COMPLETA de BD_Venta_Instalacion_SEND antes de escribir.
// No existe llave de encuesta en la tabla: NO se simula un UPSERT inseguro.

const repository = require('./customer-experience-vi-sync.repository');
const contract = require('./customer-experience-vi-sync.contract');

const FIELDS_COR = contract.CX_VI_SYNC_FIELDS_COR;
const FIELD_SET_COR = new Set(FIELDS_COR);
const COMMON_COR = new Set(FIELDS_COR.filter(f =>
  !/^(?:vc_|vnc_|ins_|aj_|ci_)/.test(f)
));
const TYPE_PREFIX_COR = Object.freeze({
  'VENTA CONCRETADA': 'vc_',
  'VENTA NO CONCRETADA': 'vnc_',
  'INSTALACION': 'ins_',
  'AJUSTE': 'aj_',
  'ENCUESTA DE CIERRE': 'ci_'
});
const MAX_RECORDS_COR = 10000;
const MAX_CELL_BYTES_COR = 65535; // MySQL TEXT, bytes UTF-8.

function error_cor(status, code, message) {
  const e = new Error(message);
  e.statusCode = status;
  e.code = code;
  return e;
}

function plain_cor(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exact_cor(payload, name, expected) {
  if (payload[name] !== expected) {
    throw error_cor(400, 'CX_VI_SYNC_CONTRACT_INVALID',
      `${name} debe ser exactamente ${JSON.stringify(expected)}.`);
  }
}

function normalizeCell_cor(value, field, i) {
  if (value === null || value === '') return null;
  let result;
  if (typeof value === 'string') result = value;
  else if (typeof value === 'number' && Number.isFinite(value)) result = String(value);
  else if (typeof value === 'boolean') result = value ? 'true' : 'false';
  else throw error_cor(400, 'CX_VI_SYNC_CELL_INVALID',
    `Registro ${i}: ${field} debe ser texto, numero, booleano o null.`);

  if (!result.trim()) return null;
  if (Buffer.byteLength(result, 'utf8') > MAX_CELL_BYTES_COR) {
    throw error_cor(400, 'CX_VI_SYNC_CELL_TOO_LONG',
      `Registro ${i}: ${field} excede el maximo de bytes de MySQL TEXT.`);
  }
  return result;
}

function allowedForType_cor(field, type) {
  if (COMMON_COR.has(field)) return true;
  if (field === 'vnc_csc') return type === 'VENTA CONCRETADA';
  if (type === 'VENTA NO CONCRETADA' && field === 'vnc_csc_1') return true;
  const prefix = TYPE_PREFIX_COR[type];
  return field.startsWith(prefix) && field !== 'vnc_csc';
}

function normalizeRecord_cor(row, index) {
  const position = index + 1;
  if (!plain_cor(row)) {
    throw error_cor(400, 'CX_VI_SYNC_ROW_INVALID', `Registro ${position} no es objeto JSON.`);
  }
  const missing = FIELDS_COR.filter(field => !Object.prototype.hasOwnProperty.call(row, field));
  const extras = Object.keys(row).filter(field => !FIELD_SET_COR.has(field));
  if (missing.length || extras.length) {
    throw error_cor(400, 'CX_VI_SYNC_FIELDS_INVALID',
      `Registro ${position}: faltan=[${missing.join(',')}] sobran=[${extras.join(',')}].`);
  }
  const normalized = {};
  for (const field of FIELDS_COR) normalized[field] = normalizeCell_cor(row[field], field, position);
  const type = normalized.tipo_encuesta == null ? '' : normalized.tipo_encuesta.trim();
  if (!Object.prototype.hasOwnProperty.call(TYPE_PREFIX_COR, type)) {
    throw error_cor(400, 'CX_VI_SYNC_TYPE_INVALID',
      `Registro ${position}: tipo_encuesta desconocido.`);
  }
  normalized.tipo_encuesta = type;
  for (const field of FIELDS_COR) {
    if (normalized[field] != null && !allowedForType_cor(field, type)) {
      throw error_cor(400, 'CX_VI_SYNC_CROSS_TYPE_FIELD',
        `Registro ${position}: ${field} no pertenece a ${type}.`);
    }
  }
  if (FIELDS_COR.every(field => field === 'tipo_encuesta' || normalized[field] == null)) {
    throw error_cor(400, 'CX_VI_SYNC_EMPTY_ROW',
      `Registro ${position}: no hay respuestas ni datos generales.`);
  }
  return normalized;
}

function validateSnapshot_cor(payload) {
  if (!plain_cor(payload)) {
    throw error_cor(400, 'CX_VI_SYNC_PAYLOAD_INVALID', 'Se requiere un cuerpo JSON objeto.');
  }
  exact_cor(payload, 'source', contract.CX_VI_SYNC_SOURCE_COR);
  exact_cor(payload, 'table', contract.CX_VI_SYNC_TABLE_COR);
  exact_cor(payload, 'mode', contract.CX_VI_SYNC_MODE_COR);

  // No se autoriza reemplazar datos accidentalmente con una pagina parcial.
  exact_cor(payload, 'snapshot_completo', true);
  exact_cor(payload, 'confirmar_reemplazo', true);
  if (payload.key !== undefined && payload.key !== null) {
    throw error_cor(400, 'CX_VI_SYNC_KEY_UNAVAILABLE',
      'La tabla no tiene una llave logica; key debe ser null.');
  }
  if (!Array.isArray(payload.campos) || payload.campos.length !== FIELDS_COR.length ||
      payload.campos.some((field, i) => field !== FIELDS_COR[i])) {
    throw error_cor(400, 'CX_VI_SYNC_HEADER_MISMATCH',
      `campos debe contener los ${FIELDS_COR.length} encabezados de Paso 2 en orden exacto.`);
  }
  if (!Array.isArray(payload.registros) || payload.registros.length === 0) {
    throw error_cor(400, 'CX_VI_SYNC_RECORDS_REQUIRED',
      'Se requiere la hoja SEND completa y al menos un registro; vacio no borra Aiven.');
  }
  if (payload.registros.length > MAX_RECORDS_COR) {
    throw error_cor(413, 'CX_VI_SYNC_TOO_MANY_RECORDS',
      `No se admiten mas de ${MAX_RECORDS_COR} registros por foto.`);
  }
  if (!Number.isSafeInteger(payload.total_registros) ||
      payload.total_registros !== payload.registros.length) {
    throw error_cor(400, 'CX_VI_SYNC_COUNT_MISMATCH',
      'total_registros debe coincidir con registros.length (foto completa).');
  }
  if ((payload.bloque !== undefined && payload.bloque !== 1) ||
      (payload.total_bloques !== undefined && payload.total_bloques !== 1)) {
    throw error_cor(400, 'CX_VI_SYNC_PARTIAL_BLOCK',
      'No se admiten bloques HTTP parciales sin llave estable; enviar toda la hoja en un POST.');
  }

  const counts = {
    'VENTA CONCRETADA': 0,
    'VENTA NO CONCRETADA': 0,
    'INSTALACION': 0,
    'AJUSTE': 0,
    'ENCUESTA DE CIERRE': 0
  };
  const records = payload.registros.map((row, i) => {
    const rec = normalizeRecord_cor(row, i);
    counts[rec.tipo_encuesta] += 1;
    return rec;
  });
  return { records, counts };
}

function buildValidationResponse_cor(verified) {
  return {
    ok: true,
    validado: true,
    escritura_bd: false,
    tabla: contract.CX_VI_SYNC_TABLE_COR,
    campos: FIELDS_COR.length,
    total_recibidos: verified.records.length,
    por_tipo: verified.counts,
    modo: contract.CX_VI_SYNC_MODE_COR,
    bloques_bd_de: contract.CX_VI_SYNC_BATCH_SIZE_COR
  };
}

function validarVentaInstalacion_cor(payload) {
  return buildValidationResponse_cor(validateSnapshot_cor(payload));
}

async function syncVentaInstalacion_cor(payload) {
  const verified = validateSnapshot_cor(payload);
  const persisted = await repository.persistSnapshot_cor(verified.records);
  return {
    ok: true,
    source: 'aiven',
    endpoint: '/api/customer-experience/venta-instalacion/sync',
    tabla: contract.CX_VI_SYNC_TABLE_COR,
    modo: contract.CX_VI_SYNC_MODE_COR,
    total_recibidos: verified.records.length,
    por_tipo: verified.counts,
    sin_cambios: persisted.sin_cambios,
    insertados: persisted.insertados,
    eliminados: persisted.eliminados,
    actualizados: 0, // Sin llave no se puede atribuir un UPDATE individual.
    total_final: persisted.total_final,
    bloques_bd_de: contract.CX_VI_SYNC_BATCH_SIZE_COR
  };
}

module.exports = Object.freeze({
  validarVentaInstalacion_cor,
  syncVentaInstalacion_cor
});
