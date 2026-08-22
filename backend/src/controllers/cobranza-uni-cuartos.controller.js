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

function zoneScope(req, columnSql) {
  return informationRecordScope.buildZoneCodeScopeSql_gnral(req, columnSql);
}

async function getGestionCredito(req, res) {
  const conn = await db.getConnection();
  const scope = zoneScope(req, 'gc.z_oper');

  try {
    const [rows] = await conn.query(
      `SELECT
         gc.id_gc, gc.idns, gc.proyecto, gc.cliente, gc.subsidiaria, gc.region,
         gc.estado, gc.z_oper, gc.z_adm, gc.categoria, gc.prioridad,
         gc.recuento_no_equipos, gc.mp_2026, gc.monto_mp_2026,
         gc.facturas_mp, gc.facturas_va, gc.monto_va, gc.adeudo,
         gc.facts_adeudadas, gc.suministro, gc.nivel_riesgo_credito,
         gc.credito_para_va, gc.credito_disponible_venta, gc.anticipo
       FROM gestion_credito gc
       WHERE ${scope.sql}
       ORDER BY
         CASE
           WHEN UPPER(TRIM(COALESCE(gc.nivel_riesgo_credito, ''))) LIKE '%ALTO%' THEN 1
           WHEN UPPER(TRIM(COALESCE(gc.nivel_riesgo_credito, ''))) LIKE '%MEDIO%' THEN 2
           WHEN UPPER(TRIM(COALESCE(gc.nivel_riesgo_credito, ''))) LIKE '%BAJO%' THEN 3
           ELSE 4
         END,
         COALESCE(gc.adeudo, 0) DESC,
         gc.proyecto ASC`,
      scope.params
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
      table: 'gestion_credito',
      generated_at: new Date().toISOString(),
      kpis,
      catalogs: {
        estado: uniqueSorted(rows.map((row) => row.estado)),
        z_oper: uniqueSorted(rows.map((row) => row.z_oper)),
        z_adm: uniqueSorted(rows.map((row) => row.z_adm)),
        nivel_riesgo_credito: uniqueSorted(rows.map((row) => row.nivel_riesgo_credito))
      },
      distribucion_z_oper: [...zoneMap.values()]
        .sort((a, b) => b.adeudo - a.adeudo || a.zona.localeCompare(b.zona, 'es')),
      riesgo_z_adm: [...riskZoneMap.values()]
        .sort((a, b) => a.zona.localeCompare(b.zona, 'es')),
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
  if (!id) return res.status(400).json({ ok: false, message: 'id_gc inválido.' });

  const conn = await db.getConnection();
  const gcScope = zoneScope(req, 'gc.z_oper');

  try {
    const [gestionRows] = await conn.query(
      `SELECT gc.*
       FROM gestion_credito gc
       WHERE gc.id_gc = ?
         AND ${gcScope.sql}
       LIMIT 1`,
      [id, ...gcScope.params]
    );

    if (!gestionRows.length) {
      return res.status(404).json({ ok: false, message: 'No se encontró el registro de Gestión de Crédito.' });
    }

    const gestion = gestionRows[0];
    const proyecto = String(gestion.proyecto || '').trim();
    let mantenimientoPreventivo = [];
    let ventaAdicional = [];

    if (proyecto) {
      const mpScope = zoneScope(req, 'mp.z_oper');
      const [mpRows] = await conn.query(
        `SELECT
           mp.id_dmp, mp.zona_adm, mp.proyecto, mp.id_proyecto_cobranza, mp.idns,
           mp.cliente, mp.periodicidad, mp.momento_facturacion, mp.estado, mp.z_oper,
           mp.forma_pago, mp.iguala, mp.condiciones_pago, mp.monto_anual,
           mp.pendiente_corriente, mp.pendiente_vencido, mp.pendiente, mp.facturas_pendientes
         FROM detalle_mp_2026 mp
         WHERE LOWER(TRIM(COALESCE(mp.proyecto, ''))) = LOWER(?)
           AND ${mpScope.sql}
         ORDER BY mp.id_dmp ASC`,
        [proyecto, ...mpScope.params]
      );
      mantenimientoPreventivo = mpRows;

      const pcScope = zoneScope(req, 'pc.zona_operativa');
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
           AND ${pcScope.sql}
         ORDER BY pc.id_pc ASC`,
        [proyecto, ...pcScope.params]
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

async function getVentaAdicional(req, res) {
  const conn = await db.getConnection();
  const scope = zoneScope(req, 'pc.zona_operativa');

  try {
    const [rows] = await conn.query(
      `SELECT
         pc.id_pc, pc.zona_adm, pc.proyecto, pc.id_proyecto_cobranza, pc.cliente,
         pc.ov, pc.fecha_ov, pc.mes_ov, pc.concepto, pc.precio_venta, pc.pagado_iva,
         pc.no_pagado_iva, pc.venta_total, pc.facturas_pendientes_pago, pc.adeudo,
         pc.tipo_pago, pc.no_factura, pc.fecha_factura, pc.mes_factura, pc.terminos,
         pc.fecha_vencimiento, pc.dias_vencimiento, pc.estatus, pc.estatus_administrativo,
         pc.estatus_operativo, pc.fecha_pago, pc.refacturacion_sustitucion,
         pc.zona_operativa, pc.estado, pc.comentarios_cobranza
       FROM pc pc
       WHERE ${scope.sql}
       ORDER BY COALESCE(pc.fecha_ov, '1900-01-01') DESC, pc.id_pc DESC`,
      scope.params
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
        estatus: uniqueSorted(rows.map((row) => row.estatus)),
        estatus_administrativo: uniqueSorted(rows.map((row) => row.estatus_administrativo)),
        estatus_operativo: uniqueSorted(rows.map((row) => row.estatus_operativo)),
        zona_adm: uniqueSorted(rows.map((row) => row.zona_adm)),
        zona_operativa: uniqueSorted(rows.map((row) => row.zona_operativa)),
        estado: uniqueSorted(rows.map((row) => row.estado)),
        tipo_pago: uniqueSorted(rows.map((row) => row.tipo_pago))
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
  const id = normalizeId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_pc inválido.' });

  const conn = await db.getConnection();
  const pcScope = zoneScope(req, 'pc.zona_operativa');

  try {
    const [rows] = await conn.query(
      `SELECT pc.*
       FROM pc pc
       WHERE pc.id_pc = ?
         AND ${pcScope.sql}
       LIMIT 1`,
      [id, ...pcScope.params]
    );
    const venta = rows[0];
    if (!venta) return res.status(404).json({ ok: false, message: 'Venta Adicional no encontrada.' });

    let gestionCredito = [];
    let mantenimientoPreventivo = [];
    const proyecto = String(venta.proyecto || '').trim();

    if (proyecto) {
      const gcScope = zoneScope(req, 'gc.z_oper');
      const [gcRows] = await conn.query(
        `SELECT
           gc.id_gc, gc.id_proyecto_cobranza, gc.idns, gc.proyecto, gc.cliente,
           gc.estado, gc.z_oper, gc.z_adm, gc.nivel_riesgo_credito,
           gc.credito_disponible_venta, gc.adeudo, gc.facts_adeudadas
         FROM gestion_credito gc
         WHERE LOWER(TRIM(COALESCE(gc.proyecto, ''))) = LOWER(?)
           AND ${gcScope.sql}
         ORDER BY gc.id_gc ASC`,
        [proyecto, ...gcScope.params]
      );
      gestionCredito = gcRows;

      const mpScope = zoneScope(req, 'mp.z_oper');
      const [mpRows] = await conn.query(
        `SELECT
           mp.id_dmp, mp.id_proyecto_cobranza, mp.proyecto, mp.idns, mp.cliente,
           mp.periodicidad, mp.momento_facturacion, mp.estado, mp.z_oper,
           mp.zona_adm, mp.forma_pago, mp.monto_anual, mp.pendiente_corriente,
           mp.pendiente_vencido, mp.pendiente, mp.facturas_pendientes
         FROM detalle_mp_2026 mp
         WHERE LOWER(TRIM(COALESCE(mp.proyecto, ''))) = LOWER(?)
           AND ${mpScope.sql}
         ORDER BY mp.id_dmp ASC`,
        [proyecto, ...mpScope.params]
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
  getVentaAdicionalDetalle
};
