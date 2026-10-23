'use strict';
// BLT NOW | Fase 2 | QA frontend documental: CPVO + GM activos
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const client = read('modules/logistica-produccion/logistica-produccion.js');
const loader = read('core/module-loader.js');

function record(cpvo, gm, extra={}){
 return {
   id_produccion:123, proyecto:'Proyecto Prueba', ppns:'P12345',
   cpvo_count:cpvo, gm_count:gm, archivos_count:cpvo+gm,
   documentacion_completa:cpvo>0&&gm>0,
   fecha_pvo:'2026-10-20',fecha_pvo_fl:'2026-10-21',
   fechas_visita:'2026-10-21',supervisores:'AB',asesores:'CD',
   pvo:{cpvo:cpvo>0,pvo_log:true,visita:true,pvo_fl:true},
   indicadores:[],...extra
 };
}
function fakeNode(id){
 return {id,innerHTML:'',value:'',dataset:{},hidden:false,disabled:false,querySelector:()=>null,querySelectorAll:()=>[],setAttribute() {}};
}
function setup(api={}){
 const ids=new Map();
 const get=id=>ids.get(id)||null;
 const document={getElementById:get};
 const window={ManttoHttp:{request:async route=>{
   if(!(route in api))throw new Error('Endpoint no simulado: '+route);
   return api[route];
 }}};
 const context={window,document,console,setTimeout,clearTimeout,FormData,URL};
 const exposed='globalThis.__phase2={activeDocCounts,documentationGap,docCountCell,pvoMissingReasons,indicators,pvoRow,loadPvo,loadDocuments,renderDetail,state};';
 const code=client.replace('window.ManttoLogisticaProduccion={init};',exposed+'\nwindow.ManttoLogisticaProduccion={init};');
 assert.ok(code.includes(exposed),'Export de QA debe insertarse en la función real');
 vm.runInNewContext(code,context,{filename:'logistica-produccion.js'});
 return {ui:context.__phase2,window,ids,get,create(id){let n=fakeNode(id);ids.set(id,n);return n;},
  view(){const v=fakeNode('view-test');v.querySelector=selector=>selector==='[data-lp-refresh]'?fakeNode('refresh'):null;return v;}};
}

for(const [cpvo,gm,name,expected] of [
 [0,0,'ningún archivo','Faltan CPVO y GM'],
 [0,1,'solo GM','Falta CPVO'],
 [0,10,'varias GM','Falta CPVO'],
 [1,0,'solo CPVO','Falta GM'],
 [2,0,'varias CPVO','Falta GM'],
 [1,1,'un archivo de cada tipo','Documentación completa'],
 [2,10,'máximos permitidos','Documentación completa']
]){
 test(`Estado documental visual: ${name}`,()=>{
  const {ui}=setup();
  assert.equal(ui.documentationGap(record(cpvo,gm)),expected);
 });
}

test('Independencia del total general de archivos y defensa ante estado backend sin confirmar',()=>{
 const {ui}=setup();
 assert.equal(ui.documentationGap(record(1,0,{archivos_count:15})),'Falta GM');
 assert.equal(ui.documentationGap(record(1,1,{documentacion_completa:false})),'Documentación por validar');
 assert.equal(ui.documentationGap(record(1,1,{documentacion_completa:undefined})),'Documentación por validar');
});

test('Integridad de identidad bloqueada nunca recibe palomita ni expone datos cruzados',()=>{
 const {ui}=setup();
 const row=record(1,1,{integridad_bloqueada:true,indicadores:[]});
 assert.equal(ui.documentationGap(row),'Vínculo de proyecto en revisión');
 const html=ui.indicators(row);
 assert.match(html,/Vínculo en revisión/);
 assert.doesNotMatch(html,/lp-ok|✓/);
});

test('Icono principal describe específicamente CPVO o GM faltante',()=>{
 const {ui}=setup();
 assert.match(ui.indicators(record(0,1)),/Falta CPVO/);
 assert.match(ui.indicators(record(1,0)),/Falta GM/);
 assert.match(ui.indicators(record(0,0)),/Faltan CPVO y GM/);
 assert.match(ui.indicators(record(1,1)),/lp-ok/);
 assert.doesNotMatch(ui.indicators(record(1,1)),/FALTAN_DOCS_PROD/);
});

test('Indicadores conservan otros faltantes (PPNS y CPVO)',()=>{
 const {ui}=setup();
 const html=ui.indicators(record(0,0,{indicadores:[
  {codigo:'FALTA_ARCHIVO_PVO',emoji:'📍',nombre:'Falta Archivo PVO'},
  {codigo:'FALTA_PPNS',emoji:'🥨',nombre:'Falta PPNS'}
 ]}));
 assert.match(html,/Falta Archivo PVO/);
 assert.match(html,/Falta PPNS/);
 assert.match(html,/Faltan CPVO y GM/);
});

test('Conteos visuales muestran el mínimo obligatorio sin confundirlo con capacidad de slots',()=>{
 const {ui}=setup();
 assert.match(ui.docCountCell(record(0,4),'cpvo',2),/❌ 0\/2/);
 assert.match(ui.docCountCell(record(1,0),'cpvo',2),/✅ 1\/2/);
 assert.match(ui.docCountCell(record(1,0),'gm',10),/❌ 0\/10/);
 assert.match(ui.docCountCell(record(1,1),'gm',10),/Mín\. 1/);
});

