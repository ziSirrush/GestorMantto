'use strict';

const db = require('../../config/db');

const TABLE_PAGOS_COR = 'cobranza_pagos_cor';
const TABLE_FACTURAS_COR = 'cobranza_facturas_cor';
const TABLE_REL_PAGOS_COR = 'cobranza_rel_pagos';

const PAGO_COLUMNS_COR = Object.freeze([
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
  'importe_complemento_pago',
  'id_pp'
]);

function normalizedBusinessKeySql_cor(expression) {
  return `REGEXP_REPLACE(UPPER(TRIM(COALESCE(${expression}, ''))), '[[:space:]_-]*MXN$', '')`;
}

function valuesFromRecord_cor(record) {
  return PAGO_COLUMNS_COR.map((column) => (
    Object.prototype.hasOwnProperty.call(record || {}, column)
      ? record[column]
      : null
  ));
}

async function getConnection_cor() {
  return db.getConnection();
}

async function lockExistingPagosByIds_cor(connection, ids) {
  const normalizedIds = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map(Number)
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  )];

  if (!normalizedIds.length) return new Set();

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT id_pago_cor
       FROM ${TABLE_PAGOS_COR}
      WHERE id_pago_cor IN (${placeholders})
      FOR UPDATE`,
    normalizedIds
  );

  return new Set(
    rows
      .map((row) => Number(row.id_pago_cor))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  );
}

async function insertPago_cor(connection, idPago, record) {
  const columns = ['id_pago_cor', ...PAGO_COLUMNS_COR];
  const placeholders = columns.map(() => '?').join(', ');
  const values = [idPago, ...valuesFromRecord_cor(record)];

  const [result] = await connection.query(
    `INSERT INTO ${TABLE_PAGOS_COR} (${columns.join(', ')})
     VALUES (${placeholders})`,
    values
  );

  return result;
}

async function updatePagoIfChanged_cor(connection, idPago, record) {
  const values = valuesFromRecord_cor(record);
  const assignments = PAGO_COLUMNS_COR
    .map((column) => `${column} = ?`)
    .join(', ');
  const differences = PAGO_COLUMNS_COR
    .map((column) => `NOT (${column} <=> ?)`)
    .join(' OR ');

  const [result] = await connection.query(
    `UPDATE ${TABLE_PAGOS_COR}
        SET ${assignments}
      WHERE id_pago_cor = ?
        AND (${differences})`,
    [...values, idPago, ...values]
  );

  return result;
}

async function listPagosEstadoCuenta_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT p.id_pago_cor,
            p.no_factura,
            NULLIF(TRIM(p.id_pp), '') AS id_pp,
            p.complemento_pago,
            DATE_FORMAT(p.fecha_complemento_pago, '%Y-%m-%d') AS fecha_pago,
            p.importe_complemento_pago
       FROM ${TABLE_PAGOS_COR} p
      WHERE ${normalizedBusinessKeySql_cor('p.id_pp')} = ${normalizedBusinessKeySql_cor('?')}
        AND EXISTS (
        SELECT 1 FROM ${TABLE_FACTURAS_COR} f
         WHERE f.activo = 1
           AND UPPER(TRIM(f.ppns)) = UPPER(TRIM(?))
           AND ${normalizedBusinessKeySql_cor('f.factura')} = ${normalizedBusinessKeySql_cor('p.no_factura')}
      )
      ORDER BY p.id_pago_cor ASC`,
    [ppns, ppns]
  );
  return rows;
}

async function listRelacionesEstadoCuenta_cor(connection, ppns) {
  const [rows] = await connection.query(
    `SELECT r.id_factura_cor, r.id_pago_cor, r.importe_aplicado
       FROM ${TABLE_REL_PAGOS_COR} r
       JOIN ${TABLE_FACTURAS_COR} f ON f.id_factura_cor = r.id_factura_cor
       JOIN ${TABLE_PAGOS_COR} p ON p.id_pago_cor = r.id_pago_cor
      WHERE f.activo = 1
        AND UPPER(TRIM(f.ppns)) = UPPER(TRIM(?))
        AND ${normalizedBusinessKeySql_cor('p.id_pp')} = ${normalizedBusinessKeySql_cor('?')}
        AND ${normalizedBusinessKeySql_cor('f.factura')} = ${normalizedBusinessKeySql_cor('p.no_factura')}
      ORDER BY r.id_pago_cor, r.id_factura_cor`,
    [ppns, ppns]
  );
  return rows;
}

