'use strict';
// BLT NOW | 2026-10-21 | Fase 2 | Fecha PVO unica; no fecha de visita redundante.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const js=read('modules/logistica-produccion/logistica-produccion.js');
const loader=read('core/module-loader.js');
const serviceSource=read('backend/src/modules/logistica-produccion/logistica-produccion.service.js');

function mockDomNode(id,value=''){
 return {id,innerHTML:'',value,dataset:{},hidden:false,disabled:false,querySelector:()=>null,querySelectorAll:()=>[],setAttribute(){},classList:{toggle() {}}};
}
function frontend(api={}){
 const ids=new Map();
 const get=id=>ids.get(id)||null;
 const document={getElementById:get};
 const window={ManttoHttp:{request:async route=>{
  if(!(route in api))throw Error('Endpoint no simulado: '+route);
  return api[route];
 }}};
 const context={window,document,console,setTimeout,clearTimeout,FormData,URL,URLSearchParams};
 const names='manualPayload,manualEditPayload,manualDetailEditForm,renderSelectedOption,loadMain,loadPvo,detailSummaryTable,pvoRow,pvoMissingReasons,state';
 const marker='window.ManttoLogisticaProduccion={init};';
 assert.equal(js.split(marker).length-1,1,'Entry point unico');
 const code=js.replace(marker,`globalThis.__testApi={${names}};\n${marker}`);
 vm.runInNewContext(code,context,{filename:'logistica-produccion.js'});
 return {ui:context.__testApi, ids, node(id,value=''){const n=mockDomNode(id,value);ids.set(id,n);return n;},view(){const v=mockDomNode('view');v.querySelector=selector=>selector==='[data-lp-refresh]'?mockDomNode('refresh'):null;return v;}};
}
function fakeProductionRow(id,extra={}){
 return {
  id_produccion:id,id_log_ops:null,ppns:`P${10000+id}`,proyecto:`Proyecto ${id}`,modo_registro:'MANUAL',
  cpvo_count:1,gm_count:1,archivos_count:2,
  fecha_pvo:'2026-10-20',fecha_pvo_fl:null,fechas_visita:'',
  asesores:'Asesor',supervisores:'Supervisor',
  ...extra
 };
}
function serviceWithRows(rows){
 const repo={list:async()=>rows};
 const context={module:{exports:{}},exports:{},console,
  require(id){
   if(id==='./logistica-produccion.repository')return repo;
   if(id==='./logistica-produccion-integridad')return {
    assertProductionLink() {},
    isProductionLinkValid(row){return !row.id_log_ops||String(row.ppns)===String(row.ppns_logistica);}
   };
   if(id==='../../services/storage/azure-storage.service')return {};
   throw Error('Dependencia inesperada: '+id);
  }
 };
 vm.runInNewContext(serviceSource,context,{filename:'logistica-produccion.service.js'});
 return context.module.exports;
}

test('Nuevo contiene solo Fecha PVO; no hay otro calendario de visita',()=>{
 assert.match(js,/<label>Fecha PVO<input id="lp-pvo-date" type="date"><\/label>/);
 assert.doesNotMatch(js,/Fecha de Visita|lp-visit-date|lp-edit-visit-date/);
 assert.match(js,/id="lp-cubes-date"/);
});

test('Nuevo genera un payload exclusivamente con fecha_pvo, no fecha_pvo_fl',()=>{
 const f=frontend();
 f.ui.state.manual.selected={
  project:{id_log_ops:71,ya_registrado:0},
  advisor:{id_SB:82},supervisor:{id_SB:93}
 };
 for(const [id,value] of Object.entries({
  'lp-manual-prod-status':'5','lp-pvo-date':'2026-10-20',
  'lp-cubes-date':'2026-10-23','lp-new-doc-date':'','lp-new-pay-date':'',
  'lp-manual-comment':'Prueba'
 }))f.node(id,value);
 const payload=f.ui.manualPayload();
 assert.equal(payload.fecha_pvo,'2026-10-20');
 assert.equal(payload.fecha_cubos,'2026-10-23');
 assert.equal(payload.id_log_ops,71);
 assert.equal(Object.hasOwn(payload,'fecha_pvo_fl'),false);
 assert.equal(Object.hasOwn(payload,'fecha_visita'),false);
});

