'use strict';

const db = require('../config/db');
const cobranzaScope = require('../services/cobranza-uni-scope.service');

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

function projectMatchSql(alias) {
  return `(
    (COALESCE(?, 0) > 0 AND ${alias}.id_proyecto_cobranza = ?)
    OR (
      TRIM(COALESCE(?, '')) <> ''
      AND LOWER(TRIM(COALESCE(${alias}.proyecto, ''))) = LOWER(TRIM(?))
    )
  )`;
}

function projectMatchParams(row) {
  const id = Number(row && row.id_proyecto_cobranza || 0);
  const proyecto = String(row && row.proyecto || '').trim();
  return [id, id, proyecto, proyecto];
}

function gestionSelectSql(alias = 'gc') {
  return `${alias}.*,
    ${cobranzaScope.canonicalProjectSql_uni(alias)} AS proyecto_oficial,
    ${cobranzaScope.canonicalZoneCodeSql_uni(alias)} AS zona_oficial,
    ${cobranzaScope.canonicalZoneIdsSql_uni(alias)} AS zona_ids_oficial`;
}

function mpSelectSql(alias = 'mp') {
  return `${alias}.*,
    ${cobranzaScope.canonicalProjectSql_uni(alias)} AS proyecto_oficial,
    ${cobranzaScope.canonicalZoneCodeSql_uni(alias)} AS zona_oficial,
    ${cobranzaScope.canonicalZoneIdsSql_uni(alias)} AS zona_ids_oficial`;
}

function pcSelectSql(alias = 'pc') {
  return `${alias}.*,
    ${cobranzaScope.canonicalProjectSql_uni(alias)} AS proyecto_oficial,
    ${cobranzaScope.canonicalZoneCodeSql_uni(alias)} AS zona_oficial,
    ${cobranzaScope.canonicalZoneIdsSql_uni(alias)} AS zona_ids_oficial`;
}

function canonGc(row) { return cobranzaScope.canonicalizeRow_uni(row, 'z_oper'); }
function canonMp(row) { return cobranzaScope.canonicalizeRow_uni(row, 'z_oper'); }
function canonPc(row) { return cobranzaScope.canonicalizeRow_uni(row, 'zona_operativa'); }

async function getGestionCredito(req, res) {
  const conn = await db.getConnection();
  const scope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'gc');

  try {
    const [rawRows] = await conn.query(`
      SELECT ${gestionSelectSql('gc')}
      FROM gestion_credito gc
      WHERE ${scope}
      ORDER BY
        CASE
          WHEN UPPER(TRIM(COALESCE(gc.nivel_riesgo_credito, ''))) LIKE '%ALTO%' THEN 1
          WHEN UPPER(TRIM(COALESCE(gc.nivel_riesgo_credito, ''))) LIKE '%MEDIO%' THEN 2
          WHEN UPPER(TRIM(COALESCE(gc.nivel_riesgo_credito, ''))) LIKE '%BAJO%' THEN 3
          ELSE 4
        END,
        COALESCE(gc.adeudo, 0) DESC,
        gc.proyecto ASC
    `);
    const rows = rawRows.map(canonGc);

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
      const credito = numberOrZero(row.credito_disponible_venta);
      const facturas = numberOrZero(row.facts_adeudadas);
      const riesgo = String(row.nivel_riesgo_credito || '').trim().toUpperCase();
      const zonaOperativa = String(row.z_oper || '').trim() || 'Sin zona';
      const zonaAdministrativa = String(row.z_adm || '').trim() || 'Sin zona';

      kpis.adeudo_total += adeudo;
      kpis.facturas_adeudadas += facturas;
      kpis.credito_disponible_total += credito;
      if (credito <= 0) kpis.proyectos_sin_credito += 1;
      if (adeudo > 0) kpis.proyectos_con_adeudo += 1;
      if (riesgo.includes('ALTO')) kpis.riesgo_alto += 1;
      else if (riesgo.includes('MEDIO')) kpis.riesgo_medio += 1;
      else if (riesgo.includes('BAJO')) kpis.riesgo_bajo += 1;

      const zone = zoneMap.get(zonaOperativa) || { zona: zonaOperativa, proyectos: 0, proyectos_con_adeudo: 0, adeudo: 0 };
      zone.proyectos += 1;
      zone.adeudo += adeudo;
      if (adeudo > 0) zone.proyectos_con_adeudo += 1;
      zoneMap.set(zonaOperativa, zone);

      const riskZone = riskZoneMap.get(zonaAdministrativa) || { zona: zonaAdministrativa, bajo: 0, medio: 0, alto: 0, sin_clasificar: 0, total: 0 };
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
      alcance: cobranzaScope.alcancePayload_uni(req),
      kpis,
      catalogs: {
        estado: uniqueSorted(rows.map((row) => row.estado)),
        z_oper: uniqueSorted(rows.map((row) => row.z_oper)),
        z_adm: uniqueSorted(rows.map((row) => row.z_adm)),
        nivel_riesgo_credito: uniqueSorted(rows.map((row) => row.nivel_riesgo_credito))
      },
      distribucion_z_oper: [...zoneMap.values()].sort((a, b) => b.adeudo - a.adeudo || a.zona.localeCompare(b.zona, 'es')),
      riesgo_z_adm: [...riskZoneMap.values()].sort((a, b) => a.zona.localeCompare(b.zona, 'es')),
      rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'No fue posible consultar Gestion de Credito desde Aiven.', error: error.message });
  } finally {
    conn.release();
  }
}

