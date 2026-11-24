'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const h=require('../modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js').helpers;
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const data={personal:{ajustador:['Ana Pérez','José García'],subcontratista:['ABC']}};
test('Los selectores aceptan únicamente valores del catálogo y permiten limpiar',()=>{
  assert.deepEqual(h.validValue_cor('ajustador','Ana Pérez',{},data),{ok:true,value:'Ana Pérez'});
  assert.deepEqual(h.validValue_cor('subcontratista','ABC',{},data),{ok:true,value:'ABC'});
  assert.equal(h.validValue_cor('ajustador','Inventado',{},data).ok,false);
  assert.equal(h.validValue_cor('subcontratista','XYZ',{},data).ok,false);
  assert.equal(h.validValue_cor('subcontratista','',{},{personal:{ajustador:[],subcontratista:null}}).ok,false);
  assert.deepEqual(h.validValue_cor('ajustador','',{},data),{ok:true,value:null});
});
test('Conserva la asignación histórica y la selección actual',()=>{
  const esc=x=>String(x).replaceAll('<','&lt;').replaceAll('>','&gt;');
  assert.ok(h.personalOptions_cor('ajustador',data,'Ana / <Histórico>',esc).includes('value="Ana / &lt;Histórico&gt;" selected disabled'));
  assert.ok(h.personalOptions_cor('subcontratista',data,'ABC',esc).includes('value="ABC" selected'));
  assert.ok(h.personalOptions_cor('subcontratista',null,'ANT',esc).includes('value="ANT" selected disabled'));
});
test('El backend usa las identidades reales de INT9 y no inventa iniciales',()=>{
  const fragment=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
  const aj=read('backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.ajustadores.service.js');
  const mont=read('backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.montadores.service.js');
  const personal=read('backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.service.js');
  const ctx={};
  vm.runInNewContext('const MAX_NOMBRES_POR_EQUIPO=5;\n'+fragment(aj,'const SIN_REFERENCIA =','function enteroOpcional(')+
    fragment(mont,'function normalize(v)','function evaluate(')+
    fragment(personal,'function catalogoAsignacionRows_cor(','async function catalogoAsignacion_cor(')+
    '\nthis.build=(rows,available)=>catalogoAsignacionRows_cor(rows,available,{indicePersonal,resolverReferencia},{code,identity});',ctx);
  const rows=[{"id_personal":1,"tipo_personal":"AJUSTADOR","nombre":"Ana Pérez","activo":1},{"id_personal":2,"tipo_personal":"AJUSTADOR","nombre":"Inactivo","activo":0},{"id_personal":3,"tipo_personal":"AJUSTADOR","nombre":"Duplicado","activo":1},{"id_personal":4,"tipo_personal":"AJUSTADOR","nombre":"duplicado","activo":1},{"id_personal":5,"tipo_personal":"MONTADOR","iniciales":"abc","contratista":"Empresa A","activo":1},{"id_personal":6,"tipo_personal":"MONTADOR","iniciales":"ABC","contratista":"Empresa A","activo":1},{"id_personal":7,"tipo_personal":"MONTADOR","iniciales":"X","contratista":"Empresa B","activo":1},{"id_personal":8,"tipo_personal":"MONTADOR","iniciales":"X","contratista":"Empresa C","activo":1},{"id_personal":9,"tipo_personal":"MONTADOR","iniciales":"-","contratista":"Empresa D","activo":1},{"id_personal":10,"tipo_personal":"MONTADOR","iniciales":"BAJA","contratista":"Empresa D","activo":0}];
  const result=JSON.parse(JSON.stringify(ctx.build(rows,true)));
  assert.deepEqual(result,{ajustador:['Ana Pérez'],subcontratista:['ABC']});
  assert.equal(ctx.build(rows,false).subcontratista,null);
});
test('El catálogo de edición se protege y comparte entre las tres vistas',()=>{
  const routes=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js');
  const auto=read('backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js');
  const main=read('modules/instalaciones-administracion/instalaciones-administracion_cor.js');
  const altas=read('modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js');
  assert.ok(routes.includes("'/administracion/catalogos-edicion/personal',...accessGuard_cor"));
  assert.ok(auto.includes('async function getPersonalEditCatalogs_cor(req) {\n  await service.ensureFullEditPermission_cor(req);'));
  assert.ok(main.includes('loadPersonalCatalog:loadPersonalCatalog_cor'));
  assert.ok(altas.includes('ManttoInstalacionesAdministracion_cor?.loadPersonalCatalog'));
});
