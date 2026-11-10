'use strict';

const repository = require('./dashboard-callcenter.repository');
const { mexicoCityCivilDateUtc } = require('../../utils/temporal');
const {
  hasUnrestrictedUnitedScope_gnral,
  zoneIds_gnral,
  zoneCodes_gnral
} = require('../../services/information-record-scope-gnral.service');

function elapsedYearDaysMexicoCity(value = new Date()) {
  const today = mexicoCityCivilDateUtc(value);
  if (!today) return 1;
  const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  return Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildProjectMtbc(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const project = String(row && row.proyecto || '').trim();
    if (!project) continue;
    const current = groups.get(project) || {
      proyecto: project,
      zona: row && row.zona || null,
      fallas_blt_anio: 0,
      fallas_blt_365: 0,
      equipos_con_falla_blt_anio: 0,
      equipos_con_falla_blt_365: 0,
      ultimo_blt: null
    };
    const yearFaults = num(row && row.fallas_blt_anio);
    const days365Faults = num(row && row.fallas_blt_365);
    current.fallas_blt_anio += yearFaults;
    current.fallas_blt_365 += days365Faults;
    if (yearFaults > 0) current.equipos_con_falla_blt_anio += 1;
    if (days365Faults > 0) current.equipos_con_falla_blt_365 += 1;
    if (row && row.ultimo_blt && (!current.ultimo_blt || String(row.ultimo_blt) > String(current.ultimo_blt))) {
      current.ultimo_blt = row.ultimo_blt;
    }
    groups.set(project, current);
  }
  const yearDays = elapsedYearDaysMexicoCity();
  return [...groups.values()].map((row) => ({
    ...row,
    mtbc_anio: row.fallas_blt_anio > 0
      ? Math.round((yearDays * row.equipos_con_falla_blt_anio / row.fallas_blt_anio) * 1000) / 1000
      : null,
    mtbc_365: row.fallas_blt_365 > 0
      ? Math.round((365 * row.equipos_con_falla_blt_365 / row.fallas_blt_365) * 1000) / 1000
      : null
  }));
}

function buildAnalytics(raw) {
  const analytics = raw && raw.analytics || {};
  const rows = Array.isArray(analytics.rows) ? analytics.rows : [];
  const criteria = analytics.criteria || { dias: 35, minFallas: 3 };
  const yearDays = elapsedYearDaysMexicoCity();
  const mtbcEquipos = rows.map((row) => {
    const yearFaults = num(row.fallas_blt_anio);
    const days365Faults = num(row.fallas_blt_365);
    return {
      ...row,
      mtbc_anio: yearFaults > 0 ? Math.round((yearDays / yearFaults) * 1000) / 1000 : null,
      mtbc_365: days365Faults > 0 ? Math.round((365 / days365Faults) * 1000) / 1000 : null
    };
  });
  const minFallas = num(criteria.minFallas) || 3;
  return {
    criticidad: { dias: num(criteria.dias) || 35, min_fallas_blt: minFallas },
    criticos_codigos: rows
      .filter((row) => num(row.fallas_blt_periodo_critico) >= minFallas)
      .map((row) => String(row.codigo_equipo || '').trim())
      .filter(Boolean),
    mtbc_equipos: mtbcEquipos,
    mtbc_proyectos: buildProjectMtbc(rows)
  };
}

function emptyU365Result(req) {
  return {
    ok: true,
    source: 'aiven',
    data: [],
    criteria: {
      dias_criticidad: Number(req && req.user && req.user.criticos_periodo) || 35,
      min_fallas_blt: Number(req && req.user && req.user.criticos_fallas) || 3
    },
    pagination: { page: 1, page_size: 100, total: 0 },
    alcance: { zona_ids: [], zonas: zoneCodes_gnral(req) || [] }
  };
}

async function getCallCenterU365Equipos(req) {
  const unrestricted = hasUnrestrictedUnitedScope_gnral(req);
  const zoneIds = zoneIds_gnral(req);
  if (!unrestricted && (!Array.isArray(zoneIds) || !zoneIds.length)) return emptyU365Result(req);

  const result = await repository.getCallCenterU365Equipos(req);
  return {
    ok: true,
    source: 'aiven',
    view: 'Detalle Llamadas U365D - Equipos',
    criteria: {
      dias_criticidad: result.criteria.dias,
      min_fallas_blt: result.criteria.minFallas
    },
    pagination: result.pagination,
    data: result.rows,
    alcance: { zona_ids: zoneIds, zonas: zoneCodes_gnral(req) }
  };
}

async function getCallCenterU365Proyectos(req) {
  const unrestricted = hasUnrestrictedUnitedScope_gnral(req);
  const zoneIds = zoneIds_gnral(req);
  if (!unrestricted && (!Array.isArray(zoneIds) || !zoneIds.length)) return emptyU365Result(req);

  const result = await repository.getCallCenterU365Proyectos(req);
  return {
    ok: true,
    source: 'aiven',
    view: 'Detalle Llamadas U365D - Proyectos',
    criteria: {
      dias_criticidad: result.criteria.dias,
      min_fallas_blt: result.criteria.minFallas
    },
    pagination: result.pagination,
    data: result.rows,
    alcance: { zona_ids: zoneIds, zonas: zoneCodes_gnral(req) }
  };
}

async function getInitialData(req) {
  const unrestricted = hasUnrestrictedUnitedScope_gnral(req);
  const zoneIds = zoneIds_gnral(req);
  const zoneCodes = zoneCodes_gnral(req);

  if (!unrestricted && (!Array.isArray(zoneIds) || !zoneIds.length)) {
    return {
      ok: true,
      source: 'aiven',
      data: {
        tickets: [],
        portafolio: [],
        criticidad: { dias: Number(req && req.user && req.user.criticos_periodo) || 35, min_fallas_blt: Number(req && req.user && req.user.criticos_fallas) || 3 },
        criticos_codigos: [],
        mtbc_equipos: [],
        mtbc_proyectos: []
      },
      alcance: { zona_ids: [], zonas: zoneCodes || [] },
      total: { tickets: 0, portafolio: 0 }
    };
  }

  const raw = await repository.getInitialData(req);
  const analytics = buildAnalytics(raw);
  const data = { tickets: raw.tickets, portafolio: raw.portafolio, ...analytics };
  return {
    ok: true,
    source: 'aiven',
    mode: 'SNAPSHOT_FULL',
    snapshot: { version: 'CALLCENTER_SNAPSHOT_V001', refresh: 'PERIODO_O_ACTUALIZAR' },
    data,
    period: raw.period || { from: null, to: null },
    alcance: {
      zona_ids: zoneIds,
      zonas: zoneCodes
    },
    total: {
      tickets: data.tickets.length,
      portafolio: data.portafolio.length,
      mtbc_equipos: data.mtbc_equipos.length,
      mtbc_proyectos: data.mtbc_proyectos.length,
      criticos: data.criticos_codigos.length
    }
  };
}

module.exports = {
  getInitialData,
  getCallCenterU365Equipos,
  getCallCenterU365Proyectos
};
