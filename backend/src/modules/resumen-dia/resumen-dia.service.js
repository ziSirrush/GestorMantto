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

// Capacidad exclusiva de la sesión real del Director General. No se hereda
// por Programador, por llave maestra ni por la identidad del visor.
function canUseRecentDeliveries_uni(req) {
  const access = req?.informationAccess;
  const actor = req?.actorUser;
  const effective = req?.contextUser;
  const id = Number(actor?.id_SB);
  if (!access || access.dominio !== 'UNITED' || req?.viewerContext?.active ||
      !Number.isSafeInteger(id) || id <= 0 || Number(effective?.id_SB) !== id ||
      Number(access.actor_user_id) !== id || Number(access.effective_user_id) !== id) return false;
  const roles = new Set([actor.rol, ...(Array.isArray(actor.roles) ? actor.roles : [])]);
  return roles.has('Director General');
}

function recentDeliveriesOption_uni(req) {
  const query = req?.query || {};
  const available = canUseRecentDeliveries_uni(req);
  if (!Object.prototype.hasOwnProperty.call(query, 'entregas_recientes'))
    return { disponible:available, activa:false, meses:12 };
  if (!available) {
    const error = new Error('Filtro exclusivo de Dirección General en su sesión propia.');
    error.status = 403;
    error.code = 'RESUMEN_DIA_ENTREGAS_NO_AUTORIZADO';
    throw error;
  }
  if (query.vista !== 'ejecutiva' || !['0','1'].includes(query.entregas_recientes)) {
    const error = new Error('El filtro de Entregas Recientes sólo admite 0 o 1 en la vista ejecutiva.');
    error.status = 400;
    error.code = 'RESUMEN_DIA_ENTREGAS_FILTRO_INVALIDO';
    throw error;
  }
  return { disponible:true, activa:query.entregas_recientes === '1', meses:12 };
}

// Modalidad optativa de Operación, bajo su Guard UNITED original.
// No cambia SNAPSHOT_FULL de Netlify ni el contrato de respaldo Offline.
async function getExecutiveData(req, entregasRecientes) {
  const engine = require('../experimental-resumen-dia/experimental-resumen-dia.service');
  const user = req.contextUser || req.user || {};
  const dias = Math.max(1, Math.min(3650, Number.parseInt(req.query?.criticos_periodo || user.criticos_periodo,10) || 35));
  const minFallas = Math.max(1, Math.min(9999, Number.parseInt(req.query?.min_fallas || user.criticos_fallas,10) || 3));
  const [summary, critical] = await Promise.all([
    engine.getResumenDia_exp(req, new Date(), {fecha:req.query?.fecha, soloDia:true, entregasRecientes:entregasRecientes.activa}),
    repository.getCriticosCodigos(req, dias, minFallas)
  ]);
  const codes = new Set(summary.tickets.map(row=>String(row.codigo_equipo||'').trim()).filter(Boolean));
  return {
    ok:true, source:'aiven', mode:'RESUMEN_DIA_EJECUTIVO_V001',
    period:summary.period, filters:summary.filters, selected_filters:summary.selected_filters,
    entregas_recientes:entregasRecientes,
    promedios:summary.promedios, alcance:summary.alcance, generated_at:summary.generated_at,
    data:{
      tickets:summary.tickets.map(row=>({...row,zona_oficial:row.zona})),
      criticidad:{dias,min_fallas_blt:minFallas},
      criticos_codigos:critical.map(row=>String(row.codigo_equipo||'').trim()).filter(code=>codes.has(code))
    }
  };
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
    if (req.query?.vista === 'ejecutiva') {
      const error = new Error('Sin alcance UNITED autorizado para el Resumen del Día.');
      error.status = 403;
      error.code = 'RESUMEN_DIA_ALCANCE_REQUERIDO';
      throw error;
    }
    return {
      ok: true,
      source: 'aiven',
      data: {
        tickets: [],
        portafolio: [],
        criticidad:{dias:Number(req && req.user && req.user.criticos_periodo)||35,min_fallas_blt:Number(req && req.user && req.user.criticos_fallas)||3},
        criticos_codigos:[]
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

  const entregasRecientes = recentDeliveriesOption_uni(req);
  if (req.query?.vista === 'ejecutiva') return getExecutiveData(req, entregasRecientes);

  const data = await repository.getInitialData(req);

  return {
    ok: true,
    source: 'aiven',
    mode: 'SNAPSHOT_FULL',
    snapshot:{version:'RESUMEN_DIA_SNAPSHOT_V001',refresh:'ACTUALIZAR'},
    data: {
      tickets: data.tickets,
      portafolio: data.portafolio,
      criticidad:data.criticidad,
      criticos_codigos:data.criticos_codigos
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
