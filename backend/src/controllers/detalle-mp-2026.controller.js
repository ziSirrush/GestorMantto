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
  'facturas_pendientes',
  'estatus_cartera'
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


function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uniqueSorted(values) {
  return [...new Set(values
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
    .map(value => String(value).trim()))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function financialProjectKey(row) {
  const proyecto = String(row && row.proyecto || '').trim().toLowerCase();
  if (proyecto) return `proyecto:${proyecto}`;

  const idProyectoCobranza = Number(row && row.id_proyecto_cobranza || 0);
  if (Number.isInteger(idProyectoCobranza) && idProyectoCobranza > 0) {
    return `id:${idProyectoCobranza}`;
  }

  return `registro:${String(row && row.id_dmp || '')}`;
}

async function getMainDetalleMp2026(req, res) {
  const conn = await db.getConnection();

  try {
    const [rows] = await conn.query(
      `SELECT
         mp.id_dmp, mp.zona_adm, mp.proyecto, mp.id_proyecto_cobranza, mp.idns, mp.cliente, mp.periodicidad,
         mp.momento_facturacion, mp.estado, mp.z_oper, mp.forma_pago, mp.iguala, mp.condiciones_pago,
         mp.monto_anual, mp.pendiente_corriente, mp.pendiente_vencido, mp.pendiente, mp.facturas_pendientes,
         COALESCE(mp.pendiente_corriente, 0) + COALESCE(mp.pendiente_vencido, 0) AS adeudo_mp,
         (
           SELECT COALESCE(SUM(COALESCE(va.adeudo, 0)), 0)
           FROM pc va
           WHERE (
             (
               COALESCE(mp.id_proyecto_cobranza, 0) > 0
               AND va.id_proyecto_cobranza = mp.id_proyecto_cobranza
             )
             OR (
               TRIM(COALESCE(mp.proyecto, '')) <> ''
               AND LOWER(TRIM(COALESCE(va.proyecto, ''))) = LOWER(TRIM(mp.proyecto))
             )
           )
         ) AS adeudo_va
       FROM ${TABLE_NAME} mp
       ORDER BY mp.proyecto ASC, mp.id_dmp ASC`
    );

    const kpis = {
      total_registros: rows.length,
      registros_con_pendiente: 0,
      monto_anual_total: 0,
      pendiente_corriente_total: 0,
      pendiente_vencido_total: 0,
      pendiente_total: 0,
      facturas_pendientes_total: 0,
      adeudo_mp_total: 0,
      adeudo_va_total: 0,
      adeudo_total: 0
    };
    const proyectosVaContados = new Set();

    for (const row of rows) {
      const pendiente = numberOrZero(row.pendiente);
      const adeudoMp = numberOrZero(row.adeudo_mp);
      const projectKey = financialProjectKey(row);

      kpis.monto_anual_total += numberOrZero(row.monto_anual);
      kpis.pendiente_corriente_total += numberOrZero(row.pendiente_corriente);
      kpis.pendiente_vencido_total += numberOrZero(row.pendiente_vencido);
      kpis.pendiente_total += pendiente;
      kpis.facturas_pendientes_total += numberOrZero(row.facturas_pendientes);
      kpis.adeudo_mp_total += adeudoMp;

      if (!proyectosVaContados.has(projectKey)) {
        proyectosVaContados.add(projectKey);
        kpis.adeudo_va_total += numberOrZero(row.adeudo_va);
      }

      if (pendiente > 0 || numberOrZero(row.facturas_pendientes) > 0) {
        kpis.registros_con_pendiente += 1;
      }
    }
    kpis.adeudo_total = kpis.adeudo_mp_total + kpis.adeudo_va_total;

    return res.json({
      ok: true,
      source: 'aiven',
      table: TABLE_NAME,
      generated_at: new Date().toISOString(),
      kpis,
      catalogs: {
        estado: uniqueSorted(rows.map(row => row.estado)),
        periodicidad: uniqueSorted(rows.map(row => row.periodicidad)),
        momento_facturacion: uniqueSorted(rows.map(row => row.momento_facturacion)),
        z_oper: uniqueSorted(rows.map(row => row.z_oper)),
        zona_adm: uniqueSorted(rows.map(row => row.zona_adm)),
        forma_pago: uniqueSorted(rows.map(row => row.forma_pago))
      },
      rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar Mantenimiento Preventivo 2026 desde Aiven.',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function getDetalleMp2026(req, res) {
  const id = normalizeId(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'id_dmp inválido.' });
  }

  const conn = await db.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT
         id_dmp, zona_adm, proyecto, id_proyecto_cobranza, idns, cliente, periodicidad,
         momento_facturacion, estado, z_oper, forma_pago, iguala, condiciones_pago,
         monto_anual, pendiente_corriente, pendiente_vencido, pendiente, facturas_pendientes
       FROM ${TABLE_NAME}
       WHERE id_dmp = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'No se encontró el registro de Mantenimiento Preventivo.' });
    }

    const mantenimiento = rows[0];
    const proyecto = String(mantenimiento.proyecto || '').trim();
    let mantenimientoPreventivo = [mantenimiento];
    let gestionCredito = null;
    let ventaAdicional = [];

    // Regla Cobranza United V014:
    // todas las relaciones funcionales de MP con GC y Venta Adicional se
    // resuelven por proyecto. La FK no condiciona la navegación cruzada.
    if (proyecto) {
      const [mpRows] = await conn.query(
        `SELECT
           id_dmp, zona_adm, proyecto, id_proyecto_cobranza, idns, cliente, periodicidad,
           momento_facturacion, estado, z_oper, forma_pago, iguala, condiciones_pago,
           monto_anual, pendiente_corriente, pendiente_vencido, pendiente, facturas_pendientes
         FROM ${TABLE_NAME}
         WHERE LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(?)
         ORDER BY id_dmp ASC`,
        [proyecto]
      );
      mantenimientoPreventivo = mpRows;

      const [gcRows] = await conn.query(
        `SELECT
           id_gc, id_proyecto_cobranza, idns, proyecto, cliente, prioridad,
           nivel_riesgo_credito, adeudo, facts_adeudadas, credito_para_va,
           credito_disponible_venta, mp_2026, monto_mp_2026, facturas_mp, montp_mp,
           facturas_va, monto_va
         FROM gestion_credito
         WHERE LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(?)
         ORDER BY id_gc ASC
         LIMIT 1`,
        [proyecto]
      );
      gestionCredito = gcRows[0] || null;

      const [pcRows] = await conn.query(
        `SELECT
           id_pc, zona_adm, proyecto, id_proyecto_cobranza, cliente, ov, fecha_ov, mes_ov,
           concepto, precio_venta, pagado_iva, no_pagado_iva, venta_total,
           facturas_pendientes_pago, adeudo, tipo_pago, no_factura, fecha_factura,
           mes_factura, terminos, fecha_vencimiento, dias_vencimiento, estatus,
           estatus_administrativo, estatus_operativo, fecha_pago,
           refacturacion_sustitucion, zona_operativa, estado, comentarios_cobranza
         FROM pc
         WHERE LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(?)
         ORDER BY id_pc ASC`,
        [proyecto]
      );
      ventaAdicional = pcRows;
    }

    return res.json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      mantenimiento,
      gestion_credito: gestionCredito,
      mantenimiento_preventivo: mantenimientoPreventivo,
      venta_adicional: ventaAdicional
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar el detalle de Mantenimiento Preventivo desde Aiven.',
      error: error.message
    });
  } finally {
    conn.release();
  }
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
  getMainDetalleMp2026,
  getDetalleMp2026,
  syncDetalleMp2026
};
