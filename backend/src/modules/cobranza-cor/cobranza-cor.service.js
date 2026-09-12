'use strict';

const repository = require('./cobranza-cor.repository');

const BATCH_SIZE = 300;
const MAX_RECORDS = 5000;

const ROUTES_COR = Object.freeze({
  carga_indice: '/api/cobranza-cor/carga/indice',
  carga_fuente: '/api/cobranza-cor/carga/fuente',
  carga_aditivas: '/api/cobranza-cor/carga/aditivas',
  estados_cuenta: '/api/cobranza-cor/estados-cuenta',
  estado_cuenta_detalle: '/api/cobranza-cor/estados-cuenta/:idIndiceCor',
  aditivas: '/api/cobranza-cor/aditivas',
  aditiva_detalle: '/api/cobranza-cor/aditivas/:idAditivaCor',
  adeudos_contractuales: '/api/cobranza-cor/adeudos-contractuales'
});

function httpError(statusCode, message, detalles) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detalles = detalles;
  return error;
}

function badRequest(message, detalles) {
  return httpError(400, message, detalles);
}

function normalizeKey_cor(value) {
  const raw = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/%/g, ' PCT ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return raw;
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
  text = text
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')
    .replace(/[\$€£]/g, '');

  // 1.234,56 -> 1234.56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+,\d+$/.test(text)) {
    // 0,50 -> 0.50
    text = text.replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    // 1,234.56 -> 1234.56
    text = text.replace(/,/g, '');
  }

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`${fieldName} debe ser numerico.`);
  }

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
  if (number < 0 || number > 1) {
    throw new Error(`${fieldName} debe estar entre 0% y 100%.`);
  }
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

function userId_cor(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || text === '-') return null;
  }
  return integer_cor(value, fieldName, { min: 1 });
}

function boolean_cor(value, fieldName, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') {
    if (value === 1) return 1;
    if (value === 0) return 0;
  }

  const text = normalizeKey_cor(value);
  if (['1', 'TRUE', 'SI', 'S', 'YES', 'Y', 'X'].includes(text)) return 1;
  if (['0', 'FALSE', 'NO', 'N'].includes(text)) return 0;
  throw new Error(`${fieldName} debe representar SI/NO o 1/0.`);
}

