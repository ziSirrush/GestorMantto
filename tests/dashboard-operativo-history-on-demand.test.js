'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const f=fs.readFileSync(path.resolve(__dirname,'../modules/dashboard-operativo/dashboard-operativo.js'),'utf8');
const b=fs.readFileSync(path.resolve(__dirname,'../backend/src/modules/dashboard-operativo/dashboard-operativo.repository.js'),'utf8');
const routes=fs.readFileSync(path.resolve(__dirname,'../backend/src/modules/dashboard-operativo/dashboard-operativo.routes.js'),'utf8');
test('Operativo ventana se controla desde backend y mantiene scope del usuario',()=>{
assert.match(b,/BLT_OPT_OPERATIVO_TICKETS_WINDOW_V1/);
assert.match(b,/t\.fecha_reporte >= \? AND t\.fecha_reporte < \?/);
assert.match(b,/buildTicketScopeSql_gnral/);
assert.match(routes,/historico.*dashboardOperativoInitialGuard_uni/);
});
test('Frontend solicita 6 meses iniciales y recorre otros bajo demanda',()=>{
assert.match(f,/tickets_window==='SIX_MONTHS'/);
assert.match(f,/months\(\)\.slice\(0,6\)/);
assert.match(f,/\/api\/operacion\/dashboard-operativo\/historico/);
assert.match(f,/pendingMonths\.has\(mes\)/);
assert.match(f,/state\.tickets\.push\(\.\.\.tickets\)/);
});
