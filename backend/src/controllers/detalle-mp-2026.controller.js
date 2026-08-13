// [Aster | 2026-08-12 | ASTER-MG | FASE: DETALLE_MP_2026_BACKEND_V001]
const db = require('../config/db');

const TABLE_NAME = 'detalle_mp_2026';
const KEY_FIELD = 'id_dmp';

const DB_FIELDS = [
  'zona_adm',
  'proyecto',
  'idns',
  'cliente',
  'periodicidad',
  'momento_facturacion',
  'estado',
  'z_oper',
  'forma_pago',
  'iguala',
  'condiciones_pago',
  'monto_anual',
  'pendiente_corriente',
  'pendiente_vencido',
  'pendiente',
  'facturas_pendientes'
];

const NUMERIC_FIELDS = new Set([
  'iguala',
  'monto_anual',
  'pendiente_corriente',
  'pendiente_vencido',
  'pendiente',
  'facturas_pendientes'
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

function normalizeIncomingRow(row) {
  const incoming = {
    id_dmp: normalizeId(row.id_dmp)
  };

  for (const field of DB_FIELDS) {
    incoming[field] = cleanValue(row[field]);
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

  return String(value);
}

function rowChanged(existing, incoming) {
  return DB_FIELDS.some(
    field => comparable(field, existing[field]) !== comparable(field, incoming[field])
  );
}

async function syncDetalleMp2026(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar detalle_mp_2026.'
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
      const savepoint = `detalle_mp_2026_row_${index}`;

      if (!incoming.id_dmp) {
        summary.rejected += 1;
        summary.errors.push({
          index,
          message: 'id_dmp invalido o ausente.'
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
          [incoming.id_dmp]
        );

        if (!existingRows.length) {
          const columns = [KEY_FIELD, ...DB_FIELDS];
          const placeholders = columns.map(() => '?').join(', ');
          const values = [
            incoming.id_dmp,
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
          incoming.id_dmp
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
          id_dmp: incoming.id_dmp,
          message: rowError.message
        });
      }
    }

    await conn.commit();

    return res.json({
      ok: true,
      message: 'Detalle MP 2026 sincronizada correctamente.',
      ...summary
    });
  } catch (error) {
    await conn.rollback();

    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando detalle_mp_2026.',
      error: error.message,
      ...summary
    });
  } finally {
    conn.release();
  }
}

module.exports = {
  syncDetalleMp2026
};
