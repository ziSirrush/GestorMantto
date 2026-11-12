'use strict';
// INT9 04-M agrupaciones: QA offline, sin acceso a Aiven ni credenciales.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.montadores-grupos.service.js'),'utf8');
const routes=fs.readFileSync(path.join(__dirname,'../backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.routes.js'),'utf8');
function serviceWith(db){
 const module={exports:{}};
 new Function('module','require',source)(module,id=>{
  if(id==='node:crypto')return {createHash:()=>({update(s){this.value=s;return this;},digest(){return this.value.padEnd(64,'0').slice(0,64);}})};
  if(id==='../../config/db')return db;
  if(id==='./instalaciones-programacion-personal.asignaciones.service')return {_read:{
   parseDate:v=>v==null?null:String(v).slice(0,10),
   windowEquipo:(_t,row)=>({inicio:row.fecha_inicio_montaje,fin:row.fecha_fin_montaje_planeado,
     valida:true,fuente_fin:'planeado'}),scope:()=>({sql:'f.id_ins_fl=?',params:[10]}),
   intersect:(a,b,c,d)=>a<=d&&b>=c,
   fetchAssignmentRows:async()=>[]
  }};
  throw Error('Mock inesperado: '+id);
 });
 return module.exports;
}
test('Contrato: rol e iniciales, prohibicion de mezclar contratistas',()=>{
 const t=serviceWith({})._test;
 const r={contratista:'AL CA',iniciales:'AL CA'};
 assert.equal(t.propio({tipo_personal:'MONTADOR',activo:1,puesto:'Mecánico',contratista:'AL CA',iniciales:'AL CA'},r),true);
 assert.equal(t.propio({tipo_personal:'MONTADOR',activo:1,puesto:'Ayudante',contratista:'DC GH',iniciales:'AL CA'},r),false);
 assert.equal(t.propio({tipo_personal:'MONTADOR',activo:0,puesto:'Mecánico',contratista:'AL CA',iniciales:'AL CA'},r),false);
 assert.equal(t.propio({tipo_personal:'MONTADOR',activo:1,puesto:'Supervisor',contratista:'AL CA',iniciales:'AL CA'},r),false);
});
test('Payload: grupo independiente, sin IDs repetidos ni campos inyectados',()=>{
 const t=serviceWith({})._test,revision='a'.repeat(64);
 assert.equal(t.validarCuerpo({contratista:'AL CA',cambios:[{id_ins_fl:10,ids_personal:[5,4],revision}]}).cambios[0].ids_personal[0],4);
 assert.throws(()=>t.validarCuerpo({contratista:'AL CA',cambios:[{id_ins_fl:10,ids_personal:[5,5],revision}]}),{code:'INT9_GRUPO_PERSONA_DUPLICADA'});
 assert.throws(()=>t.validarCuerpo({contratista:'AL CA',cambios:[{id_ins_fl:10,ids_personal:[],revision},{id_ins_fl:10,ids_personal:[],revision}]}),{code:'INT9_GRUPO_EQUIPO_DUPLICADO'});
 assert.throws(()=>t.validarCuerpo({contratista:'AL CA',cambios:[{id_ins_fl:10,ids_personal:[],revision}],created_by:1}),{code:'INT9_GRUPO_CUERPO_INVALIDO'});
});
test('Detalle: la revision solo considera manuales, no relaciones automaticas',()=>{
 const t=serviceWith({})._test,link={id_relacion:1};
 const row={id_asignacion:3,id_personal:7,fecha_desde:'2026-11-12',fecha_hasta:'2026-11-20',notas:'',origen:'MANUAL'};
 assert.equal(t.snapshot([row],link),t.snapshot([row,{...row,origen:'AUTOMATICA_FL',id_asignacion:20}],link));
 assert.notEqual(t.snapshot([row],link),t.snapshot([{...row,id_asignacion:4}],link));
});
test('Rutas: lectura con Guard CORELLIAN; escritura necesita CREAR y DESACTIVAR',()=>{
 assert.match(routes,/router\.get\('\/programacion\/montadores\/equipo\/:id\/detalle',\.\.\.readGuard/);
 assert.match(routes,/router\.post\('\/programacion\/montadores\/agrupaciones\/guardar',\.\.\.readGuard,tabPermission\.onlyTab\('MONTADOR'\),\s*permissionFor\('CREAR'\),permissionFor\('DESACTIVAR'\)/);
});
