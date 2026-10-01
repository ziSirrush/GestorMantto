'use strict';

/**
 * FASE 3 - Cobranza COR / Pagos
 *
 * Alcance:
 * - conserva la validacion/normalizacion de los 21 campos canonicos de Hoja SB;
 * - agrega id_pago como identidad tecnica obligatoria de sincronizacion;
 * - mapea id_pago -> cobranza_pagos_cor.id_pago_cor;
 * - hace INSERT / UPDATE / UNCHANGED de forma idempotente por id_pago;
 * - procesa cada request/lote dentro de una transaccion MySQL;
 * - NO crea ni modifica cobranza_rel_pagos;
 * - NO elimina pagos que dejen de aparecer en Hoja SB.
 */

const repository = require('./cobranza-cor-pagos.repository');

const ROUTE_PAGOS_COR = '/api/cobranza-cor/carga/pagos';
const SOURCE_PAGOS_COR = 'google_sheets_bg_pagos';
const VERSION_PAGOS_COR = 'COBRANZA_PAGOS_AIVEN_V002';
const SYNC_MODE_PAGOS_COR = 'upsert';
const BATCH_SIZE_PAGOS_COR = 300;
const ID_FIELD_PAGOS_COR = 'id_pago';

const RECORD_FIELDS_PAGOS_COR = Object.freeze([
  'no_factura',
  'cliente',
  'limite_credito',
  'proyecto',
  'fecha_servicio',
  'estado',
  'facturado',
  'pagado',
  'saldo',
  'dias_retraso',
  'fecha_emision',
  'fecha_vencimiento',
  'terminos',
  'zona_adm',
  'subsidiaria',
  'clase',
  'creado_desde',
  'fecha_creacion_ov',
  'complemento_pago',
  'fecha_complemento_pago',
  'importe_complemento_pago'
]);

const INPUT_FIELDS_PAGOS_COR = Object.freeze([
  ID_FIELD_PAGOS_COR,
  ...RECORD_FIELDS_PAGOS_COR
]);

const RECORD_FIELD_SET_PAGOS_COR = new Set(INPUT_FIELDS_PAGOS_COR);

const FORBIDDEN_RECORD_FIELDS_COR = new Set([
  'id_pago_cor',
  'id_pp',
  'id_factura_cor',
  'id_rel_pago',
  'importe_aplicado',
  'created_at',
  'updated_at'
]);

const TEXT_FIELDS_PAGOS_COR = Object.freeze({
  no_factura: 150,
  cliente: 255,
  proyecto: 255,
  estado: 100,
  terminos: 100,
  zona_adm: 100,
  subsidiaria: 255,
  clase: 150,
  creado_desde: 255,
  complemento_pago: 255
});

const DECIMAL_FIELDS_PAGOS_COR = new Set([
  'limite_credito',
  'facturado',
  'pagado',
  'saldo',
  'importe_complemento_pago'
]);

const INTEGER_FIELDS_PAGOS_COR = new Set([
  'dias_retraso'
]);

const DATE_FIELDS_PAGOS_COR = new Set([
  'fecha_servicio',
  'fecha_emision',
  'fecha_vencimiento',
  'fecha_complemento_pago'
]);

const DATETIME_FIELDS_PAGOS_COR = new Set([
  'fecha_creacion_ov'
]);

const MYSQL_INT_MIN = -2147483648;
const MYSQL_INT_MAX = 2147483647;
const MYSQL_DECIMAL_18_2_ABS_LIMIT = 1e16;

function httpError(statusCode, message, detalles, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  if (code) error.code = code;
  return error;
}

function badRequest(message, detalles, code = 'COBRANZA_PAGOS_CONTRATO_INVALIDO') {
  return httpError(400, message, detalles, code);
}