test('Editar conserva Fecha PVO y Cubos, elimina calendario de visita',()=>{
 const f=frontend();
 const form=f.ui.manualDetailEditForm({fecha_pvo:'2026-10-20',fecha_pvo_fl:'2026-10-19',fecha_cubos:'2026-10-22'});
 assert.match(form,/id="lp-edit-pvo-date"/);
 assert.match(form,/id="lp-edit-cubes-date"/);
 assert.doesNotMatch(form,/Fecha de Visita|lp-edit-visit-date|Visita y Cubos/);
});

test('Editar sin cambios no altera fecha PVO ni fecha de visita historica',()=>{
 const f=frontend();
 f.ui.state.manual.selected={project:{id_log_ops:71,ya_registrado:1},advisor:{id_SB:82},supervisor:{id_SB:93}};
 const record={
  id_log_ops:71,id_asesor:82,id_supervisor:93,
  fecha_pvo:'2026-10-20',fecha_pvo_fl:'2026-10-19',fecha_cubos:'2026-10-21',
  id_estatus_produccion:5,comentario:'Sin cambios',
  fecha_envio_docs_fabrica:null,fecha_envio_pago_fabrica:null
 };
 for(const [id,value] of Object.entries({
  'lp-manual-prod-status':'5','lp-edit-pvo-date':'2026-10-20','lp-edit-cubes-date':'2026-10-21',
  'lp-edit-comment':'Sin cambios','lp-doc-date':'','lp-pay-date':''
 }))f.node(id,value);
 assert.deepEqual(JSON.parse(JSON.stringify(f.ui.manualEditPayload(record))),{});
 f.ids.get('lp-edit-pvo-date').value='2026-10-25';
 const payload=f.ui.manualEditPayload(record);
 assert.equal(payload.fecha_pvo,'2026-10-25');
 assert.equal(Object.hasOwn(payload,'fecha_pvo_fl'),false);
});

test('Resumen de proyecto y Detalle muestran solo Fecha PVO',()=>{
 const f=frontend();
 f.node('lp-auto');
 f.ui.state.selectedOption={id_ppns:'P1',proyecto:'Proyecto',pvo:'2026-10-22',fechas_visita:'2026-10-23'};
 f.ui.renderSelectedOption();
 const html=f.ids.get('lp-auto').innerHTML;
 assert.match(html,/Fecha PVO/);
 assert.doesNotMatch(html,/Fecha de Visita|23\/10\/2026/);
 const detail=f.ui.detailSummaryTable({
  modo_registro:'MANUAL',proyecto:'Proyecto',ppns:'P1',semana_registro:42,anio_registro:2026,
  estatus_produccion:'Estatus',fecha_pvo:'2026-10-22',fecha_pvo_fl:'2026-10-23',fechas_visita:'2026-10-23',
  fecha_cubos:'2026-10-24',comentario:'Detalle'
 },{asesores:[],supervisores:[]});
 assert.match(detail,/Fecha PVO/);
 assert.doesNotMatch(detail,/Fecha de Visita|23\/10\/2026/);
 assert.match(detail,/Fecha entrega cubos/);
});

test('Lista principal tiene 9 columnas y elimina filtro y orden de visita',async()=>{
 const f=frontend({'/api/logistica/produccion':{data:[{
  ...fakeProductionRow(10,{fecha_pvo_fl:'2026-10-19',fechas_visita:'2026-10-19'}),
  indicadores:[],documentacion_completa:true,asesores:'AB',supervisores:'CD'
 }]}});
 f.node('lp-q','');f.node('lp-main-filter','todos');f.node('lp-main-body');f.node('lp-add');
 const view=f.view();await f.ui.loadMain(view);
 assert.match(view.innerHTML,/Fecha PVO/);
 assert.doesNotMatch(view.innerHTML,/Fecha de Visita|sin_visita|data-lp-sort="fecha_visita"/);
 const row=f.ids.get('lp-main-body').innerHTML;
 assert.equal((row.match(/<td>/g)||[]).length,9);
 assert.match(row,/20\/10\/2026/);
 assert.doesNotMatch(row,/19\/10\/2026/);
});

