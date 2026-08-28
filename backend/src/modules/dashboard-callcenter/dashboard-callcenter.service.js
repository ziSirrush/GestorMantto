'use strict';

const repository = require('./dashboard-callcenter.repository');
const {
  hasUnrestrictedUnitedScope_gnral,
  zoneIds_gnral,
  zoneCodes_gnral
} = require('../../services/information-record-scope-gnral.service');

async function getInitialData(req) {
  const unrestricted = hasUnrestrictedUnitedScope_gnral(req);
  const zoneIds = zoneIds_gnral(req);
  const zoneCodes = zoneCodes_gnral(req);

  if (!unrestricted && (!Array.isArray(zoneIds) || !zoneIds.length)) {
    return {
      ok: true,
      source: 'aiven',
      data: { tickets: [], portafolio: [] },
      alcance: { zona_ids: [], zonas: zoneCodes || [] },
      total: { tickets: 0, portafolio: 0 }
    };
  }

  const data = await repository.getInitialData(req);
  return {
    ok: true,
    source: 'aiven',
    data,
    period: data.period || { from: null, to: null },
    alcance: {
      zona_ids: zoneIds,
      zonas: zoneCodes
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