function persistenceError(message, detalles) {
  return httpError(
    500,
    message,
    detalles,
    'COBRANZA_PAGOS_PERSISTENCIA_ERROR'
  );
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function requireExactText(value, expected, fieldName) {
  const received = String(value ?? '').trim();
  if (received !== expected) {
    throw badRequest(
      `${fieldName} invalido.`,
      { field: fieldName, esperado: expected, recibido: received || null }
    );
  }
  return received;
}

function requireInteger(value, fieldName, { min = null, max = null } = {}) {
  if (!Number.isInteger(value)) {
    throw badRequest(`${fieldName} debe ser un entero.`, { field: fieldName, recibido: value });
  }
  if (min !== null && value < min) {
    throw badRequest(
      `${fieldName} debe ser mayor o igual a ${min}.`,
      { field: fieldName, recibido: value }
    );
  }
  if (max !== null && value > max) {
    throw badRequest(
      `${fieldName} debe ser menor o igual a ${max}.`,
      { field: fieldName, recibido: value }
    );
  }
  return value;
}

function validateKeyFields(keyFields) {
  if (!Array.isArray(keyFields)) {
    throw badRequest('key_fields debe ser un arreglo.', { field: 'key_fields' });
  }

  const normalized = keyFields.map((value) => String(value ?? '').trim());

  if (
    normalized.length !== 1 ||
    normalized[0] !== ID_FIELD_PAGOS_COR
  ) {
    throw badRequest(
      'key_fields debe declarar exclusivamente id_pago en Fase 3.',
      {
        field: 'key_fields',
        esperado: [ID_FIELD_PAGOS_COR],
        recibido: normalized
      },
      'COBRANZA_PAGOS_LLAVE_INVALIDA'
    );
  }

  return normalized;
}

function validateSnapshotId(snapshotId) {
  const value = String(snapshotId ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw badRequest('snapshot_id debe ser un SHA-256 hexadecimal de 64 caracteres.', {
      field: 'snapshot_id'
    });
  }
  return value.toLowerCase();
}

function fieldPath(index, field) {
  return `registros[${index}].${field}`;
}

function isNullishInput(value) {
  return value === undefined || value === null || value === '';
}

function normalizeIdPago_cor(value, fieldName) {
  let number;

  if (typeof value === 'number') {
    number = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    number = Number(value.trim());
  } else {
    throw badRequest(
      `${fieldName} debe ser un entero positivo.`,
      { field: fieldName, recibido: value },
      'COBRANZA_PAGOS_ID_INVALIDO'
    );
  }

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw badRequest(
      `${fieldName} debe ser un entero positivo seguro para JavaScript.`,
      { field: fieldName, recibido: value },
      'COBRANZA_PAGOS_ID_INVALIDO'
    );
  }

  return number;
}

function normalizeText_cor(value, fieldName, maxLength, { required = false } = {}) {
  if (isNullishInput(value)) {
    if (required) {
      throw badRequest(`${fieldName} es obligatorio.`, { field: fieldName });
    }
    return null;
  }

  if (typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol') {
    throw badRequest(`${fieldName} debe ser texto o un valor escalar.`, {
      field: fieldName,
      recibido_tipo: Array.isArray(value) ? 'array' : typeof value
    });
  }

  const text = String(value).trim();
  if (!text) {
    if (required) {
      throw badRequest(`${fieldName} es obligatorio.`, { field: fieldName });
    }
    return null;
  }

  if (Array.from(text).length > maxLength) {
    throw badRequest(`${fieldName} excede la longitud maxima de ${maxLength}.`, {
      field: fieldName,
      max_length: maxLength,
      received_length: Array.from(text).length
    }, 'COBRANZA_PAGOS_LONGITUD_INVALIDA');
  }

  return text;
}

