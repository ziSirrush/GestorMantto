'use strict';

// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_4_V001]
// Contrato de escritura exclusivo de gestion_credito. Nunca acepta IDs, FK ni derivados.
const {
  GC_COLUMNS_UNI, GC_EDITABLE_FIELDS_UNI
} = require('./cobranza-uni-administracion.constants');

const COLUMN_META = new Map(GC_COLUMNS_UNI.map(c => [c.name, c]));
const EDITABLE = new Set(GC_EDITABLE_FIELDS_UNI);
const MAX_MULTI = 20;
const MAX_SIGNED_BIGINT = 9223372036854775807n;
const MAX_INTEGER = 2147483647;

function fail_uni(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function plain_uni(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x) &&
    Object.getPrototypeOf(x) === Object.prototype;
}

function id_uni(input) {
  if (typeof input !== 'string' && typeof input !== 'number') {
    throw fail_uni(400,'GC_ADMIN_ID_INVALIDO','El ID del registro es inválido.');
  }
  if (typeof input === 'number' && !Number.isSafeInteger(input)) {
    throw fail_uni(400,'GC_ADMIN_ID_INVALIDO','Los IDs grandes deben enviarse como texto.');
  }
  const text = String(input);
  if (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > MAX_SIGNED_BIGINT) {
    throw fail_uni(400,'GC_ADMIN_ID_INVALIDO','El ID debe ser un BIGINT positivo válido.');
  }
  return text;
}

function inputString_uni(value, field) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw fail_uni(400,'GC_ADMIN_VALOR_INVALIDO',`Valor no admitido para ${field}.`,{field});
}

function numericCanonical_uni(value, field, sqlType, forWrite) {
  if (value === null) return null;
  const raw = inputString_uni(value,field).trim();
  if (/^int$/i.test(sqlType)) {
    if (!/^-?\d{1,16}$/.test(raw)) throw fail_uni(400,'GC_ADMIN_VALOR_INVALIDO',`Número entero inválido para ${field}.`,{field});
    const int = BigInt(raw);
    if (int < (forWrite ? 0n : -2147483648n) || int > BigInt(MAX_INTEGER)) {
      throw fail_uni(400,'GC_ADMIN_VALOR_INVALIDO',`Entero fuera de rango para ${field}.`,{field});
    }
    return String(int);
  }
  if (/^decimal\(18,2\)$/i.test(sqlType)) {
    const match = /^(-?)(\d{1,20})(?:\.(\d{1,2}))?$/.exec(raw);
    if (!match) throw fail_uni(400,'GC_ADMIN_VALOR_INVALIDO',`Importe inválido para ${field} (máximo 2 decimales).`,{field});
    const integer = match[2].replace(/^0+(?=\d)/,'');
    if (integer.length > 16) throw fail_uni(400,'GC_ADMIN_VALOR_INVALIDO',`Importe fuera de rango para ${field}.`,{field});
    const cents=(match[3] || '').padEnd(2,'0');
    const negative = match[1] === '-' && !(BigInt(integer) === 0n && cents === '00');
    return (negative ? '-' : '') + integer + '.' + cents;
  }
  throw new Error('Tipo numérico no reconocido por el contrato GC.');
}

function normalizeEdited_uni(field, value) {
  if (!EDITABLE.has(field)) {
    throw fail_uni(400,'GC_ADMIN_CAMPO_PROTEGIDO','Este campo no se puede editar.',{field});
  }
  const meta = COLUMN_META.get(field);
  if (value === null) return null;
  if (/^(int|decimal\()/i.test(meta.sqlType)) {
    return numericCanonical_uni(value,field,meta.sqlType,true);
  }
  const normalized=inputString_uni(value,field).trim();
  if (!normalized) return null;
  if (/[\u0000-\u001F\u007F]/u.test(normalized)) {
    throw fail_uni(400,'GC_ADMIN_VALOR_INVALIDO',`Texto no válido para ${field}.`,{field});
  }
  const limit = Number((/varchar\((\d+)\)/i.exec(meta.sqlType) || [])[1]) || 255;
  if (Array.from(normalized).length > limit) {
    throw fail_uni(400,'GC_ADMIN_VALOR_INVALIDO',`Excede ${limit} caracteres en ${field}.`,{field});
  }
  return normalized;
}

function comparable_uni(field, value) {
  if (value === null || value === undefined) return null;
  const meta=COLUMN_META.get(field);
  if (!meta || !EDITABLE.has(field)) throw fail_uni(400,'GC_ADMIN_CAMPO_PROTEGIDO','Campo no autorizado.',{field});
  if (/^(int|decimal\()/i.test(meta.sqlType)) {
    return numericCanonical_uni(value,field,meta.sqlType,false);
  }
  return inputString_uni(value,field);
}

function oneField_uni(body,isBulk) {
  if (!plain_uni(body) || Object.keys(body).some(key=>!(isBulk
      ? ['ids','changes','expected'].includes(key)
      : ['changes','expected'].includes(key))) ||
      !plain_uni(body.changes) || !plain_uni(body.expected)) {
    throw fail_uni(400,'GC_ADMIN_PAYLOAD_INVALIDO','Se requieren changes y expected válidos.');
  }
  const fields=Object.keys(body.changes);
  if (fields.length !== 1) throw fail_uni(400,'GC_ADMIN_CELDA_UNICA','Edita un campo por operación.');
  const field=fields[0];
  const value=normalizeEdited_uni(field,body.changes[field]);
  return {field,value};
}

function normalizeSingle_uni(body) {
  const {field,value}=oneField_uni(body,false);
  if (Object.keys(body.expected).length !== 1 || !Object.hasOwn(body.expected,field)) {
    throw fail_uni(400,'GC_ADMIN_EXPECTED_REQUERIDO','Debes proporcionar el valor original de la celda.');
  }
  const expected=comparable_uni(field,body.expected[field]);
  return Object.freeze({field,value,expected});
}

function normalizeBulk_uni(body) {
  const {field,value}=oneField_uni(body,true);
  if (!Array.isArray(body.ids) || body.ids.length<2 || body.ids.length>MAX_MULTI) {
    throw fail_uni(400,'GC_ADMIN_LOTE_INVALIDO',`Selecciona de 2 a ${MAX_MULTI} registros.`);
  }
  const ids=body.ids.map(id_uni);
  if (new Set(ids).size !== ids.length) throw fail_uni(400,'GC_ADMIN_LOTE_DUPLICADO','IDs repetidos en la selección.');
  const canonicalIds=ids.sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
  if (Object.keys(body.expected).length !== ids.length ||
      Object.keys(body.expected).some(id=>!canonicalIds.includes(id))) {
    throw fail_uni(400,'GC_ADMIN_EXPECTED_REQUERIDO','Se requieren los valores originales de todos los registros.');
  }
  const expected={};
  for (const id of canonicalIds) {
    const source=body.expected[id];
    if (!plain_uni(source) || Object.keys(source).length!==1 || !Object.hasOwn(source,field)) {
      throw fail_uni(400,'GC_ADMIN_EXPECTED_REQUERIDO',`Falta el valor original para ${id}.`);
    }
    expected[id]=comparable_uni(field,source[field]);
  }
  return Object.freeze({ids:canonicalIds,field,value,expected:Object.freeze(expected)});
}

module.exports = Object.freeze({
  MAX_MULTI, id_uni, normalizeEdited_uni, comparable_uni,
  normalizeSingle_uni, normalizeBulk_uni, fail_uni
});
