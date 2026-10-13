'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const saving=require('../modules/instalaciones-administracion/instalaciones-administracion-save_cor.js');
const groups=[
  {key:'proyecto',fields:['proyecto','id_proyecto','estatus'],editable_fields:['proyecto','id_proyecto','estatus'],permissions:{can_view:true,can_edit:true}},
  {key:'equipo',fields:['numero_equipo_fabrica','tipo_equipo'],editable_fields:['numero_equipo_fabrica','tipo_equipo'],permissions:{can_view:true,can_edit:true}},
  {key:'responsables',fields:['id_sup'],editable_fields:['id_sup'],permissions:{can_view:true,can_edit:true}},
  {key:'costos',fields:['presupuesto_mantenimiento_cem'],editable_fields:['presupuesto_mantenimiento_cem'],permissions:{can_view:false,can_edit:false}}
];
const permitted=(g)=>g.permissions.can_edit;
const opts={projectKey:'P:477',groups,visibleFields:['id_ins_fl','proyecto','id_proyecto','estatus','numero_equipo_fabrica','tipo_equipo','id_sup'],canEdit:permitted,isViewingAs:false};
const draft=(id,field,value,original='Antes')=>({id_ins_fl:id,field,original,value,project_key:'P:477'});
const canonical=(_field,v)=>v==null?'':String(v).trim();
test('Agrupa ediciones distintas del mismo equipo en PATCH atomico por registro',()=>{
  const plan=saving.buildPlan([
    draft(22,'estatus','En Servicio'), draft(11,'proyecto','Nuevo nombre'),
    draft(22,'numero_equipo_fabrica','098'),draft(11,'tipo_equipo','Elevador')],opts);
  assert.deepEqual(plan.map(x=>x.id),[11,22]);
  assert.deepEqual(plan[1].groups.proyecto,{changes:{estatus:'En Servicio'},expected:{estatus:'Antes'}});
  assert.deepEqual(plan[1].groups.equipo,{changes:{numero_equipo_fabrica:'098'},expected:{numero_equipo_fabrica:'Antes'}});
  assert.equal(plan[1].drafts.length,2);
});
test('Fail-closed ante visor, columna tecnica, otro proyecto y grupo no autorizado',()=>{
  assert.throws(()=>saving.buildPlan([draft(2,'proyecto','X')],{...opts,isViewingAs:true}),/Visor/);
  assert.throws(()=>saving.buildPlan([draft(2,'id_ins_fl',12)],opts),/fuera del proyecto/);
  assert.throws(()=>saving.buildPlan([draft(2,'presupuesto_mantenimiento_cem','999')],opts),/fuera del proyecto/);
  assert.throws(()=>saving.buildPlan([draft(2,'proyecto','X'),{...draft(2,'estatus','B'),project_key:'P:OTRO'}],opts),/fuera del proyecto/);
  assert.throws(()=>saving.buildPlan([draft(2,'proyecto','X'),draft(2,'proyecto','Y')],opts),/duplicado/);
  assert.throws(()=>saving.buildPlan([{...draft(2,'estatus','X'),value:{malicious:true}}],opts),/invalidos/);
  assert.throws(()=>saving.buildPlan([{...draft(2,'estatus','X'),original:undefined}],opts),/invalidos/);
});
test('Exige permiso para el campo y su visibilidad, sin inferirlo del rol',()=>{
  const none=groups.map(g=>({...g,permissions:{can_view:true,can_edit:false}}));
  assert.throws(()=>saving.buildPlan([draft(1,'proyecto','X')],{...opts,groups:none,canEdit:permitted}),/fuera del proyecto/);
  assert.throws(()=>saving.buildPlan([draft(1,'proyecto','X')],{...opts,visibleFields:[]}),/fuera del proyecto/);
});
test('Guarda secuencialmente y verifica cada registro por GET antes de ACK',async()=>{
  const plan=saving.buildPlan([draft(12,'estatus','Vigente','Antes'),draft(9,'proyecto','Proyecto Nuevo','Antes')],opts);
  const operations=[],ack=[];
  const api=async(path,config)=>{
    operations.push([config?.method||'GET',path]);
    if(config?.method==='PATCH'){
      const body=JSON.parse(config.body);
      assert.deepEqual(Object.keys(body),['groups']);
      if(path.includes('/equipos/9/'))assert.equal(body.groups.proyecto.expected.proyecto,'Antes');
      return {ok:true,changed:true};
    }
    return path.endsWith('/9')?{ok:true,data:{id_ins_fl:9,proyecto:'Proyecto Nuevo'}}:
      {ok:true,data:{id_ins_fl:12,estatus:'Vigente'}};
  };
  const result=await saving.savePlan(plan,{projectKey:'P:477',api,current:()=>true,canonicalCompare:canonical,
    onConfirmed:async(r,read)=>{ack.push([r.id,read]);}});
  assert.deepEqual(result,{verified:2,total:2});
  assert.deepEqual(ack.map(x=>x[0]),[9,12]);
  assert.deepEqual(operations.map(x=>x[0]),['PATCH','GET','PATCH','GET']);
  assert.ok(operations[0][1].includes('/proyectos/P%3A477/equipos/9/tabla'));
});
test('Detiene el lote tras conflicto 409, conserva numero confirmado y no reenvia siguiente',async()=>{
  const plan=saving.buildPlan([draft(1,'estatus','A'),draft(2,'estatus','B'),draft(3,'estatus','C')],opts);
  const sent=[],ack=[];
  const api=async(path,config)=>{
    if(config?.method==='PATCH'){
      const id=Number(/equipos\/(\d+)/.exec(path)[1]);sent.push(id);
      if(id===2)throw Object.assign(new Error('Conflicto de concurrencia'),{status:409});
      return {ok:true};
    }
    return {ok:true,data:{id_ins_fl:1,estatus:'A'}};
  };
  await assert.rejects(saving.savePlan(plan,{projectKey:'P:477',api,current:()=>true,canonicalCompare:canonical,
    onConfirmed:async(record)=>ack.push(record.id)}),err=>{
    assert.equal(err.status,409);assert.equal(err.committed,false);
    assert.equal(err.verified,1);assert.equal(err.failedId,2);return true;
  });
  assert.deepEqual(sent,[1,2]);assert.deepEqual(ack,[1]);
});
test('No reintenta un PATCH aceptado si GET posterior falla / acceso revocado',async()=>{
  const plan=saving.buildPlan([draft(1,'id_sup',10,3),draft(2,'estatus','Vigente')],opts);
  let patchCount=0;const confirmed=[];
  await assert.rejects(saving.savePlan(plan,{projectKey:'P:477',
    current:()=>true,canonicalCompare:canonical,onConfirmed:async(x)=>confirmed.push(x.id),
    api:async(_path,config)=>{
      if(config?.method==='PATCH'){patchCount++;return {ok:true};}
      throw Object.assign(new Error('Sin permiso de lectura actual'),{status:403});
    }}),err=>{
    assert.equal(err.committed,true);assert.equal(err.verified,0);assert.equal(err.failedId,1);return true;
  });
  assert.equal(patchCount,1);assert.deepEqual(confirmed,[]);
});
test('Se niega a certificar un GET con valores distintos o sin campo visible',async()=>{
  const plan=saving.buildPlan([draft(5,'estatus','Nuevo','Antes')],opts);
  for(const data of [{id_ins_fl:5,estatus:'Otro'}, {id_ins_fl:5}]){
    await assert.rejects(saving.savePlan(plan,{projectKey:'P:477',current:()=>true,canonicalCompare:canonical,
      onConfirmed:async()=>{throw Error('NO debería ejecutarse');},
      api:async(_p,config)=>config?.method==='PATCH'?{ok:true}:{ok:true,data}}),err=>{
      assert.equal(err.committed,true);assert.equal(err.code,'FASE3_RECHECK_MISMATCH');return true;
    });
  }
});
test('Detiene envio si cambia actor/proyecto, sin llamadas adicionales',async()=>{
  const plan=saving.buildPlan([draft(2,'estatus','Nuevo')],opts);
  let calls=0;
  await assert.rejects(saving.savePlan(plan,{projectKey:'P:477',current:()=>false,
    canonicalCompare:canonical,onConfirmed:async()=>{},api:async()=>{calls++;}}),/sesion/);
  assert.equal(calls,0);
});
test('Limite de 30 equipos por operacion, resto se procesa por otro guardado',async()=>{
  const plan=saving.buildPlan(Array.from({length:31},(_,i)=>draft(i+1,'estatus','Nuevo')),opts);
  assert.equal(plan.length,31);assert.equal(saving.MAX_EQUIPMENTS_PER_SAVE,30);
  await assert.rejects(saving.savePlan(plan,{projectKey:'P:477',api:async()=>{},current:()=>true,
    canonicalCompare:canonical,onConfirmed:async()=>{}}),/maximo 30 equipos/);
});
