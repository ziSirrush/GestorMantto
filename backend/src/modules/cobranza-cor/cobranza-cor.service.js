'use strict';

const repository = require('./cobranza-cor.repository');

const BATCH_SIZE = 300;
const MAX_RECORDS = 5000;

const ROUTES_COR = Object.freeze({
  carga_fuente: '/api/cobranza-cor/carga/fuente',
  carga_aditivas: '/api/cobranza-cor/carga/aditivas',
  estados_cuenta: '/api/cobranza-cor/estados-cuenta',
  estado_cuenta_detalle: '/api/cobranza-cor/estados-cuenta/:ppns',
  estado_cuenta_crear_catalogo: '/api/cobranza-cor/estados-cuenta/crear-nuevo/catalogo',
  estado_cuenta_formulario: '/api/cobranza-cor/estados-cuenta/:ppns/formulario',
  estado_cuenta_crear: '/api/cobranza-cor/estados-cuenta',
  estado_cuenta_actualizar: '/api/cobranza-cor/estados-cuenta/:ppns',
  factura_crear: '/api/cobranza-cor/estados-cuenta/:ppns/facturas',
  aditivas: '/api/cobranza-cor/aditivas',
  aditiva_detalle: '/api/cobranza-cor/aditivas/:idAditivaCor',
  aditiva_crear: '/api/cobranza-cor/aditivas',
  aditiva_actualizar: '/api/cobranza-cor/aditivas/:idAditivaCor',
  adeudos_contractuales: '/api/cobranza-cor/adeudos-contractuales'
});

function httpError(statusCode, message, detalles, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  if (code) error.code = code;
  return error;
}

function badRequest(message, detalles) {
  return httpError(400, message, detalles);
}

function normalizeKey_cor(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/%/g, ' PCT ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildFieldMap_cor(row) {
  const map = new Map();
  for (const [key, value] of Object.entries(row || {})) {
    map.set(normalizeKey_cor(key), value);
  }
  return map;
}

