'use strict';

// BLT NOW | EXPERIMENTAL_NS_F5 | Contrato GET, solo lectura.
const repository = require('./experimental-ns-proyectos-mantenimiento.repository');
const metrics = require('./experimental-ns-proyectos-mantenimiento.metrics');
const scope = require('./experimental-ns.scope');

const REQUIRED_PERMISSION = 'EXPERIMENTAL_NS_PROYECTOS_MANTENIMIENTO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL';
const TABLES = Object.freeze(['ns_portafolio_pruebas','ns_tickets_pruebas']);
function getAccess(req) {
  const access = scope.assertScope(req);
  if (access.permission_code !== REQUIRED_PERMISSION) {
    const error = new Error('Permiso individual requerido para Proyectos Experimental NS.');
    error.statusCode=403;
    error.code='EXPERIMENTAL_NS_PROJECT_PERMISSION_REQUIRED';
    throw error;
  }
  return access;
}
function queryDetails(req) {
  const criteria=metrics.parseCriteria(req.query || {});
  const key=req.query?.proyecto_clave;
  if (typeof key !== 'string' || !key.trim() || key.length>300 || /[\x00-\x1f\x7f]/.test(key)) {
    const error = new Error('El detalle requiere un identificador de proyecto valido.');
    error.statusCode=400;
    error.code='EXPERIMENTAL_NS_PROJECT_KEY_INVALID';
    throw error;
  }
  return {criteria,key:key.trim()};
}
async function getInitial(req) {
  getAccess(req);
  const criteria=metrics.parseCriteria(req.query || {});
  const snapshot=await repository.readSnapshot(req);
  const result=metrics.calc(snapshot.portafolio,snapshot.tickets,criteria);
  return {
    ok:true,source:'experimental-ns',modo:'SOLO_LECTURA',tablas:[...TABLES],
    fecha_cdmx:result.hoy,criterios:criteria,
    filtros:result.filters,summary:result.summary,data:result.rows,
    pagination:{page:criteria.page,page_size:criteria.page_size,total:result.total,
      pages:Math.ceil(result.total/criteria.page_size)},
    calidad:result.quality
  };
}
async function getDetail(req) {
  getAccess(req);
  const {criteria,key}=queryDetails(req);
  const snapshot=await repository.readSnapshot(req);
  const result=metrics.calc(snapshot.portafolio,snapshot.tickets,criteria);
  const detail=result.detalle(key);
  if (!detail) {
    const error = new Error('Proyecto no encontrado entre los equipos NS autorizados.');
    error.statusCode=404;
    error.code='EXPERIMENTAL_NS_PROJECT_NOT_FOUND';
    throw error;
  }
  // La grafica del ano anterior es informacion de DETALLE. Se calcula con
  // COUNT agrupado por mes para codigos de equipo del proyecto verificado;
  // nunca se recuperan los tickets antiguos ni se amplia el snapshot general.
  if (typeof repository.previousYearMonthly==='function') {
    const codes=snapshot.portafolio.filter(p=>metrics.isActive(p) && metrics.groupKey(p)===key)
      .map(p=>p.numero_equipo);
    detail.mensual_anterior=await repository.previousYearMonthly(
      req,codes,Number(result.hoy.slice(0,4))-1);
  }
  return {ok:true,source:'experimental-ns',modo:'SOLO_LECTURA',
    tablas:[...TABLES],fecha_cdmx:result.hoy,
    data:detail,calidad:result.quality};
}
module.exports={REQUIRED_PERMISSION, getInitial,getDetail,queryDetails};