function date_cor(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new Error(`${fieldName} debe enviarse como fecha.`);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${fieldName} no es una fecha valida.`);
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text || text === '-') return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return validateDateParts_cor(Number(iso[3]), Number(iso[2]), Number(iso[1]), fieldName);

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return validateDateParts_cor(Number(dmy[1]), Number(dmy[2]), year, fieldName);
  }

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const named = normalized.match(/^(\d{1,2})-([a-z]{3})-(\d{2}|\d{4})$/);
  if (named) {
    const months = {
      ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
      jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12
    };
    const month = months[named[2]];
    if (!month) throw new Error(`${fieldName} no es una fecha valida.`);
    const year = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3]);
    return validateDateParts_cor(Number(named[1]), month, year, fieldName);
  }

  throw new Error(`${fieldName} debe usar YYYY-MM-DD, DD/MM/YYYY o DD-mmm-AA en espanol.`);
}

function validateDateParts_cor(day, month, year, fieldName) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} no es una fecha valida.`);
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isEmptyRow_cor(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const values = Object.values(row);
  if (!values.length) return true;
  return values.every((value) => value === null || value === undefined || String(value).trim() === '');
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

function normalizeIndice_cor(row) {
  const map = buildFieldMap_cor(row);
  return {
    proyecto: requiredText_cor(field_cor(map, 'PROYECTO', 'proyecto'), 'PROYECTO', 255),
    qty: integer_cor(field_cor(map, 'QTY', 'qty'), 'QTY', { min: 0 }),
    anio: year_cor(field_cor(map, 'ANO', 'anio'), 'ANO'),
    pp: cleanText_cor(field_cor(map, 'PP', 'pp'), 50),
    mrc: cleanText_cor(field_cor(map, 'MRC', 'mrc'), 50),
    adm: userId_cor(field_cor(map, 'ADM', 'adm'), 'ADM'),
    sup: userId_cor(field_cor(map, 'SUP', 'sup'), 'SUP'),
    vend: userId_cor(field_cor(map, 'VEND', 'vend'), 'VEND'),
    edo: cleanText_cor(field_cor(map, 'EDO', 'edo'), 50),
    estatus: cleanText_cor(field_cor(map, 'ESTATUS', 'estatus'), 100),
    cobranza_usd: percentage01_cor(field_cor(map, 'COBRANZA_USD', 'cobranza_usd'), 'COBRANZA USD'),
    cobranza_mxn: percentage01_cor(field_cor(map, 'COBRANZA_MXN', 'cobranza_mxn'), 'COBRANZA MXN'),
    fianzas: boolean_cor(field_cor(map, 'FIANZAS', 'fianzas'), 'FIANZAS', 0),
    tipo_fianza: cleanText_cor(field_cor(map, 'TIPO_DE_FIANZA', 'tipo_fianza'), 255),
    repse_siroc: boolean_cor(field_cor(map, 'REPSE_SIROC', 'repse_siroc'), 'REPSE / SIROC', 0),
    activo: 1
  };
}

function normalizeFuente_cor(row) {
  const map = buildFieldMap_cor(row);
  return {
    proyecto: requiredText_cor(field_cor(map, 'PROYECTO', 'proyecto'), 'PROYECTO', 255),
    id_proyecto_origen: cleanText_cor(field_cor(map, 'ID_PROYECTO', 'id_proyecto_origen'), 100),
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
      'DIAS DE VENCIMEINTO'
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
    pp_ns: cleanText_cor(field_cor(map, 'PP_NS', 'pp_ns'), 50),
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

  if (!record.proyecto && !record.no_cot && !record.ov && !record.factura && !record.descripcion) {
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
  if (!input) {
    throw badRequest('El cuerpo debe ser un arreglo o contener registros: [...].');
  }
  if (!input.length) throw badRequest('No se recibieron registros para cargar.');
  if (input.length > MAX_RECORDS) {
    throw badRequest(`La peticion excede el maximo de ${MAX_RECORDS} registros.`);
  }

  const normalized = normalizeRows_cor(input, config.normalizer);
  const rejected = [...normalized.rejected];
  let inserted = 0;
  let linked = 0;
  let unlinked = 0;
  let ambiguous = 0;
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

            const record = { ...item.record };
            let relationState = null;

            if (typeof config.resolveRelation === 'function') {
              const relation = await config.resolveRelation(connection, record);
              record.id_indice_cor = relation.id_indice_cor;
              relationState = relation.matches === 1
                ? 'linked'
                : relation.matches > 1
                  ? 'ambiguous'
                  : 'unlinked';
            }

            await repository.insertRecord_cor(connection, config.tableName, record);
            inserted += 1;
            if (relationState === 'linked') linked += 1;
            if (relationState === 'unlinked') unlinked += 1;
            if (relationState === 'ambiguous') ambiguous += 1;

            await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
          } catch (rowError) {
            try { await connection.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_rollbackError) {}
            try { await connection.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_releaseError) {}
            rejected.push({
              fila: item.fila,
              proyecto: item.record.proyecto || null,
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
    total_recibidos: input.length,
    insertados: inserted,
    rechazados: rejected.length,
    vinculados_indice: linked,
    sin_vinculo_indice: unlinked,
    vinculo_indice_ambiguo: ambiguous,
    bloques_procesados: processedBatches,
    tamano_bloque: BATCH_SIZE,
    errores: rejected
  };
}

async function cargarIndice_cor(payload) {
  return loadTable_cor(payload, {
    kind: 'indice',
    tableName: repository.TABLES_COR.indice,
    normalizer: normalizeIndice_cor
  });
}

async function cargarFuente_cor(payload) {
  return loadTable_cor(payload, {
    kind: 'fuente',
    tableName: repository.TABLES_COR.fuente,
    normalizer: normalizeFuente_cor,
    resolveRelation: (connection, record) => repository.resolveIndiceFuente_cor(
      connection,
      record.proyecto,
      record.anio_proyecto
    )
  });
}

async function cargarAditivas_cor(payload) {
  return loadTable_cor(payload, {
    kind: 'aditivas',
    tableName: repository.TABLES_COR.aditivas,
    normalizer: normalizeAditiva_cor,
    resolveRelation: (connection, record) => repository.resolveIndiceAditiva_cor(
      connection,
      record.proyecto,
      record.pp_ns
    )
  });
}

function numberOrNull_cor(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull_cor(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function positiveId_cor(value, fieldName = 'id') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${fieldName} debe ser un entero positivo.`);
  }
  return parsed;
}

function roundAmount_cor(value) {
  const number = Number(value || 0);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function canonicalText_cor(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function isPaidStatus_cor(value) {
  const status = canonicalText_cor(value);
  if (!status) return false;
  if (status.startsWith('NO PAGAD') || status.startsWith('NO COBRAD') || status.startsWith('NO LIQUIDAD')) {
    return false;
  }
  return [
    'PAGADO',
    'PAGADA',
    'COBRADO',
    'COBRADA',
    'LIQUIDADO',
    'LIQUIDADA'
  ].includes(status);
}

function resolveVisibleUserIds_cor(informationAccess) {
  const context = informationAccess || null;
  if (!context) {
    throw httpError(403, 'No fue posible resolver el alcance de informacion de CORELLIAN.');
  }

  const domain = String(context.dominio || context.empresa || '').trim().toUpperCase();
  if (domain !== 'CORELLIAN') {
    throw httpError(403, 'El alcance de informacion no corresponde a CORELLIAN.');
  }

  if (context.requiere_filtro_usuario !== true) return null;

  return [...new Set((Array.isArray(context.usuarios_visibles) ? context.usuarios_visibles : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b);
}

function normalizeEstadosCuentaFilters_cor(query = {}) {
  const buscar = cleanText_cor(query.q ?? query.buscar, 200);
  const estatus = cleanText_cor(query.estatus, 100);

  let anio = null;
  if (query.anio !== undefined && query.anio !== null && String(query.anio).trim() !== '') {
    anio = year_cor(query.anio, 'anio');
  }

  let soloConFuente = false;
  if (query.solo_con_fuente !== undefined || query.soloConFuente !== undefined) {
    const raw = query.solo_con_fuente ?? query.soloConFuente;
    const value = canonicalText_cor(raw);
    if (['1', 'TRUE', 'SI', 'S', 'YES', 'Y'].includes(value)) {
      soloConFuente = true;
    } else if (['0', 'FALSE', 'NO', 'N', ''].includes(value)) {
      soloConFuente = false;
    } else {
      throw badRequest('solo_con_fuente debe representar SI/NO o 1/0.');
    }
  }

  return { buscar, anio, estatus, soloConFuente };
}

function serializeUsuarioReferencia_cor(row, prefix) {
  const rawId = row?.[`${prefix}_usuario_id`] ?? row?.[prefix];
  const id = integerOrNull_cor(rawId);
  if (id === null) return null;

  return {
    id_SB: id,
    nombre: cleanText_cor(row?.[`${prefix}_usuario_nombre`]),
    iniciales: cleanText_cor(row?.[`${prefix}_usuario_iniciales`])
  };
}

function serializeIndiceEstadoCuenta_cor(row) {
  const currencies = cleanText_cor(row?.monedas)
    ? String(row.monedas).split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    id_indice_cor: integerOrNull_cor(row?.id_indice_cor),
    proyecto: cleanText_cor(row?.proyecto),
    qty: integerOrNull_cor(row?.qty),
    anio: integerOrNull_cor(row?.anio),
    pp: cleanText_cor(row?.pp),
    mrc: cleanText_cor(row?.mrc),
    adm: integerOrNull_cor(row?.adm),
    sup: integerOrNull_cor(row?.sup),
    vend: integerOrNull_cor(row?.vend),
    adm_usuario: serializeUsuarioReferencia_cor(row, 'adm'),
    sup_usuario: serializeUsuarioReferencia_cor(row, 'sup'),
    vend_usuario: serializeUsuarioReferencia_cor(row, 'vend'),
    edo: cleanText_cor(row?.edo),
    estatus: cleanText_cor(row?.estatus),
    cobranza_usd: numberOrNull_cor(row?.cobranza_usd),
    cobranza_mxn: numberOrNull_cor(row?.cobranza_mxn),
    fianzas: Number(row?.fianzas || 0) === 1,
    tipo_fianza: cleanText_cor(row?.tipo_fianza),
    repse_siroc: Number(row?.repse_siroc || 0) === 1,
    registros_estado_cuenta: integerOrNull_cor(row?.registros_estado_cuenta) || 0,
    monedas: currencies,
    estado_cuenta_disponible: (integerOrNull_cor(row?.registros_estado_cuenta) || 0) > 0
  };
}

function serializeFuenteEstadoCuenta_cor(row) {
  const total = numberOrNull_cor(row?.total);
  const pagoTotal = numberOrNull_cor(row?.pago_total);
  const pagado = isPaidStatus_cor(row?.estatus_factura);
  const pagoContabilizado = pagado
    ? (pagoTotal !== null ? pagoTotal : (total !== null ? total : 0))
    : 0;
  const pendiente = total === null
    ? null
    : Math.max(roundAmount_cor(total - pagoContabilizado), 0);

  return {
    id_fuente_cor: integerOrNull_cor(row?.id_fuente_cor),
    id_indice_cor: integerOrNull_cor(row?.id_indice_cor),
    proyecto: cleanText_cor(row?.proyecto),
    id_proyecto_origen: cleanText_cor(row?.id_proyecto_origen),
    porcentaje: numberOrNull_cor(row?.porcentaje),
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
    anio_proyecto: integerOrNull_cor(row?.anio_proyecto),
    es_pagado: pagado,
    pago_contabilizado: roundAmount_cor(pagoContabilizado),
    pendiente_calculado: pendiente
  };
}

function indexCollectionPercentage_cor(project, currency) {
  const code = String(currency || '').trim().toUpperCase();
  if (code === 'USD') return project.cobranza_usd;
  if (code === 'MXN') return project.cobranza_mxn;
  return null;
}

function buildEstadoCuentaSummary_cor(project, rows) {
  const buckets = new Map();

  rows.forEach((row) => {
    const currency = row.moneda || 'SIN_MONEDA';
    if (!buckets.has(currency)) {
      buckets.set(currency, {
        moneda: currency,
        registros: 0,
        pagados: 0,
        no_pagados: 0,
        subtotal: 0,
        iva: 0,
        total: 0,
        cobrado: 0,
        pendiente: 0
      });
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
  const monedas = [...buckets.values()]
    .map((bucket) => {
      const total = roundAmount_cor(bucket.total);
      const cobrado = roundAmount_cor(bucket.cobrado);
      const porcentajeCalculado = total > 0 ? cobrado / total : null;
      return {
        ...bucket,
        subtotal: roundAmount_cor(bucket.subtotal),
        iva: roundAmount_cor(bucket.iva),
        total,
        cobrado,
        pendiente: roundAmount_cor(bucket.pendiente),
        porcentaje_cobrado_calculado: porcentajeCalculado === null
          ? null
          : Math.round(porcentajeCalculado * 1000000) / 1000000,
        porcentaje_cobranza_indice: indexCollectionPercentage_cor(project, bucket.moneda)
      };
    })
    .sort((a, b) => {
      const left = priority.get(a.moneda) ?? 50;
      const right = priority.get(b.moneda) ?? 50;
      if (left !== right) return left - right;
      return a.moneda.localeCompare(b.moneda);
    });

  return {
    registros: rows.length,
    monedas,
    nota: 'Los importes se resumen por moneda; no se suman monedas diferentes.'
  };
}

function buildEstadoCuentaQuality_cor(project, rows, summary) {
  let filasSinMoneda = 0;
  let filasTotalInconsistente = 0;
  let filasPagadasSinFecha = 0;

  rows.forEach((row) => {
    if (!row.moneda) filasSinMoneda += 1;
    if (row.es_pagado && !row.fecha_pago) filasPagadasSinFecha += 1;

    if (row.subtotal !== null && row.iva !== null && row.total !== null) {
      const difference = Math.abs(roundAmount_cor(row.subtotal + row.iva - row.total));
      if (difference > 0.05) filasTotalInconsistente += 1;
    }
  });

  const comparacion = summary.monedas
    .filter((item) => ['USD', 'MXN'].includes(item.moneda))
    .map((item) => {
      const indexPct = item.porcentaje_cobranza_indice;
      const calcPct = item.porcentaje_cobrado_calculado;
      return {
        moneda: item.moneda,
        porcentaje_indice: indexPct,
        porcentaje_calculado_fuente: calcPct,
        diferencia: indexPct === null || calcPct === null
          ? null
          : Math.round((indexPct - calcPct) * 1000000) / 1000000
      };
    });

  return {
    tiene_estado_cuenta: rows.length > 0,
    filas_sin_moneda: filasSinMoneda,
    filas_total_inconsistente: filasTotalInconsistente,
    filas_pagadas_sin_fecha_pago: filasPagadasSinFecha,
    comparacion_porcentaje_indice_fuente: comparacion,
    referencia_proyecto: {
      cobranza_usd: project.cobranza_usd,
      cobranza_mxn: project.cobranza_mxn
    }
  };
}

async function listarEstadosCuenta_cor(query = {}, informationAccess) {
  const filters = normalizeEstadosCuentaFilters_cor(query);
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const connection = await repository.getConnection_cor();

  try {
    const rows = await repository.listEstadosCuenta_cor(connection, filters, visibleUserIds);
    const data = rows.map(serializeIndiceEstadoCuenta_cor);

    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.estados_cuenta,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      total: data.length,
      filtros: {
        q: filters.buscar,
        anio: filters.anio,
        estatus: filters.estatus,
        solo_con_fuente: filters.soloConFuente
      },
      data
    };
  } finally {
    connection.release();
  }
}

async function detalleEstadoCuenta_cor(idIndiceCorValue, informationAccess) {
  const idIndiceCor = positiveId_cor(idIndiceCorValue, 'idIndiceCor');
  const visibleUserIds = resolveVisibleUserIds_cor(informationAccess);
  const connection = await repository.getConnection_cor();

  try {
    const indexRow = await repository.getIndiceEstadoCuenta_cor(connection, idIndiceCor, visibleUserIds);
    if (!indexRow) {
      throw httpError(404, 'Proyecto no encontrado o fuera del alcance autorizado.');
    }

    const sourceRows = await repository.listFuenteEstadoCuenta_cor(connection, idIndiceCor);
    const project = serializeIndiceEstadoCuenta_cor(indexRow);
    const detailRows = sourceRows.map(serializeFuenteEstadoCuenta_cor);
    const summary = buildEstadoCuentaSummary_cor(project, detailRows);
    project.registros_estado_cuenta = detailRows.length;
    project.monedas = summary.monedas
      .map((item) => item.moneda)
      .filter((currency) => currency !== 'SIN_MONEDA');
    project.estado_cuenta_disponible = detailRows.length > 0;
    const quality = buildEstadoCuentaQuality_cor(project, detailRows, summary);

    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.estado_cuenta_detalle,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      proyecto: project,
      resumen: summary,
      calidad: quality,
      estado_cuenta: detailRows
    };
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
    soloPendientes: booleanQuery_cor(
      query.solo_pendientes ?? query.soloPendientes,
      'solo_pendientes',
      false
    )
  };

  if (query.anio !== undefined && query.anio !== null && String(query.anio).trim() !== '') {
    filters.anio = year_cor(query.anio, 'anio');
  } else {
    filters.anio = null;
  }

  const page = integer_cor(query.page ?? query.pagina, 'page', { min: 1 }) || 1;
  const pageSize = integer_cor(query.page_size ?? query.pageSize ?? query.tamano, 'page_size', {
    min: 1,
    max: 100
  }) || 50;

  return { ...filters, page, pageSize };
}

function serializeAditiva_cor(row) {
  return {
    id_aditiva_cor: integerOrNull_cor(row?.id_aditiva_cor),
    id_indice_cor: integerOrNull_cor(row?.id_indice_cor),
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
    vinculo_indice: integerOrNull_cor(row?.id_indice_cor) !== null,
    indice: integerOrNull_cor(row?.id_indice_cor) === null
      ? null
      : {
          id_indice_cor: integerOrNull_cor(row?.id_indice_cor),
          proyecto: cleanText_cor(row?.indice_proyecto),
          pp: cleanText_cor(row?.indice_pp),
          anio: integerOrNull_cor(row?.indice_anio)
        }
  };
}

function countByText_cor(rows, fieldName) {
  const counts = new Map();
  rows.forEach((row) => {
    const value = cleanText_cor(row?.[fieldName]);
    if (!value) return;
    const key = value;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([valor, registros]) => ({ valor, registros }))
    .sort((a, b) => b.registros - a.registros || a.valor.localeCompare(b.valor, 'es'));
}

function buildAditivasSummary_cor(rows) {
  const buckets = new Map();
  let conPendiente = 0;
  let vinculadas = 0;
  let sinVinculo = 0;

  rows.forEach((row) => {
    const currency = cleanText_cor(row?.moneda)?.toUpperCase() || 'SIN_MONEDA';
    if (!buckets.has(currency)) {
      buckets.set(currency, {
        moneda: currency,
        registros: 0,
        monto_subtotal: 0,
        monto_iva: 0,
        monto_total: 0,
        gasto_subtotal: 0,
        diferencia: 0,
        monto_pagado: 0,
        pagado_sin_iva: 0,
        pendiente_pago: 0
      });
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
    if (integerOrNull_cor(row?.id_indice_cor) === null) sinVinculo += 1;
    else vinculadas += 1;
  });

  const porMoneda = [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      monto_subtotal: roundAmount_cor(bucket.monto_subtotal),
      monto_iva: roundAmount_cor(bucket.monto_iva),
      monto_total: roundAmount_cor(bucket.monto_total),
      gasto_subtotal: roundAmount_cor(bucket.gasto_subtotal),
      diferencia: roundAmount_cor(bucket.diferencia),
      monto_pagado: roundAmount_cor(bucket.monto_pagado),
      pagado_sin_iva: roundAmount_cor(bucket.pagado_sin_iva),
      pendiente_pago: roundAmount_cor(bucket.pendiente_pago)
    }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda));

  return {
    registros: rows.length,
    con_pendiente: conPendiente,
    vinculadas_indice: vinculadas,
    sin_vinculo_indice: sinVinculo,
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

  return [...values].sort((a, b) => numeric
    ? Number(b) - Number(a)
    : String(a).localeCompare(String(b), 'es'));
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
    const pageRows = filteredRows.slice(start, start + filters.pageSize);

    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.aditivas,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      filtros: {
        q: filters.buscar,
        anio: filters.anio,
        departamento: filters.departamento,
        categoria: filters.categoria,
        firma_cot: filters.firmaCot,
        estatus_trabajos: filters.estatusTrabajos,
        estatus_cobranza: filters.estatusCobranza,
        sup: filters.supervisor,
        moneda: filters.moneda,
        solo_pendientes: filters.soloPendientes
      },
      paginacion: {
        pagina: page,
        tamano: filters.pageSize,
        total_registros: total,
        total_paginas: totalPages
      },
      resumen: buildAditivasSummary_cor(filteredRows),
      catalogos: buildAditivasCatalogs_cor(catalogRows),
      data: pageRows.map(serializeAditiva_cor)
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
    if (!row) {
      throw httpError(404, 'Aditiva no encontrada o fuera del alcance autorizado.');
    }

    return {
      ok: true,
      source: 'aiven',
      domain: 'CORELLIAN',
      route: ROUTES_COR.aditiva_detalle,
      scope_aplicado: visibleUserIds === null ? 'DOMINIO_COMPLETO' : 'USUARIOS_VISIBLES',
      aditiva: serializeAditiva_cor(row)
    };
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
  cargarIndice_cor,
  cargarFuente_cor,
  cargarAditivas_cor,
  listarEstadosCuenta_cor,
  detalleEstadoCuenta_cor,
  listarAditivas_cor,
  detalleAditiva_cor,
  getAdeudosContractuales_cor
};