async function lockPagoEstadoCuenta_cor(connection, idPagoCor, ppns) {
  const [rows] = await connection.query(
    `SELECT p.id_pago_cor, p.no_factura, NULLIF(TRIM(p.id_pp), '') AS id_pp,
            p.importe_complemento_pago
       FROM ${TABLE_PAGOS_COR} p
      WHERE p.id_pago_cor = ?
        AND ${normalizedBusinessKeySql_cor('p.id_pp')} = ${normalizedBusinessKeySql_cor('?')}
        AND EXISTS (
          SELECT 1 FROM ${TABLE_FACTURAS_COR} f
           WHERE f.activo = 1
             AND UPPER(TRIM(f.ppns)) = UPPER(TRIM(?))
             AND ${normalizedBusinessKeySql_cor('f.factura')} = ${normalizedBusinessKeySql_cor('p.no_factura')}
        )
      FOR UPDATE`,
    [idPagoCor, ppns, ppns]
  );
  return rows[0] || null;
}

async function lockFacturaEstadoCuenta_cor(connection, idFacturaCor, ppns) {
  const [rows] = await connection.query(
    `SELECT id_factura_cor, factura, total
       FROM ${TABLE_FACTURAS_COR}
      WHERE id_factura_cor = ? AND activo = 1
        AND UPPER(TRIM(ppns)) = UPPER(TRIM(?))
      FOR UPDATE`,
    [idFacturaCor, ppns]
  );
  return rows[0] || null;
}

async function listRelacionesPagoForUpdate_cor(connection, idPagoCor) {
  const [rows] = await connection.query(
    `SELECT r.id_factura_cor, r.id_pago_cor, r.importe_aplicado, f.ppns
       FROM ${TABLE_REL_PAGOS_COR} r
       JOIN ${TABLE_FACTURAS_COR} f ON f.id_factura_cor = r.id_factura_cor
      WHERE r.id_pago_cor = ?
      FOR UPDATE`,
    [idPagoCor]
  );
  return rows;
}

async function listRelacionesFacturaForUpdate_cor(connection, idFacturaCor) {
  const [rows] = await connection.query(
    `SELECT id_pago_cor, importe_aplicado
       FROM ${TABLE_REL_PAGOS_COR}
      WHERE id_factura_cor = ?
      FOR UPDATE`,
    [idFacturaCor]
  );
  return rows;
}

async function guardarRelacionPagoFactura_cor(connection, idPagoCor, idFacturaCor, importeAplicado, existe) {
  if (existe) {
    await connection.query(
      `UPDATE ${TABLE_REL_PAGOS_COR} SET importe_aplicado = ?
        WHERE id_pago_cor = ? AND id_factura_cor = ?`,
      [importeAplicado, idPagoCor, idFacturaCor]
    );
    return;
  }
  await connection.query(
    `INSERT INTO ${TABLE_REL_PAGOS_COR} (id_factura_cor, id_pago_cor, importe_aplicado)
     VALUES (?, ?, ?)`,
    [idFacturaCor, idPagoCor, importeAplicado]
  );
}

async function quitarRelacionPagoFactura_cor(connection, idPagoCor, idFacturaCor) {
  const [result] = await connection.query(
    `DELETE FROM ${TABLE_REL_PAGOS_COR}
      WHERE id_pago_cor = ? AND id_factura_cor = ?`,
    [idPagoCor, idFacturaCor]
  );
  return result.affectedRows || 0;
}

module.exports = {
  TABLE_PAGOS_COR,
  PAGO_COLUMNS_COR,
  getConnection_cor,
  lockExistingPagosByIds_cor,
  insertPago_cor,
  updatePagoIfChanged_cor,
  listPagosEstadoCuenta_cor,
  listRelacionesEstadoCuenta_cor,
  lockPagoEstadoCuenta_cor,
  lockFacturaEstadoCuenta_cor,
  listRelacionesPagoForUpdate_cor,
  listRelacionesFacturaForUpdate_cor,
  guardarRelacionPagoFactura_cor,
  quitarRelacionPagoFactura_cor
};
