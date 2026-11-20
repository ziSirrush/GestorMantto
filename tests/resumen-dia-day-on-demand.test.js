'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const front=fs.readFileSync(path.resolve(__dirname,'../modules/resumen-dia/resumen-dia.js'),'utf8');
const back=fs.readFileSync(path.resolve(__dirname,'../backend/src/modules/resumen-dia/resumen-dia.repository.js'),'utf8');
const router=fs.readFileSync(path.resolve(__dirname,'../backend/src/routes/data/resumen-dia.routes.js'),'utf8');
test('Resumen Dia mantiene alcance al consultar dias y bandera reversible',()=>{
  assert.match(back,/BLT_OPT_RESUMEN_DAY_V1/);
  assert.match(back,/getDayData/);
  assert.match(back,/t\.fecha_reporte >= \?/);
  assert.match(back,/buildTicketScopeSql_gnral/);
  assert.match(router,/periodo.*resumenDiaGuard/);
});
test('UI navega fechas descargando solo el dia solicitado',()=>{
  assert.match(front,/payload\.mode==='SNAPSHOT_DAY'/);
  assert.match(front,/selectDay\(currentDayIdx\+1\)/);
  assert.match(front,/loadedDays\.has\(day\)/);
  assert.match(front,/allTickets\.push\(\.\.\.tickets\)/);
  assert.match(front,/t\.fr===day/);
});