function normalizeDecimal_cor(value, fieldName) {
  if (isNullishInput(value)) return null;

  let number;
  let raw;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw badRequest(`${fieldName} debe ser numerico finito.`, { field: fieldName });
    }
    number = value;
    raw = String(value);
  } else if (typeof value === 'string') {
    raw = value.trim();
    if (!raw) return null;
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
      throw badRequest(`${fieldName} debe usar un decimal canonico con maximo 2 decimales.`, {
        field: fieldName,
        recibido: value
      }, 'COBRANZA_PAGOS_DECIMAL_INVALIDO');
    }
    number = Number(raw);
  } else {
    throw badRequest(`${fieldName} debe ser numerico.`, {
      field: fieldName,
      recibido_tipo: typeof value
    }, 'COBRANZA_PAGOS_DECIMAL_INVALIDO');
  }

  if (!Number.isFinite(number)) {
    throw badRequest(`${fieldName} debe ser numerico finito.`, { field: fieldName });
  }

  if (Math.abs(number) >= MYSQL_DECIMAL_18_2_ABS_LIMIT) {
    throw badRequest(`${fieldName} excede DECIMAL(18,2).`, {
      field: fieldName,
      recibido: raw
    }, 'COBRANZA_PAGOS_DECIMAL_FUERA_RANGO');
  }

  if (typeof value === 'number') {
    const twoDecimals = Math.round(number * 100) / 100;
    const tolerance = Math.max(1e-9, Math.abs(number) * Number.EPSILON * 4);
    if (Math.abs(number - twoDecimals) > tolerance) {
      throw badRequest(`${fieldName} no puede tener mas de 2 decimales.`, {
        field: fieldName,
        recibido: value
      }, 'COBRANZA_PAGOS_DECIMAL_ESCALA_INVALIDA');
    }
  }

  return number;
}

function normalizeInteger_cor(value, fieldName) {
  if (isNullishInput(value)) return null;

  let number;
  if (typeof value === 'number') {
    number = value;
  } else if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    number = Number(value.trim());
  } else {
    throw badRequest(`${fieldName} debe ser un entero.`, {
      field: fieldName,
      recibido: value
    }, 'COBRANZA_PAGOS_ENTERO_INVALIDO');
  }

  if (!Number.isInteger(number)) {
    throw badRequest(`${fieldName} debe ser un entero.`, {
      field: fieldName,
      recibido: value
    }, 'COBRANZA_PAGOS_ENTERO_INVALIDO');
  }

  if (number < MYSQL_INT_MIN || number > MYSQL_INT_MAX) {
    throw badRequest(`${fieldName} excede el rango INT de MySQL.`, {
      field: fieldName,
      recibido: value
    }, 'COBRANZA_PAGOS_ENTERO_FUERA_RANGO');
  }

  return number;
}

function validateDateParts_cor(year, month, day, fieldName) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw badRequest(`${fieldName} no es una fecha valida.`, {
      field: fieldName
    }, 'COBRANZA_PAGOS_FECHA_INVALIDA');
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDate_cor(value, fieldName) {
  if (isNullishInput(value)) return null;
  if (typeof value !== 'string') {
    throw badRequest(`${fieldName} debe enviarse como fecha canonica.`, {
      field: fieldName,
      recibido_tipo: typeof value
    }, 'COBRANZA_PAGOS_FECHA_INVALIDA');
  }

  const text = value.trim();
  if (!text) return null;

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?)?$/
  );
  if (!match) {
    throw badRequest(`${fieldName} debe usar YYYY-MM-DD o un ISO valido iniciado por YYYY-MM-DD.`, {
      field: fieldName,
      recibido: text
    }, 'COBRANZA_PAGOS_FECHA_INVALIDA');
  }

  const date = validateDateParts_cor(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    fieldName
  );

  if (match[4] !== undefined) {
    validateTimeParts_cor(
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
      fieldName
    );
  }

  return date;
}

function validateTimeParts_cor(hour, minute, second, fieldName) {
  if (
    !Number.isInteger(hour) || hour < 0 || hour > 23 ||
    !Number.isInteger(minute) || minute < 0 || minute > 59 ||
    !Number.isInteger(second) || second < 0 || second > 59
  ) {
    throw badRequest(`${fieldName} no es una fecha/hora valida.`, {
      field: fieldName
    }, 'COBRANZA_PAGOS_DATETIME_INVALIDO');
  }
}

