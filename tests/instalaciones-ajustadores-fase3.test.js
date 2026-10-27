'use strict';

// F3: QA aislado de backend. Nada sale de memoria (sin Aiven, Azure o Netlify).
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');

const moduleDir=path.resolve(__dirname,'../backend/src/modules/instalaciones-programacion-personal');
const serviceFile=path.join(moduleDir,'instalaciones-programacion-personal.ajustadores-sync.service.js');
const f2File=path.join(moduleDir,'instalaciones-programacion-personal.ajustadores.service.js');
const programRoutes=path.join(moduleDir,'instalaciones-programacion-personal.routes.js');
const insFlRoutes=path.resolve(__dirname,'../backend/src/routes/ins-fl.routes.js');

const clone=x=>JSON.parse(JSON.stringify(x));
let equipos=[],personas=[],asignadas=[],nextId=800,sqlCalls=[],txs=[],hooks={},createdSync=null,locks=0;
function eq(id,ajustador,extra={}){
  return {id_ins_fl:id,id_proyecto:'P'+id,referencia_sitio:'E'+id,proyecto:'Proyecto '+id,
    activo:1,id_sup:10,ajustador,fecha_inicio_ajuste:'2026-10-10',
    fecha_fin_ajuste_planeado:'2026-10-20',fecha_fin_ajuste_modificado:null,
    fecha_fin_ajuste_real:null,...extra};
}
function person(id,nombre,extra={}){
  return {id_personal:id,nombre,activo:1,tipo_personal:'AJUSTADOR',...extra};
}
const NOTE='[BLT_NOW_INT9_AJUSTADOR_AUTO_V1] Origen: ins_fl.ajustador; fechas heredadas de ins_fl.';
function assign(pid,team,options={}){
  return {id_asignacion:++nextId,id_personal:pid,id_ins_fl:team,fecha_desde:null,fecha_hasta:null,
    activo:1,notas:NOTE,created_by:null,updated_by:null,...options};
}
function windowEquipo(type,record){
  assert.equal(type,'AJUSTADOR');
  const start=String(record.fecha_inicio_ajuste||'');
  let end=null,source=null;
  for(const option of ['real','modificado','planeado']){
    const str=String(record[`fecha_fin_ajuste_${option}`]||'');
    if(/^\d{4}-\d\d-\d\d$/.test(str)){end=str;source=option;break;}
  }
  const valid=/^\d{4}-\d\d-\d\d$/.test(start)&&Boolean(end)&&end>=start;
  return {inicio:valid?start:null,fin:end,fuente_fin:source,valida:valid};
}
function windowAsignacion(type,equipo,asignacion){
  const w=windowEquipo(type,equipo);
  const begin=asignacion.fecha_desde||w.inicio;
  const end=asignacion.fecha_hasta||w.fin;
  return {inicio:begin,fin:end,valida:Boolean(begin&&end&&end>=begin)};
}
const scopeImpl={_read:{
  scope(req){
    if(req.informationAccess?.empresa!=='CORELLIAN' || !Number.isSafeInteger(req.informationAccess.scopeId)){
      const e=Error('scope denied');e.statusCode=403;throw e;
    }
    return {sql:'f.id_sup=?',params:[req.informationAccess.scopeId]};
  },windowEquipo,windowAsignacion,intersect(a,b,c,d){return a<=d&&b>=c;}
}};
function executeSelect(sql,params,working,tx){
  sqlCalls.push({sql,params:clone(params),tx:!!tx});
  if(sql.includes('FROM ins_fl f')){
    if(sql.includes('f.id_proyecto=? AND f.referencia_sitio=?')){
      const keys=[];for(let i=0;i<params.length;i+=2)keys.push([String(params[i]).trim().toLowerCase(),String(params[i+1]).trim().toLowerCase()]);
      return [equipos.filter(e=>keys.some(k=>e.id_proyecto.toLowerCase()===k[0]&&e.referencia_sitio.toLowerCase()===k[1])).map(clone)];
    }
    assert.match(sql,/f\.id_ins_fl=\?/);
    assert.match(sql,/f\.activo=1/);
    const id=params[0];
    if(sql.includes('f.id_sup=?'))assert.equal(params[1],10);
    if(tx&&sql.includes('FOR UPDATE')){
      assert.equal(tx.lockedPeople,true,'personas primero, ins_fl despues');
      tx.lockedTeam=true;
      hooks.onTeamLock?.();
    }
    return [equipos.filter(e=>e.id_ins_fl===id&&e.activo===1&&(!sql.includes('f.id_sup=?')||e.id_sup===params[1])).slice(0,1).map(clone)];
  }
  if(sql.includes('FROM instalaciones_personal\n')&&sql.includes('WHERE activo=1')){
    assert.deepEqual(params,['AJUSTADOR']);
    return [personas.filter(p=>p.activo===1&&p.tipo_personal==='AJUSTADOR').map(clone)];
  }
  if(sql.includes('FROM instalaciones_personal p')&&sql.includes('FOR UPDATE')){
    const ids=params.slice(1);
    assert.equal(params[0],'AJUSTADOR');
    if(tx)tx.lockedPeople=true;
    hooks.onPeopleLock?.();
    return [personas.filter(p=>ids.includes(p.id_personal)&&p.tipo_personal==='AJUSTADOR')
      .sort((a,b)=>a.id_personal-b.id_personal).map(clone)];
  }
  if(sql.includes('FROM instalaciones_programacion_asignaciones a')){
    const rows=working||asignadas;
    if(sql.includes('a.id_ins_fl=?')){
      const team=params[0];assert.equal(params[1],'AJUSTADOR');
      return [rows.filter(a=>a.id_ins_fl===team&&a.activo===1&&
        personas.some(p=>p.id_personal===a.id_personal&&p.tipo_personal==='AJUSTADOR'))
        .sort((a,b)=>a.id_personal-b.id_personal||a.id_asignacion-b.id_asignacion).map(clone)];
    }
    if(sql.includes('JOIN ins_fl f')){
      assert.equal(params[0],'AJUSTADOR');
      const ids=params.slice(1);
      return [rows.filter(a=>a.activo===1&&ids.includes(a.id_personal)&&
        personas.some(p=>p.id_personal===a.id_personal&&p.tipo_personal==='AJUSTADOR'))
        .flatMap(a=>{
          const team=equipos.find(e=>e.id_ins_fl===a.id_ins_fl&&e.activo===1);
          if(!team)return [];
          return [{...clone(a),fecha_inicio_ajuste:team.fecha_inicio_ajuste,
            fecha_fin_ajuste_real:team.fecha_fin_ajuste_real,
            fecha_fin_ajuste_modificado:team.fecha_fin_ajuste_modificado,
            fecha_fin_ajuste_planeado:team.fecha_fin_ajuste_planeado}];
        })];
    }
  }
  throw new Error('SELECT no simulado: '+sql);
}
const db={
  async query(sql,params=[]){return executeSelect(sql,params,null,null);},
  async getConnection(){
    const tx={active:false,lockedPeople:false,lockedTeam:false,committed:false,rolledBack:false,release:false,working:null};
    txs.push(tx);
    return {
      async beginTransaction(){assert.equal(tx.active,false);tx.working=clone(asignadas);tx.active=true;},
      async query(sql,params=[]){assert.equal(tx.active,true);return executeSelect(sql,params,tx.working,tx);},
      async execute(sql,params=[]){
        sqlCalls.push({sql,params:clone(params),tx:true});
        assert.equal(tx.active,true);
        assert.equal(tx.lockedTeam,true);
        if(hooks.onWrite)hooks.onWrite(sql,params);
        if(sql.includes('UPDATE instalaciones_programacion_asignaciones')){
          const [updated_by,id_asignacion,pid,team,notes]=params;
          const row=tx.working.find(a=>a.id_asignacion===id_asignacion&&a.id_personal===pid&&
            a.id_ins_fl===team&&a.activo===1&&a.notas===notes&&
            a.fecha_desde==null&&a.fecha_hasta==null);
          if(!row)return [{affectedRows:0}];
          row.activo=0;row.updated_by=updated_by;
          return [{affectedRows:1}];
        }
        if(sql.includes('INSERT INTO instalaciones_programacion_asignaciones')){
          const [pid,team,notes,created_by,updated_by]=params;
          if(tx.working.some(a=>a.activo===1&&a.id_personal===pid&&a.id_ins_fl===team)){
            const e=Error('duplicado');e.code='ER_DUP_ENTRY';throw e;
          }
          const row=assign(pid,team,{notas:notes,created_by,updated_by});
          tx.working.push(row);
          return [{insertId:row.id_asignacion}];
        }
        throw Error('escritura no simulada: '+sql);
      },
      async commit(){assert.equal(tx.active,true);asignadas=clone(tx.working);tx.active=false;tx.committed=true;},
      async rollback(){assert.equal(tx.active,true);tx.active=false;tx.rolledBack=true;},
      release(){tx.release=true;}
    };
  }
};
const routes=[];
const express={Router(){const r={};for(const method of ['get','post','put','patch','delete']){
  r[method]=(pattern,...handlers)=>{routes.push({method,pattern,handlers});return r;};
}return r;}};
const original=Module._load;
Module._load=function(request,parent,isMain){
  if(parent?.filename===f2File){
    if(request==='../../config/db')return db;
    if(request==='./instalaciones-programacion-personal.asignaciones.service')return scopeImpl;
  }
  if(parent?.filename===serviceFile){
    if(request==='../../config/db')return db;
    if(request==='./instalaciones-programacion-personal.asignaciones.service')return scopeImpl;
  }
  if(parent?.filename===programRoutes){
    if(request==='express')return express;
    if(request==='./instalaciones-programacion-personal.service' ||
       request==='./instalaciones-programacion-personal.asignaciones.service' ||
       request==='./instalaciones-programacion-personal.analitica.service')return {};
    if(request==='../../middleware/information-access-gnral.middleware'){
      return {humanInformationGuard_gnral:()=>[(req,res,next)=>req.user?.id_SB&&req.informationAccess?.empresa==='CORELLIAN'?
        next():res.status(403).json({ok:false})]};
    }
    if(request==='../../middleware/integration-auth.middleware')return {requireIntegrationAuthFor:()=>()=>{}};
    if(request==='../../services/permissions/effective-permission.service'){
      return {hasEffectivePermission:async(uid,code)=>uid===42&&['CREAR','DESACTIVAR'].includes(code.split('.').at(-1))};
    }
  }
  if(parent?.filename===insFlRoutes){
    if(request==='express')return express;
    if(request==='multer')return Object.assign(()=>({single:()=>{} }),{memoryStorage:()=>({})});
    if(request==='../controllers/ins-fl.controller')return {syncInsFl:async(req,res)=>createdSync(req,res),
      uploadInsFlProjectPhoto:()=>{},deleteInsFlProjectPhoto:()=>{},updateInsFlProjectMainPhoto:()=>{}};
    if(request==='../controllers/ins-fl-read-cor.controller')return {};
    if(request==='../modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard'){
      return {protectManualAltasCor:(req,res,next)=>{req.bltnowInsFlGuardReleaseCor=async()=>{locks++};next();}};
    }
    if(request==='../services/storage/storage-file-policy.service')return {getLimits_gnral:()=>({maxFileBytes:10_000})};
    if(request==='../middleware/integration-auth.middleware')return {requireIntegrationAuthFor:()=>((req,res,next)=>next())};
    if(request==='../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:()=>[]};
    if(request==='../middleware/project-photo.middleware')return {
      requireProjectPhotoManager_gnral:()=>{},requireCorellianProjectPhotoScope_gnral:()=>{}};
  }
  return original.call(this,request,parent,isMain);
};
let service;
try {service=require(serviceFile);require(programRoutes);require(insFlRoutes);}finally{Module._load=original;}
const human=(id=1,extra={})=>({body:{id_ins_fl:id},user:{id_SB:42},
  informationAccess:{empresa:'CORELLIAN',scopeId:10},...extra});
const machine=(rows,extra={})=>({body:{rows},integrationAuth:{integrationId:'ins-test'},...extra});
function res(){return {statusCode:200,body:null,status(code){this.statusCode=code;return this;},
  json(value){this.body=value;return this;}};}
async function invoke(handlers,req){
  const out=res();
  for(const fn of handlers){
    let called=false,exception;
    await fn(req,out,ex=>{called=true;exception=ex;});
    if(exception)throw exception;
    if(out.body!==null)return out;
    assert.equal(called,true,'middleware sin respuesta ni next');
  }
  return out;
}
async function route(kind,routePath,req){
  const r=routes.find(x=>x.method===kind&&x.pattern===routePath);
  assert.ok(r,kind+' '+routePath);
  return invoke(r.handlers,req);
}
const syncPath='/sync';
function base(){equipos=[eq(1,'Ana López')];personas=[person(10,'Ana López')];}
function changeSource(row,modified={}){
  const pos=equipos.findIndex(e=>e.id_proyecto===row.id_proyecto&&e.referencia_sitio===row.referencia_sitio);
  if(pos>=0)equipos[pos]={...equipos[pos],...modified};
  else equipos.push(eq(2,row.ajustador,{
    id_proyecto:row.id_proyecto,referencia_sitio:row.referencia_sitio,...modified}));
}
function updater(changes={},extras={}){
  createdSync=async(req,reply)=>{
    hooks.onSync?.();
    for(const row of req.body?.rows||[])changeSource(row,changes);
    return reply.json({ok:true,message:'ins_fl sincronizada correctamente.',received:req.body?.rows?.length||0,
      inserted:0,updated:1,unchanged:0,rejected:0,errors:[],...extras});
  };
}
test.beforeEach(()=>{equipos=[];personas=[];asignadas=[];nextId=800;sqlCalls=[];txs=[];
  hooks={};createdSync=null;locks=0;process.env.INTEGRATION_INS_FL_ID='ins-test';});
test.after(()=>{delete process.env.INTEGRATION_INS_FL_ID;});

test('reconciliación manual exige identidad real, alcance y no admite campos extra',async()=>{
  base();
  await assert.rejects(()=>service.reconciliarManual(human(1,{viewerContext:{active:true}})),{statusCode:403});
  await assert.rejects(()=>service.reconciliarManual(human(1,{informationAccess:null})),{statusCode:403});
  await assert.rejects(()=>service.reconciliarManual(human(1,{body:{id_ins_fl:1,forzar:true}})),{statusCode:400});
  await assert.rejects(()=>service.reconciliarManual(human(1,{body:{id_ins_fl:1.1}})),{statusCode:400});
});

test('ruta POST de reintento: Guard, CREAR y DESACTIVAR; no GET de escritura',async()=>{
  base();
  const out=await route('post','/programacion/ajustadores/reconciliar',human());
  assert.equal(out.statusCode,200);
  assert.equal(out.body.data.estado,'SINCRONIZADO');
  assert.equal(asignadas.length,1);
  assert.equal(asignadas[0].created_by,42);
  assert.equal(asignadas[0].fecha_desde,null);
  const denied=await route('post','/programacion/ajustadores/reconciliar',human(1,{viewerContext:{active:true}}));
  assert.equal(denied.statusCode,403);
  assert.equal(routes.filter(x=>x.method==='get'&&x.pattern.includes('reconciliar')).length,0);
});

test('sin cambios conserva auto existente y evita escrituras',async()=>{
  base();asignadas=[assign(10,1)];
  const result=await service.reconciliarManual(human());
  assert.equal(result.estado,'SIN_CAMBIOS');
  assert.deepEqual(result,{id_ins_fl:1,estado:'SIN_CAMBIOS',creadas:0,retiradas:0,existentes:1});
  assert.equal(sqlCalls.filter(c=>/^\s*(INSERT|UPDATE)/.test(c.sql)).length,0);
  assert.equal(txs[0].rolledBack,true);
});

test('cambio de ajustador: retira SOLO auto obsoleto y asigna nuevo',async()=>{
  equipos=[eq(1,'Luis García')];personas=[person(10,'Ana López'),person(11,'Luis García')];
  asignadas=[assign(10,1)];
  const result=await service.reconciliarManual(human());
  assert.equal(result.estado,'SINCRONIZADO');assert.equal(result.creadas,1);assert.equal(result.retiradas,1);
  assert.equal(asignadas.find(a=>a.id_personal===10).activo,0);
  assert.equal(asignadas.find(a=>a.id_personal===11).activo,1);
  assert.equal(asignadas.find(a=>a.id_personal===11).created_by,42);
  assert.equal(txs.at(-1).committed,true);
});

test('asignación manual conserva notas y fechas, aunque ins_fl cambie de ajustador',async()=>{
  equipos=[eq(1,'Luis García')];personas=[person(10,'Ana López'),person(11,'Luis García')];
  const manual=assign(10,1,{notas:'Plan editado',fecha_desde:'2026-10-12',fecha_hasta:'2026-10-18'});
  asignadas=[clone(manual)];
  const result=await service.reconciliarManual(human());
  assert.equal(result.creadas,1);assert.equal(result.retiradas,0);
  assert.deepEqual(asignadas.find(a=>a.id_personal===10),manual);
});

test('auto con override de fechas permanece manual aunque conserve nota de origen',async()=>{
  equipos=[eq(1,'Luis García')];personas=[person(10,'Ana López'),person(11,'Luis García')];
  asignadas=[assign(10,1,{fecha_desde:'2026-10-12'})];
  const result=await service.reconciliarManual(human());
  assert.equal(result.retiradas,0);assert.equal(asignadas.find(a=>a.id_personal===10).activo,1);
});

test('identidad ambigua, desconocida o fecha inválida: ni altas ni bajas',async()=>{
  base();asignadas=[assign(10,1)];
  for(const [raw,changed] of [['Ana López / desconocido',{}],['Ana López',{fecha_inicio_ajuste:'2026-11-01'}],['Ana López',{}]]){
    equipos[0]={...eq(1,raw),...changed};
    if(raw==='Ana López'&&!Object.keys(changed).length)personas=[person(10,'Ana López'),person(11,'ANA LÓPEZ')];
    const out=await service.reconciliarManual(human());
    assert.equal(out.estado,'REQUIERE_REVISION');
    assert.equal(asignadas[0].activo,1);
  }
  assert.equal(sqlCalls.filter(c=>/UPDATE instalaciones_programacion_asignaciones/.test(c.sql)).length,0);
});

test('traslape con equipo ajeno: bloquea todo sin exponer identificadores externos',async()=>{
  equipos=[eq(1,'Ana López'),eq(99,'Externo',{id_sup:999})];personas=[person(10,'Ana López')];
  asignadas=[assign(10,99)];
  const out=await service.reconciliarManual(human());
  assert.equal(out.estado,'CONFLICTO');assert.equal(out.conflictos[0].motivo,'TRASLAPE');
  assert.doesNotMatch(JSON.stringify(out),/99|Externo/);
  assert.equal(asignadas.length,1);
  assert.equal(txs[0].rolledBack,true);
});

test('cambio de fechas se hereda en vivo de ins_fl sin sobrescribir fecha manual',async()=>{
  base();asignadas=[assign(10,1)];
  let old=windowAsignacion('AJUSTADOR',equipos[0],asignadas[0]);
  assert.equal(old.fin,'2026-10-20');
  equipos[0].fecha_fin_ajuste_modificado='2026-11-01';
  const out=await service.reconciliarManual(human());
  assert.equal(out.estado,'SIN_CAMBIOS');
  assert.equal(windowAsignacion('AJUSTADOR',equipos[0],asignadas[0]).fin,'2026-11-01');
  assert.equal(asignadas[0].fecha_hasta,null);
});

test('cambio concurrente en ins_fl revierte equipo sin escribir',async()=>{
  base();hooks.onTeamLock=()=>{equipos[0].ajustador='Otro';};
  await assert.rejects(()=>service.reconciliarManual(human()),{code:'INT9_F3_INS_FL_CAMBIO'});
  assert.equal(txs[0].rolledBack,true);assert.equal(asignadas.length,0);
});

test('fallo de INSERT revierte bajas previas: transacción por equipo atómica',async()=>{
  equipos=[eq(1,'Luis García')];personas=[person(10,'Ana López'),person(11,'Luis García')];
  asignadas=[assign(10,1)];
  hooks.onWrite=sql=>{if(sql.includes('INSERT'))throw Error('Fallo simulado');};
  await assert.rejects(()=>service.reconciliarManual(human()),/Fallo simulado/);
  assert.equal(txs[0].rolledBack,true);assert.equal(asignadas.length,1);
  assert.equal(asignadas[0].activo,1);
});

test('sync M2M con modificación de ajustador: ins_fl primero, F3 después del commit',async()=>{
  base();personas.push(person(11,'Luis García'));
  asignadas=[assign(10,1)];
  updater({ajustador:'Luis García'});
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1',ajustador:'Luis García'}]));
  assert.equal(out.body.ok,true);
  assert.equal(out.body.programacion_ajustadores.estado,'PROCESADO');
  assert.equal(out.body.programacion_ajustadores.creadas,1);
  assert.equal(out.body.programacion_ajustadores.retiradas,1);
  assert.equal(asignadas.find(a=>a.id_personal===11).created_by,null,'el actor técnico NO es usuario');
  assert.equal(locks,1,'bloqueo original de altas liberado al final');
});

test('sync sin firma verificada mantiene comportamiento legacy y NO crea asignaciones',async()=>{
  base();updater({ajustador:'Ana López'});
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1'}],{integrationAuth:null}));
  assert.equal(out.body.ok,true);
  assert.equal(Object.hasOwn(out.body,'programacion_ajustadores'),false);
  assert.equal(asignadas.length,0);
  assert.equal(sqlCalls.length,0);
  assert.equal(locks,1);
});

test('sync sin cambio de fechas/ajustador no consulta catálogo ni inserta',async()=>{
  base();updater({proyecto:'Proyecto actualizado'});
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1'}]));
  assert.equal(out.body.programacion_ajustadores.cambios_relevantes,0);
  assert.equal(out.body.programacion_ajustadores.estado,'SIN_CAMBIOS');
  assert.equal(asignadas.length,0);
  assert.equal(sqlCalls.filter(c=>c.sql.includes('FROM instalaciones_personal')).length,0);
});

test('sync fechas: no crea nuevas filas si automático ya existe; hereda último valor',async()=>{
  base();asignadas=[assign(10,1)];updater({fecha_fin_ajuste_real:'2026-10-25'});
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1'}]));
  assert.equal(out.body.programacion_ajustadores.procesados,1);
  assert.equal(asignadas.length,1);
  assert.equal(windowAsignacion('AJUSTADOR',equipos[0],asignadas[0]).fin,'2026-10-25');
});

test('sync fallido NO llama reconciliación aunque existan diferencias',async()=>{
  base();
  createdSync=async(req,r)=>{equipos[0].ajustador='Luis García';return r.status(500).json({ok:false,errors:[]});};
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1'}]));
  assert.equal(out.statusCode,500);assert.equal(out.body.ok,false);
  assert.equal(asignadas.length,0);
  assert.equal(locks,1);
});

test('sync parcial rechazado no aplica auto a equipo del índice rechazado',async()=>{
  base();personas.push(person(11,'Luis García'));
  updater({ajustador:'Luis García'},{rejected:1,errors:[{index:0,message:'bad row'}]});
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1'}]));
  assert.equal(out.body.programacion_ajustadores.procesados,0);
  assert.equal(asignadas.length,0);
});

test('sync completo deja fallo de F3 visible sin falsear rollback de ins_fl',async()=>{
  base();personas.push(person(11,'Luis García'));
  updater({ajustador:'Luis García'});
  hooks.onWrite=()=>{throw Error('simulado');};
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1'}]));
  assert.equal(out.body.ok,true);
  assert.equal(out.body.programacion_ajustadores.estado,'REQUIERE_ATENCION');
  assert.equal(out.body.programacion_ajustadores.errores,1);
  assert.equal(locks,1);
  assert.equal(txs[0].rolledBack,true);
});

test('no se crea una asignación si el ajustador ya trabaja en otra ventana solapada',async()=>{
  equipos=[eq(1,'Ana López'),eq(2,'Externo',{id_sup:999,fecha_inicio_ajuste:'2026-10-18'})];
  personas=[person(10,'Ana López')];
  asignadas=[assign(10,2)];
  const out=await service.reconciliarManual(human());
  assert.equal(out.estado,'CONFLICTO');assert.equal(asignadas.length,1);
});

test('varios ajustadores: manual existente conserva prioridad y solo agrega el faltante',async()=>{
  equipos=[eq(1,'Ana López / Luis García')];
  personas=[person(10,'Ana López'),person(11,'Luis García')];
  const manual=assign(10,1,{notas:'Asignación manual de Dirección',fecha_desde:'2026-10-11'});
  asignadas=[clone(manual)];
  const out=await service.reconciliarManual(human());
  assert.equal(out.estado,'SINCRONIZADO');assert.equal(out.creadas,1);assert.equal(out.retiradas,0);
  assert.deepEqual(asignadas.find(a=>a.id_personal===10),manual);
  assert.equal(asignadas.find(a=>a.id_personal===11).fecha_hasta,null);
});

test('duplicidad previa del mismo ajustador en equipo: fail-closed sin alterar filas',async()=>{
  base();asignadas=[assign(10,1),assign(10,1,{notas:'Manual'})];
  const before=clone(asignadas);
  const out=await service.reconciliarManual(human());
  assert.equal(out.estado,'REQUIERE_REVISION');
  assert.equal(out.motivo,'ASIGNACIONES_DUPLICADAS');
  assert.deepEqual(asignadas,before);
});

test('alcance humano a nivel equipo vuelve a revisarse en la operación',async()=>{
  base();equipos[0].id_sup=999;
  await assert.rejects(()=>service.reconciliarManual(human()),{statusCode:404});
  assert.equal(txs.length,0);
});

test('claves colisionadas en ins_fl se marcan revisión y no se escriben',async()=>{
  base();personas=[person(10,'Ana López')];
  equipos.push(eq(2,'Ana López',{id_proyecto:'P1',referencia_sitio:'E1'}));
  const keys=service._test.clavesDeEntrada([{id_proyecto:'P1',referencia_sitio:'E1'}]);
  const before=await service._test.consultarPorClaves(keys);
  const after=await service._test.consultarPorClaves(keys);
  const out=await service._test.aplicarCambios(machine([]),before,after,keys,new Set());
  assert.equal(out.estado,'REQUIERE_ATENCION');
  assert.equal(out.revision,1);
  assert.equal(asignadas.length,0);
});


test('candado del GAS se libera antes del primer INSERT/UPDATE de F3',async()=>{
  base();updater({fecha_fin_ajuste_real:'2026-10-25'});
  // Al guardar equipo recién sincronizado, la llave de altas ya debe estar libre.
  hooks.onWrite=()=>assert.equal(locks,1,'F3 no debe prolongar lock original de Altas');
  const out=await route('post',syncPath,machine([{id_proyecto:'P1',referencia_sitio:'E1'}]));
  assert.equal(out.body.ok,true);
  assert.equal(out.body.programacion_ajustadores.creadas,1);
  assert.equal(locks,1);
});