function field_cor(map, ...aliases) {
  for (const alias of aliases) {
    const key = normalizeKey_cor(alias);
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

function cleanText_cor(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function requiredText_cor(value, fieldName, maxLength = null) {
  const text = cleanText_cor(value, maxLength);
  if (!text) throw new Error(`${fieldName} es obligatorio.`);
  return text;
}

function decimal_cor(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${fieldName} debe ser numerico.`);
    return value;
  }

  let text = String(value).trim();
  if (!text || text === '-') return null;
  text = text.replace(/\u00a0/g, '').replace(/\s+/g, '').replace(/[\$€£]/g, '');

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d+$/.test(text)) {
    text = text.replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    text = text.replace(/,/g, '');
  }

  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`${fieldName} debe ser numerico.`);
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} debe ser numerico.`);
  return number;
}

function percent_cor(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${fieldName} debe ser numerico.`);
    return value;
  }
  const text = String(value).trim();
  if (!text || text === '-') return null;
  if (text.endsWith('%')) {
    const number = decimal_cor(text.slice(0, -1), fieldName);
    return number === null ? null : number / 100;
  }
  return decimal_cor(text, fieldName);
}

function percentage01_cor(value, fieldName) {
  const number = percent_cor(value, fieldName);
  if (number === null) return null;
  if (number < 0 || number > 1) throw new Error(`${fieldName} debe estar entre 0% y 100%.`);
  return number;
}

function integer_cor(value, fieldName, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && value.trim() === '-') return null;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${fieldName} debe ser un entero.`);
  if (min !== null && number < min) throw new Error(`${fieldName} debe ser mayor o igual a ${min}.`);
  if (max !== null && number > max) throw new Error(`${fieldName} debe ser menor o igual a ${max}.`);
  return number;
}

function year_cor(value, fieldName) {
  return integer_cor(value, fieldName, { min: 1900, max: 2500 });
}

function boolean_cor(value, fieldName, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value;
  const text = normalizeKey_cor(value);
  if (['1', 'TRUE', 'SI', 'S', 'YES', 'Y', 'X'].includes(text)) return 1;
  if (['0', 'FALSE', 'NO', 'N'].includes(text)) return 0;
  throw new Error(`${fieldName} debe representar SI/NO o 1/0.`);
}

function date_cor(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${fieldName} no es una fecha valida.`);
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') throw new Error(`${fieldName} debe enviarse como fecha.`);

  const text = String(value).trim();
  if (!text || text === '-') return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return validateDateParts_cor(Number(iso[3]), Number(iso[2]), Number(iso[1]), fieldName);
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return validateDateParts_cor(Number(dmy[1]), Number(dmy[2]), year, fieldName);
  }
  const named = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .match(/^(\d{1,2})-([a-z]{3})-(\d{2}|\d{4})$/);
  if (named) {
    const months = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
    const month = months[named[2]];
    if (!month) throw new Error(`${fieldName} no es una fecha valida.`);
    const year = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3]);
    return validateDateParts_cor(Number(named[1]), month, year, fieldName);
  }
  throw new Error(`${fieldName} debe usar YYYY-MM-DD, DD/MM/YYYY o DD-mmm-AA en espanol.`);
}

function validateDateParts_cor(day, month, year, fieldName) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new Error(`${fieldName} no es una fecha valida.`);
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isEmptyRow_cor(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const values = Object.values(row);
  return !values.length || values.every((value) => value === null || value === undefined || String(value).trim() === '');
}

function extractRecords_cor(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.registros)) return payload.registros;
  if (Array.isArray(payload?.records)) return payload.records;
  return null;
}

function splitBatches_cor(records) {
  const batches = [];
  for (let start = 0; start < records.length; start += BATCH_SIZE) {
    batches.push(records.slice(start, start + BATCH_SIZE));
  }
  return batches;
}

function normalizeFuente_cor(row) {
  const map = buildFieldMap_cor(row);
  return {
    proyecto: requiredText_cor(field_cor(map, 'PROYECTO', 'proyecto'), 'PROYECTO', 255),
    id_proyecto_origen: requiredText_cor(
      field_cor(map, 'PPNS', 'PP_NS', 'ID_PROYECTO', 'id_proyecto_origen'),
      'PPNS / ID_PROYECTO',
      100
    ),
    cliente: cleanText_cor(field_cor(map, 'CLIENTE', 'cliente'), 500),
    contractual: cleanText_cor(field_cor(
      map,
      'CONTRACTUAL',
      'ESTATUS_CONTRACTUAL',
      'ESTATUS_EDO_DE_CTA',
      'ESTATUS_DEL_EDO_DE_CTA',
      'ESTATUS_ESTADO_DE_CUENTA',
      'contractual'
    ), 150),
    porcentaje: percentage01_cor(field_cor(map, 'PCT', 'porcentaje'), '%'),
    condicion: cleanText_cor(field_cor(map, 'CONDICION', 'condicion'), 500),
    moneda: cleanText_cor(field_cor(map, 'MONEDA', 'moneda'), 10),
    subtotal: decimal_cor(field_cor(map, 'SUBTOTAL', 'subtotal'), 'SUBTOTAL'),
    iva: decimal_cor(field_cor(map, 'IVA', 'iva'), 'IVA'),
    total: decimal_cor(field_cor(map, 'TOTAL', 'total'), 'TOTAL'),
    factura: cleanText_cor(field_cor(map, 'FACTURA', 'factura'), 150),
    pago_total: decimal_cor(field_cor(map, 'PAGO_TOTAL', 'pago_total'), 'PAGO (TOTAL)'),
    estatus_factura: cleanText_cor(field_cor(map, 'ESTATUS_DE_FACTURA', 'estatus_factura'), 100),
    fecha_pago: date_cor(field_cor(map, 'FECHA_DE_PAGO', 'fecha_pago'), 'FECHA DE PAGO'),
    fecha_vencimiento: date_cor(field_cor(map, 'FECHA_DE_VENCIMIENTO', 'fecha_vencimiento'), 'FECHA DE VENCIMIENTO'),
    dias_vencimiento: integer_cor(
      field_cor(map, 'DIAS_DE_VENCIMEINTO', 'DIAS_DE_VENCIMIENTO', 'dias_vencimiento'),
      'DIAS DE VENCIMIENTO'
    ),
    estimado_pago: cleanText_cor(field_cor(map, 'ESTIMADO_DE_PAGO', 'estimado_pago'), 100),
    estatus_vencimiento: cleanText_cor(field_cor(map, 'ESTATUS_DE_VENCIMIENTO', 'estatus_vencimiento'), 100),
    anio_proyecto: year_cor(field_cor(map, 'ANO_DEL_PROYECTO', 'anio_proyecto'), 'ANO DEL PROYECTO'),
    activo: 1
  };
}

function normalizeAditiva_cor(row) {
  const map = buildFieldMap_cor(row);
  const record = {
    anio_cot: year_cor(field_cor(map, 'ANO_COT', 'anio_cot'), 'ANO COT'),
    departamento: cleanText_cor(field_cor(map, 'DEPARTAMENTO', 'departamento'), 100),
    categoria: cleanText_cor(field_cor(map, 'CATEGORIA', 'categoria'), 100),
    fecha_cot: date_cor(field_cor(map, 'FECHA_COT', 'fecha_cot'), 'FECHA COT'),
    firma_cot: cleanText_cor(field_cor(map, 'FIRMA_COT', 'firma_cot'), 100),
    no_cot: cleanText_cor(field_cor(map, 'NO_COT', 'no_cot'), 100),
    ov: cleanText_cor(field_cor(map, 'OV', 'ov'), 100),
    factura: cleanText_cor(field_cor(map, 'FACTURA', 'factura'), 150),
    estatus_trabajos: cleanText_cor(field_cor(map, 'ESTATUS_TRABAJOS', 'estatus_trabajos'), 100),
    estatus_cobranza: cleanText_cor(field_cor(map, 'ESTATUS_COBRANZA', 'estatus_cobranza'), 100),
    sup: cleanText_cor(field_cor(map, 'SUP', 'sup'), 50),
    pp_ns: cleanText_cor(field_cor(map, 'PP_NS', 'PPNS', 'pp_ns'), 100),
    proyecto: cleanText_cor(field_cor(map, 'PROYECTO', 'proyecto'), 255),
    equipo: cleanText_cor(field_cor(map, 'EQUIPO', 'equipo'), 255),
    descripcion: cleanText_cor(field_cor(map, 'DESCRIPCION', 'descripcion')),
    comentario_fuente: cleanText_cor(field_cor(map, 'COMENTARIO', 'comentario_fuente')),
    monto_subtotal: decimal_cor(field_cor(map, 'MONTO_SUBTOTAL', 'monto_subtotal'), 'MONTO SUBTOTAL'),
    iva_pct: percent_cor(field_cor(map, 'IVA_PCT', 'IVA', 'iva_pct'), 'IVA [%]'),
    monto_iva: decimal_cor(field_cor(map, 'MONTO_IVA', 'monto_iva'), 'MONTO IVA'),
    monto_total: decimal_cor(field_cor(map, 'MONTO_TOTAL', 'monto_total'), 'MONTO TOTAL'),
    gasto_subtotal: decimal_cor(field_cor(map, 'GASTO_SUBTOTAL', 'gasto_subtotal'), 'GASTO SUBTOTAL'),
    oc: cleanText_cor(field_cor(map, 'OC', 'oc'), 100),
    diferencia: decimal_cor(field_cor(map, 'DIFERENCIA', 'diferencia'), 'DIFERENCIA'),
    utilidad_real_pct: percent_cor(field_cor(map, 'UTILIDAD_REAL_PCT', 'utilidad_real_pct'), 'UTILIDAD REAL (%)'),
    monto_pagado: decimal_cor(field_cor(map, 'MONTO_PAGADO', 'monto_pagado'), 'MONTO PAGADO'),
    pagado_sin_iva: decimal_cor(field_cor(map, 'PAGADO_SIN_IVA', 'pagado_sin_iva'), 'PAGADO SIN IVA'),
    pendiente_pago: decimal_cor(field_cor(map, 'PENDIENTE_DE_PAGO', 'pendiente_pago'), 'PENDIENTE DE PAGO'),
    fecha_pago: date_cor(field_cor(map, 'FECHA_DE_PAGO', 'fecha_pago'), 'FECHA DE PAGO'),
    semana_pago: cleanText_cor(field_cor(map, 'SEMANA_DE_PAGO', 'semana_pago'), 30),
    moneda: cleanText_cor(field_cor(map, 'MONEDA', 'moneda'), 10),
    gasto_ejercido: cleanText_cor(field_cor(map, 'GASTO_EJERCIDO', 'gasto_ejercido'), 50),
    activo: 1
  };

  if (!record.proyecto && !record.pp_ns && !record.no_cot && !record.ov && !record.factura && !record.descripcion) {
    throw new Error('La fila de ADITIVAS no contiene identificadores ni descripcion util.');
  }
  return record;
}

function normalizeRows_cor(input, normalizer) {
  const valid = [];
  const rejected = [];
  input.forEach((row, index) => {
    const fila = index + 2;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      rejected.push({ fila, motivo: 'Cada registro debe ser un objeto JSON.' });
      return;
    }
    if (isEmptyRow_cor(row)) {
      rejected.push({ fila, motivo: 'Fila vacia.' });
      return;
    }
    try {
      valid.push({ fila, record: normalizer(row) });
    } catch (error) {
      rejected.push({ fila, motivo: error.message });
    }
  });
  return { valid, rejected };
}

async function loadTable_cor(payload, config) {
  const input = extractRecords_cor(payload);
  if (!input) throw badRequest('El cuerpo debe ser un arreglo o contener registros: [...].');
  if (!input.length) throw badRequest('No se recibieron registros para cargar.');
  if (input.length > MAX_RECORDS) throw badRequest(`La peticion excede el maximo de ${MAX_RECORDS} registros.`);

  const normalized = normalizeRows_cor(input, config.normalizer);
  const rejected = [...normalized.rejected];
  let inserted = 0;
  let processedBatches = 0;
  const connection = await repository.getConnection_cor();

  try {
    for (const batch of splitBatches_cor(normalized.valid)) {
      await connection.beginTransaction();
      try {
        for (let position = 0; position < batch.length; position += 1) {
          const item = batch[position];
          const savepoint = `cob_cor_${config.kind}_${position}`;
          try {
            await connection.query(`SAVEPOINT ${savepoint}`);
            await repository.insertRecord_cor(connection, config.tableName, { ...item.record });
            inserted += 1;
            await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
          } catch (rowError) {
            try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_rollbackError) {}
            try { await connection.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_releaseError) {}
            rejected.push({
              fila: item.fila,
              proyecto: item.record.proyecto || null,
              ppns: item.record.id_proyecto_origen || item.record.pp_ns || null,
              motivo: rowError.message
            });
          }
        }
        await connection.commit();
        processedBatches += 1;
      } catch (error) {
        await connection.rollback();
        error.message = `Fallo estructuralmente el bloque ${processedBatches + 1}: ${error.message}`;
        throw error;
      }
    }
  } finally {
    connection.release();
  }

  return {
    ok: true,
    source: 'aiven',
    domain: 'CORELLIAN',
    tabla: config.tableName,
    modo: 'insert_only',
    relacion_main: 'PPNS',
    total_recibidos: input.length,
    insertados: inserted,
    rechazados: rejected.length,
    bloques_procesados: processedBatches,
    tamano_bloque: BATCH_SIZE,
    errores: rejected
  };
}

async function cargarFuente_cor(payload) {
  return loadTable_cor(payload, {
    kind: 'fuente',
    tableName: repository.TABLES_COR.fuente,
    normalizer: normalizeFuente_cor
  });
}

async function cargarAditivas_cor(payload) {
  return loadTable_cor(payload, {
    kind: 'aditivas',
    tableName: repository.TABLES_COR.aditivas,
    normalizer: normalizeAditiva_cor
  });
}

function numberOrNull_cor(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull_cor(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function positiveId_cor(value, fieldName = 'id') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw badRequest(`${fieldName} debe ser un entero positivo.`);
  return parsed;
}

function roundAmount_cor(value) {
  const number = Number(value || 0);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

const IVA_GENERAL_ALLOWED_COR = Object.freeze([0, 0.08, 0.16]);
const PARTIDA_CURRENCIES_COR = new Set(['MXN', 'USD', 'EUR']);

function normalizeIvaGeneralPct_cor(value, fieldName = 'IVA general') {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  let parsed;
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    parsed = decimal_cor(value.trim().slice(0, -1), fieldName);
    parsed = parsed === null ? null : parsed / 100;
  } else {
    parsed = decimal_cor(value, fieldName);
  }
  const matched = IVA_GENERAL_ALLOWED_COR.find((candidate) => Math.abs(candidate - parsed) < 0.0000005);
  if (matched === undefined) throw badRequest(`${fieldName} debe ser 0%, 8% o 16%.`);
  return matched;
}

function canonicalText_cor(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function isPaidStatus_cor(value) {
  const status = canonicalText_cor(value);
  if (!status) return false;
  if (status.startsWith('NO PAGAD') || status.startsWith('NO COBRAD') || status.startsWith('NO LIQUIDAD')) return false;
  return ['PAGADO', 'PAGADA', 'COBRADO', 'COBRADA', 'LIQUIDADO', 'LIQUIDADA'].includes(status);
}

function resolveVisibleUserIds_cor(informationAccess) {
  const context = informationAccess || null;
  if (!context) throw httpError(403, 'No fue posible resolver el alcance de informacion de CORELLIAN.');
  const domain = String(context.dominio || context.empresa || '').trim().toUpperCase();
  if (domain !== 'CORELLIAN') throw httpError(403, 'El alcance de informacion no corresponde a CORELLIAN.');
  if (context.requiere_filtro_usuario !== true) return null;
  return [...new Set((Array.isArray(context.usuarios_visibles) ? context.usuarios_visibles : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function normalizeEstadosCuentaFilters_cor(query = {}) {
  const buscar = cleanText_cor(query.q ?? query.buscar, 200);
  const contractual = cleanText_cor(query.contractual ?? query.estatus, 150);
  let anio = null;
  if (query.anio !== undefined && query.anio !== null && String(query.anio).trim() !== '') {
    anio = year_cor(query.anio, 'anio');
  }
  return { buscar, contractual, anio };
}

function splitDashValues_cor(value) {
  const text = cleanText_cor(value);
  if (!text) return [];
  return String(text).split('-').map((item) => item.trim()).filter(Boolean);
}

function serializeEstadoCuentaMain_cor(row) {
  const registros = integerOrNull_cor(row?.registros_estado_cuenta) || 0;
  return {
    ppns: cleanText_cor(row?.ppns),
    proyecto: cleanText_cor(row?.proyecto),
    cliente: cleanText_cor(row?.cliente),
    supervisor: cleanText_cor(row?.supervisor_iniciales),
    asesor: cleanText_cor(row?.asesor_iniciales),
    administrativo: cleanText_cor(row?.administrativo_iniciales),
    hitos_suministro: integerOrNull_cor(row?.hitos_suministro) || 0,
    hitos_mxn: integerOrNull_cor(row?.hitos_mxn) || 0,
    aditivas: integerOrNull_cor(row?.aditivas) || 0,
    monedas: splitDashValues_cor(row?.monedas),
    estado_cuenta_disponible: registros > 0,
    estado_cuenta: registros > 0 ? 'Disponible' : 'No disponible',
    contractual: cleanText_cor(row?.contractual),
    registros_estado_cuenta: registros,
    anios: splitDashValues_cor(row?.anios).map(Number).filter(Number.isInteger)
  };
}

function serializeFuenteEstadoCuenta_cor(row) {
  const total = numberOrNull_cor(row?.total);
  const pagoTotal = numberOrNull_cor(row?.pago_total);
  const pagado = isPaidStatus_cor(row?.estatus_factura);
  const pagoContabilizado = pagado ? (pagoTotal !== null ? pagoTotal : (total !== null ? total : 0)) : 0;
  const pendiente = total === null ? null : Math.max(roundAmount_cor(total - pagoContabilizado), 0);

  return {
    id_fuente_cor: integerOrNull_cor(row?.id_fuente_cor),
    ppns: cleanText_cor(row?.id_proyecto_origen),
    proyecto: cleanText_cor(row?.proyecto),
    cliente: cleanText_cor(row?.cliente),
    contractual: cleanText_cor(row?.contractual),
    porcentaje: numberOrNull_cor(row?.porcentaje),
    fondo_garantia: Number(row?.fondo_garantia) === 1,
    porcentaje_fondo_garantia: numberOrNull_cor(row?.porcentaje_fondo_garantia) ?? 0,
    iva_general_pct: numberOrNull_cor(row?.iva_general_pct),
    condicion: cleanText_cor(row?.condicion),
    moneda: cleanText_cor(row?.moneda)?.toUpperCase() || null,
    subtotal: numberOrNull_cor(row?.subtotal),
    iva: numberOrNull_cor(row?.iva),
    total,
    factura: cleanText_cor(row?.factura),
    pago_total: pagoTotal,
    estatus_factura: cleanText_cor(row?.estatus_factura),
    fecha_pago: cleanText_cor(row?.fecha_pago),
    fecha_vencimiento: cleanText_cor(row?.fecha_vencimiento),
    dias_vencimiento: integerOrNull_cor(row?.dias_vencimiento),
    estimado_pago: cleanText_cor(row?.estimado_pago),
    estatus_vencimiento: cleanText_cor(row?.estatus_vencimiento),
    orden_hito: integerOrNull_cor(row?.orden_hito),
    fecha_programada: cleanText_cor(row?.fecha_programada),
    fecha_notificada: cleanText_cor(row?.fecha_notificada),
    estatus_hito: cleanText_cor(row?.estatus_hito),
    anio_proyecto: integerOrNull_cor(row?.anio_proyecto),
    es_pagado: pagado,
    pago_contabilizado: roundAmount_cor(pagoContabilizado),
    pendiente_calculado: pendiente
  };
}

function serializeEstadoCuentaPartida_cor(row) {
  return {
    id_partida_cor: integerOrNull_cor(row?.id_partida_cor),
    ppns: cleanText_cor(row?.ppns),
    orden: integerOrNull_cor(row?.orden),
    moneda: cleanText_cor(row?.moneda)?.toUpperCase() || null,
    monto_base: numberOrNull_cor(row?.monto_base),
    activo: Number(row?.activo) === 1
  };
}

function resolveIvaGeneralFromRows_cor(rows) {
  const tokens = (Array.isArray(rows) ? rows : []).map((row) => {
    const value = numberOrNull_cor(row?.iva_general_pct);
    return value === null ? 'NULL' : String(Math.round(value * 1000000) / 1000000);
  });
  const unique = [...new Set(tokens)];
  if (!unique.length || (unique.length === 1 && unique[0] === 'NULL')) return { value: null, mixed: false };
  if (unique.length === 1) return { value: Number(unique[0]), mixed: false };
  return { value: null, mixed: true };
}

function buildEstadoCuentaSummary_cor(rows) {
  const buckets = new Map();
  rows.forEach((row) => {
    const currency = row.moneda || 'SIN_MONEDA';
    if (!buckets.has(currency)) {
      buckets.set(currency, { moneda: currency, registros: 0, pagados: 0, no_pagados: 0, subtotal: 0, iva: 0, total: 0, cobrado: 0, pendiente: 0 });
    }
    const bucket = buckets.get(currency);
    bucket.registros += 1;
    bucket.pagados += row.es_pagado ? 1 : 0;
    bucket.no_pagados += row.es_pagado ? 0 : 1;
    bucket.subtotal += row.subtotal || 0;
    bucket.iva += row.iva || 0;
    bucket.total += row.total || 0;
    bucket.cobrado += row.pago_contabilizado || 0;
    bucket.pendiente += row.pendiente_calculado || 0;
  });

  const priority = new Map([['USD', 1], ['MXN', 2], ['EUR', 3], ['SIN_MONEDA', 99]]);
  const monedas = [...buckets.values()].map((bucket) => {
    const total = roundAmount_cor(bucket.total);
    const cobrado = roundAmount_cor(bucket.cobrado);
    return {
      ...bucket,
      subtotal: roundAmount_cor(bucket.subtotal),
      iva: roundAmount_cor(bucket.iva),
      total,
      cobrado,
      pendiente: roundAmount_cor(bucket.pendiente),
      porcentaje_cobrado_calculado: total > 0 ? Math.round((cobrado / total) * 1000000) / 1000000 : null
    };
  }).sort((a, b) => {
    const left = priority.get(a.moneda) ?? 50;
    const right = priority.get(b.moneda) ?? 50;
    if (left !== right) return left - right;
    return a.moneda.localeCompare(b.moneda);
  });

  return { registros: rows.length, monedas, nota: 'Los importes se resumen por moneda; no se suman monedas diferentes.' };
}

function buildEstadoCuentaQuality_cor(rows) {
  let filasSinMoneda = 0;
  let filasTotalInconsistente = 0;
  let filasPagadasSinFecha = 0;
  rows.forEach((row) => {
    if (!row.moneda) filasSinMoneda += 1;
    if (row.es_pagado && !row.fecha_pago) filasPagadasSinFecha += 1;
    if (row.subtotal !== null && row.iva !== null && row.total !== null) {
      if (Math.abs(roundAmount_cor(row.subtotal + row.iva - row.total)) > 0.05) filasTotalInconsistente += 1;
    }
  });
  return {
    tiene_estado_cuenta: rows.length > 0,
    filas_sin_moneda: filasSinMoneda,
    filas_total_inconsistente: filasTotalInconsistente,
    filas_pagadas_sin_fecha_pago: filasPagadasSinFecha
  };
}

function normalizeEstatusFacturaRegistro_cor(value) {
  const normalized = canonicalText_cor(value);
  if (!normalized || normalized === 'NULL') return null;
  if (normalized === 'NO PAGADO') return 'No pagado';
  if (normalized === 'PAGADO') return 'Pagado';
  throw badRequest('Estatus factura debe ser No pagado, Pagado o quedar vacio.');
}

function serializeFacturaEstadoCuenta_cor(row) {
  const tipo = cleanText_cor(row?.tipo_concepto)?.toUpperCase() || null;
  let concepto = null;
  if (tipo === 'HITO') {
    const orden = integerOrNull_cor(row?.orden_hito);
    const condicion = cleanText_cor(row?.hito_condicion);
    concepto = [orden ? `Hito ${orden}` : 'Hito', condicion].filter(Boolean).join(' · ');
  } else if (tipo === 'ADITIVA') {
    const noCot = cleanText_cor(row?.aditiva_no_cot);
    const descripcion = cleanText_cor(row?.aditiva_descripcion);
    concepto = [noCot ? `Aditiva ${noCot}` : 'Aditiva', descripcion].filter(Boolean).join(' · ');
  }
  return {
    id_factura_cor: integerOrNull_cor(row?.id_factura_cor),
    ppns: cleanText_cor(row?.ppns),
    tipo_concepto: tipo,
    id_fuente_cor: integerOrNull_cor(row?.id_fuente_cor),
    id_aditiva_cor: integerOrNull_cor(row?.id_aditiva_cor),
    factura: cleanText_cor(row?.factura),
    fecha_factura: cleanText_cor(row?.fecha_factura),
    moneda: cleanText_cor(row?.moneda)?.toUpperCase() || null,
    subtotal: numberOrNull_cor(row?.subtotal),
    iva: numberOrNull_cor(row?.iva),
    total: numberOrNull_cor(row?.total),
    estatus_factura: cleanText_cor(row?.estatus_factura),
    fecha_vencimiento: cleanText_cor(row?.fecha_vencimiento),
    estatus_cobranza: cleanText_cor(row?.estatus_cobranza),
    origen_registro: cleanText_cor(row?.origen_registro),
    concepto
  };
}

function serializeFacturaHitoCatalogo_cor(row) {
  const orden = integerOrNull_cor(row?.orden_hito);
  const condicion = cleanText_cor(row?.condicion);
  return {
    tipo_concepto: 'HITO',
    id_concepto: integerOrNull_cor(row?.id_fuente_cor),
    label: [orden ? `Hito ${orden}` : 'Hito', condicion].filter(Boolean).join(' · '),
    moneda: cleanText_cor(row?.moneda)?.toUpperCase() || null,
    subtotal: numberOrNull_cor(row?.subtotal),
    iva: numberOrNull_cor(row?.iva),
    total: numberOrNull_cor(row?.total)
  };
}

function serializeFacturaAditivaCatalogo_cor(row) {
  const noCot = cleanText_cor(row?.no_cot);
  const descripcion = cleanText_cor(row?.descripcion);
  return {
    tipo_concepto: 'ADITIVA',
    id_concepto: integerOrNull_cor(row?.id_aditiva_cor),
    label: [noCot ? `Aditiva ${noCot}` : 'Aditiva', descripcion].filter(Boolean).join(' · '),
    moneda: cleanText_cor(row?.moneda)?.toUpperCase() || null,
    subtotal: numberOrNull_cor(row?.monto_subtotal),
    iva: numberOrNull_cor(row?.monto_iva),
    total: numberOrNull_cor(row?.monto_total)
  };
}

function attachFacturaRefsToHitos_cor(hitos, facturas) {
  const byHito = new Map();
  (Array.isArray(facturas) ? facturas : []).forEach((row) => {
    const factura = serializeFacturaEstadoCuenta_cor(row);
    if (factura.tipo_concepto !== 'HITO' || !factura.id_fuente_cor || !factura.factura) return;
    if (!byHito.has(factura.id_fuente_cor)) byHito.set(factura.id_fuente_cor, []);
    const bucket = byHito.get(factura.id_fuente_cor);
    if (!bucket.includes(factura.factura)) bucket.push(factura.factura);
  });
  return (Array.isArray(hitos) ? hitos : []).map((row) => {
    const refs = byHito.get(row.id_fuente_cor) || [];
    return refs.length ? { ...row, factura: refs.join(', ') } : row;
  });
}

function normalizeFacturaMutation_cor(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('El cuerpo de la Factura debe ser un objeto JSON.');
  }
  const tipo = canonicalText_cor(payload.tipo_concepto);
  if (!['HITO', 'ADITIVA'].includes(tipo)) throw badRequest('Selecciona si la Factura corresponde a un Hito o una Aditiva.');
  const idConcepto = positiveId_cor(payload.id_concepto ?? (tipo === 'HITO' ? payload.id_fuente_cor : payload.id_aditiva_cor), 'id_concepto');
  const factura = requiredText_cor(payload.factura, 'Factura', 150);
  const fechaFactura = date_cor(payload.fecha_factura, 'Fecha factura');
  const fechaVencimiento = date_cor(payload.fecha_vencimiento, 'Fecha vencimiento');
  const subtotal = decimal_cor(payload.subtotal, 'Subtotal factura');
  const iva = decimal_cor(payload.iva, 'IVA factura');
  const totalEnviado = decimal_cor(payload.total, 'Total factura');
  for (const [label, value] of [['Subtotal', subtotal], ['IVA', iva], ['Total', totalEnviado]]) {
    if (value !== null && value < 0) throw badRequest(`${label} factura no puede ser negativo.`);
  }
  let total = totalEnviado;
  if (subtotal !== null || iva !== null) {
    const calculado = roundAmount_cor((subtotal || 0) + (iva || 0));
    if (totalEnviado !== null && Math.abs(roundAmount_cor(totalEnviado) - calculado) > 0.05) {
      throw badRequest('El Total de la Factura no coincide con Subtotal + IVA.');
    }
    total = calculado;
  }
  return {
    tipo_concepto: tipo,
    id_concepto: idConcepto,
    factura,
    fecha_factura: fechaFactura,
    subtotal,
    iva,
    total,
    estatus_factura: normalizeEstatusFacturaRegistro_cor(payload.estatus_factura),
    fecha_vencimiento: fechaVencimiento
  };
}

async function listarEstadosCuenta_cor(query = {}, informationAccess) {
  const filters = normalizeEstadosCuentaFilters_cor(query);
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const connection = await repository.getConnection_cor();
  try {
    const rows = await repository.listEstadosCuenta_cor(connection, filters, visibleUserIds);
    const data = rows.map(serializeEstadoCuentaMain_cor);
    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.estados_cuenta,
      source_table: repository.TABLES_COR.fuente,
      grouped_by: 'PPNS',
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      total: data.length,
      filtros: { q: filters.buscar, anio: filters.anio, contractual: filters.contractual },
      data
    };
  } finally {
    connection.release();
  }
}

async function detalleEstadoCuenta_cor(ppnsValue, informationAccess) {
  const ppns = requiredText_cor(ppnsValue, 'ppns', 100);
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const connection = await repository.getConnection_cor();
  try {
    const row = await repository.getEstadoCuentaByPpns_cor(connection, ppns, visibleUserIds);
    if (!row) throw httpError(404, 'PPNS no encontrado o fuera del alcance autorizado.');
    const [sourceRows, facturaRows, aditivaRows] = await Promise.all([
      repository.listFuenteEstadoCuenta_cor(connection, ppns),
      repository.listFacturasEstadoCuenta_cor(connection, ppns),
      repository.listAditivasEstadoCuentaFacturables_cor(connection, ppns)
    ]);
    const project = serializeEstadoCuentaMain_cor(row);
    const facturas = facturaRows.map(serializeFacturaEstadoCuenta_cor);
    const detailRows = attachFacturaRefsToHitos_cor(sourceRows.map(serializeFuenteEstadoCuenta_cor), facturaRows);
    const summary = buildEstadoCuentaSummary_cor(detailRows);
    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.estado_cuenta_detalle,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      proyecto: project,
      resumen: summary,
      calidad: buildEstadoCuentaQuality_cor(detailRows),
      estado_cuenta: detailRows,
      facturas,
      facturacion_catalogo: {
        hitos: detailRows.map(serializeFacturaHitoCatalogo_cor),
        aditivas: aditivaRows.map(serializeFacturaAditivaCatalogo_cor)
      }
    };
  } finally {
    connection.release();
  }
}

/* [Aster | 2026-09-30 | ASTER-MG | COBRANZA COR FASE 3 CONSOLIDACION CREAR EDITAR V001] */

function serializeEstadoCuentaProyectoForm_cor(row) {
  return {
    ppns: cleanText_cor(row?.ppns),
    proyecto: cleanText_cor(row?.proyecto),
    cliente: cleanText_cor(row?.cliente),
    contractual: cleanText_cor(row?.contractual),
    supervisor: cleanText_cor(row?.supervisor_iniciales ?? row?.supervisor),
    asesor: cleanText_cor(row?.asesor_iniciales ?? row?.asesor),
    administrativo: cleanText_cor(row?.administrativo_iniciales ?? row?.administrativo),
    equipos_total: integerOrNull_cor(row?.equipos_total) || 0,
    anios: Array.isArray(row?.anios) ? row.anios : splitDashValues_cor(row?.anios).map(Number).filter(Number.isInteger)
  };
}

function serializeEstadoCuentaEquipoDisponible_cor(row) {
  return {
    id_ins_fl: integerOrNull_cor(row?.id_ins_fl),
    ppns: cleanText_cor(row?.ppns),
    referencia_sitio: cleanText_cor(row?.referencia_sitio),
    capacidad_kg: cleanText_cor(row?.capacidad_kg),
    numero_desembarques: cleanText_cor(row?.numero_desembarques),
    estatus: cleanText_cor(row?.estatus),
    estatus_produccion: cleanText_cor(row?.estatus_produccion),
    estatus_equipo_entrega: cleanText_cor(row?.estatus_equipo_entrega)
  };
}

function serializeEstadoCuentaLogOps_cor(row) {
  return {
    id_log_ops: integerOrNull_cor(row?.id_log_ops),
    ppns: cleanText_cor(row?.ppns),
    ph_ns: cleanText_cor(row?.ph_ns),
    no_control: cleanText_cor(row?.no_control),
    marca: cleanText_cor(row?.marca),
    estatus: cleanText_cor(row?.estatus),
    cantidad: integerOrNull_cor(row?.cantidad)
  };
}

function serializeEstadoCuentaEquipoRelacion_cor(row) {
  return {
    id_equipo_cor: integerOrNull_cor(row?.id_equipo_cor),
    ppns: cleanText_cor(row?.ppns),
    id_ins_fl: integerOrNull_cor(row?.id_ins_fl),
    id_log_ops: integerOrNull_cor(row?.id_log_ops),
    orden: integerOrNull_cor(row?.orden),
    ubicacion_torre: cleanText_cor(row?.ubicacion_torre),
    activo: Number(row?.activo) === 1,
    referencia_sitio: cleanText_cor(row?.referencia_sitio),
    capacidad_kg: cleanText_cor(row?.capacidad_kg),
    numero_desembarques: cleanText_cor(row?.numero_desembarques),
    estatus: cleanText_cor(row?.estatus_equipo_entrega ?? row?.ins_fl_estatus),
    ph_ns: cleanText_cor(row?.ph_ns),
    no_control: cleanText_cor(row?.no_control),
    marca: cleanText_cor(row?.marca),
    log_ops_estatus: cleanText_cor(row?.log_ops_estatus)
  };
}

async function catalogoCrearEstadoCuenta_cor(query = {}, informationAccess) {
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const requestedPpns = cleanText_cor(query?.ppns, 100);
  const connection = await repository.getConnection_cor();
  try {
    const projectRows = await repository.listCrearEstadoCuentaProyectos_cor(connection, visibleUserIds);
    const proyectos = projectRows.map(serializeEstadoCuentaProyectoForm_cor);
    if (!requestedPpns) {
      return {
        ok: true,
        source: 'aiven',
        domain: 'CORELLIAN',
        route: ROUTES_COR.estado_cuenta_crear_catalogo,
        scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
        proyectos
      };
    }

    if (!await repository.canAccessPpns_cor(connection, requestedPpns, visibleUserIds)) {
      throw httpError(403, 'El PPNS queda fuera de tu alcance autorizado.');
    }
    if (await repository.existeFuentePpns_cor(connection, requestedPpns)) {
      throw httpError(409, 'El PPNS ya cuenta con un Estado de Cuenta activo.');
    }

    const selectedRows = await repository.listCrearEstadoCuentaProyectos_cor(connection, visibleUserIds, requestedPpns);
    const project = selectedRows.length ? serializeEstadoCuentaProyectoForm_cor(selectedRows[0]) : null;
    if (!project || !project.ppns) {
      throw httpError(404, 'El PPNS no existe en Instalaciones o no está disponible para crear Estado de Cuenta.');
    }

    const [equipmentRows, logOpsRows] = await Promise.all([
      repository.listCrearEstadoCuentaEquipos_cor(connection, requestedPpns),
      repository.listCrearEstadoCuentaLogOps_cor(connection, requestedPpns)
    ]);

    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.estado_cuenta_crear_catalogo,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      proyectos,
      seleccion: {
        proyecto: project,
        equipos: equipmentRows.map(serializeEstadoCuentaEquipoDisponible_cor),
        log_ops: logOpsRows.map(serializeEstadoCuentaLogOps_cor)
      }
    };
  } finally {
    connection.release();
  }
}

async function formularioEstadoCuenta_cor(ppnsValue, informationAccess) {
  const ppns = requiredText_cor(ppnsValue, 'ppns', 100);
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const connection = await repository.getConnection_cor();
  try {
    const row = await repository.getEstadoCuentaByPpns_cor(connection, ppns, visibleUserIds);
    if (!row) throw httpError(404, 'PPNS no encontrado o fuera del alcance autorizado.');

    const [sourceRows, equipmentRows, logOpsRows, relationRows, partidaRows, facturaRows] = await Promise.all([
      repository.listFuenteEstadoCuenta_cor(connection, ppns),
      repository.listCrearEstadoCuentaEquipos_cor(connection, ppns),
      repository.listCrearEstadoCuentaLogOps_cor(connection, ppns),
      repository.listEquiposEstadoCuenta_cor(connection, ppns),
      repository.listPartidasEstadoCuenta_cor(connection, ppns),
      repository.listFacturasEstadoCuenta_cor(connection, ppns)
    ]);
    if (!sourceRows.length) throw httpError(404, 'El PPNS no tiene un Estado de Cuenta activo para editar.');

    const project = serializeEstadoCuentaMain_cor(row);
    const ivaGeneral = resolveIvaGeneralFromRows_cor(sourceRows);
    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.estado_cuenta_formulario,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      ppns,
      proyecto: {
        ...project,
        equipos_total: equipmentRows.length
      },
      hitos: attachFacturaRefsToHitos_cor(sourceRows.map(serializeFuenteEstadoCuenta_cor), facturaRows),
      iva_general_pct: ivaGeneral.value,
      iva_general_mixed: ivaGeneral.mixed,
      partidas: partidaRows.map(serializeEstadoCuentaPartida_cor),
      equipos_disponibles: equipmentRows.map(serializeEstadoCuentaEquipoDisponible_cor),
      equipos_relacionados: relationRows.map(serializeEstadoCuentaEquipoRelacion_cor),
      log_ops: logOpsRows.map(serializeEstadoCuentaLogOps_cor)
    };
  } finally {
    connection.release();
  }
}

function optionalPositiveId_cor(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return positiveId_cor(value, fieldName);
}

function optionalYearForm_cor(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return year_cor(value, fieldName);
}

function activePartidaTotals_cor(partidas) {
  const totals = new Map();
  (Array.isArray(partidas) ? partidas : []).forEach((partida) => {
    if (!partida || partida.eliminar === true) return;
    const currency = String(partida.moneda || '').trim().toUpperCase();
    const amount = numberOrNull_cor(partida.monto_base);
    if (!currency || amount === null) return;
    totals.set(currency, roundAmount_cor((totals.get(currency) || 0) + amount));
  });
  return totals;
}

function applyHitoFinancialRules_cor(input) {
  if (!input || input.partidas_presentes !== true) return input;
  const totals = activePartidaTotals_cor(input.partidas);
  const percentageByCurrency = new Map([...totals.keys()].map((currency) => [currency, 0]));

  input.hitos.forEach((hito, index) => {
    if (!hito || hito.eliminar === true) return;
    const fila = index + 1;
    const currency = String(hito.moneda || '').trim().toUpperCase() || null;
    if (!currency) {
      if (hito.porcentaje !== null) throw badRequest(`Selecciona la moneda del hito ${fila} para aplicar su porcentaje.`);
      hito.subtotal = null;
      hito.iva = null;
      hito.total = null;
      return;
    }
    if (!totals.has(currency)) {
      throw badRequest(`La moneda ${currency} del hito ${fila} no existe entre las Partidas de General.`);
    }
    if (hito.porcentaje === null) {
      hito.subtotal = null;
      hito.iva = null;
      hito.total = null;
      return;
    }

    percentageByCurrency.set(currency, (percentageByCurrency.get(currency) || 0) + hito.porcentaje);
    const subtotal = roundAmount_cor(totals.get(currency) * hito.porcentaje);
    hito.subtotal = subtotal;
    if (input.iva_general_pct_present === true && input.iva_general_pct !== null) {
      hito.iva = roundAmount_cor(subtotal * input.iva_general_pct);
      hito.total = roundAmount_cor(subtotal + hito.iva);
    } else {
      hito.iva = null;
      hito.total = null;
    }
  });

  for (const [currency] of totals) {
    const totalPct = percentageByCurrency.get(currency) || 0;
    if (Math.abs(totalPct - 1) > 0.000001) {
      const display = Math.round(totalPct * 1000000) / 10000;
      throw badRequest(`Los porcentajes de los hitos en ${currency} deben sumar exactamente 100%. Actualmente suman ${display}%.`);
    }
  }
  return input;
}

function normalizeEstadoCuentaMutation_cor(payload, mode) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('El cuerpo del Estado de Cuenta debe ser un objeto JSON.');
  }

  const ppns = requiredText_cor(payload.ppns, 'PPNS', 100);
  const proyecto = cleanText_cor(payload.proyecto, 255) || '';
  const cliente = cleanText_cor(payload.cliente, 500) || '';
  const contractual = cleanText_cor(payload.contractual, 150);
  if (!Array.isArray(payload.hitos) || !payload.hitos.length) {
    throw badRequest('Agrega al menos un hito de cobranza.');
  }

  const firstActiveRawHito = payload.hitos.find((raw) => !(
    raw?.eliminar === true ||
    raw?.eliminar === 1 ||
    String(raw?.eliminar || '').toLowerCase() === 'true'
  )) || null;
  const fondoGarantiaRaw = payload.fondo_garantia !== undefined
    ? payload.fondo_garantia
    : firstActiveRawHito?.fondo_garantia;
  const porcentajeFondoGarantiaRaw = payload.porcentaje_fondo_garantia !== undefined
    ? payload.porcentaje_fondo_garantia
    : firstActiveRawHito?.porcentaje_fondo_garantia;
  const fondoGarantia = boolean_cor(fondoGarantiaRaw, 'Fondo de garantia', 0);
  let porcentajeFondoGarantia = percentage01_cor(
    porcentajeFondoGarantiaRaw,
    'Porcentaje de fondo de garantia'
  );
  if (fondoGarantia !== 1) porcentajeFondoGarantia = 0;
  if (fondoGarantia === 1 && porcentajeFondoGarantia === null) porcentajeFondoGarantia = 0;
  if (fondoGarantia === 1 && porcentajeFondoGarantia > 0.10) {
    throw httpError(
      422,
      'El Fondo de Garantia supera el tope de 10%. Requiere autorizacion antes de guardar.',
      {
        maximo_sin_autorizacion_pct: 10,
        porcentaje_solicitado_pct: Math.round(porcentajeFondoGarantia * 10000) / 100
      },
      'FONDO_GARANTIA_AUTORIZACION_REQUERIDA'
    );
  }

  const ivaGeneralPresent = Object.prototype.hasOwnProperty.call(payload, 'iva_general_pct');
  const ivaGeneralPct = ivaGeneralPresent
    ? normalizeIvaGeneralPct_cor(payload.iva_general_pct, 'IVA general')
    : undefined;

  const hitos = payload.hitos.map((raw, index) => {
    const fila = index + 1;
    const idFuenteCor = optionalPositiveId_cor(raw?.id_fuente_cor, `id_fuente_cor del hito ${fila}`);
    const eliminar = raw?.eliminar === true || raw?.eliminar === 1 || String(raw?.eliminar || '').toLowerCase() === 'true';
    if (eliminar) {
      if (!idFuenteCor) throw badRequest(`El hito ${fila} no puede eliminarse porque no tiene id_fuente_cor.`);
      return { id_fuente_cor: idFuenteCor, eliminar: true };
    }

    const porcentaje = percentage01_cor(raw?.porcentaje, `Porcentaje del hito ${fila}`);
    const monedaRaw = cleanText_cor(raw?.moneda, 10);
    const moneda = monedaRaw ? monedaRaw.toUpperCase() : null;
    const subtotal = decimal_cor(raw?.subtotal, `Subtotal del hito ${fila}`);
    const iva = decimal_cor(raw?.iva, `IVA del hito ${fila}`);
    const total = decimal_cor(raw?.total, `Total del hito ${fila}`);

    const condicion = cleanText_cor(raw?.condicion, 500);

    return {
      id_fuente_cor: idFuenteCor,
      eliminar: false,
      orden_hito: integer_cor(raw?.orden_hito ?? fila, `Orden del hito ${fila}`, { min: 1 }),
      porcentaje,
      condicion,
      moneda,
      subtotal,
      iva,
      total,
      fecha_vencimiento: date_cor(raw?.fecha_vencimiento, `Fecha de vencimiento del hito ${fila}`),
      dias_vencimiento: integer_cor(raw?.dias_vencimiento, `Días de vencimiento del hito ${fila}`),
      estimado_pago: cleanText_cor(raw?.estimado_pago, 100),
      fecha_programada: date_cor(raw?.fecha_programada, `Fecha programada del hito ${fila}`),
      fecha_notificada: date_cor(raw?.fecha_notificada, `Fecha notificada del hito ${fila}`),
      anio_proyecto: optionalYearForm_cor(raw?.anio_proyecto, `Año del proyecto del hito ${fila}`)
    };
  });

  if (!hitos.some((row) => row.eliminar !== true)) {
    throw badRequest('El Estado de Cuenta debe conservar al menos un hito activo.');
  }

  const partidasPresentes = Array.isArray(payload.partidas);
  const partidasRaw = partidasPresentes ? payload.partidas : [];
  const partidas = partidasRaw.map((raw, index) => {
    const fila = index + 1;
    const idPartidaCor = optionalPositiveId_cor(raw?.id_partida_cor, `id_partida_cor de la partida ${fila}`);
    const eliminar = raw?.eliminar === true || raw?.eliminar === 1 || String(raw?.eliminar || '').toLowerCase() === 'true';
    if (eliminar) {
      if (!idPartidaCor) throw badRequest(`La partida ${fila} no puede eliminarse porque no tiene id_partida_cor.`);
      return { id_partida_cor: idPartidaCor, eliminar: true };
    }
    const moneda = cleanText_cor(raw?.moneda, 3)?.toUpperCase() || null;
    if (!moneda || !PARTIDA_CURRENCIES_COR.has(moneda)) {
      throw badRequest(`La moneda de la partida ${fila} debe ser MXN, USD o EUR.`);
    }
    const montoBase = decimal_cor(raw?.monto_base, `Monto base de la partida ${fila}`);
    if (montoBase === null || montoBase < 0) {
      throw badRequest(`El monto base de la partida ${fila} debe ser numerico y mayor o igual a 0.`);
    }
    return {
      id_partida_cor: idPartidaCor,
      eliminar: false,
      orden: integer_cor(raw?.orden ?? fila, `Orden de la partida ${fila}`, { min: 1 }),
      moneda,
      monto_base: roundAmount_cor(montoBase)
    };
  });

  const equiposRaw = Array.isArray(payload.equipos) ? payload.equipos : [];
  const equipos = equiposRaw.map((raw, index) => {
    const fila = index + 1;
    const idEquipoCor = optionalPositiveId_cor(raw?.id_equipo_cor, `id_equipo_cor del equipo ${fila}`);
    const idInsFl = optionalPositiveId_cor(raw?.id_ins_fl, `id_ins_fl del equipo ${fila}`);
    const idLogOps = optionalPositiveId_cor(raw?.id_log_ops, `id_log_ops del equipo ${fila}`);
    const activo = !(raw?.activo === false || raw?.activo === 0 || String(raw?.activo || '').toLowerCase() === 'false');
    if (activo && !idInsFl) throw badRequest(`El equipo ${fila} activo requiere id_ins_fl.`);
    return {
      id_equipo_cor: idEquipoCor,
      id_ins_fl: idInsFl,
      id_log_ops: idLogOps,
      orden: integer_cor(raw?.orden ?? fila, `Orden del equipo ${fila}`, { min: 1 }),
      ubicacion_torre: cleanText_cor(raw?.ubicacion_torre, 255),
      activo: activo ? 1 : 0
    };
  });

  const activeInsFlIds = new Set();
  equipos.forEach((equipment, index) => {
    if (equipment.activo !== 1) return;
    if (activeInsFlIds.has(equipment.id_ins_fl)) {
      throw badRequest(`El id_ins_fl ${equipment.id_ins_fl} esta repetido entre los equipos activos.`);
    }
    activeInsFlIds.add(equipment.id_ins_fl);
  });

  const normalized = {
    ppns,
    proyecto,
    cliente,
    contractual,
    fondo_garantia: fondoGarantia,
    porcentaje_fondo_garantia: porcentajeFondoGarantia,
    iva_general_pct_present: ivaGeneralPresent,
    iva_general_pct: ivaGeneralPct,
    partidas_presentes: partidasPresentes,
    partidas,
    hitos,
    equipos
  };
  return applyHitoFinancialRules_cor(normalized);
}

function fuenteMutationRecord_cor(input, hito) {
  const record = {
    proyecto: input.proyecto,
    cliente: input.cliente,
    contractual: input.contractual,
    porcentaje: hito.porcentaje,
    fondo_garantia: input.fondo_garantia,
    porcentaje_fondo_garantia: input.porcentaje_fondo_garantia,
    condicion: hito.condicion,
    moneda: hito.moneda,
    subtotal: hito.subtotal,
    iva: hito.iva,
    total: hito.total,
    fecha_vencimiento: hito.fecha_vencimiento,
    dias_vencimiento: hito.dias_vencimiento,
    estimado_pago: hito.estimado_pago,
    orden_hito: hito.orden_hito,
    fecha_programada: hito.fecha_programada,
    fecha_notificada: hito.fecha_notificada,
    anio_proyecto: hito.anio_proyecto,
    activo: 1
  };
  if (input.iva_general_pct_present === true) record.iva_general_pct = input.iva_general_pct;
  return record;
}


async function validateEstadoCuentaEquipos_cor(connection, input) {
  const equipmentRows = await repository.listCrearEstadoCuentaEquipos_cor(connection, input.ppns);
  const validInsFl = new Set(equipmentRows.map((row) => Number(row.id_ins_fl)).filter(Number.isInteger));
  const logOpsRows = await repository.listCrearEstadoCuentaLogOps_cor(connection, input.ppns);
  const validLogOps = new Set(logOpsRows.map((row) => Number(row.id_log_ops)).filter(Number.isInteger));

  input.equipos.forEach((equipment) => {
    if (equipment.activo === 1 && !validInsFl.has(equipment.id_ins_fl)) {
      throw badRequest(`El id_ins_fl ${equipment.id_ins_fl} no pertenece al PPNS seleccionado.`);
    }
    if (equipment.activo === 1 && equipment.id_log_ops !== null && !validLogOps.has(equipment.id_log_ops)) {
      throw badRequest(`El id_log_ops ${equipment.id_log_ops} no pertenece al PPNS seleccionado.`);
    }
  });
  return { equipmentRows, logOpsRows };
}

async function crearEstadoCuenta_cor(payload, informationAccess, actorUserIdValue) {
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const input = normalizeEstadoCuentaMutation_cor(payload, 'create');
  const actorUserId = positiveId_cor(actorUserIdValue, 'actorUserId');
  const connection = await repository.getConnection_cor();
  try {
    if (!await repository.canAccessPpns_cor(connection, input.ppns, visibleUserIds)) {
      throw httpError(403, 'El PPNS queda fuera de tu alcance autorizado.');
    }

    await connection.beginTransaction();
    try {
      const locked = await repository.lockCrearEstadoCuentaPpns_cor(connection, input.ppns);
      if (!locked.length) throw httpError(404, 'El PPNS no existe o no tiene equipos activos en Instalaciones.');
      if (await repository.existeFuentePpns_cor(connection, input.ppns)) {
        throw httpError(409, 'El PPNS ya cuenta con un Estado de Cuenta activo.');
      }

      const projectRows = await repository.listCrearEstadoCuentaProyectos_cor(connection, visibleUserIds, input.ppns);
      if (!projectRows.length) throw httpError(404, 'No fue posible resolver los datos del PPNS en Instalaciones.');
      if (input.equipos.length) await validateEstadoCuentaEquipos_cor(connection, input);

      for (const hito of input.hitos) {
        if (hito.eliminar) continue;
        await repository.insertRecord_cor(connection, repository.TABLES_COR.fuente, {
          id_proyecto_origen: input.ppns,
          ...fuenteMutationRecord_cor(input, hito)
        });
      }

      if (input.partidas_presentes) {
        for (const partida of input.partidas) {
          if (partida.eliminar) continue;
          await repository.insertRecord_cor(connection, repository.TABLES_COR.partidas, {
            ppns: input.ppns,
            orden: partida.orden,
            moneda: partida.moneda,
            monto_base: partida.monto_base,
            activo: 1,
            created_by: actorUserId,
            updated_by: actorUserId
          });
        }
      }

      for (const equipment of input.equipos) {
        if (equipment.activo !== 1) continue;
        await repository.insertRecord_cor(connection, repository.TABLES_COR.equipos, {
          ppns: input.ppns,
          id_ins_fl: equipment.id_ins_fl,
          id_log_ops: equipment.id_log_ops,
          orden: equipment.orden,
          ubicacion_torre: equipment.ubicacion_torre,
          activo: 1,
          created_by: actorUserId,
          updated_by: actorUserId
        });
      }

      await connection.commit();
      return {
        ok: true,
        source: 'aiven',
        domain: 'CORELLIAN',
        route: ROUTES_COR.estado_cuenta_crear,
        ppns: input.ppns,
        proyecto: input.proyecto,
        hitos_creados: input.hitos.filter((row) => !row.eliminar).length,
        partidas_creadas: input.partidas_presentes ? input.partidas.filter((row) => !row.eliminar).length : 0,
        equipos_relacionados: input.equipos.filter((row) => row.activo === 1).length
      };
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
  } finally {
    connection.release();
  }
}

async function actualizarEstadoCuenta_cor(ppnsValue, payload, informationAccess, actorUserIdValue) {
  const ppns = requiredText_cor(ppnsValue, 'ppns', 100);
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const input = normalizeEstadoCuentaMutation_cor({ ...(payload || {}), ppns }, 'edit');
  const actorUserId = positiveId_cor(actorUserIdValue, 'actorUserId');
  const connection = await repository.getConnection_cor();
  try {
    const current = await repository.getEstadoCuentaByPpns_cor(connection, ppns, visibleUserIds);
    if (!current) throw httpError(404, 'PPNS no encontrado o fuera del alcance autorizado.');

    await connection.beginTransaction();
    try {
      const lockedFuente = await repository.lockFuenteEstadoCuentaPpns_cor(connection, ppns);
      if (!lockedFuente.length) throw httpError(404, 'El PPNS no tiene un Estado de Cuenta activo para editar.');
      const validFuenteIds = new Set(lockedFuente.map((row) => Number(row.id_fuente_cor)).filter(Number.isInteger));

      const lockedEquipos = await repository.lockEquiposEstadoCuentaPpns_cor(connection, ppns);
      const validEquipoIds = new Set(lockedEquipos.map((row) => Number(row.id_equipo_cor)).filter(Number.isInteger));
      const lockedPartidas = input.partidas_presentes
        ? await repository.lockPartidasEstadoCuentaPpns_cor(connection, ppns)
        : [];
      const validPartidaIds = new Set(lockedPartidas.map((row) => Number(row.id_partida_cor)).filter(Number.isInteger));
      if (input.equipos.length) await validateEstadoCuentaEquipos_cor(connection, input);

      let hitosActualizados = 0;
      let hitosCreados = 0;
      let hitosDesactivados = 0;
      for (const hito of input.hitos) {
        if (hito.id_fuente_cor !== null) {
          if (!validFuenteIds.has(hito.id_fuente_cor)) {
            throw badRequest(`El id_fuente_cor ${hito.id_fuente_cor} no pertenece al Estado de Cuenta activo del PPNS.`);
          }
          if (hito.eliminar) {
            await repository.updateFuenteEstadoCuenta_cor(connection, hito.id_fuente_cor, ppns, { activo: 0 });
            hitosDesactivados += 1;
          } else {
            await repository.updateFuenteEstadoCuenta_cor(connection, hito.id_fuente_cor, ppns, fuenteMutationRecord_cor(input, hito));
            hitosActualizados += 1;
          }
        } else if (!hito.eliminar) {
          await repository.insertRecord_cor(connection, repository.TABLES_COR.fuente, {
            id_proyecto_origen: ppns,
            ...fuenteMutationRecord_cor(input, hito)
          });
          hitosCreados += 1;
        }
      }

      let partidasActualizadas = 0;
      let partidasCreadas = 0;
      let partidasDesactivadas = 0;
      if (input.partidas_presentes) {
        for (const partida of input.partidas) {
          if (partida.id_partida_cor !== null) {
            if (!validPartidaIds.has(partida.id_partida_cor)) {
              throw badRequest(`El id_partida_cor ${partida.id_partida_cor} no pertenece al Estado de Cuenta activo del PPNS.`);
            }
            if (partida.eliminar) {
              await repository.updatePartidaEstadoCuenta_cor(connection, partida.id_partida_cor, ppns, { activo: 0, updated_by: actorUserId });
              partidasDesactivadas += 1;
            } else {
              await repository.updatePartidaEstadoCuenta_cor(connection, partida.id_partida_cor, ppns, {
                orden: partida.orden,
                moneda: partida.moneda,
                monto_base: partida.monto_base,
                activo: 1,
                updated_by: actorUserId
              });
              partidasActualizadas += 1;
            }
          } else if (!partida.eliminar) {
            await repository.insertRecord_cor(connection, repository.TABLES_COR.partidas, {
              ppns,
              orden: partida.orden,
              moneda: partida.moneda,
              monto_base: partida.monto_base,
              activo: 1,
              created_by: actorUserId,
              updated_by: actorUserId
            });
            partidasCreadas += 1;
          }
        }
      }

      let equiposActualizados = 0;
      let equiposCreados = 0;
      let equiposDesactivados = 0;
      for (const equipment of input.equipos) {
        if (equipment.id_equipo_cor !== null) {
          if (!validEquipoIds.has(equipment.id_equipo_cor)) {
            throw badRequest(`El id_equipo_cor ${equipment.id_equipo_cor} no pertenece al PPNS activo.`);
          }
          await repository.updateEquipoEstadoCuenta_cor(connection, equipment.id_equipo_cor, ppns, {
            id_ins_fl: equipment.id_ins_fl,
            id_log_ops: equipment.id_log_ops,
            orden: equipment.orden,
            ubicacion_torre: equipment.ubicacion_torre,
            activo: equipment.activo,
            updated_by: actorUserId
          });
          if (equipment.activo === 1) equiposActualizados += 1;
          else equiposDesactivados += 1;
        } else if (equipment.activo === 1) {
          await repository.insertRecord_cor(connection, repository.TABLES_COR.equipos, {
            ppns,
            id_ins_fl: equipment.id_ins_fl,
            id_log_ops: equipment.id_log_ops,
            orden: equipment.orden,
            ubicacion_torre: equipment.ubicacion_torre,
            activo: 1,
            created_by: actorUserId,
            updated_by: actorUserId
          });
          equiposCreados += 1;
        }
      }

      const remaining = lockedFuente.length - hitosDesactivados + hitosCreados;
      if (remaining <= 0) throw badRequest('El Estado de Cuenta debe conservar al menos un hito activo.');

      await connection.commit();
      return {
        ok: true,
        source: 'aiven',
        domain: 'CORELLIAN',
        route: ROUTES_COR.estado_cuenta_actualizar,
        ppns,
        hitos_actualizados: hitosActualizados,
        hitos_creados: hitosCreados,
        hitos_desactivados: hitosDesactivados,
        partidas_actualizadas: partidasActualizadas,
        partidas_creadas: partidasCreadas,
        partidas_desactivadas: partidasDesactivadas,
        equipos_actualizados: equiposActualizados,
        equipos_creados: equiposCreados,
        equipos_desactivados: equiposDesactivados
      };
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
  } finally {
    connection.release();
  }
}

async function crearFacturaEstadoCuenta_cor(ppnsValue, payload, informationAccess, actorUserIdValue) {
  const ppns = requiredText_cor(ppnsValue, 'ppns', 100);
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const actorUserId = positiveId_cor(actorUserIdValue, 'actorUserId');
  const input = normalizeFacturaMutation_cor(payload);
  const connection = await repository.getConnection_cor();
  try {
    const estado = await repository.getEstadoCuentaByPpns_cor(connection, ppns, visibleUserIds);
    if (!estado) throw httpError(404, 'PPNS no encontrado o fuera del alcance autorizado.');

    await connection.beginTransaction();
    try {
      const concepto = input.tipo_concepto === 'HITO'
        ? await repository.getHitoFacturable_cor(connection, ppns, input.id_concepto)
        : await repository.getAditivaFacturable_cor(connection, ppns, input.id_concepto);
      if (!concepto) throw badRequest(`${input.tipo_concepto === 'HITO' ? 'Hito' : 'Aditiva'} no pertenece al Estado de Cuenta activo del PPNS.`);

      const duplicate = await repository.findFacturaDuplicada_cor(
        connection,
        ppns,
        input.tipo_concepto,
        input.id_concepto,
        input.factura
      );
      if (duplicate) throw httpError(409, 'La Factura ya está relacionada con este concepto.');

      const moneda = cleanText_cor(concepto?.moneda, 10)?.toUpperCase() || null;
      const record = {
        ppns,
        tipo_concepto: input.tipo_concepto,
        id_fuente_cor: input.tipo_concepto === 'HITO' ? input.id_concepto : null,
        id_aditiva_cor: input.tipo_concepto === 'ADITIVA' ? input.id_concepto : null,
        factura: input.factura,
        fecha_factura: input.fecha_factura,
        moneda,
        subtotal: input.subtotal,
        iva: input.iva,
        total: input.total,
        estatus_factura: input.estatus_factura,
        fecha_vencimiento: input.fecha_vencimiento,
        estatus_cobranza: null,
        origen_registro: 'MANUAL',
        activo: 1,
        created_by: actorUserId,
        updated_by: actorUserId
      };
      const result = await repository.insertRecord_cor(connection, repository.TABLES_COR.facturas, record);
      const idFacturaCor = Number(result.insertId);
      if (!Number.isInteger(idFacturaCor) || idFacturaCor <= 0) throw new Error('No fue posible obtener el identificador de la Factura creada.');
      await connection.commit();
      const created = await repository.getFacturaEstadoCuentaById_cor(connection, ppns, idFacturaCor);
      if (!created) throw httpError(500, 'La Factura fue creada, pero no pudo recuperarse para confirmar el resultado.');
      return {
        ok: true,
        source: 'aiven',
        domain: 'CORELLIAN',
        route: ROUTES_COR.factura_crear,
        ppns,
        factura: serializeFacturaEstadoCuenta_cor(created)
      };
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
  } finally {
    connection.release();
  }
}

function booleanQuery_cor(value, fieldName, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = canonicalText_cor(value);
  if (['1', 'TRUE', 'SI', 'S', 'YES', 'Y'].includes(normalized)) return true;
  if (['0', 'FALSE', 'NO', 'N'].includes(normalized)) return false;
  throw badRequest(`${fieldName} debe representar SI/NO o 1/0.`);
}

function normalizeAditivasFilters_cor(query = {}) {
  const filters = {
    buscar: cleanText_cor(query.q ?? query.buscar, 200),
    departamento: cleanText_cor(query.departamento, 100),
    categoria: cleanText_cor(query.categoria, 100),
    firmaCot: cleanText_cor(query.firma_cot ?? query.firmaCot, 100),
    estatusTrabajos: cleanText_cor(query.estatus_trabajos ?? query.estatusTrabajos, 100),
    estatusCobranza: cleanText_cor(query.estatus_cobranza ?? query.estatusCobranza, 100),
    supervisor: cleanText_cor(query.sup ?? query.supervisor, 50),
    moneda: cleanText_cor(query.moneda, 10),
    soloPendientes: booleanQuery_cor(query.solo_pendientes ?? query.soloPendientes, 'solo_pendientes', false)
  };
  filters.anio = query.anio !== undefined && query.anio !== null && String(query.anio).trim() !== ''
    ? year_cor(query.anio, 'anio')
    : null;
  const page = integer_cor(query.page ?? query.pagina, 'page', { min: 1 }) || 1;
  const pageSize = integer_cor(query.page_size ?? query.pageSize ?? query.tamano, 'page_size', { min: 1, max: 100 }) || 50;
  return { ...filters, page, pageSize };
}

function serializeAditiva_cor(row) {
  const linked = Number(row?.fuente_ppns_existe || 0) === 1;
  const reference = linked ? {
    ppns: cleanText_cor(row?.pp_ns),
    proyecto: cleanText_cor(row?.fuente_proyecto) || cleanText_cor(row?.proyecto),
    anio: integerOrNull_cor(row?.fuente_anio)
  } : null;

  return {
    id_aditiva_cor: integerOrNull_cor(row?.id_aditiva_cor),
    anio_cot: integerOrNull_cor(row?.anio_cot),
    departamento: cleanText_cor(row?.departamento),
    categoria: cleanText_cor(row?.categoria),
    fecha_cot: cleanText_cor(row?.fecha_cot),
    firma_cot: cleanText_cor(row?.firma_cot),
    no_cot: cleanText_cor(row?.no_cot),
    ov: cleanText_cor(row?.ov),
    factura: cleanText_cor(row?.factura),
    estatus_trabajos: cleanText_cor(row?.estatus_trabajos),
    estatus_cobranza: cleanText_cor(row?.estatus_cobranza),
    sup: cleanText_cor(row?.sup),
    pp_ns: cleanText_cor(row?.pp_ns),
    proyecto: cleanText_cor(row?.proyecto),
    equipo: cleanText_cor(row?.equipo),
    descripcion: cleanText_cor(row?.descripcion),
    comentario_fuente: cleanText_cor(row?.comentario_fuente),
    monto_subtotal: numberOrNull_cor(row?.monto_subtotal),
    iva_pct: numberOrNull_cor(row?.iva_pct),
    monto_iva: numberOrNull_cor(row?.monto_iva),
    monto_total: numberOrNull_cor(row?.monto_total),
    gasto_subtotal: numberOrNull_cor(row?.gasto_subtotal),
    oc: cleanText_cor(row?.oc),
    diferencia: numberOrNull_cor(row?.diferencia),
    utilidad_real_pct: numberOrNull_cor(row?.utilidad_real_pct),
    monto_pagado: numberOrNull_cor(row?.monto_pagado),
    pagado_sin_iva: numberOrNull_cor(row?.pagado_sin_iva),
    pendiente_pago: numberOrNull_cor(row?.pendiente_pago),
    fecha_pago: cleanText_cor(row?.fecha_pago),
    semana_pago: cleanText_cor(row?.semana_pago),
    moneda: cleanText_cor(row?.moneda)?.toUpperCase() || null,
    gasto_ejercido: cleanText_cor(row?.gasto_ejercido),
    vinculo_ppns: linked,
    ppns_referencia: reference
  };
}

function countByText_cor(rows, fieldName) {
  const counts = new Map();
  rows.forEach((row) => {
    const value = cleanText_cor(row?.[fieldName]);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].map(([valor, registros]) => ({ valor, registros }))
    .sort((a, b) => b.registros - a.registros || a.valor.localeCompare(b.valor, 'es'));
}

function buildAditivasSummary_cor(rows) {
  const buckets = new Map();
  let conPendiente = 0;
  let conPpns = 0;
  let sinPpns = 0;
  rows.forEach((row) => {
    const currency = cleanText_cor(row?.moneda)?.toUpperCase() || 'SIN_MONEDA';
    if (!buckets.has(currency)) {
      buckets.set(currency, { moneda: currency, registros: 0, monto_subtotal: 0, monto_iva: 0, monto_total: 0, gasto_subtotal: 0, diferencia: 0, monto_pagado: 0, pagado_sin_iva: 0, pendiente_pago: 0 });
    }
    const bucket = buckets.get(currency);
    bucket.registros += 1;
    bucket.monto_subtotal += Number(row?.monto_subtotal || 0);
    bucket.monto_iva += Number(row?.monto_iva || 0);
    bucket.monto_total += Number(row?.monto_total || 0);
    bucket.gasto_subtotal += Number(row?.gasto_subtotal || 0);
    bucket.diferencia += Number(row?.diferencia || 0);
    bucket.monto_pagado += Number(row?.monto_pagado || 0);
    bucket.pagado_sin_iva += Number(row?.pagado_sin_iva || 0);
    bucket.pendiente_pago += Number(row?.pendiente_pago || 0);
    if (Number(row?.pendiente_pago || 0) > 0) conPendiente += 1;
    if (Number(row?.fuente_ppns_existe || 0) === 1) conPpns += 1;
    else sinPpns += 1;
  });

  const porMoneda = [...buckets.values()].map((bucket) => ({
    ...bucket,
    monto_subtotal: roundAmount_cor(bucket.monto_subtotal),
    monto_iva: roundAmount_cor(bucket.monto_iva),
    monto_total: roundAmount_cor(bucket.monto_total),
    gasto_subtotal: roundAmount_cor(bucket.gasto_subtotal),
    diferencia: roundAmount_cor(bucket.diferencia),
    monto_pagado: roundAmount_cor(bucket.monto_pagado),
    pagado_sin_iva: roundAmount_cor(bucket.pagado_sin_iva),
    pendiente_pago: roundAmount_cor(bucket.pendiente_pago)
  })).sort((a, b) => a.moneda.localeCompare(b.moneda));

  return {
    registros: rows.length,
    con_pendiente: conPendiente,
    con_ppns: conPpns,
    sin_ppns: sinPpns,
    por_moneda: porMoneda,
    por_estatus_cobranza: countByText_cor(rows, 'estatus_cobranza'),
    por_estatus_trabajos: countByText_cor(rows, 'estatus_trabajos'),
    por_firma_cot: countByText_cor(rows, 'firma_cot'),
    nota: 'Los importes se resumen por moneda. No se suman monedas diferentes entre si.'
  };
}

function distinctValues_cor(rows, fieldName, { numeric = false } = {}) {
  const values = new Set();
  rows.forEach((row) => {
    if (numeric) {
      const value = integerOrNull_cor(row?.[fieldName]);
      if (value !== null) values.add(value);
      return;
    }
    const value = cleanText_cor(row?.[fieldName]);
    if (value) values.add(value);
  });
  return [...values].sort((a, b) => numeric ? Number(b) - Number(a) : String(a).localeCompare(String(b), 'es'));
}

function buildAditivasCatalogs_cor(rows) {
  return {
    anios: distinctValues_cor(rows, 'anio_cot', { numeric: true }),
    departamentos: distinctValues_cor(rows, 'departamento'),
    categorias: distinctValues_cor(rows, 'categoria'),
    firmas_cot: distinctValues_cor(rows, 'firma_cot'),
    estatus_trabajos: distinctValues_cor(rows, 'estatus_trabajos'),
    estatus_cobranza: distinctValues_cor(rows, 'estatus_cobranza'),
    supervisores: distinctValues_cor(rows, 'sup'),
    monedas: distinctValues_cor(rows, 'moneda').map((value) => value.toUpperCase())
  };
}

async function listarAditivas_cor(query = {}, informationAccess) {
  const filters = normalizeAditivasFilters_cor(query);
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const connection = await repository.getConnection_cor();
  try {
    const filteredRows = await repository.listAditivas_cor(connection, filters, visibleUserIds);
    const catalogRows = await repository.listAditivas_cor(connection, {}, visibleUserIds);
    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.aditivas,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      filtros: {
        q: filters.buscar, anio: filters.anio, departamento: filters.departamento, categoria: filters.categoria,
        firma_cot: filters.firmaCot, estatus_trabajos: filters.estatusTrabajos,
        estatus_cobranza: filters.estatusCobranza, sup: filters.supervisor,
        moneda: filters.moneda, solo_pendientes: filters.soloPendientes
      },
      paginacion: { pagina: page, tamano: filters.pageSize, total_registros: total, total_paginas: totalPages },
      resumen: buildAditivasSummary_cor(filteredRows),
      catalogos: buildAditivasCatalogs_cor(catalogRows),
      data: filteredRows.slice(start, start + filters.pageSize).map(serializeAditiva_cor)
    };
  } finally {
    connection.release();
  }
}

async function detalleAditiva_cor(idAditivaCorValue, informationAccess) {
  const idAditivaCor = positiveId_cor(idAditivaCorValue, 'idAditivaCor');
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const connection = await repository.getConnection_cor();
  try {
    const row = await repository.getAditiva_cor(connection, idAditivaCor, visibleUserIds);
    if (!row) throw httpError(404, 'Aditiva no encontrada o fuera del alcance autorizado.');
    return { ok: true, source: 'aiven', domain: 'CORELLIAN', route: ROUTES_COR.aditiva_detalle, scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES', aditiva: serializeAditiva_cor(row) };
  } finally {
    connection.release();
  }
}

function normalizeManualAditiva_cor(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw badRequest('El cuerpo de la Aditiva debe ser un objeto JSON.');
  try { return normalizeAditiva_cor(payload); }
  catch (error) { throw badRequest(error?.message || 'La Aditiva contiene datos invalidos.'); }
}

async function assertManualAditivaScope_cor(connection, record, visibleUserIds) {
  if (visibleUserIds === null) return;
  if (!record.pp_ns) {
    throw httpError(403, 'La Aditiva requiere PPNS para validar el alcance CORELLIAN antes de guardarse.');
  }
  if (!await repository.canAccessPpns_cor(connection, record.pp_ns, visibleUserIds)) {
    throw httpError(403, 'El PPNS relacionado con la Aditiva queda fuera de tu alcance autorizado.');
  }
}

async function crearAditiva_cor(payload, informationAccess) {
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const record = normalizeManualAditiva_cor(payload);
  const connection = await repository.getConnection_cor();
  let idAditivaCor;
  try {
    await connection.beginTransaction();
    try {
      await assertManualAditivaScope_cor(connection, record, visibleUserIds);
      const result = await repository.insertRecord_cor(connection, repository.TABLES_COR.aditivas, record);
      idAditivaCor = Number(result.insertId);
      if (!Number.isInteger(idAditivaCor) || idAditivaCor <= 0) throw new Error('No fue posible obtener el identificador de la Aditiva creada.');
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
    const created = await repository.getAditiva_cor(connection, idAditivaCor, visibleUserIds);
    if (!created) throw httpError(500, 'La Aditiva fue creada, pero no pudo recuperarse para confirmar el resultado.');
    return { ok: true, source: 'aiven', domain: 'CORELLIAN', route: ROUTES_COR.aditiva_crear, scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES', aditiva: serializeAditiva_cor(created) };
  } finally {
    connection.release();
  }
}

async function actualizarAditiva_cor(idAditivaCorValue, payload, informationAccess) {
  const idAditivaCor = positiveId_cor(idAditivaCorValue, 'idAditivaCor');
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const record = normalizeManualAditiva_cor(payload);
  const connection = await repository.getConnection_cor();
  try {
    const existing = await repository.getAditiva_cor(connection, idAditivaCor, visibleUserIds);
    if (!existing) throw httpError(404, 'Aditiva no encontrada o fuera del alcance autorizado.');
    await connection.beginTransaction();
    try {
      await assertManualAditivaScope_cor(connection, record, visibleUserIds);
      await repository.updateAditiva_cor(connection, idAditivaCor, record);
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch (_rollbackError) {}
      throw error;
    }
    const updated = await repository.getAditiva_cor(connection, idAditivaCor, visibleUserIds);
    if (!updated) throw httpError(500, 'La Aditiva fue actualizada, pero no pudo recuperarse para confirmar el resultado.');
    return { ok: true, source: 'aiven', domain: 'CORELLIAN', route: ROUTES_COR.aditiva_actualizar, scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES', aditiva: serializeAditiva_cor(updated) };
  } finally {
    connection.release();
  }
}

function getAdeudosContractuales_cor() {
  return {
    available: false,
    supported: false,
    domain: 'CORELLIAN',
    route: ROUTES_COR.adeudos_contractuales,
    source_table: repository.TABLES_COR.fuente,
    status: 'PENDING_COBRANZA_COR_FUNCTIONAL_READ',
    label: 'Adeudos contractuales',
    message: `La tabla ${repository.TABLES_COR.fuente} ya existe; la lectura funcional de Adeudos contractuales se implementa en una fase posterior.`,
    data: []
  };
}

module.exports = {
  ROUTES_COR,
  cargarFuente_cor,
  cargarAditivas_cor,
  listarEstadosCuenta_cor,
  detalleEstadoCuenta_cor,
  catalogoCrearEstadoCuenta_cor,
  formularioEstadoCuenta_cor,
  crearEstadoCuenta_cor,
  actualizarEstadoCuenta_cor,
  crearFacturaEstadoCuenta_cor,
  listarAditivas_cor,
  detalleAditiva_cor,
  crearAditiva_cor,
  actualizarAditiva_cor,
  getAdeudosContractuales_cor
};
