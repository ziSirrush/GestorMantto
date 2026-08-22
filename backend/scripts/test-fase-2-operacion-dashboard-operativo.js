'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const frontend = read('modules/dashboard-operativo/dashboard-operativo.js');
const repository = read('backend/src/modules/dashboard-operativo/dashboard-operativo.repository.js');
const service = read('backend/src/modules/dashboard-operativo/dashboard-operativo.service.js');
const routes = read('backend/src/modules/dashboard-operativo/dashboard-operativo.routes.js');

assert(routes.includes("'/operacion/dashboard-operativo/inicial'"), 'Falta endpoint inicial dedicado.');
assert(routes.includes("domain: 'UNITED'"), 'El endpoint inicial debe usar dominio UNITED.');
assert(routes.includes("groupingCodesAny: ['OPERACION']"), 'El endpoint inicial debe exigir la puerta OPERACION.');
assert(routes.includes('permissionCodesAny: DASHBOARD_OPERATIVO_READ_PERMISSIONS'), 'El endpoint inicial debe validar permiso funcional del Dashboard Operativo.');

assert(repository.includes("buildPortafolioScopeSql_gnral(informationAccess, 'p')"), 'Portafolio inicial no consume alcance territorial.');
assert(repository.includes('INNER JOIN z_op z_op_ini'), 'Portafolio inicial no resuelve la zona oficial desde z_op.');
assert(repository.includes('z_op_ini.zona AS zona_oficial'), 'Portafolio inicial no devuelve zona oficial.');
assert(repository.includes("buildTicketScopeSql_gnral(informationAccess, 't')"), 'Tickets iniciales no consumen alcance territorial.');
assert(repository.includes('AS zona_oficial'), 'Tickets iniciales no canonizan la zona.');

const preventivosBlock = repository.slice(
  repository.indexOf('async function getPreventivosPorZona'),
  repository.indexOf('module.exports')
);
assert(preventivosBlock.includes('INNER JOIN z_op z_prev'), 'Preventivos debe resolver zona mediante portafolio.zona_id -> z_op.');
assert(preventivosBlock.includes('z_prev.zona'), 'Preventivos debe agrupar por z_op.zona.');
assert(!preventivosBlock.includes('TRIM(p.zona_operativa)'), 'Preventivos no debe agrupar por portafolio.zona_operativa.');

assert(service.includes('informationAccess.requiere_filtro_zona !== true'), 'La carga inicial debe fallar cerrado sin filtro de cuartos.');
assert(service.includes('!zoneIds.length'), 'La carga inicial debe fallar cerrado sin zonas asignadas.');
assert(service.includes('getPortafolioInicial(informationAccess)'), 'La carga inicial debe consultar Portafolio con alcance.');
assert(service.includes('getTicketsInicial(informationAccess)'), 'La carga inicial debe consultar Tickets con alcance.');
assert(service.includes('getSupervisoresActivosPorZona(informationAccess)'), 'La carga inicial debe filtrar supervisores por cuartos.');

assert(frontend.includes("'/api/operacion/dashboard-operativo/inicial?mes='"), 'Frontend no usa la llamada inicial dedicada.');
assert(frontend.includes("['zona_oficial','zona','zona_operativa'"), 'Frontend no prioriza zona_oficial.');
assert(frontend.includes("preventivosMes:''"), 'Frontend no controla el mes ya recibido en la carga inicial.');
assert(frontend.includes('if(state.preventivosMes!==mes)'), 'Frontend volvería a pedir preventivos en el primer render.');

const loadStart = frontend.indexOf('async function loadData(){');
const loadEnd = frontend.indexOf('function filteredPortfolio()', loadStart);
assert(loadStart >= 0 && loadEnd > loadStart, 'No se pudo aislar loadData().');
const loadBlock = frontend.slice(loadStart, loadEnd);
assert(loadBlock.includes('await fetchInitialDashboardOperativo(mes)'), 'loadData debe esperar primero la llamada territorial dedicada.');
assert(!loadBlock.includes("fetchRows(['/api/portafolio'"), 'loadData conserva fallback global de Portafolio.');
assert(!loadBlock.includes("fetchRows(['/api/tickets'"), 'loadData conserva fallback global de Tickets.');
assert(!loadBlock.includes("fetchRows(['/api/usuarios/supervisores-mantenimiento'"), 'loadData conserva carga global de supervisores.');

console.log('FASE_2_11_OPERACION_DASHBOARD_OPERATIVO_CUARTOS_V001: OK');
