// [Aster | 2026-08-13 | ASTER-MG | FASE: COBRANZA_UNI_GESTION_CREDITO_1A_V001]
const db = require('../config/db');

const TABLE_NAME = 'gestion_credito';
const KEY_FIELD = 'id_gc';

const DB_FIELDS = [
  'idns',
  'proyecto',
  'cliente',
  'subsidiaria',
  'region',
  'estado',
  'z_oper',
  'z_adm',
  'categoria',
  'prioridad',
  'suma_valor_unitario',
  'recuento_no_equipos',
  'mp_2025',
  'monto_mp_2025',
  'mp_2026',
  'monto_mp_2026',
  'facturas_mp',
  'montp_mp',
  'facturas_va',
  'monto_va',
  'adeudo',
  'facts_adeudadas',
  'suministro',
  'nivel_riesgo_credito',
  'credito_para_va',
  'credito_disponible_venta',
  'anticipo'
];

const NUMERIC_FIELDS = new Set([
  'suma_valor_unitario',
  'recuento_no_equipos',
  'mp_2025',
  'monto_mp_2025',
  'mp_2026',
  'monto_mp_2026',
  'facturas_mp',
  'montp_mp',
  'facturas_va',
  'monto_va',
  'adeudo',
  'facts_adeudadas',
  'suministro',
  'credito_para_va',
  'credito_disponible_venta',
  'anticipo'
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
    id_gc: normalizeId(row.id_gc)
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
  return [...new Set(values.filter(value => value !== null && value !== undefined && String(value).trim() !== ''))]
    .map(value => String(value).trim())
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

async function getGestionCredito(req, res) {
  const conn = await db.getConnection();

  try {
    const [rows] = await conn.query(
      `SELECT
         id_gc, idns, proyecto, cliente, subsidiaria, region, estado, z_oper, z_adm,
         categoria, prioridad, recuento_no_equipos, mp_2026, monto_mp_2026,
         facturas_mp, facturas_va, monto_va, adeudo, facts_adeudadas, suministro,
         nivel_riesgo_credito, credito_para_va, credito_disponible_venta, anticipo
       FROM ${TABLE_NAME}
       ORDER BY
         CASE
           WHEN UPPER(TRIM(COALESCE(nivel_riesgo_credito, ''))) LIKE '%ALTO%' THEN 1
           WHEN UPPER(TRIM(COALESCE(nivel_riesgo_credito, ''))) LIKE '%MEDIO%' THEN 2
           WHEN UPPER(TRIM(COALESCE(nivel_riesgo_credito, ''))) LIKE '%BAJO%' THEN 3
           ELSE 4
         END,
         COALESCE(adeudo, 0) DESC,
         proyecto ASC`
    );

    const kpis = {
      total_proyectos: rows.length,
      proyectos_sin_credito: 0,
      adeudo_total: 0,
      facturas_adeudadas: 0,
      riesgo_alto: 0,
      riesgo_medio: 0,
      riesgo_bajo: 0,
      proyectos_con_adeudo: 0,
      credito_disponible_total: 0
    };
    const zoneMap = new Map();
    const riskZoneMap = new Map();

    for (const row of rows) {
      const adeudo = numberOrZero(row.adeudo);
      const creditoDisponible = numberOrZero(row.credito_disponible_venta);
      const facturas = numberOrZero(row.facts_adeudadas);
      const riesgo = String(row.nivel_riesgo_credito || '').trim().toUpperCase();
      const zonaOperativa = String(row.z_oper || '').trim() || 'Sin zona';
      const zonaAdministrativa = String(row.z_adm || '').trim() || 'Sin zona';

      kpis.adeudo_total += adeudo;
      kpis.facturas_adeudadas += facturas;
      kpis.credito_disponible_total += creditoDisponible;
      if (creditoDisponible <= 0) kpis.proyectos_sin_credito += 1;
      if (adeudo > 0) kpis.proyectos_con_adeudo += 1;
      if (riesgo.includes('ALTO')) kpis.riesgo_alto += 1;
      else if (riesgo.includes('MEDIO')) kpis.riesgo_medio += 1;
      else if (riesgo.includes('BAJO')) kpis.riesgo_bajo += 1;

      const zone = zoneMap.get(zonaOperativa) || {
        zona: zonaOperativa,
        proyectos: 0,
        proyectos_con_adeudo: 0,
        adeudo: 0
      };
      zone.proyectos += 1;
      zone.adeudo += adeudo;
      if (adeudo > 0) zone.proyectos_con_adeudo += 1;
      zoneMap.set(zonaOperativa, zone);

      const riskZone = riskZoneMap.get(zonaAdministrativa) || {
        zona: zonaAdministrativa,
        bajo: 0,
        medio: 0,
        alto: 0,
        sin_clasificar: 0,
        total: 0
      };
      riskZone.total += 1;
      if (riesgo.includes('ALTO')) riskZone.alto += 1;
      else if (riesgo.includes('MEDIO')) riskZone.medio += 1;
      else if (riesgo.includes('BAJO')) riskZone.bajo += 1;
      else riskZone.sin_clasificar += 1;
      riskZoneMap.set(zonaAdministrativa, riskZone);
    }

    return res.json({
      ok: true,
      source: 'aiven',
      table: TABLE_NAME,
      generated_at: new Date().toISOString(),
      kpis,
      catalogs: {
        estado: uniqueSorted(rows.map(row => row.estado)),
        z_oper: uniqueSorted(rows.map(row => row.z_oper)),
        z_adm: uniqueSorted(rows.map(row => row.z_adm)),
        nivel_riesgo_credito: uniqueSorted(rows.map(row => row.nivel_riesgo_credito))
      },
      distribucion_z_oper: [...zoneMap.values()].sort((a, b) => b.adeudo - a.adeudo || a.zona.localeCompare(b.zona, 'es')),
      riesgo_z_adm: [...riskZoneMap.values()].sort((a, b) => a.zona.localeCompare(b.zona, 'es')),
      rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar Gestión de Crédito desde Aiven.',
      error: error.message
    });
  } finally {
    conn.release();
  }
}


async function getGestionCreditoDetalle(req, res) {
  const id = normalizeId(req.params.id);
  if (!id) {
    return res.status(400).json({ ok: false, message: 'id_gc inválido.' });
  }

  const conn = await db.getConnection();
  try {
    const [gestionRows] = await conn.query(
      `SELECT ${KEY_FIELD}, id_proyecto_cobranza, ${DB_FIELDS.join(', ')}
       FROM ${TABLE_NAME}
       WHERE ${KEY_FIELD} = ?
       LIMIT 1`,
      [id]
    );

    if (!gestionRows.length) {
      return res.status(404).json({ ok: false, message: 'No se encontró el registro de Gestión de Crédito.' });
    }

    const gestion = gestionRows[0];
    const proyecto = String(gestion.proyecto || '').trim();

    let mantenimientoPreventivo = [];
    let ventaAdicional = [];

    // Regla Cobranza United V014:
    // GC, MP y Venta Adicional se relacionan funcionalmente por proyecto.
    // id_proyecto_cobranza puede existir como dato técnico, pero no condiciona
    // la navegación ni las consultas cruzadas entre estos tres módulos.
    if (proyecto) {
      const [mpRows] = await conn.query(
        `SELECT
           id_dmp, zona_adm, proyecto, id_proyecto_cobranza, idns, cliente, periodicidad,
           momento_facturacion, estado, z_oper, forma_pago, iguala, condiciones_pago,
           monto_anual, pendiente_corriente, pendiente_vencido, pendiente, facturas_pendientes
         FROM detalle_mp_2026
         WHERE LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(?)
         ORDER BY id_dmp ASC`,
        [proyecto]
      );
      mantenimientoPreventivo = mpRows;

      const [pcRows] = await conn.query(
        `SELECT
           id_pc, zona_adm, proyecto, id_proyecto_cobranza, cliente, ov, fecha_ov, mes_ov, concepto,
           precio_venta, pagado_iva, no_pagado_iva, venta_total, facturas_pendientes_pago,
           adeudo, tipo_pago, no_factura, fecha_factura, mes_factura, terminos,
           fecha_vencimiento, dias_vencimiento, estatus, estatus_administrativo,
           estatus_operativo, fecha_pago, refacturacion_sustitucion, zona_operativa,
           estado, comentarios_cobranza
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
      gestion_credito: gestion,
      mantenimiento_preventivo: mantenimientoPreventivo,
      venta_adicional: ventaAdicional
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar las relaciones de Gestión de Crédito desde Aiven.',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function syncCobranzaUni(req, res) {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      message: 'No se recibieron filas para sincronizar gestion_credito.'
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
      const savepoint = `gestion_credito_row_${index}`;

      if (!incoming.id_gc) {
        summary.rejected += 1;
        summary.errors.push({
          index,
          message: 'id_gc invalido o ausente.'
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
          [incoming.id_gc]
        );

        if (!existingRows.length) {
          const columns = [KEY_FIELD, ...DB_FIELDS];
          const placeholders = columns.map(() => '?').join(', ');
          const values = [
            incoming.id_gc,
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
          incoming.id_gc
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
          id_gc: incoming.id_gc,
          message: rowError.message
        });
      }
    }

    await conn.commit();

    return res.json({
      ok: true,
      message: 'Cobranza United sincronizada correctamente.',
      ...summary
    });
  } catch (error) {
    await conn.rollback();

    return res.status(500).json({
      ok: false,
      message: 'Error sincronizando gestion_credito.',
      error: error.message,
      ...summary
    });
  } finally {
    conn.release();
  }
}


function normalizePcId(value) {
  const text = String(value == null ? '' : value).trim();
  return /^\d+$/.test(text) && !/^0+$/.test(text) ? text : null;
}

async function getVentaAdicional(req, res) {
  const conn = await db.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT
         id_pc, zona_adm, proyecto, id_proyecto_cobranza, cliente, ov, fecha_ov, mes_ov,
         concepto, precio_venta, pagado_iva, no_pagado_iva, venta_total,
         facturas_pendientes_pago, adeudo, tipo_pago, no_factura, fecha_factura,
         mes_factura, terminos, fecha_vencimiento, dias_vencimiento, estatus,
         estatus_administrativo, estatus_operativo, fecha_pago,
         refacturacion_sustitucion, zona_operativa, estado, comentarios_cobranza
       FROM pc
       ORDER BY COALESCE(fecha_ov, '1900-01-01') DESC, id_pc DESC`
    );

    const kpis = {
      total_registros: rows.length,
      venta_total: 0,
      facturado_pagado: 0,
      no_pagado: 0,
      adeudo_total: 0,
      facturas_pendientes: 0,
      registros_con_adeudo: 0
    };

    for (const row of rows) {
      kpis.venta_total += numberOrZero(row.venta_total || row.precio_venta);
      kpis.facturado_pagado += numberOrZero(row.pagado_iva);
      kpis.no_pagado += numberOrZero(row.no_pagado_iva);
      kpis.adeudo_total += numberOrZero(row.adeudo);
      kpis.facturas_pendientes += numberOrZero(row.facturas_pendientes_pago);
      if (numberOrZero(row.adeudo) > 0 || numberOrZero(row.facturas_pendientes_pago) > 0) {
        kpis.registros_con_adeudo += 1;
      }
    }

    return res.json({
      ok: true,
      source: 'aiven',
      table: 'pc',
      generated_at: new Date().toISOString(),
      kpis,
      catalogs: {
        estatus: uniqueSorted(rows.map(row => row.estatus)),
        estatus_administrativo: uniqueSorted(rows.map(row => row.estatus_administrativo)),
        estatus_operativo: uniqueSorted(rows.map(row => row.estatus_operativo)),
        zona_adm: uniqueSorted(rows.map(row => row.zona_adm)),
        zona_operativa: uniqueSorted(rows.map(row => row.zona_operativa)),
        estado: uniqueSorted(rows.map(row => row.estado)),
        tipo_pago: uniqueSorted(rows.map(row => row.tipo_pago))
      },
      rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar Venta Adicional desde Aiven.',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

async function getVentaAdicionalDetalle(req, res) {
  const id = normalizePcId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_pc inválido.' });

  const conn = await db.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT
         id_pc, zona_adm, proyecto, id_proyecto_cobranza, cliente, ov, fecha_ov, mes_ov,
         concepto, precio_venta, pagado_iva, no_pagado_iva, venta_total,
         facturas_pendientes_pago, adeudo, tipo_pago, no_factura, fecha_factura,
         mes_factura, terminos, fecha_vencimiento, dias_vencimiento, estatus,
         estatus_administrativo, estatus_operativo, fecha_pago,
         refacturacion_sustitucion, zona_operativa, estado, comentarios_cobranza
       FROM pc
       WHERE id_pc = ?
       LIMIT 1`,
      [id]
    );
    const venta = rows[0];
    if (!venta) return res.status(404).json({ ok: false, message: 'Venta Adicional no encontrada.' });

    let gestionCredito = [];
    let mantenimientoPreventivo = [];
    const proyecto = String(venta.proyecto || '').trim();

    // En Venta Adicional una misma obra/proyecto puede tener muchas facturas.
    // La relación de navegación se resuelve por proyecto, no por FK de cada factura.
    if (proyecto) {
      const [gcRows] = await conn.query(
        `SELECT id_gc, id_proyecto_cobranza, idns, proyecto, cliente, estado, z_oper, z_adm,
                nivel_riesgo_credito, credito_disponible_venta, adeudo, facts_adeudadas
         FROM gestion_credito
         WHERE LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(?)
         ORDER BY id_gc ASC`,
        [proyecto]
      );
      gestionCredito = gcRows;

      const [mpRows] = await conn.query(
        `SELECT id_dmp, id_proyecto_cobranza, proyecto, idns, cliente, periodicidad,
                momento_facturacion, estado, z_oper, zona_adm, forma_pago, monto_anual,
                pendiente_corriente, pendiente_vencido, pendiente, facturas_pendientes
         FROM detalle_mp_2026
         WHERE LOWER(TRIM(COALESCE(proyecto, ''))) = LOWER(?)
         ORDER BY id_dmp ASC`,
        [proyecto]
      );
      mantenimientoPreventivo = mpRows;
    }

    return res.json({
      ok: true,
      source: 'aiven',
      table: 'pc',
      generated_at: new Date().toISOString(),
      venta,
      gestion_credito: gestionCredito,
      mantenimiento_preventivo: mantenimientoPreventivo
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar el detalle de Venta Adicional.',
      error: error.message
    });
  } finally {
    conn.release();
  }
}

module.exports = {
  getGestionCredito,
  getGestionCreditoDetalle,
  getVentaAdicional,
  getVentaAdicionalDetalle,
  syncCobranzaUni
};
