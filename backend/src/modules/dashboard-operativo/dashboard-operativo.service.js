'use strict';

const dashboardOperativoRepository = require('./dashboard-operativo.repository');
const {
  hasUnrestrictedUnitedScope_gnral
} = require('../../services/information-record-scope-gnral.service');

function normalizarZona(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, '');
}

function normalizePositiveIds(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

function normalizeCodes(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean))]
    .sort();
}

function groupSupervisores(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = Number(row.supervisor_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!map.has(id)) {
      map.set(id, {
        id_SB: id,
        nombre: String(row.supervisor || '').trim(),
        iniciales: String(row.iniciales || '').trim(),
        roles: ['Supervisor Mantenimiento Zona'],
        zonas: []
      });
    }
    const item = map.get(id);
    const zonaId = Number(row.id_zona);
    const zona = String(row.zona || '').trim();
    if (zonaId > 0 && zona && !item.zonas.some((z) => z.id_zona === zonaId)) {
      item.zonas.push({
        id_zona: zonaId,
        zona,
        nombre: String(row.zona_nombre || '').trim()
      });
    }
  }
  return [...map.values()];
}

function buildPreventivosSupervisor(supervisores, servicios) {
  const porZona = new Map(
    servicios.map((row) => [
      String(row.zona_clave || ''),
      {
        programados: Number(row.programados || 0),
        realizados: Number(row.realizados || 0)
      }
    ])
  );

  const porSupervisor = new Map();

  for (const row of supervisores) {
    const id = Number(row.supervisor_id);

    if (!porSupervisor.has(id)) {
      porSupervisor.set(id, {
        supervisor_id: id,
        supervisor: row.supervisor,
        zonas: [],
        programados: 0,
        realizados: 0
      });
    }

    const item = porSupervisor.get(id);
    const zona = String(row.zona || '').trim();
    const conteo = porZona.get(normalizarZona(zona)) || {
      programados: 0,
      realizados: 0
    };

    item.zonas.push(zona);
    item.programados += conteo.programados;
    item.realizados += conteo.realizados;
  }

  return [...porSupervisor.values()].map((item) => ({
    ...item,
    porcentaje: item.programados
      ? Math.round((item.realizados / item.programados) * 100)
      : 0
  }));
}

function monthsWindow(mes, count = 12) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(mes || '').trim());
  if (!match) return [];
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12));
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() - i);
    rows.push(String(d.getUTCFullYear()) + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'));
  }
  return rows;
}

function buildPreventivosByMonth(supervisores, servicios, meses) {
  const out = {};
  for (const mes of meses || []) {
    const rows = (servicios || []).filter((row) => String(row.mes || '') === mes);
    out[mes.replace('-', '_')] = buildPreventivosSupervisor(supervisores, rows);
  }
  return out;
}

async function getPreventivosSupervisor(mes, informationAccess = null) {
  const [supervisores, servicios] = await Promise.all([
    dashboardOperativoRepository.getSupervisoresActivosPorZona(informationAccess),
    dashboardOperativoRepository.getPreventivosPorZona(mes, informationAccess)
  ]);
  return buildPreventivosSupervisor(supervisores, servicios);
}

async function getInitialData(mes, informationAccess = null, criticidad = {}) {
  const unrestricted = hasUnrestrictedUnitedScope_gnral(informationAccess);
  const zoneIds = normalizePositiveIds(informationAccess?.zona_ids);
  const zoneCodes = normalizeCodes(informationAccess?.zona_codigos);

  if (
    !informationAccess ||
    informationAccess.dominio !== 'UNITED' ||
    (!unrestricted && (
      informationAccess.requiere_filtro_zona !== true ||
      !zoneIds.length
    ))
  ) {
    return {
      portafolio: [],
      tickets: [],
      supervisores: [],
      preventivos_supervisor: [],
      preventivos_por_mes: {},
      criticidad: { dias: Number(criticidad.dias) || 35, min_fallas_blt: Number(criticidad.minFallas) || 3 },
      criticos_codigos: [],
      alcance: { zona_ids: unrestricted ? null : zoneIds, zonas: unrestricted ? null : zoneCodes }
    };
  }

  const meses = monthsWindow(mes, 12);
  const dias = Number(criticidad.dias) || 35;
  const minFallas = Number(criticidad.minFallas) || 3;
  const [portafolio, tickets, supervisoresRows, preventivosRows, criticosRows] = await Promise.all([
    dashboardOperativoRepository.getPortafolioInicial(informationAccess),
    dashboardOperativoRepository.getTicketsInicial(informationAccess),
    dashboardOperativoRepository.getSupervisoresActivosPorZona(informationAccess),
    dashboardOperativoRepository.getPreventivosPorMeses(meses, informationAccess),
    dashboardOperativoRepository.getCriticosCodigos(dias, minFallas, informationAccess)
  ]);

  return {
    portafolio,
    tickets,
    supervisores: groupSupervisores(supervisoresRows),
    preventivos_supervisor: buildPreventivosSupervisor(supervisoresRows, preventivosRows.filter((row) => String(row.mes || '') === mes)),
    preventivos_por_mes: buildPreventivosByMonth(supervisoresRows, preventivosRows, meses),
    criticidad: { dias, min_fallas_blt: minFallas },
    criticos_codigos: criticosRows.map((row) => String(row.codigo_equipo || '').trim()).filter(Boolean),
    alcance: { zona_ids: unrestricted ? null : zoneIds, zonas: unrestricted ? null : zoneCodes }
  };
}

module.exports = {
  getPreventivosSupervisor,
  getInitialData,
  groupSupervisores,
  buildPreventivosSupervisor,
  monthsWindow,
  buildPreventivosByMonth
};
