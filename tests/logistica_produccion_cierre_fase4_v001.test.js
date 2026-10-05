'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'modules/logistica-produccion/logistica-produccion.js'),'utf8');
const service=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.service.js'),'utf8');
const repo=fs.readFileSync(path.join(root,'backend/src/modules/logistica-produccion/logistica-produccion.repository.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'core/module-loader.js'),'utf8');
const FINAL_CACHE='20261005-pvo-cierre-fase4-v001';

function sliceFunction(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0,start+' no encontrado');
  assert.ok(b>a,end+' no encontrado');
  return source.slice(a,b);
}

test('Crear nuevo queda exclusivamente Manual y las cinco fechas son calendario',()=>{
  assert.match(js,/newMode:'MANUAL'/);
  assert.match(service,/if\(modo!==CREATION_MODE\)throw error\('La captura nueva de PVO-Producción solo está habilitada en modo Manual\.'/);
  for(const id of ['lp-pvo-date','lp-visit-date','lp-cubes-date','lp-new-doc-date','lp-new-pay-date']){
    assert.match(js,new RegExp(`id="${id}" type="date"`));
  }
});

test('Create persiste las cinco fechas y Estatus Produccion usa Catalogo General oficial',()=>{
  for(const field of ['fecha_pvo','fecha_pvo_fl','fecha_cubos','fecha_envio_docs_fabrica','fecha_envio_pago_fabrica']){
    assert.ok(service.includes(`optionalDate(input.${field},'${field}')`),field);
  }
  assert.match(repo,/STATUS_CATALOG=Object\.freeze\(\{area:'Logistica',elemento:'Estatus Produccion'\}\)/);
  assert.match(repo,/FROM catalogo_general/);
  assert.match(service,/El Estatus Producción no pertenece al catálogo activo Logistica \/ Estatus Produccion\./);
});

test('Listado conserva las fechas capturadas como autoridad y fuentes externas separadas',()=>{
  assert.match(service,/const fechaPvo=row\.fecha_pvo\|\|null/);
  assert.match(service,/const fechaVisita=row\.fecha_pvo_fl\|\|null/);
  assert.match(service,/const fechaCubos=row\.fecha_cubos\|\|null/);
  assert.match(service,/fecha_pvo_fuente:fechaPvoFuente/);
  assert.match(service,/fecha_visita_fuente:fechaVisitaFuente/);
  assert.match(service,/fecha_cubos_fuente:fechaCubosFuente/);
  assert.doesNotMatch(service,/const fechaPvo=sourceBound\?/);
});

test('Edicion Manual permite las tres fechas operativas sin habilitarlas en historicos semiautomaticos',()=>{
  assert.match(service,/const manualAllowed=\[\.\.\.commonAllowed,'id_log_ops','id_asesor','id_supervisor','fecha_pvo','fecha_pvo_fl','fecha_cubos'\]/);
  assert.match(service,/const allowed=mode==='MANUAL'\?manualAllowed:commonAllowed/);
  assert.match(js,/id="lp-edit-pvo-date" type="date"/);
  assert.match(js,/id="lp-edit-visit-date" type="date"/);
  assert.match(js,/id="lp-edit-cubes-date" type="date"/);
});

test('Comparacion contra log_ops e ins_fl existe solamente en Detalle',()=>{
  assert.match(service,/sourceName:'log_ops\.pvo'/);
  assert.match(service,/sourceName:'ins_fl\.fecha_visita'/);
  assert.match(service,/sourceName:'ins_fl\.fecha_posible_recepcion_cubo'/);
  assert.match(service,/comparacion_fechas:comparacionFechas/);
  const main=sliceFunction(js,'function renderMainRows(view){','async function loadMain(view){');
  const nuevo=sliceFunction(js,'async function loadNew(view,resetMode=true){','function statusOptions(selected){');
  const detalle=sliceFunction(js,'function detailSummaryTable(p,fl){','function isPdfFile(file){');
  assert.doesNotMatch(main,/comparisonLabel|comparacion_fechas/);
  assert.doesNotMatch(nuevo,/comparisonLabel|comparacion_fechas/);
  assert.match(detalle,/comparisonLabel\('fecha_pvo'\)/);
  assert.match(detalle,/comparisonLabel\('fecha_visita'\)/);
  assert.match(detalle,/comparisonLabel\('fecha_cubos'\)/);
});

test('Cache bust final es unico y cubre CSS y JS de las cinco rutas PVO',()=>{
  const matches=loader.match(new RegExp(FINAL_CACHE,'g'))||[];
  assert.equal(matches.length,10);
  for(const route of ['logistica-produccion','logistica-produccion-nuevo','logistica-produccion-detalle','logistica-pvo','logistica-documentos']){
    const line=loader.split('\n').find(x=>x.includes(`'${route}':`));
    assert.ok(line,route+' no encontrada');
    assert.ok(line.includes(`logistica-produccion.css?v=${FINAL_CACHE}`));
    assert.ok(line.includes(`logistica-produccion.js?v=${FINAL_CACHE}`));
  }
});
