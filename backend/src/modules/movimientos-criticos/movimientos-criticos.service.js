'use strict';

const db = require('../../config/db');
const {
  buildPortafolioScopeSqlInline_gnral
} = require('../../services/information-record-scope-gnral.service');

function parseJson(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function positiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeType(value) {
  const type = normalizeText(value).toUpperCase();
  return ['ENTRA_CRITICO', 'SALE_CRITICO'].includes(type) ? type : '';
}

function equipmentKey(value) {
  return normalizeText(value).toUpperCase();
}

async function getVisibleEquipmentCodes(req, equipmentCodes) {
  const requested = [...new Set((equipmentCodes || [])
    .map(normalizeText)
    .filter(Boolean))];
  if (!requested.length) return new Set();

  const scope = buildPortafolioScopeSqlInline_gnral(req, 'p');
  const placeholders = requested.map(() => '?').join(', ');
  const [rows] = await db.query(`
    SELECT DISTINCT p.numero_equipo
    FROM portafolio p
    WHERE p.estado_registro = 1
      AND p.numero_equipo IN (${placeholders})
      AND ${scope.sql}
  `, requested);

  return new Set(rows.map((row) => equipmentKey(row.numero_equipo)).filter(Boolean));
}

async function listCuts(_req, res, next) {
  try {
    const [rows] = await db.query(`
      SELECT
        id_corte,
        anio_iso,
        semana_iso,
        fecha_inicio,
        fecha_fin,
        fecha_corte,
        criterio_fallas,
        criterio_dias,
        estado,
        created_at
      FROM criticos_cortes_semanales
      WHERE estado = 'CERRADO'
      ORDER BY anio_iso DESC, semana_iso DESC
      LIMIT 260
    `);

    return res.json({
      ok: true,
      source: 'aiven',
      data: rows
    });
  } catch (error) {
    return next(error);
  }
}

async function loadSelectedCut(req) {
  const anio = Number.parseInt(req.query.anio, 10);
  const semana = Number.parseInt(req.query.semana, 10);

  if (Number.isInteger(anio) && Number.isInteger(semana)) {
    const [rows] = await db.query(`
      SELECT *
      FROM criticos_cortes_semanales
      WHERE anio_iso = ?
        AND semana_iso = ?
        AND estado = 'CERRADO'
      LIMIT 1
    `, [anio, semana]);
    return rows[0] || null;
  }

  const [rows] = await db.query(`
    SELECT *
    FROM criticos_cortes_semanales
    WHERE estado = 'CERRADO'
    ORDER BY anio_iso DESC, semana_iso DESC
    LIMIT 1
  `);
  return rows[0] || null;
}

async function getMovements(req, res, next) {
  try {
    const cut = await loadSelectedCut(req);
    if (!cut) {
      return res.json({
        ok: true,
        source: 'aiven',
        corte: null,
        kpis: { total: 0, entradas: 0, salidas: 0 },
        data: []
      });
    }

    const rawMovements = parseJson(cut.movimientos_json, []);
    const movements = Array.isArray(rawMovements) ? rawMovements : [];
    const visibleCodes = await getVisibleEquipmentCodes(
      req,
      movements.map((row) => row.equipo)
    );

    const type = normalizeType(req.query.tipo);
    const search = normalizeText(req.query.search || req.query.buscar).toLowerCase();
    const zoneId = positiveInt(req.query.zona_id, 0, 0, 999999999);

    const filtered = movements.filter((row) => {
      if (!visibleCodes.has(equipmentKey(row.equipo))) return false;
      if (type && normalizeType(row.tipo) !== type) return false;
      if (zoneId && Number(row.zona_id) !== zoneId) return false;
      if (search) {
        const haystack = [
          row.equipo,
          row.proyecto,
          row.referencia_en_sitio,
          row.zona,
          row.supervisor
        ].map((value) => normalizeText(value).toLowerCase()).join(' | ');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const kpis = filtered.reduce((acc, row) => {
      acc.total += 1;
      if (row.tipo === 'ENTRA_CRITICO') acc.entradas += 1;
      else if (row.tipo === 'SALE_CRITICO') acc.salidas += 1;
      return acc;
    }, { total: 0, entradas: 0, salidas: 0 });

    return res.json({
      ok: true,
      source: 'aiven',
      corte: {
        id_corte: cut.id_corte,
        anio_iso: cut.anio_iso,
        semana_iso: cut.semana_iso,
        fecha_inicio: cut.fecha_inicio,
        fecha_fin: cut.fecha_fin,
        fecha_corte: cut.fecha_corte,
        criterio_fallas: cut.criterio_fallas,
        criterio_dias: cut.criterio_dias,
        linea_base: !cut.id_corte_anterior
      },
      kpis,
      data: filtered
    });
  } catch (error) {
    return next(error);
  }
}

async function getCurrentSnapshot(req, res, next) {
  try {
    const cut = await loadSelectedCut(req);
    if (!cut) return res.json({ ok: true, source: 'aiven', corte: null, data: [] });

    const rawSnapshot = parseJson(cut.snapshot_json, []);
    const snapshot = Array.isArray(rawSnapshot) ? rawSnapshot : [];
    const visibleCodes = await getVisibleEquipmentCodes(req, snapshot.map((row) => row.equipo));
    const onlyCritical = String(req.query.solo_criticos || '').toLowerCase();
    const filterCritical = ['1', 'true', 'si', 'sí'].includes(onlyCritical);

    const data = snapshot.filter((row) => {
      if (!visibleCodes.has(equipmentKey(row.equipo))) return false;
      if (filterCritical && !row.es_critico) return false;
      return true;
    });

    return res.json({
      ok: true,
      source: 'aiven',
      corte: {
        id_corte: cut.id_corte,
        anio_iso: cut.anio_iso,
        semana_iso: cut.semana_iso,
        fecha_inicio: cut.fecha_inicio,
        fecha_fin: cut.fecha_fin,
        fecha_corte: cut.fecha_corte,
        criterio_fallas: cut.criterio_fallas,
        criterio_dias: cut.criterio_dias
      },
      data
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCuts,
  getMovements,
  getCurrentSnapshot
};
