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

function projectLookupKey_uni(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function chunkValues_uni(values, size = 400) {
  const rows = Array.isArray(values) ? values : [];
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function loadCanonicalZoneMap_uni(conn, projects) {
  const projectByKey = new Map();
  for (const value of projects || []) {
    const text = String(value == null ? '' : value).trim();
    const key = projectLookupKey_uni(text);
    if (!key || projectByKey.has(key)) continue;
    projectByKey.set(key, text.toLowerCase());
  }

  const zoneMap = new Map();
  for (const batch of chunkValues_uni([...projectByKey.values()])) {
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(', ');
    const [rows] = await conn.query(`
      SELECT
        LOWER(TRIM(COALESCE(p_cob_batch.proyecto, ''))) AS project_key,
        GROUP_CONCAT(DISTINCT z_cob_batch.zona ORDER BY z_cob_batch.zona SEPARATOR ' / ') AS zona_oficial,
        GROUP_CONCAT(DISTINCT p_cob_batch.zona_id ORDER BY p_cob_batch.zona_id SEPARATOR ',') AS zona_ids_oficial
      FROM portafolio p_cob_batch
      INNER JOIN z_op z_cob_batch
        ON z_cob_batch.id_zona = p_cob_batch.zona_id
       AND z_cob_batch.estado = 1
      WHERE p_cob_batch.estado_registro = 1
        AND (p_cob_batch.inactivo IS NULL OR UPPER(p_cob_batch.inactivo) NOT IN ('SI','SÍ','1','TRUE','INACTIVO'))
        AND LOWER(TRIM(COALESCE(p_cob_batch.proyecto, ''))) IN (${placeholders})
      GROUP BY LOWER(TRIM(COALESCE(p_cob_batch.proyecto, '')))
    `, batch);

    for (const row of rows) {
      const key = projectLookupKey_uni(row.project_key);
      if (!key) continue;
      zoneMap.set(key, {
        zona_oficial: row.zona_oficial || null,
        zona_ids_oficial: row.zona_ids_oficial || ''
      });
    }
  }

  return zoneMap;
}

async function canonicalizeMainRows_uni(conn, rawRows, legacyField) {
  const prepared = (Array.isArray(rawRows) ? rawRows : []).map((source) => {
    const row = { ...source };
    const joinedProject = row.__proyecto_canonico;
    delete row.__proyecto_canonico;

    const legacyProject = String(row.proyecto == null ? '' : row.proyecto).trim();
    const canonicalProject = joinedProject !== null && joinedProject !== undefined
      ? String(joinedProject)
      : (legacyProject || null);

    return { row, canonicalProject };
  });

  const zoneMap = await loadCanonicalZoneMap_uni(
    conn,
    prepared.map((item) => item.canonicalProject).filter(Boolean)
  );

  return prepared.map(({ row, canonicalProject }) => {
    const zone = zoneMap.get(projectLookupKey_uni(canonicalProject)) || {};
    return cobranzaScope.canonicalizeRow_uni({
      ...row,
      proyecto_oficial: canonicalProject,
      zona_oficial: zone.zona_oficial || null,
      zona_ids_oficial: zone.zona_ids_oficial || ''
    }, legacyField);
  });
}

function financialProjectKey(row) {
  const id = Number(row && row.id_proyecto_cobranza || 0);
  if (Number.isInteger(id) && id > 0) return `id:${id}`;
  const proyecto = String(row && (row.proyecto_oficial || row.proyecto) || '').trim().toLowerCase();
  return proyecto ? `proyecto:${proyecto}` : `registro:${String(row && row.id_dmp || '')}`;
}

function projectMatchSql(alias) {
  return `(
    (COALESCE(?, 0) > 0 AND ${alias}.id_proyecto_cobranza = ?)
    OR (TRIM(COALESCE(?, '')) <> '' AND LOWER(TRIM(COALESCE(${alias}.proyecto, ''))) = LOWER(TRIM(?)))
  )`;
}

function projectMatchParams(row) {
  const id = Number(row && row.id_proyecto_cobranza || 0);
  const proyecto = String(row && (row.proyecto_oficial || row.proyecto) || '').trim();
  return [id, id, proyecto, proyecto];
}

function selectMp(alias = 'mp') {
  return `${alias}.*,
    ${cobranzaScope.canonicalProjectSql_uni(alias)} AS proyecto_oficial,
    ${cobranzaScope.canonicalZoneCodeSql_uni(alias)} AS zona_oficial,
    ${cobranzaScope.canonicalZoneIdsSql_uni(alias)} AS zona_ids_oficial`;
}

function selectGc(alias = 'gc') {
  return `${alias}.*,
    ${cobranzaScope.canonicalProjectSql_uni(alias)} AS proyecto_oficial,
    ${cobranzaScope.canonicalZoneCodeSql_uni(alias)} AS zona_oficial,
    ${cobranzaScope.canonicalZoneIdsSql_uni(alias)} AS zona_ids_oficial`;
}

function selectPc(alias = 'pc') {
  return `${alias}.*,
    ${cobranzaScope.canonicalProjectSql_uni(alias)} AS proyecto_oficial,
    ${cobranzaScope.canonicalZoneCodeSql_uni(alias)} AS zona_oficial,
    ${cobranzaScope.canonicalZoneIdsSql_uni(alias)} AS zona_ids_oficial`;
}

function canonMp(row) { return cobranzaScope.canonicalizeRow_uni(row, 'z_oper'); }
function canonGc(row) { return cobranzaScope.canonicalizeRow_uni(row, 'z_oper'); }
function canonPc(row) { return cobranzaScope.canonicalizeRow_uni(row, 'zona_operativa'); }

async function getMainDetalleMp2026(req, res) {
  const conn = await db.getConnection();
  const mpScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'mp');
  const pcScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'pc');

  try {
    const [rawMpRows] = await conn.query(`
      SELECT mp.*, cp_mp_main.proyecto AS __proyecto_canonico
      FROM detalle_mp_2026 mp
      LEFT JOIN cobranza_proyectos cp_mp_main
        ON cp_mp_main.id_proyecto_cobranza = mp.id_proyecto_cobranza
      WHERE ${mpScope}
      ORDER BY mp.proyecto ASC, mp.id_dmp ASC
    `);

    // Para el adeudo VA de MP solo se necesitan llave de proyecto + adeudo.
    // Evita cargar pc.* y evita resolver zonas/proyecto canónico por cada fila de pc.
    const [rawPcRows] = await conn.query(`
      SELECT pc.id_pc, pc.id_proyecto_cobranza, pc.proyecto, pc.adeudo
      FROM pc pc
      WHERE ${pcScope}
    `);

    const pcRows = rawPcRows;
    const debtByProject = new Map();
    for (const row of pcRows) {
      const key = financialProjectKey(row);
      debtByProject.set(key, (debtByProject.get(key) || 0) + numberOrZero(row.adeudo));
    }

    const canonicalMpRows = await canonicalizeMainRows_uni(conn, rawMpRows, 'z_oper');
    const rows = canonicalMpRows.map((row) => ({
      ...row,
      adeudo_mp: numberOrZero(row.pendiente_corriente) + numberOrZero(row.pendiente_vencido),
      adeudo_va: debtByProject.get(financialProjectKey(row)) || 0
    }));

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
    const countedVa = new Set();

    for (const row of rows) {
      const pendiente = numberOrZero(row.pendiente);
      const key = financialProjectKey(row);
      kpis.monto_anual_total += numberOrZero(row.monto_anual);
      kpis.pendiente_corriente_total += numberOrZero(row.pendiente_corriente);
      kpis.pendiente_vencido_total += numberOrZero(row.pendiente_vencido);
      kpis.pendiente_total += pendiente;
      kpis.facturas_pendientes_total += numberOrZero(row.facturas_pendientes);
      kpis.adeudo_mp_total += numberOrZero(row.adeudo_mp);
      if (!countedVa.has(key)) {
        countedVa.add(key);
        kpis.adeudo_va_total += numberOrZero(row.adeudo_va);
      }
      if (pendiente > 0 || numberOrZero(row.facturas_pendientes) > 0) kpis.registros_con_pendiente += 1;
    }
    kpis.adeudo_total = kpis.adeudo_mp_total + kpis.adeudo_va_total;

    return res.json({
      ok: true,
      source: 'aiven',
      table: 'detalle_mp_2026',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
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
    return res.status(500).json({ ok: false, message: 'No fue posible consultar Mantenimiento Preventivo 2026 desde Aiven.', error: error.message });
  } finally {
    conn.release();
  }
}

async function getDetalleMp2026(req, res) {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: 'id_dmp invalido.' });
  const conn = await db.getConnection();
  const baseScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'mp');

  try {
    const [rows] = await conn.query(`SELECT ${selectMp('mp')} FROM detalle_mp_2026 mp WHERE mp.id_dmp = ? AND ${baseScope} LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'No se encontro el registro de Mantenimiento Preventivo dentro de los cuartos autorizados.' });
    const mantenimiento = canonMp(rows[0]);
    const match = projectMatchParams(mantenimiento);

    const mpScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'mp');
    const [mpRows] = await conn.query(`SELECT ${selectMp('mp')} FROM detalle_mp_2026 mp WHERE ${projectMatchSql('mp')} AND ${mpScope} ORDER BY mp.id_dmp ASC`, match);

    const gcScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'gc');
    const [gcRows] = await conn.query(`SELECT ${selectGc('gc')} FROM gestion_credito gc WHERE ${projectMatchSql('gc')} AND ${gcScope} ORDER BY gc.id_gc ASC LIMIT 1`, match);

    const pcScope = cobranzaScope.buildCobranzaProjectScopeSql_uni(req, 'pc');
    const [pcRows] = await conn.query(`SELECT ${selectPc('pc')} FROM pc pc WHERE ${projectMatchSql('pc')} AND ${pcScope} ORDER BY pc.id_pc ASC`, match);

    return res.json({
      ok: true,
      source: 'aiven',
      generated_at: new Date().toISOString(),
      alcance: cobranzaScope.alcancePayload_uni(req),
      mantenimiento,
      gestion_credito: gcRows[0] ? canonGc(gcRows[0]) : null,
      mantenimiento_preventivo: mpRows.map(canonMp),
      venta_adicional: pcRows.map(canonPc)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'No fue posible consultar el detalle de Mantenimiento Preventivo desde Aiven.', error: error.message });
  } finally {
    conn.release();
  }
}

module.exports = {
  getMainDetalleMp2026,
  getDetalleMp2026
};
