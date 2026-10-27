'use strict';

const repository = require('./experimental-ns-equipos-criticos.repository');
const metrics = require('./experimental-ns-equipos-criticos.metrics');
const scope = require('./experimental-ns.scope');

const REQUIRED_PERMISSION = 'EXPERIMENTAL_NS_EQUIPOS_CRITICOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';

function badRequest(message) {
  const error = new Error(message);
  error.code = 'EXPERIMENTAL_NS_CRITICAL_BAD_REQUEST';
  error.statusCode = 400;
  return error;
}
function intParam(raw, fallback, min, max, name) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (!/^\d+$/.test(String(raw))) throw badRequest(`Parametro ${name} invalido.`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw badRequest(`Parametro ${name} fuera de rango (${min}-${max}).`);
  return n;
}
function textParam(raw, max, label) {
  if (raw === undefined || raw === null) return '';
  if (typeof raw !== 'string' || raw.length > max) throw badRequest(`Parametro ${label} invalido.`);
  return raw.trim();
}
function getAccess(req) {
  const info = scope.assertScope(req);
  if (info.permission_code !== REQUIRED_PERMISSION) {
    const error = new Error('Se requiere permiso individual de Equipos Criticos Experimental NS.');
    error.code = 'EXPERIMENTAL_NS_EQUIPMENT_PERMISSION_REQUIRED';
    error.statusCode = 403;
    throw error;
  }
  return info;
}
function criteriaFromReq(req) {
  const q = req.query || {};
  const user = req.user || {};
  const userFallas = intParam(user.criticos_fallas, 3, 1, 9999, 'criticos_fallas');
  const userDias = intParam(user.criticos_periodo, 35, 1, 3650, 'criticos_periodo');
  const pageSize = intParam(q.page_size, 25, 5, 100, 'page_size');
  return {
    equipos: {
      min_fallas: intParam(q.min_fallas, userFallas, 1, 9999, 'min_fallas'),
      dias: intParam(q.dias, userDias, 1, 3650, 'dias'),
      zona: textParam(q.zona, 100, 'zona'),
      proyecto: textParam(q.proyecto, 150, 'proyecto'),
      search: textParam(q.search, 150, 'search'),
      page: intParam(q.page_equipos, 1, 1, 100000, 'page_equipos'),
      page_size: pageSize
    },
    proyectos: {
      min_fallas: intParam(q.min_fallas_proyecto, 5, 1, 9999, 'min_fallas_proyecto'),
      min_fallas_equipo: intParam(q.min_fallas_equipo, userFallas, 1, 9999, 'min_fallas_equipo'),
      dias: intParam(q.dias_proyectos, userDias, 1, 3650, 'dias_proyectos'),
      zona: textParam(q.zona_proyectos, 100, 'zona_proyectos'),
      proyecto: textParam(q.proyecto_proyectos, 150, 'proyecto_proyectos'),
      page: intParam(q.page_proyectos, 1, 1, 100000, 'page_proyectos'),
      page_size: pageSize
    }
  };
}

async function getInitial(req) {
  getAccess(req);
  const criteria = criteriaFromReq(req);
  const snapshot = await repository.readSnapshot(req);
  const data = metrics.evaluate(snapshot.portafolio, snapshot.tickets, criteria);
  return {
    ok: true, source: 'experimental-ns', modo: 'SOLO_LECTURA',
    tablas: ['ns_portafolio_pruebas','ns_tickets_pruebas'],
    criterios: criteria, fecha_cdmx: data.hoy, calendario: data.calendario,
    pagination: { equipos: {page: data.equipos.page, page_size: data.equipos.page_size,total:data.equipos.total},
      proyectos: {page:data.proyectos.page,page_size:data.proyectos.page_size,total:data.proyectos.total} },
    data: { equipos: data.equipos.data, proyectos: data.proyectos.data, u365: data.u365 },
    calidad: data.calidad
  };
}

async function getDetail(req) {
  getAccess(req);
  const type = textParam(req.query?.tipo, 15, 'tipo');
  if (type !== 'equipo' && type !== 'proyecto') throw badRequest('El tipo de detalle debe ser equipo o proyecto.');
  const value = textParam(req.query?.valor, 300, 'valor');
  if (!value) throw badRequest('Se requiere identificador de equipo/proyecto.');
  const days = intParam(req.query?.dias, 35, 1, 3650, 'dias');
  const reqCriteria = criteriaFromReq(req);
  const snapshot = await repository.readSnapshot(req);
  const result = metrics.evaluate(snapshot.portafolio,snapshot.tickets,reqCriteria);
  const all = type === 'equipo' ? result.details.equipo(value,days) : result.details.proyecto(value,days);
  const limit = 1000;
  return {
    ok: true,source:'experimental-ns',modo:'SOLO_LECTURA',
    tablas:['ns_portafolio_pruebas','ns_tickets_pruebas'],
    criterio: {tipo, valor, dias:days, responsabilidad:'BLT'},
    total: all.length, limitado: all.length > limit,
    data: all.slice(0,limit).map(row => ({
      ticket:row.ticket, fecha_reporte:row.fecha_reporte, estado_ticket:row.estado_ticket,
      proyecto:row.proyecto_oficial, codigo_equipo:row.codigo_equipo,
      zona:row.zona_oficial, responsabilidad:row.responsabilidad,
      causa:row.causa, causa_falla:row.causa_falla,tiempo_llegada:row.tiempo_llegada,
      tiempo_solucion:row.tiempo_solucion, custeventblt_mot_det:row.custeventblt_mot_det
    }))
  };
}

module.exports = { getInitial, getDetail, criteriaFromReq, REQUIRED_PERMISSION };