test('Listado PVO completo y faltante oculta visita incluso si backend trae fecha historica',async()=>{
 const f=frontend({
  '/api/logistica/produccion/pvo/completos':{data:[{
   ...fakeProductionRow(1,{fecha_pvo_fl:'2026-10-19',fechas_visita:'2026-10-19'}),
   pvo:{pvo_log:true,visita:true},documentacion_completa:true
  }]},
  '/api/logistica/produccion/pvo/faltantes':{data:[{
   ...fakeProductionRow(2,{cpvo_count:0,gm_count:1}),pvo:{pvo_log:true,visita:false},documentacion_completa:false
  }]}
 });
 for(const id of ['lp-pvo-ok','lp-pvo-ok-pager','lp-pvo-missing','lp-pvo-missing-pager'])f.node(id);
 const view=f.view();await f.ui.loadPvo(view);
 assert.doesNotMatch(view.innerHTML,/Fecha de Visita/);
 assert.equal((f.ids.get('lp-pvo-ok').innerHTML.match(/<td>/g)||[]).length,8);
 assert.equal((f.ids.get('lp-pvo-missing').innerHTML.match(/<td>/g)||[]).length,7);
 assert.match(f.ids.get('lp-pvo-missing').innerHTML,/CPVO/);
 assert.doesNotMatch(f.ids.get('lp-pvo-ok').innerHTML,/19\/10\/2026/);
});

test('Faltantes en PVO no señalan ausencia de visita; sí señalan Fecha PVO',()=>{
 const f=frontend();
 assert.equal(f.ui.pvoMissingReasons({cpvo_count:1,gm_count:1,documentacion_completa:true,
  pvo:{pvo_log:true,visita:false}}),'—');
 assert.equal(f.ui.pvoMissingReasons({cpvo_count:1,gm_count:1,documentacion_completa:true,
  pvo:{pvo_log:false,visita:true}}),'Fecha PVO');
});

for(const [title,rows,expectedOk,expectedMissing] of [
 ['Fecha PVO existente, visita nula',[fakeProductionRow(1)],[1],[]],
 ['Fecha PVO existente, visita distinta',[fakeProductionRow(2,{fecha_pvo_fl:'2026-10-19'})],[2],[]],
 ['Sin Fecha PVO',[fakeProductionRow(3,{fecha_pvo:null,fecha_pvo_fl:'2026-10-19'})],[],[3]],
 ['Sin documentos de tipo GM',[fakeProductionRow(4,{gm_count:0,archivos_count:1})],[],[4]],
 ['Sin PPNS consistente',[fakeProductionRow(5,{id_log_ops:12,ppns_logistica:'P99999'})],[],[]]
]){
 test(`Backend PVO: ${title}`,async()=>{
  const s=serviceWithRows(rows);
  const ok=await s.pvo({},false),missing=await s.pvo({},true);
  assert.deepEqual(Array.from(ok.data,r=>r.id_produccion),expectedOk);
  assert.deepEqual(Array.from(missing.data,r=>r.id_produccion),expectedMissing);
 });
}

test('Backend conserva esquema historico sin backfill y no exige fecha_pvo_fl para PVO',()=>{
 assert.match(serviceSource,/fecha_pvo_fl/);
 assert.match(serviceSource,/const complete=r\.documentacion_completa&&r\.pvo\.pvo_log;/);
 assert.doesNotMatch(serviceSource,/const complete=r\.documentacion_completa&&r\.pvo\.pvo_log&&r\.pvo\.visita;/);
 assert.match(serviceSource,/assertProductionLink\(current,/);
});

test('Cache-bust actualizado solo para las 5 rutas del modulo',()=>{
 const newRef='./modules/logistica-produccion/logistica-produccion.js?v=20261021-pvo-fecha-unica-fase2-v001';
 assert.equal(loader.split(newRef).length-1,5);
 assert.match(loader,/20260923-dashboard-ppns-final-v001/);
 assert.equal(loader.split('./modules/logistica-produccion/logistica-produccion.css?v=20261005-pvo-cierre-fase4-v001').length-1,5);
});
