'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('QA temporal: no hay ejecucion arbitraria ni cambios a SQL nocturno',()=>{
  const routes=read('backend/src/routes/panel-control.routes.js');
  const tester=read('backend/src/controllers/panel-control-scripts.controller.js');
  const job=read('backend/src/jobs/instalacionesProgramacionPersonal.job.js');
  assert.match(routes,/pruebas-scripts\/conciliacion-ajustadores/);
  assert.match(routes,/scriptTests\.authorize/);
  assert.match(tester,/roles\.includes\('Programador'\)/);
  assert.match(tester,/hasEffectivePermission\(id,PERMISO_PANEL\)/);
  assert.match(tester,/GET_LOCK\(\?,0\)/);
  assert.match(tester,/scanEquipos/);
  assert.match(job,/INSERT IGNORE INTO instalaciones_programacion_conciliacion_diaria/);
  assert.match(job,/clock\.hour!==23\|\|clock\.minute!==59/);
});
test('QA temporal: barrido manual reutiliza motor sin consumir cierre diario',async()=>{
  const source=read('backend/src/jobs/instalacionesProgramacionPersonal.job.js');
  const sql=[];
  const db={query:async (text)=>{
    sql.push(String(text));
    if(/SELECT f\.id_ins_fl FROM ins_fl/.test(text))return [[{id_ins_fl:7}]];
    throw Error('El barrido manual no puede escribir en la tabla nocturna');
  }};
  let called=0;
  const context={
    require:module=>{
      if(module==='../config/db')return db;
      if(module.includes('conciliacion.service'))return {reconciliarEquipo:async()=>{
        called++;
        return {estado:'SINCRONIZADO',creadas:1,actualizadas:0,historicas:0,conflictos:[]};
      }};
      throw Error(module);
    },module:{exports:{}},Date,Intl,Number,String,Object,JSON,console,
    setInterval:()=>null,clearInterval:()=>{}
  };
  // Segunda pagina devuelta vacia para que termine la prueba.
  let queries=0;
  db.query=async text=>{
    sql.push(String(text));
    if(/SELECT f\.id_ins_fl FROM ins_fl/.test(text)){
      queries++;
      return [queries===1?[{id_ins_fl:7}]:[]];
    }
    throw Error('SQL no esperado en barrido de prueba');
  };
  vm.runInNewContext(source,context);
  const out=await context.module.exports.scanEquipos({manual:true});
  assert.equal(out.total_equipos,1);
  assert.equal(out.creadas,1);
  assert.equal(out.errores,0);
  assert.equal(called,1);
  assert.ok(sql.every(stmt=>!/instalaciones_programacion_conciliacion_diaria/.test(stmt)));
});
test('PWA CX: Encuestas y Visitas usan regreso contextual cuando hay detalle abierto',()=>{
  const app=read('core/app.js');
  const encuesta=read('modules/customer-experience-encuestas/customer-experience-encuestas.js');
  const encuestaCss=read('modules/customer-experience-encuestas/customer-experience-encuestas.css');
  const visitaCss=read('modules/customer-experience-visitas/customer-experience-visitas.css');
  assert.match(app,/'cx-encuestas':\['#ce-detalle-overlay:not\(\[hidden\]\) #ce-detalle-cerrar'\]/);
  assert.match(app,/route==='cx-encuestas'/);
  assert.match(app,/if\(localBack\)\{localBack\.click\(\);return;\}/);
  assert.match(encuesta,/id="ce-detalle-cerrar"/);
  assert.match(encuestaCss,/min-height:44px/);
  assert.match(visitaCss,/\.cxv-close\{min-width:44px/);
});
