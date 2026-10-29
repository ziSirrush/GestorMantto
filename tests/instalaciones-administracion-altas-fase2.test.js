'use strict';
// QA de reglas puras y contrato visual. No conecta Aiven ni escribe en red.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const modulePath=path.resolve(__dirname,'../modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js');
const cssPath=path.resolve(__dirname,'../modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css');
const mainPath=path.resolve(__dirname,'../modules/instalaciones-administracion/instalaciones-administracion_cor.js');
const api=require(modulePath);
const {visibleFields,canCapture,editable,createRow,duplicateRow,projectPrefill,validateDraftCell,assessRows,MAX}=api.helpers;
const fullGroups=[
  {key:'proyecto',fields:[],permissions:{can_view:true,can_edit:true}},
  {key:'cliente_contrato',fields:[],permissions:{can_view:true,can_edit:true}},
  {key:'responsables',fields:[],permissions:{can_view:true,can_edit:true}}
];
const fieldList=['id_proyecto','id_sup','id_asesor','id_admin','activo',
  'proyecto','referencia_sitio', ...Array.from({length:86},(_,i)=>'campo_'+(i+1))];
fullGroups[0].fields=fieldList; // 93 columnas operativas / 5 internas = 88 + rel_admin = 89.
function row(ppns,project,reference){const x=createRow(7);x.values={id_proyecto:ppns,proyecto:project,referencia_sitio:reference};return x;}

