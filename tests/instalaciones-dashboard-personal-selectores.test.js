'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const shared=require('../modules/instalaciones-programacion-personal/instalaciones-personal-selectores_cor.js');
const admin=require('../modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js').helpers;
const source=fs.readFileSync(path.join(__dirname,'..','modules/instalaciones-dashboard/instalaciones-dashboard_cor.js'),'utf8');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const fragment=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const cat={personal:{ajustador:['Ana Pérez','José'],subcontratista:['ABC','XYZ']}};
test('Administración y Dashboard comparten las opciones y validación de personal',()=>{
  assert.equal(admin.personalOptions_cor,shared.personalOptions_cor);
  for(const [field,value] of [['ajustador','Ana Pérez'],['subcontratista','ABC']]){
    assert.deepEqual(admin.validValue_cor(field,value,{},cat),shared.validatePersonalValue_cor(field,value,{},cat));
    assert.deepEqual(shared.validatePersonalValue_cor(field,value,{},cat),{ok:true,value});
    assert.equal(shared.validatePersonalValue_cor(field,'INVENTADO',{},cat).ok,false);
    assert.deepEqual(shared.validatePersonalValue_cor(field,'',{},cat),{ok:true,value:null});
  }
  assert.equal(shared.validatePersonalValue_cor('subcontratista','',{}, {personal:{ajustador:[],subcontratista:null}}).ok,false);
});
test('04-M, 05-PA y 06-A usan select real, preservan históricos y bloquean hasta consultar',()=>{
  const configs=new Function(fragment(source,'const QUICK_EDIT_FIELDS_COR =','const PERMISSIONS_COR =')+'\nreturn QUICK_EDIT_FIELDS_COR;')();
  const editor=new Function('window','state','raw','esc',fragment(source,'function dateInputValue_cor(','function closeCellEditor_cor(')+'\nreturn editorControl_cor;')(
    {ManttoInstalacionesPersonalSelectores_cor:shared},{personalCatalog:cat,sections:[{codigo:'04-M',nombre:'Montaje'}]},v=>String(v??'').trim(),
    v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'));
  for(const [stage,field] of [['04-M','subcontratista'],['05-PA','ajustador'],['06-A','ajustador']]){
    const config=configs[stage][field];
    assert.equal(config.type,'personal');
    assert.equal(config.field,field);
    const html=editor(config,'Anterior <Histórico>');
    assert.ok(html.startsWith('<select'));
    assert.ok(html.includes('disabled aria-busy'));
    assert.ok(html.includes('selected disabled'));
    assert.ok(html.includes('&lt;Histórico&gt;'));
  }
  assert.ok(editor(configs['04-M'].estatus,'04-M').includes('<option value="04-M" selected>'));
});
test('Catálogo protegido por Modo Junta, permiso EDITAR, alcance y visor',()=>{
  const routes=read('backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.routes.js');
  const controller=read('backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.controller.js');
  assert.ok(routes.includes("'/dashboard/catalogos-edicion/personal'"));
  assert.ok(routes.includes('requireReportEdit_cor,\n  controller.personalCatalog_cor'));
  const guard=fragment(controller,'async function personalCatalog_cor(','async function assertRowInInformationScope_cor(');
  assert.ok(guard.includes('req.viewerContext?.active'));
  assert.ok(guard.includes("String(req.query?.modo_junta)!=='1'"));
  assert.ok(guard.includes('await validateDashboardQueryScope_cor(req)'));
  assert.ok(guard.includes('.catalogoAsignacion_cor()'));
  assert.ok(source.includes('state.personalCatalogPromise!==pending'));
  assert.ok(source.includes('state.editor===context&&state.report===context.reportRef'));
  assert.ok(source.includes('if(raw(value)===raw(context.previousValue))'));
  assert.ok(source.includes('valor_anterior:context.previousValue'));
  const loader=read('core/module-loader.js');
  assert.equal(loader.split('./modules/instalaciones-programacion-personal/instalaciones-personal-selectores_cor.js?v=20261124-personal-selectores-v002').length,3);
});
