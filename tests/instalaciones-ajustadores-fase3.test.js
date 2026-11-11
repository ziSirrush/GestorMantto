'use strict';
// F3 V2: conciliacion incrementable, transacciones, historial, reintentos y
// contrato del wrapper M2M; los mocks no acceden a Aiven.
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {createFixture,byOrigin,assert}=require('./helpers/instalaciones-conciliacion-v2.cjs');
const repo=path.resolve(__dirname,'..');
const text=p=>fs.readFileSync(path.join(repo,p),'utf8');
const syncSrc=text('backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.ajustadores-sync.service.js');
const flSrc=text('backend/src/controllers/ins-fl.controller.js');
const jobSrc=text('backend/src/jobs/instalacionesProgramacionPersonal.job.js');
const req={tecnico:true};
test('F3: se guarda una sola fila automatica por equipo y persona',async()=>{
 const {state,api}=createFixture();
 const r=await api.reconciliarEquipo(21,req);
 assert.equal(r.creadas,1);assert.equal(byOrigin(state,'AUTOMATICA_FL').length,1);
});
test('F3: no se duplica en un reintento igual',async()=>{
 const {state,api}=createFixture();
 await api.reconciliarEquipo(21,req);
 assert.equal((await api.reconciliarEquipo(21,req)).estado,'SIN_CAMBIOS');
 assert.equal(byOrigin(state,'AUTOMATICA_FL').length,1);
});
test('F3: actualizar fin solo emite UPDATE de la barra azul',async()=>{
 const {state,api}=createFixture();await api.reconciliarEquipo(21,req);
 const original=byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion;
 state.equipment.fecha_fin_ajuste_modificado='2026-11-16';
 const r=await api.reconciliarEquipo(21,req);
 assert.equal(r.actualizadas,1);assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion,original);
});
test('F3: con dato real posterior tambien actualiza la barra azul',async()=>{
 const {state,api}=createFixture();await api.reconciliarEquipo(21,req);
 state.equipment.fecha_fin_ajuste_real='2026-11-17';
 assert.equal((await api.reconciliarEquipo(21,req)).actualizadas,1);
 assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].fecha_hasta,'2026-11-17');
});
test('F3: manual no se modifica por cambio de fechas FL',async()=>{
 const manual={id_asignacion:33,id_personal:5,id_ins_fl:21,activo:1,
  origen:'MANUAL',es_historico:0,fecha_desde:'2026-11-13',fecha_hasta:'2026-11-14'};
 const {state,api}=createFixture({assignments:[manual]});
 await api.reconciliarEquipo(21,req);
 state.equipment.fecha_fin_ajuste_real='2026-11-22';await api.reconciliarEquipo(21,req);
 assert.deepEqual(byOrigin(state,'MANUAL'),[manual]);
});
test('F3: 05-PA no genera barra automatica',async()=>{
 const {state,api}=createFixture({equipment:{estatus:'05-PA'}});
 assert.equal((await api.reconciliarEquipo(21,req)).creadas,0);
 assert.equal(state.assignments.length,0);
});
test('F3: 07-PE no genera barra automatica',async()=>{
 const {state,api}=createFixture({equipment:{estatus:'07-PE'}});
 assert.equal((await api.reconciliarEquipo(21,req)).creadas,0);
 assert.equal(state.assignments.length,0);
});
test('F3: 06-A a 07-PE conserva el ID en historico',async()=>{
 const {state,api}=createFixture();await api.reconciliarEquipo(21,req);
 const initial=byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion;
 state.equipment.estatus='07-PE';await api.reconciliarEquipo(21,req);
 assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion,initial);
 assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].es_historico,1);
});
test('F3: la fecha congelada historica no hereda modificaciones',async()=>{
 const {state,api}=createFixture();await api.reconciliarEquipo(21,req);
 state.equipment.estatus='08-T';await api.reconciliarEquipo(21,req);
 state.equipment.fecha_fin_ajuste_real='2028-01-01';await api.reconciliarEquipo(21,req);
 assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].fecha_hasta,'2026-11-15');
});
test('F3: otra vez 06-A reanima el mismo registro sin INSERT',async()=>{
 const {state,api}=createFixture();await api.reconciliarEquipo(21,req);
 state.equipment.estatus='08-T';await api.reconciliarEquipo(21,req);
 state.equipment.estatus='06-A';const r=await api.reconciliarEquipo(21,req);
 assert.equal(r.actualizadas,1);assert.equal(byOrigin(state,'AUTOMATICA_FL').length,1);
});
test('F3: si la identidad es ambigua no muta el sistema',async()=>{
 const {state,api}=createFixture({people:[{id_personal:5,nombre:'Ana',activo:1,tipo_personal:'AJUSTADOR'},
  {id_personal:6,nombre:'Ana',activo:1,tipo_personal:'AJUSTADOR'}]});
 assert.equal((await api.reconciliarEquipo(21,req)).estado,'REQUIERE_REVISION');
 assert.equal(state.commits,0);
});
test('F3: sin ajustador no hay nuevas filas',async()=>{
 const {state,api}=createFixture({equipment:{ajustador:''}});
 assert.equal((await api.reconciliarEquipo(21,req)).estado,'REQUIERE_REVISION');
 assert.equal(state.assignments.length,0);
});
test('F3: fecha invalida no genera altas',async()=>{
 const {state,api}=createFixture({equipment:{fecha_fin_ajuste_planeado:'2026-11-01'}});
 assert.equal((await api.reconciliarEquipo(21,req)).estado,'REQUIERE_REVISION');
 assert.equal(state.commits,0);
});
test('F3: fallo SQL causa rollback completo',async()=>{
 const {state,api}=createFixture({failWrite:true});
 await assert.rejects(()=>api.reconciliarEquipo(21,req));
 assert.equal(state.commits,0);assert.equal(state.rollbacks,1);
});
test('F3: conflicto manual registra advertencia, no cancela sincronizacion',async()=>{
 const {state,api}=createFixture({assignments:[
  {id_asignacion:30,id_personal:5,id_ins_fl:21,origen:'MANUAL',es_historico:0,activo:1,
   fecha_desde:'2026-11-12',fecha_hasta:'2026-11-12'}]});
 const r=await api.reconciliarEquipo(21,req);
 assert.equal(r.creadas,1);assert.equal(r.conflictos.length,1);
});
test('F3: fuera de alcance no asigna por ruta humana',async()=>{
 const {state,api}=createFixture();
 const r=await api.reconciliarEquipo(21,{actorId:20,access:{sql:'f.id_sup=?',params:[11]}});
 assert.equal(r.creadas,0);assert.equal(state.assignments.length,0);
});
test('F3: cambio de FL durante el bloqueo revierte transaccion',async()=>{
 const {state,api}=createFixture();
 state.onLock=()=>{state.equipment.fecha_fin_ajuste_real='2026-11-24';};
 await assert.rejects(()=>api.reconciliarEquipo(21,req),{code:'INT9_FL_CAMBIO'});
 assert.equal(state.commits,0);assert.equal(state.rollbacks,1);
});
test('F3: error de duplicidad SQL mapea al codigo INT9',async()=>{
 const {api}=createFixture({failWrite:true});
 await assert.rejects(()=>api.reconciliarEquipo(21,req),{code:'INT9_AUTO_DUPLICADO'});
});
test('F3: controlador FL acumula solo IDs cambiados en transaccion',()=>{
 assert.match(flSrc,/int9CommittedChanges/);
 assert.match(flSrc,/new Set\(int9Changed/);
 assert.match(flSrc,/await conn\.commit\(\)/);
});
test('F3: wrapper respeta autenticacion de integracion',()=>{
 assert.match(syncSrc,/integracionVerificada\(req\)/);
 assert.match(syncSrc,/INTEGRATION_INS_FL_ID/);
 assert.match(syncSrc,/if\(!integracionVerificada\(req\)\)return originalSync/);
});
test('F3: wrapper no niega sync confirmado ante falla parcial',()=>{
 assert.match(syncSrc,/INT9_POST_SYNC_RECONCILIACION/);
 assert.match(syncSrc,/capturado/);
 assert.match(syncSrc,/programacion_ajustadores:report/);
});
test('F3: el limite de conciliacion incremental permanece acotado',()=>{
 assert.match(syncSrc,/MAX_AJUSTES_POR_SYNC = 80/);
 assert.match(syncSrc,/slice\(0,MAX_AJUSTES_POR_SYNC\)/);
});
test('F3: revision nocturna se limita por fecha y estado SQL',()=>{
 assert.match(jobSrc,/INSERT IGNORE INTO instalaciones_programacion_conciliacion_diaria/);
 assert.match(jobSrc,/WHERE fecha_cdmx=\? AND estado='EN_PROCESO'/);
});
test('F3: job no procesa fuera de 23:59 CDMX',()=>{
 assert.match(jobSrc,/America\/Mexico_City/);
 assert.match(jobSrc,/clock\.hour!==23\|\|clock\.minute!==59/);
});
