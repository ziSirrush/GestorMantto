'use strict';

// [Aster | 2026-10-02 | ASTER-MG | COBRANZA COR FASE 6 EDITAR ELIMINAR V001]
// Reutiliza las tablas existentes. No crea esquema ni duplica relaciones.

const TABLE_PAGOS = 'cobranza_pagos_cor';
const TABLE_FACTURAS = 'cobranza_facturas_cor';
const TABLE_REL = 'cobranza_rel_pagos';

function normalizedKeySql_cor(expression) {
  return `UPPER(TRIM(COALESCE(${expression}, '')))`;
}

async function lockFactura_cor(connection, ppns, idFacturaCor) {
  const [rows] = await connection.query(
    `SELECT id_factura_cor, ppns, tipo_concepto, id_fuente_cor, id_aditiva_cor,
            factura, DATE_FORMAT(fecha_factura, '%Y-%m-%d') AS fecha_factura,
            moneda, subtotal, iva, total, estatus_factura,
            DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
            estatus_cobranza, activo
       FROM ${TABLE_FACTURAS}
      WHERE id_factura_cor = ?
        AND activo = 1
        AND ${normalizedKeySql_cor('ppns')} = ${normalizedKeySql_cor('?')}
      FOR UPDATE`,
    [idFacturaCor, ppns]
  );
  return rows[0] || null;
}

async function updateFactura_cor(connection, ppns, idFacturaCor, record) {
  const [result] = await connection.query(
    `UPDATE ${TABLE_FACTURAS}
        SET tipo_concepto = ?,
            id_fuente_cor = ?,
            id_aditiva_cor = ?,
            factura = ?,
            fecha_factura = ?,
            moneda = ?,
            subtotal = ?,
            iva = ?,
            total = ?,
            fecha_vencimiento = ?,
            updated_by = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id_factura_cor = ?
        AND activo = 1
        AND ${normalizedKeySql_cor('ppns')} = ${normalizedKeySql_cor('?')}`,
    [
      record.tipo_concepto,
      record.id_fuente_cor,
      record.id_aditiva_cor,
      record.factura,
      record.fecha_factura,
      record.moneda,
      record.subtotal,
      record.iva,
      record.total,
      record.fecha_vencimiento,
      record.updated_by,
      idFacturaCor,
      ppns
    ]
  );
  return result;
}

async function deleteFacturaRelations_cor(connection, idFacturaCor) {
  const [result] = await connection.query(
    `DELETE FROM ${TABLE_REL} WHERE id_factura_cor = ?`,
    [idFacturaCor]
  );
  return Number(result.affectedRows || 0);
}

async function deleteFactura_cor(connection, ppns, idFacturaCor) {
  const [result] = await connection.query(
    `DELETE FROM ${TABLE_FACTURAS}
      WHERE id_factura_cor = ?
        AND activo = 1
        AND ${normalizedKeySql_cor('ppns')} = ${normalizedKeySql_cor('?')}`,
    [idFacturaCor, ppns]
  );
  return Number(result.affectedRows || 0);
}

async function lockPago_cor(connection, ppns, idPagoCor) {
  const [rows] = await connection.query(
    `SELECT p.id_pago_cor,
            p.no_factura,
            p.complemento_pago,
            DATE_FORMAT(p.fecha_complemento_pago, '%Y-%m-%d') AS fecha_complemento_pago,
            p.importe_complemento_pago
       FROM ${TABLE_PAGOS} p
      WHERE p.id_pago_cor = ?
        AND (
          EXISTS (
            SELECT 1
              FROM ${TABLE_FACTURAS} f
             WHERE f.activo = 1
               AND ${normalizedKeySql_cor('f.ppns')} = ${normalizedKeySql_cor('?')}
               AND ${normalizedKeySql_cor('f.factura')} = ${normalizedKeySql_cor('p.no_factura')}
          )
          OR EXISTS (
            SELECT 1
              FROM ${TABLE_REL} r
              JOIN ${TABLE_FACTURAS} f ON f.id_factura_cor = r.id_factura_cor
             WHERE r.id_pago_cor = p.id_pago_cor
               AND f.activo = 1
               AND ${normalizedKeySql_cor('f.ppns')} = ${normalizedKeySql_cor('?')}
          )
        )
      FOR UPDATE`,
    [idPagoCor, ppns, ppns]
  );
  return rows[0] || null;
}

async function sumPagoAplicado_cor(connection, idPagoCor) {
  const [rows] = await connection.query(
    `SELECT COALESCE(SUM(importe_aplicado), 0) AS aplicado
       FROM ${TABLE_REL}
      WHERE id_pago_cor = ?`,
    [idPagoCor]
  );
  return Number(rows[0] && rows[0].aplicado || 0);
}

async function updatePago_cor(connection, idPagoCor, record) {
  const [result] = await connection.query(
    `UPDATE ${TABLE_PAGOS}
        SET no_factura = ?,
            complemento_pago = ?,
            fecha_complemento_pago = ?,
            importe_complemento_pago = ?
      WHERE id_pago_cor = ?`,
    [
      record.no_factura,
      record.complemento_pago,
      record.fecha_complemento_pago,
      record.importe_complemento_pago,
      idPagoCor
    ]
  );
  return result;
}

async function listPagoFacturasForUpdate_cor(connection, idPagoCor) {
  const [rows] = await connection.query(
    `SELECT r.id_factura_cor, f.total
       FROM ${TABLE_REL} r
       JOIN ${TABLE_FACTURAS} f ON f.id_factura_cor = r.id_factura_cor
      WHERE r.id_pago_cor = ?
      FOR UPDATE`,
    [idPagoCor]
  );
  return rows;
}

async function deletePagoRelations_cor(connection, idPagoCor) {
  const [result] = await connection.query(
    `DELETE FROM ${TABLE_REL} WHERE id_pago_cor = ?`,
    [idPagoCor]
  );
  return Number(result.affectedRows || 0);
}

async function deletePago_cor(connection, idPagoCor) {
  const [result] = await connection.query(
    `DELETE FROM ${TABLE_PAGOS} WHERE id_pago_cor = ?`,
    [idPagoCor]
  );
  return Number(result.affectedRows || 0);
}

async function recalcFacturaEstatus_cor(connection, idFacturaCor) {
  const [rows] = await connection.query(
    `SELECT f.total,
            COALESCE(SUM(r.importe_aplicado), 0) AS aplicado
       FROM ${TABLE_FACTURAS} f
       LEFT JOIN ${TABLE_REL} r ON r.id_factura_cor = f.id_factura_cor
      WHERE f.id_factura_cor = ?
        AND f.activo = 1
      GROUP BY f.id_factura_cor, f.total`,
    [idFacturaCor]
  );
  if (!rows.length) return null;
  const total = Number(rows[0].total || 0);
  const aplicado = Number(rows[0].aplicado || 0);
  const estatus = total > 0 && aplicado + 0.005 >= total ? 'Pagado' : 'No pagado';
  await connection.query(
    `UPDATE ${TABLE_FACTURAS}
        SET estatus_factura = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id_factura_cor = ? AND activo = 1`,
    [estatus, idFacturaCor]
  );
  return estatus;
}

module.exports = {
  lockFactura_cor,
  updateFactura_cor,
  deleteFacturaRelations_cor,
  deleteFactura_cor,
  lockPago_cor,
  sumPagoAplicado_cor,
  updatePago_cor,
  listPagoFacturasForUpdate_cor,
  deletePagoRelations_cor,
  deletePago_cor,
  recalcFacturaEstatus_cor
};