test('Faltantes PVO validan solo Fecha PVO y documentos CPVO + GM',()=>{
 const {ui}=setup();
 assert.equal(ui.pvoMissingReasons(record(1,0)),'GM');
 assert.equal(ui.pvoMissingReasons(record(0,1)),'CPVO');
 assert.equal(ui.pvoMissingReasons(record(0,0,{pvo:{cpvo:false,pvo_log:false,visita:false}})),
  'CPVO / GM / Fecha PVO');
 assert.equal(ui.pvoMissingReasons(record(1,1,{documentacion_completa:true})),'—');
});

test('HTML de PVO completos cuenta GM en columna independiente',()=>{
 const {ui}=setup();
 const markup=ui.pvoRow(record(1,1));
 assert.equal((markup.match(/<td>/g)||[]).length,8);
 assert.match(markup,/✅ 1\/2/);
 assert.match(markup,/✅ 1\/10/);
 assert.match(markup,/20\/10\/2026/);
});

test('Escapa datos textuales y fechas inválidas en la tabla PVO',()=>{
 const {ui}=setup();
 const html=ui.pvoRow(record(1,1,{proyecto:'<img src=x>',fecha_pvo:'<svg onload=alert(1)>'}));
 assert.match(html,/&lt;img src=x&gt;/);
 assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<svg|<img/);
});

test('Listado PVO completo y faltante utiliza endpoints existentes de Fase 1 y muestra causas reales',async()=>{
 const api={
  '/api/logistica/produccion/pvo/completos':{data:[record(1,1,{id_produccion:100})]},
  '/api/logistica/produccion/pvo/faltantes':{data:[record(1,0,{id_produccion:101})]}
 };
 const app=setup(api);
 for(const id of ['lp-pvo-ok','lp-pvo-ok-pager','lp-pvo-missing','lp-pvo-missing-pager'])app.create(id);
 const view=app.view();await app.ui.loadPvo(view);
 assert.match(view.innerHTML,/CPVO<\/th><th>GM<\/th>/);
 assert.match(app.get('lp-pvo-ok').innerHTML,/✅ 1\/10/);
 assert.match(app.get('lp-pvo-missing').innerHTML,/❌ 0\/10/);
 assert.match(app.get('lp-pvo-missing').innerHTML,/>GM<\/td>/);
 assert.doesNotMatch(app.get('lp-pvo-ok').innerHTML,/Falta GM/);
});

test('Listado documental muestra faltante aunque exista un archivo activo',async()=>{
 const api={
  '/api/logistica/produccion/documentos':{data:[]},
  '/api/logistica/produccion/documentos/faltantes':{data:[record(0,1),record(1,0,{id_produccion:124})]}
 };
 const app=setup(api);
 for(const id of ['lp-doc-q','lp-docs','lp-docs-pager','lp-docs-missing','lp-docs-missing-pager'])app.create(id);
 const view=app.view();await app.ui.loadDocuments(view);
 const html=app.get('lp-docs-missing').innerHTML;
 assert.match(view.innerHTML,/Documentación incompleta/);
 assert.match(html,/Falta CPVO/);
 assert.match(html,/Falta GM/);
 assert.match(html,/❌ 0\/2/);
 assert.match(html,/❌ 0\/10/);
 assert.doesNotMatch(html,/Sin archivos activos/);
});

test('Detalle mantiene carga, reemplazo, eliminación, recarga de backend y estatus documental',()=>{
 assert.match(client,/Zona de carga/);
 assert.match(client,/Documentación incompleta: /);
 assert.match(client,/Documentación completa: mínimo 1 CPVO y 1 GM activos/);
 assert.match(client,/await req\('\/api\/logistica\/produccion\/'\+id\+'\/archivos'/);
 assert.match(client,/await req\('\/api\/logistica\/produccion\/'\+id\+'\/archivos\/'/);
 assert.match(client,/state\.detail=fresh\.data/);
 assert.match(client,/renderDetail\(view\)/);
 assert.match(client,/markProductionDirty\(\)/);
});

test('Un único archivo del módulo y cache-bust solamente de JS en las cinco rutas',()=>{
 const token=loader.match(/logistica-produccion\.js\?v=(\d{8}-[a-z0-9-]+)/)?.[1];
 assert.ok(token);
 const jsRef='./modules/logistica-produccion/logistica-produccion.js?v='+token;
 assert.equal(loader.split(jsRef).length-1,5);
 assert.equal(loader.split('./modules/logistica-produccion/logistica-produccion.css?v=20261005-pvo-cierre-fase4-v001').length-1,5);
 assert.doesNotMatch(loader,/logistica-produccion\.js\?v=20261005-pvo-cierre-fase4-v001/);
 assert.doesNotMatch(client,/Fecha de Visita|lp-visit-date|lp-edit-visit-date/);
 assert.match(loader,/20260923-dashboard-ppns-final-v001/);
});

test('Sin SQL nuevo, dependencias externas, ni cambios del formato de fechas',()=>{
 assert.match(client,/function fmtDisplayDateSingle/);
 assert.match(client,/function fmtDisplayDate\(/);
 assert.match(client,/function loadPvo\(/);
 assert.match(client,/async function loadDocuments\(/);
 assert.equal((client.match(/async function loadPvo\(/g)||[]).length,1);
 assert.equal((client.match(/async function loadDocuments\(/g)||[]).length,1);
 assert.doesNotMatch(client,/https?:\/\/\S+\/api\/logistica\/produccion/);
});
