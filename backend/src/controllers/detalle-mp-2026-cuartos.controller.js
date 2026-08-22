'use strict';

const db = require('../config/db');
const informationRecordScope = require('../services/information-record-scope-gnral.service');

function normalizeId(value) {
  const text = String(value == null ? '' : value).trim();
  return /^\d+$/.test(text) && !/^0+$/.test(text) ? text : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .map((value) => String(value).trim()))]
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

function zoneScopeInline(req, columnSql) {
  return informationRecordScope.buildZoneCodeScopeSqlInline_gnral(req, columnSql).sql;
}

async function getMainDetalleMp2026(req, res) {
  const conn = await db.getConnection();
  const mpScope = zoneScopeInline(req, 'mp.z_oper');
  const pcScope = zoneScopeInline(req, 'va.zona_operativa');

  try {
    const [rows] = await conn.query(
      `SELECT
         mp.id_dmp, mp.zona_adm, mp.proyecto, mp.id_proyecto_cobranza, mp.idns,
         mp.cliente, mp.periodicidad, mp.momento_facturacion, mp.estado, mp.z_oper,
         mp.forma_pago, mp.iguala, mp.condiciones_pago, mp.monto_anual,
         mp.pendiente_corriente, mp.pendiente_vencido, mp.pendiente,
         mp.facturas_pendientes,
         COALESCE(mp.pendiente_corriente, 0) + COALESCE(mp.pendiente_vencido, 0) AS adeudo_mp,
         (
           SELECT COALESCE(SUM(COALESCE(va.adeudo, 0)), 0)
           FROM pc va
           WHERE ${pcScope}
             AND (
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
       FROM detalle_mp_2026 mp
       WHERE ${mpScope}
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
      table: 'detalle_mp_2026',
      generated_at: new Date().toISOString(),
      kpis,
      catalogs: {
        estado: uniqueSorted(rows.map((row) => row.estado)),
        periodicidad: uniqueSorted(rows.map((row) => row.periodicidad)),
        momento_facturacion: uniqueSorted(rows.map((row) => row.momento_facturacion)),
        z_oper: uniqueSorted(rows.map((row) => row.z_oper)),
        zona_adm: uniqueSorted(rows.map((row) => row.zona_adm)),
        forma_pago: uniqueSorted(rows.map((row) => row.forma_pago))
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
  if (!id) return res.status(400).json({ ok: false, message: 'id_dmp inválido.' });

  const conn = await db.getConnection();
  const baseScope = zoneScopeInline(req, 'mp.z_oper');

  try {
    const [rows] = await conn.query(
      `SELECT
         mp.id_dmp, mp.zona_adm, mp.proyecto, mp.id_proyecto_cobranza, mp.idns,
         mp.cliente, mp.periodicidad, mp.momento_facturacion, mp.estado, mp.z_oper,
         mp.forma_pago, mp.iguala, mp.condiciones_pago, mp.monto_anual,
         mp.pendiente_corriente, mp.pendiente_vencido, mp.pendiente, mp.facturas_pendientes
       FROM detalle_mp_2026 mp
       WHERE mp.id_dmp = ?
         AND ${baseScope}
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

    if (proyecto) {
      const relatedMpScope = zoneScopeInline(req, 'mp.z_oper');
      const [mpRows] = await conn.query(
        `SELECT
           mp.id_dmp, mp.zona_adm, mp.proyecto, mp.id_proyecto_cobranza, mp.idns,
           mp.cliente, mp.periodicidad, mp.momento_facturacion, mp.estado, mp.z_oper,
           mp.forma_pago, mp.iguala, mp.condiciones_pago, mp.monto_anual,
           mp.pendiente_corriente, mp.pendiente_vencido, mp.pendiente, mp.facturas_pendientes
         FROM detalle_mp_2026 mp
         WHERE LOWER(TRIM(COALESCE(mp.proyecto, ''))) = LOWER(?)
           AND ${relatedMpScope}
         ORDER BY mp.id_dmp ASC`,
        [proyecto]
      );
      mantenimientoPreventivo = mpRows;

      const gcScope = zoneScopeInline(req, 'gc.z_oper');
      const [gcRows] = await conn.query(
        `SELECT
           gc.id_gc, gc.id_proyecto_cobranza, gc.idns, gc.proyecto, gc.cliente,
           gc.prioridad, gc.nivel_riesgo_credito, gc.adeudo, gc.facts_adeudadas,
           gc.credito_para_va, gc.credito_disponible_venta, gc.mp_2026,
           gc.monto_mp_2026, gc.facturas_mp, gc.montp_mp, gc.facturas_va, gc.monto_va
         FROM gestion_credito gc
         WHERE LOWER(TRIM(COALESCE(gc.proyecto, ''))) = LOWER(?)
           AND ${gcScope}
         ORDER BY gc.id_gc ASC
         LIMIT 1`,
        [proyecto]
      );
      gestionCredito = gcRows[0] || null;

      const pcScope = zoneScopeInline(req, 'pc.zona_operativa');
      const [pcRows] = await conn.query(
        `SELECT
           pc.id_pc, pc.zona_adm, pc.proyecto, pc.id_proyecto_cobranza, pc.cliente,
           pc.ov, pc.fecha_ov, pc.mes_ov, pc.concepto, pc.precio_venta, pc.pagado_iva,
           pc.no_pagado_iva, pc.venta_total, pc.facturas_pendientes_pago, pc.adeudo,
           pc.tipo_pago, pc.no_factura, pc.fecha_factura, pc.mes_factura, pc.terminos,
           pc.fecha_vencimiento, pc.dias_vencimiento, pc.estatus, pc.estatus_administrativo,
           pc.estatus_operativo, pc.fecha_pago, pc.refacturacion_sustitucion,
           pc.zona_operativa, pc.estado, pc.comentarios_cobranza
         FROM pc pc
         WHERE LOWER(TRIM(COALESCE(pc.proyecto, ''))) = LOWER(?)
           AND ${pcScope}
         ORDER BY pc.id_pc ASC`,
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

module.exports = {
  getMainDetalleMp2026,
  getDetalleMp2026
};
