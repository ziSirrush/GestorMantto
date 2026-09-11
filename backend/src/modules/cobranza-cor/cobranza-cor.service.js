'use strict';

const repository = require('./cobranza-cor.repository');

const BATCH_SIZE = 300;
const MAX_RECORDS = 5000;

const ROUTES_COR = Object.freeze({
  carga_indice: '/api/cobranza-cor/carga/indice',
  carga_fuente: '/api/cobranza-cor/carga/fuente',
  carga_aditivas: '/api/cobranza-cor/carga/aditivas',
  aditivas: '/api/cobranza-cor/aditivas',
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
  if (!text) return null;
  text = text.replace(/\$/g, '').replace(/\s+/g, '');

  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
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
  if (!text) return null;
  if (text.endsWith('%')) {
    const number = decimal_cor(text.slice(0, -1), fieldName);
    return number === null ? null : number / 100;
  }
  return decimal_cor(text, fieldName);
}

function integer_cor(value, fieldName, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === '') return null;
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
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
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

  throw new Error(`${fieldName} debe usar YYYY-MM-DD, ISO o DD/MM/YYYY.`);
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
    adm: cleanText_cor(field_cor(map, 'ADM', 'adm'), 50),
    sup: cleanText_cor(field_cor(map, 'SUP', 'sup'), 50),
    vend: cleanText_cor(field_cor(map, 'VEND', 'vend'), 50),
    edo: cleanText_cor(field_cor(map, 'EDO', 'edo'), 50),
    estatus: cleanText_cor(field_cor(map, 'ESTATUS', 'estatus'), 100),
    cobranza_usd: decimal_cor(field_cor(map, 'COBRANZA_USD', 'cobranza_usd'), 'COBRANZA USD'),
    cobranza_mxn: decimal_cor(field_cor(map, 'COBRANZA_MXN', 'cobranza_mxn'), 'COBRANZA MXN'),
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
    porcentaje: percent_cor(field_cor(map, 'PCT', 'porcentaje'), '%'),
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
    gasto_ejercido: decimal_cor(field_cor(map, 'GASTO_EJERCIDO', 'gasto_ejercido'), 'GASTO EJERCIDO'),
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

function pendingFunctionalRead_cor(kind) {
  const config = kind === 'adeudos_contractuales'
    ? {
        route: ROUTES_COR.adeudos_contractuales,
        label: 'Adeudos contractuales',
        sourceTable: repository.TABLES_COR.fuente
      }
    : {
        route: ROUTES_COR.aditivas,
        label: 'Aditivas',
        sourceTable: repository.TABLES_COR.aditivas
      };

  return {
    available: false,
    supported: false,
    domain: 'CORELLIAN',
    route: config.route,
    source_table: config.sourceTable,
    status: 'PENDING_COBRANZA_COR_FUNCTIONAL_READ',
    label: config.label,
    message: `La tabla ${config.sourceTable} ya existe; la lectura funcional de ${config.label} se implementa en una fase posterior.`,
    data: []
  };
}

function getAditivas_cor() {
  return pendingFunctionalRead_cor('aditivas');
}

function getAdeudosContractuales_cor() {
  return pendingFunctionalRead_cor('adeudos_contractuales');
}

module.exports = {
  ROUTES_COR,
  cargarIndice_cor,
  cargarFuente_cor,
  cargarAditivas_cor,
  getAditivas_cor,
  getAdeudosContractuales_cor
};
