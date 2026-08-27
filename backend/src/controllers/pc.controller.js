// [Aster | 2026-08-12 | ASTER-MG | FASE: PC_BACKEND_V001]
const db = require('../config/db');

const TABLE_NAME = 'pc';
const KEY_FIELD = 'id_pc';

const DB_FIELDS = [
  'zona_adm',
  'proyecto',
  'cliente',
  'ov',
  'fecha_ov',
  'mes_ov',
  'concepto',
  'precio_venta',
  'pagado_iva',
  'no_pagado_iva',
  'venta_total',
  'facturas_pendientes_pago',
  'adeudo',
  'tipo_pago',
  'no_factura',
  'fecha_factura',
  'mes_factura',
  'terminos',
  'fecha_vencimiento',
  'dias_vencimiento',
  'estatus',
  'estatus_administrativo',
  'estatus_operativo',
  'fecha_pago',
  'refacturacion_sustitucion',
  'zona_operativa',
  'estado',
  'comentarios_cobranza',
  'estatus_cartera'
];

const NUMERIC_FIELDS = new Set([
  'precio_venta',
  'pagado_iva',
  'no_pagado_iva',
  'venta_total',
  'facturas_pendientes_pago',
  'adeudo',
  'dias_vencimiento'
]);

const DATE_FIELDS = new Set([
  'fecha_ov',
  'fecha_factura',
  'fecha_vencimiento',
  'fecha_pago'
]);

function cleanValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

function normalizeId(value) {
  const cleaned = cleanValue(value);
  if (cleaned === null) return null;

  const text = String(cleaned).trim();
  if (!/^\d+$/.test(text)) return null;
  if (/^0+$/.test(text)) return null;

  return text;
}

function normalizeDate(value) {
  const cleaned = cleanValue(value);
  if (cleaned === null) return null;

  if (cleaned instanceof Date && !Number.isNaN(cleaned.getTime())) {
    return cleaned.toISOString().slice(0, 10);
  }

  const text = String(cleaned).trim();
  if (!text) return null;

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return text;
}

function normalizeIncomingRow(row) {
  const incoming = {
    id_pc: normalizeId(row.id_pc)
  };

  for (const field of DB_FIELDS) {
    const value = cleanValue(row[field]);
    incoming[field] = DATE_FIELDS.has(field) ? normalizeDate(value) : value;
  }

  return incoming;
}

function normalizeNumericComparable(value) {
  if (value === undefined || value === null || value === '') return null;

  const text = String(value).trim();
  if (!text) return null;

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    return text;
  }

  let normalized = text.replace(/^\+/, '');
  let sign = '';

  if (normalized.startsWith('-')) {
    sign = '-';
    normalized = normalized.slice(1);
  }

  let [integerPart, decimalPart = ''] = normalized.split('.');
  integerPart = integerPart.replace(/^0+(?=\d)/, '');
  decimalPart = decimalPart.replace(/0+$/, '');

  if (!integerPart) integerPart = '0';
  if (integerPart === '0' && !decimalPart) sign = '';

  return sign + integerPart + (decimalPart ? `.${decimalPart}` : '');
}

function comparable(field, value) {
  if (value === undefined || value === null || value === '') return null;

  if (NUMERIC_FIELDS.has(field)) {
    return normalizeNumericComparable(value);
  }

  if (DATE_FIELDS.has(field)) {
    return normalizeDate(value);
  }

  return String(value);
}

function rowChanged(existing, incoming) {
  return DB_FIELDS.some(
    field => comparable(field, existing[field]) !== comparable(field, incoming[field])
  );
}

async function syncPc(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar pc.'
    });
  }

  const conn = await db.getConnection();
  const summary = {
    received: rows.length,
    processed: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    rejected: 0,
    errors: []
  };

  try {
    await conn.beginTransaction();

    for (let index = 0; index < rows.length; index += 1) {
      const incoming = normalizeIncomingRow(rows[index] || {});
      const savepoint = `pc_row_${index}`;

      if (!incoming.id_pc) {
        summary.rejected += 1;
        summary.errors.push({
          index,
          message: 'id_pc invalido o ausente.'
        });
        continue;
      }

      try {
        await conn.query(`SAVEPOINT ${savepoint}`);

        const [existingRows] = await conn.query(
          `SELECT ${KEY_FIELD}, ${DB_FIELDS.join(', ')}
           FROM ${TABLE_NAME}
           WHERE ${KEY_FIELD} = ?
           LIMIT 1`,
          [incoming.id_pc]
        );

        if (!existingRows.length) {
          const columns = [KEY_FIELD, ...DB_FIELDS];
          const placeholders = columns.map(() => '?').join(', ');
          const values = [
            incoming.id_pc,
            ...DB_FIELDS.map(field => incoming[field])
          ];

          await conn.query(
            `INSERT INTO ${TABLE_NAME} (${columns.join(', ')}) VALUES (${placeholders})`,
            values
          );

          summary.inserted += 1;
          summary.processed += 1;
          await conn.query(`RELEASE SAVEPOINT ${savepoint}`);
          continue;
        }

        if (!rowChanged(existingRows[0], incoming)) {
          summary.unchanged += 1;
          summary.processed += 1;
          await conn.query(`RELEASE SAVEPOINT ${savepoint}`);
          continue;
        }

        const assignments = DB_FIELDS.map(field => `${field} = ?`).join(', ');
        const values = [
          ...DB_FIELDS.map(field => incoming[field]),
          incoming.id_pc
        ];

        await conn.query(
          `UPDATE ${TABLE_NAME}
           SET ${assignments}
           WHERE ${KEY_FIELD} = ?`,
          values
        );

        summary.updated += 1;
        summary.processed += 1;
        await conn.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (rowError) {
        try { await conn.query(`ROLLBACK TO SAVEPOINT ${savepoint}`); } catch (_rollbackError) {}
        try { await conn.query(`RELEASE SAVEPOINT ${savepoint}`); } catch (_releaseError) {}

        summary.rejected += 1;
        summary.errors.push({
          index,
          id_pc: incoming.id_pc,
          message: rowError.message
        });
      }
    }

    await conn.commit();

    return res.json({
      ok: true,
      message: 'PC sincronizada correctamente.',
      ...summary
    });
  } catch (error) {
    await conn.rollback();

    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando pc.',
      error: error.message,
      ...summary
    });
  } finally {
    conn.release();
  }
}

module.exports = {
  syncPc
};