function normalizeDateTime_cor(value, fieldName) {
  if (isNullishInput(value)) return null;
  if (typeof value !== 'string') {
    throw badRequest(`${fieldName} debe enviarse como fecha/hora canonica.`, {
      field: fieldName,
      recibido_tipo: typeof value
    }, 'COBRANZA_PAGOS_DATETIME_INVALIDO');
  }

  const text = value.trim();
  if (!text) return null;

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?$/
  );

  if (!match) {
    throw badRequest(
      `${fieldName} debe usar YYYY-MM-DD HH:mm:ss o YYYY-MM-DDTHH:mm:ss sin zona horaria.`,
      { field: fieldName, recibido: text },
      'COBRANZA_PAGOS_DATETIME_INVALIDO'
    );
  }

  const date = validateDateParts_cor(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    fieldName
  );

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  validateTimeParts_cor(hour, minute, second, fieldName);

  return `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function validateRecordShape_cor(record, index) {
  if (!isPlainObject(record)) {
    throw badRequest('Cada elemento de registros debe ser un objeto JSON.', {
      field: `registros[${index}]`
    });
  }

  for (const forbidden of FORBIDDEN_RECORD_FIELDS_COR) {
    if (Object.prototype.hasOwnProperty.call(record, forbidden)) {
      throw badRequest(
        `El campo ${forbidden} no puede ser enviado por la integracion de Pagos.`,
        { field: fieldPath(index, forbidden) },
        'COBRANZA_PAGOS_CAMPO_TECNICO_PROHIBIDO'
      );
    }
  }

  const keys = Object.keys(record);
  const unknown = keys.filter((key) => !RECORD_FIELD_SET_PAGOS_COR.has(key));
  if (unknown.length > 0) {
    throw badRequest('El registro contiene campos no reconocidos por Pagos V002.', {
      field: `registros[${index}]`,
      campos_no_reconocidos: unknown
    }, 'COBRANZA_PAGOS_CAMPOS_INVALIDOS');
  }

  const missing = INPUT_FIELDS_PAGOS_COR.filter(
    (field) => !Object.prototype.hasOwnProperty.call(record, field)
  );
  if (missing.length > 0) {
    throw badRequest('El registro no contiene id_pago + los 21 campos canonicos esperados.', {
      field: `registros[${index}]`,
      campos_faltantes: missing
    }, 'COBRANZA_PAGOS_CAMPOS_INVALIDOS');
  }
}

function normalizarRegistroPago_cor(record, index = 0) {
  validateRecordShape_cor(record, index);

  const normalized = {
    id_pago: normalizeIdPago_cor(record.id_pago, fieldPath(index, 'id_pago'))
  };

  for (const field of RECORD_FIELDS_PAGOS_COR) {
    const value = record[field];
    const path = fieldPath(index, field);

    if (Object.prototype.hasOwnProperty.call(TEXT_FIELDS_PAGOS_COR, field)) {
      normalized[field] = normalizeText_cor(
        value,
        path,
        TEXT_FIELDS_PAGOS_COR[field],
        { required: field === 'no_factura' }
      );
      continue;
    }

    if (DECIMAL_FIELDS_PAGOS_COR.has(field)) {
      normalized[field] = normalizeDecimal_cor(value, path);
      continue;
    }

    if (INTEGER_FIELDS_PAGOS_COR.has(field)) {
      normalized[field] = normalizeInteger_cor(value, path);
      continue;
    }

    if (DATE_FIELDS_PAGOS_COR.has(field)) {
      normalized[field] = normalizeDate_cor(value, path);
      continue;
    }

    if (DATETIME_FIELDS_PAGOS_COR.has(field)) {
      normalized[field] = normalizeDateTime_cor(value, path);
      continue;
    }

    throw new Error(`Campo de Pagos sin normalizador interno: ${field}`);
  }

  return Object.freeze(normalized);
}

function validateUniqueIds_cor(records) {
  const seen = new Map();

  records.forEach((record, index) => {
    const previous = seen.get(record.id_pago);
    if (previous !== undefined) {
      throw badRequest(
        `El lote contiene id_pago duplicado: ${record.id_pago}.`,
        {
          field: `registros[${index}].id_pago`,
          id_pago: record.id_pago,
          primera_posicion: previous,
          segunda_posicion: index
        },
        'COBRANZA_PAGOS_ID_DUPLICADO_LOTE'
      );
    }
    seen.set(record.id_pago, index);
  });
}

function validateAndNormalizeRecords_cor(records) {
  if (!Array.isArray(records)) {
    throw badRequest('registros debe ser un arreglo.', { field: 'registros' });
  }

  if (records.length === 0) {
    throw badRequest('registros no puede estar vacio para un lote enviado desde Hoja SB.', {
      field: 'registros'
    });
  }

  if (records.length > BATCH_SIZE_PAGOS_COR) {
    throw badRequest(
      `registros excede el maximo de ${BATCH_SIZE_PAGOS_COR} por lote.`,
      { field: 'registros', recibidos: records.length }
    );
  }

  const normalized = records.map((record, index) => normalizarRegistroPago_cor(record, index));
  validateUniqueIds_cor(normalized);
  return Object.freeze(normalized);
}

function validateBatch(batch, recordCount) {
  if (!isPlainObject(batch)) {
    throw badRequest('batch debe ser un objeto.', { field: 'batch' });
  }

  const index = requireInteger(batch.index, 'batch.index', { min: 1 });
  const total = requireInteger(batch.total, 'batch.total', { min: 1 });
  const offset = requireInteger(batch.offset, 'batch.offset', { min: 0 });
  const count = requireInteger(batch.count, 'batch.count', {
    min: 1,
    max: BATCH_SIZE_PAGOS_COR
  });
  const totalRecords = requireInteger(batch.total_records, 'batch.total_records', { min: 1 });

  if (typeof batch.is_last !== 'boolean') {
    throw badRequest('batch.is_last debe ser booleano.', {
      field: 'batch.is_last',
      recibido: batch.is_last
    });
  }

  if (count !== recordCount) {
    throw badRequest('batch.count no coincide con registros.length.', {
      batch_count: count,
      registros_length: recordCount
    });
  }

  const expectedTotal = Math.ceil(totalRecords / BATCH_SIZE_PAGOS_COR);
  if (total !== expectedTotal) {
    throw badRequest('batch.total no coincide con total_records y el tamano de lote aprobado.', {
      batch_total: total,
      esperado: expectedTotal,
      total_records: totalRecords,
      batch_size: BATCH_SIZE_PAGOS_COR
    });
  }

  if (index > total) {
    throw badRequest('batch.index no puede ser mayor que batch.total.', {
      batch_index: index,
      batch_total: total
    });
  }

  const expectedOffset = (index - 1) * BATCH_SIZE_PAGOS_COR;
  if (offset !== expectedOffset) {
    throw badRequest('batch.offset no corresponde al indice del lote.', {
      batch_offset: offset,
      esperado: expectedOffset,
      batch_index: index
    });
  }

  if (offset + count > totalRecords) {
    throw badRequest('El lote excede batch.total_records.', {
      offset,
      count,
      total_records: totalRecords
    });
  }

  const expectedIsLast = index === total;
  if (batch.is_last !== expectedIsLast) {
    throw badRequest('batch.is_last no coincide con batch.index/batch.total.', {
      is_last: batch.is_last,
      esperado: expectedIsLast
    });
  }

  if (expectedIsLast) {
    if (offset + count !== totalRecords) {
      throw badRequest('El ultimo lote no termina exactamente en total_records.', {
        offset,
        count,
        total_records: totalRecords
      });
    }
  } else if (count !== BATCH_SIZE_PAGOS_COR) {
    throw badRequest(
      `Un lote intermedio debe contener exactamente ${BATCH_SIZE_PAGOS_COR} registros.`,
      { count, batch_index: index, batch_total: total }
    );
  }

  return {
    index,
    total,
    offset,
    count,
    total_records: totalRecords,
    is_last: batch.is_last
  };
}

function validarContratoCargaPagos_cor(payload) {
  if (!isPlainObject(payload)) {
    throw badRequest('El body debe ser un objeto JSON.', { field: 'body' });
  }

  const source = requireExactText(payload.source, SOURCE_PAGOS_COR, 'source');
  const version = requireExactText(payload.version, VERSION_PAGOS_COR, 'version');
  const syncMode = requireExactText(payload.sync_mode, SYNC_MODE_PAGOS_COR, 'sync_mode');
  const keyFields = validateKeyFields(payload.key_fields);
  const snapshotId = validateSnapshotId(payload.snapshot_id);
  const records = validateAndNormalizeRecords_cor(payload.registros);
  const batch = validateBatch(payload.batch, records.length);

  return Object.freeze({
    source,
    version,
    sync_mode: syncMode,
    key_fields: Object.freeze([...keyFields]),
    snapshot_id: snapshotId,
    batch: Object.freeze({ ...batch }),
    record_count: records.length,
    records
  });
}

function splitPersistenceRecord_cor(record) {
  const data = {};
  for (const field of RECORD_FIELDS_PAGOS_COR) {
    data[field] = record[field];
  }
  return {
    id_pago: record.id_pago,
    data
  };
}

async function cargarPagos_cor(payload) {
  const contract = validarContratoCargaPagos_cor(payload);
  const ids = contract.records.map((record) => record.id_pago);

  let connection = null;
  let transactionStarted = false;

  try {
    connection = await repository.getConnection_cor();
    await connection.beginTransaction();
    transactionStarted = true;

    const existingIds = await repository.lockExistingPagosByIds_cor(connection, ids);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const normalized of contract.records) {
      const record = splitPersistenceRecord_cor(normalized);

      if (!existingIds.has(record.id_pago)) {
        await repository.insertPago_cor(connection, record.id_pago, record.data);
        existingIds.add(record.id_pago);
        inserted += 1;
        continue;
      }

      const result = await repository.updatePagoIfChanged_cor(
        connection,
        record.id_pago,
        record.data
      );

      if (Number(result?.affectedRows || 0) > 0) {
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    await connection.commit();
    transactionStarted = false;

    return {
      ok: true,
      fase: 3,
      source: 'aiven',
      domain: 'CORELLIAN',
      tabla: repository.TABLE_PAGOS_COR,
      modo: 'upsert_por_id_pago',
      identidad_upsert: 'id_pago -> id_pago_cor',
      snapshot_id: contract.snapshot_id,
      batch: contract.batch,
      total_recibidos: contract.record_count,
      insertados: inserted,
      actualizados: updated,
      sin_cambios: unchanged,
      key_fields: contract.key_fields,
      campos_canonicos: RECORD_FIELDS_PAGOS_COR.length,
      escribe_cobranza_pagos_cor: true,
      escribe_cobranza_rel_pagos: false,
      elimina_ausentes: false
    };
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('[cobranza-cor/pagos] Error en rollback:', rollbackError.message);
      }
    }

    if (error?.statusCode) throw error;

    console.error('[cobranza-cor/pagos] Error de persistencia:', error);
    throw persistenceError(
      'No fue posible persistir el lote de Pagos en Aiven.',
      {
        fase: 3,
        snapshot_id: contract.snapshot_id,
        batch_index: contract.batch.index,
        db_code: error?.code || null
      }
    );
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  ROUTE_PAGOS_COR,
  SOURCE_PAGOS_COR,
  VERSION_PAGOS_COR,
  BATCH_SIZE_PAGOS_COR,
  ID_FIELD_PAGOS_COR,
  RECORD_FIELDS_PAGOS_COR,
  INPUT_FIELDS_PAGOS_COR,
  validarContratoCargaPagos_cor,
  normalizarRegistroPago_cor,
  validateAndNormalizeRecords_cor,
  cargarPagos_cor
};
