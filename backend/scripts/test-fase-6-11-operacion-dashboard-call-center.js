'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const frontend = fs.readFileSync(path.resolve(root, '../modules/callcenter/callcenter.js'), 'utf8');
const route = read('src/modules/dashboard-callcenter/dashboard-callcenter.routes.js');
const repository = read('src/modules/dashboard-callcenter/dashboard-callcenter.repository.js');
const service = read('src/modules/dashboard-callcenter/dashboard-callcenter.service.js');
const controller = read('src/modules/criticos/criticos.controller.js');
const callcenterScope = read('src/modules/criticos/callcenter-cuartos-operacion.service.js');
const dataRoutes = read('src/routes/data.routes.js');

const loadDataStart = frontend.indexOf('async function loadData()');
const loadDataEnd = frontend.indexOf('function populateZona()', loadDataStart);
const loadData = frontend.slice(loadDataStart, loadDataEnd);

const checks = [
  ['first module data endpoint', loadData.includes("fetchJson('/api/operacion/dashboard-call-center/inicial')")],
  ['no generic tickets fallback in loadData', !loadData.includes("fetchRows(['/api/tickets")],
  ['no generic portfolio fallback in loadData', !loadData.includes("fetchPortafolioPages()") && !loadData.includes("fetchRows(['/api/portafolio")],
  ['secondary calls happen after initial', loadData.indexOf('dashboard-call-center/inicial') < loadData.indexOf('Promise.all')],
  ['exact operation door', route.includes("groupingCode: 'OPERACION'") && route.includes("domain: 'UNITED'")],
  ['real call center permissions', route.includes('OPERACION_DASHBOARD_CALL_CENTER_KPI_TICKETS.VER') && route.includes('OPERACION_DASHBOARD_CALL_CENTER_TABLA_TICKETS_TICKETS_DEL_PERIODO.VER')],
  ['initial portfolio scope', repository.includes('buildPortafolioScopeSql_gnral')],
  ['initial ticket scope', repository.includes('buildTicketScopeSql_gnral')],
  ['initial canonical zone', repository.includes('INNER JOIN z_op z_cc') && repository.includes('zona_oficial')],
  ['fail closed no rooms except UNITED master', service.includes('hasUnrestrictedUnitedScope_gnral') && service.includes('if (!unrestricted && (!Array.isArray(zoneIds) || !zoneIds.length))')],
  ['route mounted', dataRoutes.includes("require('./data/dashboard-callcenter.routes')")],
  ['phase 5 delegation preserved', controller.includes('criticosCuartosOperacionService.getEquiposCriticos') && controller.includes('criticosCuartosOperacionService.getCriticidadCorporativa')],
  ['call center secondary delegation', controller.includes('callcenterCuartosOperacionService.getMtbcEquipos') && controller.includes('callcenterCuartosOperacionService.getCallCenterU365Proyectos')],
  ['secondary official zone join', callcenterScope.includes('INNER JOIN z_op') && callcenterScope.includes('MAX(z_cc.zona) AS zona')],
  ['secondary zone filter uses catalog', callcenterScope.includes("clauses.push('z_cc.zona LIKE ?')")],
  ['secondary scope uses structured portfolio', callcenterScope.includes('buildPortafolioScopeSqlInline_gnral')],
  ['u365 ticket scope preserved', callcenterScope.includes('buildTicketScopeSqlInline_gnral')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} - ${name}`);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log('FASE_6_11_OPERACION_DASHBOARD_CALL_CENTER_CUARTOS_V001: OK');
