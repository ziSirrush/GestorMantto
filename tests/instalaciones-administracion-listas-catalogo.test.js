'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('ins_fl: Estado y Estatus produccion usan catalogos oficiales en edicion y altas',async()=>{
 const h=require('../modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js').helpers,a=require('../modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js').helpers,rules=require('../backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-rules.js');
 const ghost=read('modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js'),admin=read('modules/instalaciones-administracion/instalaciones-administracion_cor.js'),altas=read('modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js'),auto=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js'),svc=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js'),altaSvc=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js'),server=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.estados.service.js'),repo=read('backend/src/modules/catalogo-general/catalogo-general.repository.js');
 const check=(ok,msg)=>assert.ok(ok,msg);

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const catalog={
  estados:[{codigo:'CDMX',nombre:'Ciudad de México'},{codigo:'EDOMEX',nombre:'Estado de Mexico'},{codigo:'JAL',nombre:'Jalisco'}],
  estatus:rules.STATUS_CODES_COR.map(codigo=>({codigo,nombre:rules.STATUS_LABELS_COR[codigo]})),
  estatus_produccion:["En Bodega","En Produccion","En Sitio","En Transito","Liberando","Sin Produccion"].map(codigo=>({codigo,nombre:codigo}))
};
check(equal(h.stateCatalogValues_cor(catalog),catalog.estados),'Catalogo dinamico');
check(h.stateCatalogValues_cor({estados:[]})===null&&h.stateCatalogValues_cor({estados:[{codigo:'JAL'},{codigo:'jal'}]})===null,'Catalogo vacio o ambiguo falla cerrado');
check(equal(h.validValue_cor('estado','CDMX',{},catalog),{ok:true,value:'CDMX'}),'Guarda abreviatura');
check(!h.validValue_cor('estado','Ciudad de México',{},catalog).ok&&!h.validValue_cor('estado','MEX',{},catalog).ok,'No texto libre ni codigos antiguos');
check(!h.validValue_cor('estado','',{},null).ok&&equal(h.validValue_cor('estado','',{},catalog),{ok:true,value:null}),'Sin catalogo bloquea; con catalogo permite vaciar');
const escape=v=>String(v).replace(/</g,'&lt;').replace(/"/g,'&quot;');
const options=h.stateOptions_cor(catalog,'MEX',escape);
check(options.includes('value="MEX" selected disabled')&&options.includes('value="CDMX">CDMX · Ciudad de México'),'Preserva legado no elegible');
check(!h.stateOptions_cor(catalog,'JAL',escape).includes('valor anterior')&&h.stateOptions_cor(catalog,'JAL',escape).includes('value="JAL" selected'),'Seleccion vigente');
check(h.stateOptions_cor(catalog,'<x>',escape).includes('&lt;x>'),'Escapa legado');
check(a.stateLocationCor('EDOMEX',catalog)==='Estado de Mexico'&&a.stateLocationCor('MEX',catalog)===null,'Ubicacion desde descripcion oficial');
check(a.validateDraftCell('estado','CDMX',{},catalog,h).ok&&!a.validateDraftCell('estado','MEX',{},catalog,h).ok,'Altas valida estado');
check(equal(h.productionStatusValues_cor(catalog).map(x=>x.codigo),["En Bodega","En Produccion","En Sitio","En Transito","Liberando","Sin Produccion"]),'Seis estatus de produccion en orden exacto');
check(h.productionStatusValues_cor({estatus:catalog.estatus})===null,'No reutiliza los ocho estatus de Instalaciones');
check(h.productionStatusValues_cor({estatus_produccion:catalog.estatus_produccion.slice(1)})===null,'No carga catalogo incompleto');
check(h.productionStatusValues_cor({estatus_produccion:Array(6).fill(catalog.estatus_produccion[0])})===null,'Rechaza catalogo ambiguo');
for(const status of catalog.estatus_produccion)check(h.validValue_cor('estatus_produccion',status.codigo,{},catalog).ok,'Produccion valida '+status.codigo);
for(const status of catalog.estatus){
  check(h.validValue_cor('estatus',status.codigo,{},catalog).ok,'Conserva estatus principal '+status.codigo);
  check(!h.validValue_cor('estatus_produccion',status.codigo,{},catalog).ok,'No permite estatus principal en produccion '+status.codigo);
}
check(h.productionStatusOptions_cor(catalog,'En Sitio',escape).includes('value="En Sitio" selected>En Sitio</option>'),'Etiqueta exacta sin repetir texto');
check(h.productionStatusOptions_cor(catalog,'04-M',escape).includes('value="04-M" selected disabled'),'Codigo legado visible, no elegible');
check(!h.validValue_cor('estatus_produccion','09-X',{},catalog).ok&&!h.validValue_cor('estatus_produccion','Montaje',{},catalog).ok,'Produccion rechaza texto libre');
check(h.productionStatusOptions_cor(catalog,'Anterior',escape).includes('value="Anterior" selected disabled'),'Produccion preserva legado');
check(a.validateDraftCell('estatus_produccion','En Sitio',{},catalog,h).ok&&!a.validateDraftCell('estatus_produccion','09-X',{},catalog,h).ok,'Altas valida produccion');
const row=a.createRow(1,{proyecto:'P',id_proyecto:'P1',estado:'MEX',estatus_produccion:'Anterior',estatus:'04-M'});
row.values.referencia_sitio='E1'; // createRow omite la referencia de los equipos duplicados.
check(!a.assessRows([row],catalog).ok&&row.values.estado==='MEX','Borrador legado preservado');
row.values.estado='EDOMEX';
check(!a.assessRows([row],catalog).ok,'Borrador de produccion requiere valor vigente');
row.values.estatus_produccion='En Sitio';
check(a.assessRows([row],catalog).ok&&a.postRowsCor([row],catalog).rows[0].estatus==='04-M','Alta valida sin cambiar estatus principal');
const fragment=(s,start,end)=>{const i=s.indexOf(start),j=s.indexOf(end,i);if(i<0||j<=i)throw Error('Fragmento ausente '+start);return s.slice(i,j);};
const st={selectedRecord:{estado:'MEX',estatus_produccion:'Anterior'},editCatalog:null,autoOriginal:new Map([['estado','MEX'],['estatus_produccion','Anterior']])};
const input={value:'MEX'};
const view=new Function('st','personnelHelpers','input',[
 'const esc=v=>String(v??"").replace(/</g,"&lt;").replace(/"/g,"&quot;"),raw=v=>String(v??"").trim(),meta=()=>({kind:"text",max_length:30}),label=f=>f,display=(f,v)=>v,isCatalogListField_cor=personnelHelpers.isCatalogListField_cor,listAvailable_cor=f=>personnelHelpers.catalogListAvailable_cor(f,st.editCatalog),listOptionsFor_cor=(f,v)=>personnelHelpers.catalogListOptions_cor(f,st.editCatalog,v,esc),isPersonalField_cor=()=>false,$=()=>input;',
 fragment(admin,'function formField(','// FIX 2: detalle por equipo'),
 fragment(admin,'function bulkField_cor(','function renderBulkEditor_cor('),
 fragment(admin,'function readControl(','function comparable('),
 'return {formField,bulkField_cor,readControl};'
].join('\n'))(st,h,input);
check(view.formField('estado',true).includes('disabled aria-busy="true"')&&!view.formField('estado',false).includes('<select'),'Ficha respeta permisos y espera catalogo');
st.editCatalog=catalog;
check(view.formField('estado',true).includes('<select')&&view.formField('estado',true).includes('value="MEX" selected disabled'),'Ficha individual selector estado');
check(view.bulkField_cor('estado').includes('<select')&&view.bulkField_cor('estado').includes('value="EDOMEX"'),'Multiple selector estado');
check(view.formField('estatus_produccion',true).includes('value="Anterior" selected disabled')&&view.formField('estatus_produccion',true).includes('value="Sin Produccion"'),'Ficha selector produccion');
check(view.bulkField_cor('estatus_produccion').includes('<select')&&view.bulkField_cor('estatus_produccion').includes('value="En Bodega"'),'Multiple selector produccion');
check(view.readControl('estado').ok,'Legado sin cambio permanece');
input.value='MEXICO';check(!view.readControl('estado').ok,'Ficha rechaza texto libre');
input.value='EDOMEX';check(equal(view.readControl('estado'),{ok:true,value:'EDOMEX'}),'Ficha acepta codigo activo');
input.value='MEX';check(!view.readControl('estado','iadm-cor-bulk-input-').ok,'Lote no copia legado');
input.value='Liberando';check(equal(view.readControl('estatus_produccion'),{ok:true,value:'Liberando'}),'Ficha guarda solo estatus produccion');
check(ghost.includes('if(isCatalogListField_cor(field))return catalogListOptions_cor(field,catalogs,value,esc)')&&ghost.includes('!catalogListAvailable_cor(field,catalogs)'),'Tabla y lote usan selector');
check(admin.includes('loadEditableListsWithoutBlocking_cor(ensureContext_cor()')&&admin.includes('isCatalogListField_cor(f)&&!listAvailable_cor(f)')&&admin.includes('||isCatalogListField_cor(field)))queueAutoSave_cor'),'Carga asincrona y autoguardado');
check(altas.includes('if(states?.isCatalogListField_cor(field))return states.catalogListOptions_cor')&&!altas.includes('STATE_LOCATION_BY_CODE'),'Alta sin mapa fijo');
check(auto.includes('estados:await estadosCatalog_cor.listEstados_cor(db)'),'Endpoint existente integra catalogo');
let calls=[],entries=catalog.estados.map(x=>({articulo:x.codigo,descripcion:x.nombre}));
const executor={query:async(sql,params)=>{calls.push({sql,params});return [entries];}};
const repositoryModule={exports:{}};
new Function('require','module',repo)(()=>({}),repositoryModule);
const mod={exports:{}};
new Function('require','module',server)(id=>{if(id==='../catalogo-general/catalogo-general.repository')return repositoryModule.exports;if(id==='./instalaciones-administracion.auto-rules')return rules;throw Error(id);},mod);
const states=mod.exports;
check(equal(await states.listEstados_cor(executor),catalog.estados)&&equal(calls.at(-1).params,['General','Estado Abreviado'])&&calls.at(-1).sql.includes('activo=1'),'SQL parametrizado con catalogo activo');
let n=calls.length;
await states.assertCatalogChanges_cor(executor,[{marca:'X'},{estado:null},{estado:'MEX',estatus_produccion:'Anterior'}],[{estado:'MEX',estatus_produccion:'Anterior'}]);
check(calls.length===n,'Sin cambio real no consulta ni bloquea historico');
await states.assertCatalogChanges_cor(executor,[{estado:'CDMX',estatus_produccion:'En Sitio'},{estado:'EDOMEX',estatus_produccion:'En Transito'}]);
check(calls.length===n+1,'Una lectura por lote');
n=calls.length;
check(equal(states.PRODUCTION_STATUS_CODES_COR,catalog.estatus_produccion.map(x=>x.codigo)),'Fuente unica de seis estatus');
for(const value of states.PRODUCTION_STATUS_CODES_COR)await states.assertCatalogChanges_cor(executor,{estatus_produccion:value});
await states.assertCatalogChanges_cor(executor,{estatus_produccion:null});
await states.assertCatalogChanges_cor(executor,{estatus_produccion:'04-M'},[{estatus_produccion:'04-M'}]);
check(calls.length===n,'Produccion usa catalogo propio sin consulta extra; legado intacto');
let rejected=false;try{await states.assertCatalogChanges_cor(executor,{estado:'MEX'});}catch(e){rejected=e.code==='INSTALACIONES_ESTADO_INVALIDO'&&e.statusCode===400;}
check(rejected,'Backend rechaza abreviatura no vigente');
rejected=false;try{await states.assertCatalogChanges_cor(executor,{estatus_produccion:'09-X'});}catch(e){rejected=e.code==='INSTALACIONES_ESTATUS_PRODUCCION_INVALIDO'&&e.statusCode===400;}
check(rejected,'Backend rechaza estatus no vigente');
for(const status of rules.STATUS_CODES_COR){
  rejected=false;try{await states.assertCatalogChanges_cor(executor,{estatus_produccion:status});}catch(e){rejected=e.code==='INSTALACIONES_ESTATUS_PRODUCCION_INVALIDO'&&e.statusCode===400;}
  check(rejected,'Backend rechaza codigo principal en produccion '+status);
}
// Ejercitar el endpoint real con permisos y DB simulados. Sin acceso a produccion.
const autoModule={exports:{}},permissions=[];
const fakeDb={query:async(sql,params)=>sql.includes('FROM usuarios')?[[]]:executor.query(sql,params)};
const dependencies={
  '../../config/db':fakeDb,
  '../ventas/ventas-visibility.service':{},
  './instalaciones-administracion.service':{ensureFullEditPermission_cor:async req=>permissions.push(req)},
  './instalaciones-administracion.repository':{},
  './instalaciones-administracion.audit-service':{},
  './instalaciones-administracion.constants':{GROUPS_COR:{},ALL_OPERATIONAL_FIELDS_COR:[]},
  './instalaciones-administracion.validation':{},
  './instalaciones-administracion.field-policy':{},
  './instalaciones-administracion.auto-rules':rules,
  './instalaciones-administracion-altas-persist':{},
  './instalaciones-administracion-altas-origin':{},
  './instalaciones-administracion.estados.service':states
};
new Function('require','module',auto)(name=>{if(!Object.hasOwn(dependencies,name))throw Error(name);return dependencies[name];},autoModule);
const response=await autoModule.exports.getEditCatalogs_cor({contextUser:{id_SB:1}});
check(permissions.length===1&&equal(response.estatus,catalog.estatus)&&equal(response.estatus_produccion,catalog.estatus_produccion)&&equal(response.estados,catalog.estados),'Endpoint devuelve ambos catalogos separados y conserva guard');
entries=[];
rejected=false;try{await states.assertCatalogChanges_cor(executor,{estado:'CDMX'});}catch(e){rejected=e.code==='INSTALACIONES_ESTADOS_CATALOGO_NO_DISPONIBLE'&&e.statusCode===503;}
check(rejected,'Backend falla cerrado si no hay estados');
check(auto.split('estadosCatalog_cor.assertCatalogChanges_cor').length===3&&svc.split('estadosCatalog_cor.assertCatalogChanges_cor').length===4&&altaSvc.includes('.assertCatalogChanges_cor(connection,rows)'),'Todas las mutaciones humanas cubiertas');

});