test('Las 93 operativas no exponen IDs tecnicos: 89 columnas del Ghost',()=>{
  const columns=visibleFields({groups:fullGroups});
  assert.equal(fieldList.length,93);
  assert.equal(columns.length,89);
  assert.equal(columns.filter(x=>x==='rel_admin').length,1);
  for(const field of ['id_proyecto','id_sup','id_asesor','id_admin','activo'])assert.ok(!columns.includes(field));
});
test('Usuarios sin permiso de alta no obtienen el boton',()=>{
  assert.equal(canCapture({groups:fullGroups}),true);
  assert.equal(canCapture({groups:[{key:'proyecto',permissions:{can_view:true,can_edit:false}}]}),false);
  assert.equal(canCapture({groups:[{key:'proyecto',permissions:{can_view:false,can_edit:true}}]}),false);
});
test('El modo sin grupos o sin contrato falla cerrado',()=>{
  assert.equal(canCapture(null),false);
  assert.deepEqual(visibleFields({groups:[]}),[]);
});
test('La identidad PP NS es editable solamente en un alta',()=>{
  assert.equal(editable('id_proyecto'),true);
  assert.equal(editable('proyecto'),true);
  assert.equal(editable('referencia_sitio'),true);
});
test('Campos calculados y formulas pendientes no son editables',()=>{
  for(const field of ['estatus_completo','dias_sin_visita','dias_sin_ccnr','dias_restantes',
    'meses_garantia_restantes','fecha_fin_montaje_real','fecha_fin_ajuste_real',
    'anio_termino','costo_mensual_mantenimiento_cem','rel_admin','id_ins_fl','activo']) {
    assert.equal(editable(field),false,field);
    assert.equal(validateDraftCell(field,'123').ok,false,field);
  }
});
test('Los campos opcionales vacios se guardan en borrador como NULL',()=>{
  assert.deepEqual(validateDraftCell('marca',''),{ok:true,value:null});
  assert.deepEqual(validateDraftCell('estatus','  '),{ok:true,value:null});
});
test('PP NS permite texto corto y rechaza mas de 100 caracteres',()=>{
  assert.deepEqual(validateDraftCell('id_proyecto','  P123  '),{ok:true,value:'P123'});
  assert.equal(validateDraftCell('id_proyecto','P'.repeat(101)).ok,false);
});
test('Seleccion y fecha usan las reglas del editor fantasma',()=>{
  const helpers={validValue_cor(field,value){return {ok:true,value:field+'='+value};}};
  assert.deepEqual(validateDraftCell('estatus','02-OC',{},null,helpers),{ok:true,value:'estatus=02-OC'});
  assert.deepEqual(validateDraftCell('fecha_visita','2026-10-20',{kind:'date'},null,helpers),
    {ok:true,value:'fecha_visita=2026-10-20'});
});
test('Detecta identidades incompletas, sin adivinar PP NS',()=>{
  const verdict=assessRows([createRow(1)]);
  assert.equal(verdict.ok,false);
  assert.match(verdict.issues.join(' '),/PP NS/);
  assert.match(verdict.issues.join(' '),/Proyecto/);
});
test('Permite equipos de distintos proyectos',()=>{
  assert.deepEqual(assessRows([row('P200','Proyecto A','Elevador 1'),row('P201','Proyecto B','Escalera 1')]).issues,[]);
});
test('Detecta referencia duplicada por PP NS aun con diferente formato',()=>{
  const v=assessRows([row('P100','Proyecto A','Elevador 1'),row(' p100 ','proyecto a','elevador   1')]);
  assert.equal(v.ok,false);
  assert.match(v.issues.join(' '),/duplicada/);
});
test('Detecta PP NS compartido por diferentes nombres de proyecto',()=>{
  const v=assessRows([row('P100','Proyecto A','Elevador 1'),row('P100','Proyecto B','Elevador 2')]);
  assert.equal(v.ok,false);
  assert.match(v.issues.join(' '),/nombres distintos/);
});
test('No permite mas de veinte filas',()=>{
  assert.equal(MAX,20);
  assert.equal(assessRows(Array.from({length:21},(_,i)=>row('P'+i,'Proyecto '+i,'Equipo'))).ok,false);
});
test('Duplicar fila copia el borrador salvo PH NS y Referencia en sitio',()=>{
  const source=createRow(3);
  source.values={proyecto:'Proyecto A',id_proyecto:'P200',referencia_sitio:'Elevador 1',
    ph_ns:'PH900',estatus:'04-M',marca:null,numero_pisos:'12'};
  const copy=duplicateRow(source,4);
  assert.equal(copy.draft_id,4);
  assert.notStrictEqual(copy.values,source.values);
  assert.equal(Object.getPrototypeOf(copy.values),null);
  assert.deepEqual({...copy.values},{proyecto:'Proyecto A',id_proyecto:'P200',estatus:'04-M',marca:null,numero_pisos:'12'});
  assert.equal(Object.hasOwn(copy.values,'ph_ns'),false);
  assert.equal(Object.hasOwn(copy.values,'referencia_sitio'),false);
  assert.equal(source.values.ph_ns,'PH900');
  assert.equal(source.values.referencia_sitio,'Elevador 1');
});
test('Agregar desde un proyecto precarga sus datos autorizados y limpia PH NS y Referencia',()=>{
  const context={
    project:{project_key:'P:P200',id_proyecto:'P200',proyecto:'Proyecto A'},
    template:{id_ins_fl:18,id_proyecto:'P-VIEJO',proyecto:'Nombre anterior',
      referencia_sitio:'Elevador 1',ph_ns:'PH900',estatus:'04-M',marca:'BLT',
      numero_pisos:'12',dias_restantes:8,rel_admin:'AA'}
  };
  const defaults=projectPrefill(context,[
    'proyecto','referencia_sitio','ph_ns','estatus','marca','numero_pisos','dias_restantes','rel_admin'
  ]);
  const row=createRow(5,defaults);
  assert.deepEqual({...row.values},{
    id_proyecto:'P200',proyecto:'Proyecto A',estatus:'04-M',marca:'BLT',numero_pisos:'12'
  });
  for(const field of ['ph_ns','referencia_sitio','id_ins_fl','dias_restantes','rel_admin'])
    assert.equal(Object.hasOwn(row.values,field),false,field);
  const main=fs.readFileSync(mainPath,'utf8');
  assert.match(main,/function getAltaContext_cor\(\)/);
  assert.match(main,/st\.records\[0\]/);
  assert.match(main,/getAltaContext:getAltaContext_cor/);
});
test('Captura solo envia POST cuando el usuario confirma, sin storage ni PATCH',()=>{
  const src=fs.readFileSync(modulePath,'utf8');
  assert.match(src, /method:'POST'/);
  assert.match(src,/env\.confirm\('Crear /);
  assert.doesNotMatch(src, /method:\s*['"](?:PATCH|PUT|DELETE)['"]/i);
  assert.doesNotMatch(src, /\b(?:localStorage|sessionStorage|indexedDB)\./i);
  assert.match(src,/Agregar nuevo/);
  assert.match(src,/Agregar fila/);
  assert.match(src,/data-iadm-altas-duplicate/);
  assert.match(src,/>Duplicar<\/button>/);
  assert.match(src,/getAltaContext/);
  assert.match(src,/id="iadm-cor-altas-cancel"[^>]*[\s\S]*?>Cancelar<\/button>/);
  assert.match(src,/id="iadm-cor-altas-clear"[^>]*>Eliminar borrador<\/button>/);
  assert.match(src,/Cancelar y eliminar el borrador/);
  assert.match(src,/Guardar lote/);
  assert.ok(fs.existsSync(cssPath));
});
test('No hay persistencia de un equipo sin confirmar el lote',()=>{
  const x=createRow(1);
  assert.equal(Object.getPrototypeOf(x.values),null);
  assert.deepEqual(Object.keys(x.values),[]);
});
