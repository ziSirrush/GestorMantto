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
  assert.match(job,/GET_LOCK/);
  assert.doesNotMatch(tester,/db\\.getConnection/);
  assert.match(job,/RELEASE_LOCK/);
  assert.match(tester,/scanEquipos/);
  assert.match(job,/INSERT IGNORE INTO instalaciones_programacion_conciliacion_diaria/);
  assert.match(job,/clock\.hour!==23\|\|clock\.minute!==59/);
});
test('QA temporal: barrido manual por capas sin consumir cierre diario',async()=>{
  const source=read('backend/src/jobs/instalacionesProgramacionPersonal.job.js');
  const queries=[],visited=[];
  let held=0,peak=0,opened=0,released=0;
  const rows=[{id_ins_fl:7,estatus:'06-A'},{id_ins_fl:8,estatus:'05-C'}];
  const con={
    query:async sql=>{
      queries.push(sql);
      if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
      if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
      throw Error('SQL de conexion inesperado: '+sql);
    },
    release(){held--;released++;},
    destroy(){held--;released++;}
  };
  const db={
    query:async(sql,params=[])=>{
      queries.push(String(sql));
      if(sql.includes('FROM ins_fl f'))return [rows.filter(row=>row.id_ins_fl>params[0])];
      if(sql.includes('FROM instalaciones_programacion_asignaciones a'))return [[]];
      throw Error('El barrido manual no puede escribir en la tabla nocturna');
    },
    async getConnection(){opened++;held++;peak=Math.max(peak,held);return con;}
  };
  const context={
    require:module=>{
      if(module==='../config/db')return db;
      if(module.includes('conciliacion.service'))return {reconciliarEquipo:async(id,options)=>{
        assert.equal(options.conexionCompartida,con);
        visited.push(id);
        return {estado:'SINCRONIZADO',creadas:1,actualizadas:0,historicas:0,conflictos:[]};
      }};
      throw Error(module);
    },
    module:{exports:{}},Date,Intl,Number,String,Object,JSON,console,
    setTimeout,setInterval:()=>null,clearInterval:()=>{}
  };
  vm.runInNewContext(source,context);
  const out=await context.module.exports.scanEquipos({manual:true});
  assert.equal(out.total_equipos,1);
  assert.equal(out.creadas,1);
  assert.equal(out.errores,0);
  assert.deepEqual(visited,[7]);
  assert.equal(peak,1);
  assert.equal(opened,released);
  assert.ok(queries.every(query=>!/instalaciones_programacion_conciliacion_diaria/.test(query)));
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

test('PWA CX: regreso funcional, único cierre superior y CSS de modal bajo barra contextual',()=>{
  const base=read('styles/base.css');
  const css=read('modules/customer-experience-encuestas/customer-experience-encuestas.css');
  const js=read('modules/customer-experience-encuestas/customer-experience-encuestas.js');
  const app=read('core/app.js');
  const sw=read('service-worker.js');
  const html=read('index.html');
  assert.match(base,/#view-placeholder #ce-detalle-overlay\{top:var\(--app-context-bottom,120px\)!important\}/);
  assert.match(css,/#view-placeholder #ce-detalle-overlay\{top:var\(--app-context-bottom,120px\)!important/);
  assert.match(css,/max-height:calc\(100dvh - var\(--app-context-bottom,120px\) - 18px\)/);
  assert.match(js,/id="ce-detalle-cerrar"/);
  assert.doesNotMatch(js,/ce-detalle-cerrar-inferior|ce-modal-footer|ce-modal-exit/);
  assert.doesNotMatch(css,/ce-modal-footer|ce-modal-exit/);
  assert.match(js,/closeDetail:closeModal/);
  assert.match(js,/if\(!isDetailOpen\(\)\)return false/);
  assert.match(app,/ManttoCustomerExperienceEncuestas\?\.closeDetail\?\.\(\)/);
  assert.match(sw,/needsFreshCxAsset_cor\(url\)/);
  assert.match(html,/20261111-cx-encuestas-close-v002/);
});
test('Panel de Control conserva EN_PROCESO cuando falla una consulta temporal',()=>{
  const panel=read('modules/panel-control/panel-control.js');
  assert.match(panel,/const pending=state\.scriptTest\.running\|\|state\.scriptTest\.data\?\.estado==='EN_PROCESO'/);
  assert.match(panel,/state\.scriptTest\.running=Boolean\(pending\)/);
  assert.match(panel,/Math\.min\(30000,1600\*Math\.pow\(2,/);
  assert.match(panel,/NO vuelvas a ejecutarla/);
  assert.match(panel,/scriptTestPolling=true/);
});
