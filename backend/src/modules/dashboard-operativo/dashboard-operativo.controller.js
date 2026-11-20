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
      req.informationAccess || null,
      {
        dias: Number(req.query.criticos_periodo || req.query.dias || (req.user && req.user.criticos_periodo)) || 35,
        minFallas: Number(req.query.min_fallas || req.query.criticos_fallas || (req.user && req.user.criticos_fallas)) || 3
      }
    );

    return res.json({
      ok: true,
      source: 'aiven',
      mode: 'SNAPSHOT_FULL',
      snapshot: { version: 'DASHBOARD_OPERATIVO_SNAPSHOT_V001', meses_preventivos: 12, ...(process.env.BLT_OPT_OPERATIVO_TICKETS_WINDOW_V1==='1'?{tickets_window:'SIX_MONTHS'}:{}) },
      mes,
      data: {
        portafolio: data.portafolio,
        tickets: data.tickets,
        supervisores: data.supervisores,
        preventivos_supervisor: data.preventivos_supervisor,
        preventivos_por_mes: data.preventivos_por_mes,
        criticidad: data.criticidad,
        criticos_codigos: data.criticos_codigos
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

async function getTicketsHistorical(req,res,next) {
  try {
    if(process.env.BLT_OPT_OPERATIVO_TICKETS_WINDOW_V1!=='1')return res.status(404).json({ok:false});
    const mes=String(req.query?.mes||'').trim();
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))return res.status(400).json({ok:false,message:'Mes inválido.'});
    const data=await dashboardOperativoService.getTicketsByMonth(mes,req.informationAccess||null);
    return res.json({ok:true,source:'aiven',mes,data:{tickets:data}});
  } catch(error) {
    if(typeof next==='function')return next(error);
    return res.status(500).json({ok:false,message:'No fue posible cargar el mes.'});
  }
}
module.exports = {
  getInitialData,
  getTicketsHistorical,
  getPreventivosSupervisor
};
