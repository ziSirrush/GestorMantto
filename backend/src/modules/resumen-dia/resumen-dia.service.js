'use strict';

const repository = require('./resumen-dia.repository');
const {
  hasUnrestrictedUnitedScope_gnral
} = require('../../services/information-record-scope-gnral.service');

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

async function getInitialData(req) {
  const access = req?.informationAccess || null;
  const unrestricted = hasUnrestrictedUnitedScope_gnral(req);
  const zoneIds = normalizePositiveIds(access?.zona_ids);
  const zoneCodes = normalizeCodes(access?.zona_codigos);

  // Usuario normal sin cuartos falla cerrado. La llave maestra UNITED ya fue
  // validada por el Guard y no debe reintroducir usuario_zop en esta capa.
  if (!access || access.dominio !== 'UNITED' || (!unrestricted && (
    access.requiere_filtro_zona !== true || !zoneIds.length
  ))) {
    return {
      ok: true,
      source: 'aiven',
      data: {
        tickets: [],
        portafolio: []
      },
      alcance: {
        zona_ids: unrestricted ? null : zoneIds,
        zonas: unrestricted ? null : zoneCodes
      },
      total: {
        tickets: 0,
        portafolio: 0
      }
    };
  }

  const data = await repository.getInitialData(req);

  return {
    ok: true,
    source: 'aiven',
    data: {
      tickets: data.tickets,
      portafolio: data.portafolio
    },
    alcance: {
      zona_ids: unrestricted ? null : zoneIds,
      zonas: unrestricted ? null : zoneCodes
    },
    total: {
      tickets: data.tickets.length,
      portafolio: data.portafolio.length
    }
  };
}

module.exports = {
  getInitialData
};