async function getGestionCreditoDetalle(req, res) {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_gc invalido.' });
  const conn = await db.getConnection();
  const gcScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'gc');

  try {
    const [rows] = await conn.query(`SELECT ${gestionSelectSql('gc')} FROM gestion_credito gc WHERE gc.id_gc = ? AND ${gcScope} LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'No se encontro el registro de Gestion de Credito dentro de los cuartos autorizados.' });
    const gestion = canonGc(rows[0]);
    const match = projectMatchParams(gestion);

    const mpScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'mp');
    const [mpRows] = await conn.query(`
      SELECT ${mpSelectSql('mp')}
      FROM detalle_mp_2026 mp
      WHERE ${projectMatchSql('mp')} AND ${mpScope}
      ORDER BY mp.id_dmp ASC
    `, match);

    const pcScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'pc');
    const [pcRows] = await conn.query(`
      SELECT ${pcSelectSql('pc')}
      FROM pc pc
      WHERE ${projectMatchSql('pc')} AND ${pcScope}
      ORDER BY pc.id_pc ASC
    `, match);

    return res.json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
      gestion_credito: gestion,
      mantenimiento_preventivo: mpRows.map(canonMp),
      venta_adicional: pcRows.map(canonPc)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'No fue posible consultar las relaciones de Gestion de Credito desde Aiven.', error: error.message });
  } finally {
    conn.release();
  }
}

async function getVentaAdicional(req, res) {
  const conn = await db.getConnection();
  const scope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'pc');

  try {
    const [rawRows] = await conn.query(`
      SELECT ${pcSelectSql('pc')}
      FROM pc pc
      WHERE ${scope}
      ORDER BY COALESCE(pc.fecha_ov, '1900-01-01') DESC, pc.id_pc DESC
    `);
    const rows = rawRows.map(canonPc);
    const kpis = { total_registros: rows.length, venta_total: 0, facturado_pagado: 0, no_pagado: 0, adeudo_total: 0, facturas_pendientes: 0, registros_con_adeudo: 0 };
    for (const row of rows) {
      kpis.venta_total += numberOrZero(row.venta_total || row.precio_venta);
      kpis.facturado_pagado += numberOrZero(row.pagado_iva);
      kpis.no_pagado += numberOrZero(row.no_pagado_iva);
      kpis.adeudo_total += numberOrZero(row.adeudo);
      kpis.facturas_pendientes += numberOrZero(row.facturas_pendientes_pago);
      if (numberOrZero(row.adeudo) > 0 || numberOrZero(row.facturas_pendientes_pago) > 0) kpis.registros_con_adeudo += 1;
    }

    return res.json({
      ok: true,
      source: 'aiven',
      table: 'pc',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
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
    return res.status(500).json({ ok: false, message: 'No fue posible consultar Venta Adicional desde Aiven.', error: error.message });
  } finally {
    conn.release();
  }
}

async function getVentaAdicionalDetalle(req, res) {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_pc invalido.' });
  const conn = await db.getConnection();
  const pcScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'pc');

  try {
    const [rows] = await conn.query(`SELECT ${pcSelectSql('pc')} FROM pc pc WHERE pc.id_pc = ? AND ${pcScope} LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Venta Adicional no encontrada dentro de los cuartos autorizados.' });
    const venta = canonPc(rows[0]);
    const match = projectMatchParams(venta);

    const gcScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'gc');
    const [gcRows] = await conn.query(`
      SELECT ${gestionSelectSql('gc')}
      FROM gestion_credito gc
      WHERE ${projectMatchSql('gc')} AND ${gcScope}
      ORDER BY gc.id_gc ASC
    `, match);

    const mpScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'mp');
    const [mpRows] = await conn.query(`
      SELECT ${mpSelectSql('mp')}
      FROM detalle_mp_2026 mp
      WHERE ${projectMatchSql('mp')} AND ${mpScope}
      ORDER BY mp.id_dmp ASC
    `, match);

    return res.json({
      ok: true,
      source: 'aiven',
      table: 'pc',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
      venta,
      gestion_credito: gcRows.map(canonGc),
      mantenimiento_preventivo: mpRows.map(canonMp)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'No fue posible consultar el detalle de Venta Adicional desde Aiven.', error: error.message });
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
