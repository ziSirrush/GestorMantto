'use strict';
// Contrato V2 de asignación automática: estado 06-A, idempotencia, traslapes.
const test=require('node:test');
const {createFixture,byOrigin,assert}=require('./helpers/instalaciones-conciliacion-v2.cjs');
const auto={actorId:null,tecnico:true};
const f=overrides=>createFixture(overrides);
test('F2: 06-A da de alta una sola barra azul con fechas persistidas',async()=>{
  const {state,api}=f();const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.creadas,1);assert.equal(byOrigin(state,'AUTOMATICA_FL').length,1);
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].fecha_desde,'2026-11-12');
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].fecha_hasta,'2026-11-15');
});
test('F2: la asignación automática se conserva en repetidos',async()=>{
  const {state,api}=f();await api.reconciliarEquipo(21,auto);
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.estado,'SIN_CAMBIOS');assert.equal(state.assignments.length,1);
});
test('F2: sin 06-A no crea asignaciones',async()=>{
  for(const status of ['05-PA','04-M','07-PE','08-T','']){
    const {state,api}=f({equipment:{estatus:status}});
    const r=await api.reconciliarEquipo(21,auto);
    assert.equal(r.creadas,0,status);assert.equal(state.assignments.length,0);
  }
});
test('F2: fecha real tiene preferencia sobre modificada y planeada',async()=>{
  const {state,api}=f({equipment:{fecha_fin_ajuste_real:'2026-11-14',fecha_fin_ajuste_modificado:'2026-11-16'}});
  await api.reconciliarEquipo(21,auto);
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].fecha_hasta,'2026-11-14');
});
test('F2: editando las fechas realiza UPDATE, no un segundo INSERT',async()=>{
  const {state,api}=f();await api.reconciliarEquipo(21,auto);
  const initial=byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion;
  state.equipment.fecha_fin_ajuste_real='2026-11-19';
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.actualizadas,1);assert.equal(byOrigin(state,'AUTOMATICA_FL').length,1);
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion,initial);
});
test('F2: una proyección manual coincidente no bloquea la barra de FL',async()=>{
  const manual={id_asignacion:40,id_personal:5,id_ins_fl:21,activo:1,origen:'MANUAL',es_historico:0,fecha_desde:'2026-11-13',fecha_hasta:'2026-11-14'};
  const {state,api}=f({assignments:[manual]});
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.conflictos[0].motivo,'TRASLAPE_PROYECCION_MANUAL');
  assert.equal(byOrigin(state,'AUTOMATICA_FL').length,1);
  assert.deepEqual(byOrigin(state,'MANUAL')[0],manual);
});
test('F2: una proyección manual sin traslape no genera alerta',async()=>{
  const {api}=f({assignments:[{id_asignacion:45,id_personal:5,id_ins_fl:21,activo:1,origen:'MANUAL',es_historico:0,fecha_desde:'2026-12-01',fecha_hasta:'2026-12-03'}]});
  const r=await api.reconciliarEquipo(21,auto);assert.deepEqual(r.conflictos,[]);
});
test('F2: nombre inexistente no genera fila',async()=>{
  const {state,api}=f({equipment:{ajustador:'Nadie'}});
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.estado,'REQUIERE_REVISION');assert.equal(state.assignments.length,0);
});
test('F2: persona inactiva no es elegible',async()=>{
  const {state,api}=f({people:[{id_personal:5,nombre:'Ana',activo:0,tipo_personal:'AJUSTADOR'}]});
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.estado,'REQUIERE_REVISION');assert.equal(state.assignments.length,0);
});
test('F2: identidad multipersonal completa da una fila por persona',async()=>{
  const {state,api}=f({equipment:{ajustador:'Ana / Luis'},
    people:[{id_personal:5,nombre:'Ana',activo:1,tipo_personal:'AJUSTADOR'},
      {id_personal:7,nombre:'Luis',activo:1,tipo_personal:'AJUSTADOR'}]});
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.creadas,2);assert.deepEqual(byOrigin(state,'AUTOMATICA_FL').map(x=>x.id_personal),[5,7]);
});
test('F2: referencia parcial no produce alta parcial',async()=>{
  const {state,api}=f({equipment:{ajustador:'Ana / Desconocido'}});
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.estado,'REQUIERE_REVISION');assert.equal(state.assignments.length,0);
});
test('F2: identidad ambigua no asigna personal',async()=>{
  const {state,api}=f({people:[{id_personal:5,nombre:'Ana',activo:1,tipo_personal:'AJUSTADOR'},
    {id_personal:6,nombre:'Ana',activo:1,tipo_personal:'AJUSTADOR'}]});
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.estado,'REQUIERE_REVISION');assert.equal(state.assignments.length,0);
});
test('F2: fechas invertidas no permiten una barra sin ventana valida',async()=>{
  const {state,api}=f({equipment:{fecha_inicio_ajuste:'2026-11-17'}});
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.estado,'REQUIERE_REVISION');assert.equal(state.assignments.length,0);
});
test('F2: cambio de estatus conserva azul historico y no lo elimina',async()=>{
  const {state,api}=f();await api.reconciliarEquipo(21,auto);
  state.equipment.estatus='05-PA';
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.historicas,1);assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].es_historico,1);
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].activo,1);
});
test('F2: historico no sigue fechas posteriores de FL',async()=>{
  const {state,api}=f();await api.reconciliarEquipo(21,auto);
  state.equipment.estatus='05-PA';await api.reconciliarEquipo(21,auto);
  state.equipment.fecha_fin_ajuste_real='2027-01-01';
  await api.reconciliarEquipo(21,auto);
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].fecha_hasta,'2026-11-15');
});
test('F2: 06-A recuperado actualiza el mismo registro historico',async()=>{
  const {state,api}=f();await api.reconciliarEquipo(21,auto);
  const id=byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion;
  state.equipment.estatus='05-PA';await api.reconciliarEquipo(21,auto);
  state.equipment.estatus='06-A';state.equipment.fecha_fin_ajuste_real='2026-11-18';
  const r=await api.reconciliarEquipo(21,auto);
  assert.equal(r.actualizadas,1);assert.equal(byOrigin(state,'AUTOMATICA_FL').length,1);
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].id_asignacion,id);
  assert.equal(byOrigin(state,'AUTOMATICA_FL')[0].es_historico,0);
});
test('F2: no acepta IDs fraccionarios ni menores que uno',async()=>{
  const {api}=f();
  for(const id of [0,-1,1.5,'abc'])await assert.rejects(()=>api.reconciliarEquipo(id,auto),{statusCode:400});
});
test('F2: no acepta identidad tecnica con actor humano',async()=>{
  const {api}=f();
  await assert.rejects(()=>api.reconciliarEquipo(21,{tecnico:true,actorId:42}),{statusCode:403});
});
test('F2: la operacion humana exige alcance verificado',async()=>{
  const {api}=f();await assert.rejects(()=>api.reconciliarEquipo(21,{actorId:42}),{statusCode:403});
});
test('F2: alcance humano correcto no bloquea la programación',async()=>{
  const {api}=f();const r=await api.reconciliarEquipo(21,{actorId:42,access:{sql:'f.id_sup=?',params:[10]}});
  assert.equal(r.creadas,1);
});
test('F2: alcance de otro supervisor no accede al equipo',async()=>{
  const {api}=f();const r=await api.reconciliarEquipo(21,{actorId:42,access:{sql:'f.id_sup=?',params:[99]}});
  assert.equal(r.estado,'REQUIERE_REVISION');
});
test('F2: fallo de INSERT no deja asignaciones a medias',async()=>{
  const {state,api}=f({failWrite:true});
  await assert.rejects(()=>api.reconciliarEquipo(21,auto));
  assert.equal(state.assignments.length,0);assert.equal(state.commits,0);assert.equal(state.rollbacks,1);
});
