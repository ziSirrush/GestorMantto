'use strict';

const dashboardOperativoService = require('./dashboard-operativo.service');
const { mexicoCityDate } = require('../../utils/temporal');

function normalizeMes(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return mexicoCityDate().slice(0, 7);
}

async function getInitialData(req, res) {
  try {
    const mes = normalizeMes(req.query.mes);
    const data = await dashboardOperativoService.getInitialData(
      mes,
      req.informationAccess || null
    );

    return res.json({
      ok: true,
      source: 'aiven',
      mes,
      data: {
        portafolio: data.portafolio,
        tickets: data.tickets,
        supervisores: data.supervisores,
        preventivos_supervisor: data.preventivos_supervisor
      },
      alcance: data.alcance,
      total: {
        portafolio: data.portafolio.length,
        tickets: data.tickets.length,
        supervisores: data.supervisores.length
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando carga inicial del Dashboard Operativo.',
      error: error.message
    });
  }
}

async function getPreventivosSupervisor(req, res) {
  try {
    const mes = String(req.query.mes || '').trim();

    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({
        ok: false,
        message: 'El parámetro mes debe usar el formato YYYY-MM.'
      });
    }

    const data = await dashboardOperativoService.getPreventivosSupervisor(
      mes,
      req.informationAccess || null
    );

    return res.json({
      ok: true,
      source: 'aiven',
      mes,
      data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error consultando servicios preventivos por supervisor.',
      error: error.message
    });
  }
}

module.exports = {
  getInitialData,
  getPreventivosSupervisor
};
