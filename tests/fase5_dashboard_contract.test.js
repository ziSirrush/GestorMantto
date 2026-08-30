'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const dashboardPath = path.join(__dirname, '..', 'modules', 'ventas-dashboard', 'ventas-dashboard.js');
const source = fs.readFileSync(dashboardPath, 'utf8');
const start = source.indexOf('const LOGISTICS_PIPELINE_ORDER');
const end = source.indexOf('// Orden oficial del Dashboard Ventas', start);
assert(start >= 0 && end > start, 'No se encontro el contrato de Logistica.');
const snippet = `${source.slice(start, end)}\nthis.contract = { pipeline: LOGISTICS_PIPELINE_ORDER, columns: LOGISTICS_COLUMNS_BY_STATUS };`;
const context = { Object };
vm.runInNewContext(snippet, context);

const expected = {
  'SIN PRODUCCIÓN / Documentación Pendiente': ['PH NS','Proyecto','Supervisor(a)','Asesor','Proveedor','Qty','Carpeta','Pago cliente','POL','PLoD','Comentarios'],
  'SIN PRODUCCIÓN / Primera Visita a Obra': ['PH NS','Proyecto','Supervisor(a)','Asesor','Proveedor','Qty','Carpeta','PVO','Pago cliente','Fecha producción','Estimado obra','POL','PLoD','No control','Comentarios'],
  'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente': ['PH NS','Proyecto','Supervisor(a)','Asesor','Proveedor','Qty','Carpeta','PVO','Pago cliente','Fecha producción','Estimado obra','POL','PLoD','No control','Comentarios'],
  'SIN PRODUCCIÓN / Programados a Producción': ['PH NS','Proyecto','Supervisor(a)','Asesor','Proveedor','Qty','Carpeta','PVO','Pago cliente','Fecha producción','Estimado obra','POL','PLoD','No control','Comentarios'],
  'EN PRODUCCION': ['PH NS','No control','Qty','Proyecto','Supervisor(a)','Asesor','Pago cliente','Pago de liberación','EXW date','Incoterm','POL','POD','Entrega programada','Comentarios'],
  'PARADOS POR CLIENTE': ['PH NS','Proyecto','Supervisor(a)','Asesor','Proveedor','Qty','Pago cliente','EXW date','POL','PLoD','Comentarios'],
  'PENDIENTE PAGO LIBERACIÓN': ['PH NS','No control','Qty','Proyecto','Supervisor(a)','Asesor','Incoterm','POL','POD','Comentarios'],
  'PROGRAMADO': ['PH NS','No control','Qty','Proyecto','Supervisor(a)','Asesor','Incoterm','EXW date','POL','ETD','POD','ETA','Comentarios'],
  'EN TRANSITO': ['PH NS','No control','Qty','Proyecto','Supervisor(a)','Asesor','ICT','Incoterm','EXW date','POL','ETD','Real departure','T/T','ETA','Real arrival','Estimado obra'],
  'PROGRAMA ENTREGA': ['PH NS','Qty','Proyecto','Supervisor(a)','Asesor','EXW date','ETD','Real departure','T/T','ETA','Real arrival','Pago pdmto','Loaded at truck or train','Tiempo aduana','PLoD','Entrega real en obra','Comentarios'],
  'ENTREGADO': ['PH NS','Qty','Proyecto','Supervisor(a)','Asesor','EXW date','POL','ETD','Real departure','T/T','POD','ETA','Real arrival','Pago pdmto','Loaded at truck or train','Tiempo aduana','PLoD','Entrega programada','Entrega real en obra','Dif.','Tiempo total'],
  'ALMACENADOS': ['PH NS','Qty','Proyecto','Supervisor(a)','Asesor','EXW date','POL','ETD','Real departure','T/T','POD','ETA','Real arrival','Pago pdmto','Loaded at truck or train','Tiempo aduana','PLoD','Entrega programada','Fecha Alm.','Fecha Fin Alm.','Aditiva termina']
};

assert.deepStrictEqual(Array.from(context.contract.pipeline), Object.keys(expected));
for (const [status, columns] of Object.entries(expected)) {
  assert.deepStrictEqual(Array.from(context.contract.columns[status]), columns, `Columnas distintas en ${status}`);
}
assert(source.includes("headers: ['Proyecto', 'Cantidad de equipos', '%OC', '%M', '%A', '%General']"));
assert(source.includes('const TABLE_PAGE_SIZE = 30;'));
console.log('OK fase5_dashboard_contract');
