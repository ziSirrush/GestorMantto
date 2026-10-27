'use strict';

// QA aislado de Fase 2: los datos y transacciones se simulan en memoria.
// No realiza escrituras en Aiven, Azure, GitHub ni servicios externos.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname,'../backend/src/modules/instalaciones-programacion-personal');
const serviceFile = path.join(root,'instalaciones-programacion-personal.ajustadores.service.js');
const routesFile = path.join(root,'instalaciones-programacion-personal.routes.js');
let equipos=[];
let personas=[];
let asignadas=[];
let consultas=[];
let nextId=500;
let cambios={};
let transactions=[];
const safeDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?v:null;
const deepCopy=v=>JSON.parse(JSON.stringify(v));
function eq(id,ajustador,opts={}){
  return {id_ins_fl:id,activo:1,id_sup:10,proyecto:'Proyecto visible',id_proyecto:'PX',
    referencia_sitio:'Equipo '+id,ajustador,fecha_inicio_ajuste:'2026-10-10',
    fecha_fin_ajuste_real:null,fecha_fin_ajuste_modificado:null,
    fecha_fin_ajuste_planeado:'2026-10-20', ...opts};
}
function person(id,nombre,opts={}) {
  return {id_personal:id,activo:1,tipo_personal:'AJUSTADOR',nombre,...opts};
}
function assignment(pid,eqid,opts={}){
  return {id_asignacion:++nextId,id_personal:pid,id_ins_fl:eqid,fecha_desde:null,
    fecha_hasta:null,notas:'Manual',activo:1,...opts};
}
function mxWindow(type,row){
  assert.equal(type,'AJUSTADOR');
  const inicio=safeDate(row.fecha_inicio_ajuste);
  let fin=null,fuente_fin=null;
  for(const s of ['real','modificado','planeado']){
    const f=safeDate(row[`fecha_fin_ajuste_${s}`]);
    if(f){fin=f;fuente_fin=s;break;}
  }
  return {inicio,fin,fuente_fin,valida:Boolean(inicio&&fin&&fin>=inicio)};
}
function equiposScope(sql,params,lock=false){
  assert.match(sql,/\(f\.id_sup=\?\)/);
  assert.match(sql,/f\.id_ins_fl=\?/);
  assert.match(sql,/f\.activo=1/);
  assert.doesNotMatch(sql,/SELECT\s+\*/i);
  assert.equal(sql.includes('FOR UPDATE'),lock);
  assert.equal(params.length,2);
  const [id,scopeId]=params;
  return equipos.filter(x=>x.id_ins_fl===id&&x.id_sup===scopeId&&x.activo===1).slice(0,1).map(deepCopy);
}
function getCatalog(sql,params){
  assert.match(sql,/WHERE activo=1 AND tipo_personal=\?/);
  assert.deepEqual(params,['AJUSTADOR']);
  assert.doesNotMatch(sql,/SELECT\s+\*/i);
  const limit=Number(/LIMIT (\d+)/.exec(sql)?.[1]);
  return personas.filter(p=>p.activo===1&&p.tipo_personal==='AJUSTADOR').slice(0,limit).map(deepCopy);
}
const db={
  async query(sql,params=[]){
    consultas.push({phase:'db',sql,params});
    if(sql.includes('FROM ins_fl f')) {
      if(sql.includes('ORDER BY f.id_ins_fl ASC')) {
        assert.match(sql,/\(f\.id_sup=\?\)/);
        const scopeId=params[0], teamId=sql.includes('f.id_ins_fl=?')?params.at(-1):null;
        const limit=Number(/LIMIT (\d+)/.exec(sql)?.[1]);
        return [equipos.filter(x=>x.activo===1 && x.id_sup===scopeId &&
          x.ajustador && (teamId==null || x.id_ins_fl===teamId))
          .sort((a,b)=>a.id_ins_fl-b.id_ins_fl).slice(0,limit).map(deepCopy)];
      }
      return [equiposScope(sql,params)];
    }
    if(sql.includes('FROM instalaciones_personal'))return [getCatalog(sql,params)];
    throw new Error('Consulta simulada ausente: '+sql);
  },
  async getConnection(){
    const tx={active:false,working:null,committed:false,rolledBack:false,readLockedPeople:false,
      readLockedEquipo:false,released:false};
    transactions.push(tx);
    return {
      _tx:tx,
      async beginTransaction(){tx.active=true;tx.working=deepCopy(asignadas);consultas.push({phase:'begin'});},
      async query(sql,params=[]){
        consultas.push({phase:'tx',sql,params});
        assert.equal(tx.active,true);
        if(sql.includes('FROM instalaciones_personal p')){
          assert.match(sql,/ORDER BY p\.id_personal FOR UPDATE/);
          assert.equal(tx.readLockedEquipo,false,'debe bloquear primero personal');
          tx.readLockedPeople=true;
          if(cambios.alBloquearPersonal)cambios.alBloquearPersonal();
          const [type,...ids]=params;
          assert.equal(type,'AJUSTADOR');
          return [personas.filter(p=>p.activo===1&&p.tipo_personal===type&&ids.includes(p.id_personal))
            .sort((a,b)=>a.id_personal-b.id_personal).map(deepCopy)];
        }
        if(sql.includes('FROM ins_fl f')){
          assert.equal(tx.readLockedPeople,true,'bloquear personal antes del equipo');
          tx.readLockedEquipo=true;
          if(cambios.alBloquearEquipo)cambios.alBloquearEquipo();
          return [equiposScope(sql,params,true)];
        }
        throw Error('Consulta transaccional no simulada: '+sql);
      },
      async execute(sql,params=[]){
        consultas.push({phase:'insert',sql,params});
        assert.match(sql,/INSERT INTO instalaciones_programacion_asignaciones/);
        assert.match(sql,/VALUES\(\?,\?,NULL,NULL,\?,1,\?,\?\)/);
        assert.equal(tx.readLockedEquipo,true);
        if(cambios.failInsert===true || cambios.failInsert===params[0]){
          const error=new Error('insert simulated failure');error.code=cambios.duplicate?'ER_DUP_ENTRY':'SIMULATED_INSERT_ERROR';
          throw error;
        }
        const [id_personal,id_ins_fl,notas,created_by,updated_by]=params;
        assert.match(notas,/BLT_NOW_INT9_AJUSTADOR_AUTO_V1/);
        tx.working.push({id_asignacion:++nextId,id_personal,id_ins_fl,
          fecha_desde:null,fecha_hasta:null,notas,activo:1,created_by,updated_by});
        return [{insertId:nextId}];
      },
      getAssignments(){return tx.working;},
      async commit(){assert.equal(tx.active,true);asignadas=deepCopy(tx.working);tx.committed=true;tx.active=false;consultas.push({phase:'commit'});},
      async rollback(){assert.equal(tx.active,true);tx.rolledBack=true;tx.active=false;consultas.push({phase:'rollback'});},
      release(){tx.released=true;}
    };
  }
};
const asignaciones={_read:{
  scope(req){
    if(req.informationAccess?.empresa!=='CORELLIAN' || !Number.isSafeInteger(req.informationAccess.scopeId)){
      const e=Error('No scope');e.statusCode=403;e.code='INT9_ALCANCE_NO_DISPONIBLE';throw e;
    }
    return {sql:'f.id_sup=?',params:[req.informationAccess.scopeId]};
  },
  windowEquipo:mxWindow,
  intersect(a,b,c,d){return a<=d && b>=c;},
  async fetchAssignmentRows(connection,type,ids,req){
    assert.equal(type,'AJUSTADOR');
    consultas.push({phase:'read-assignments',ids,scope:req.informationAccess.scopeId});
    return connection.getAssignments().filter(a=>a.activo===1&&ids.includes(a.id_personal))
      .map(a=>{
        const equipo=equipos.find(x=>x.id_ins_fl===a.id_ins_fl);
        if(!equipo||equipo.activo!==1)return null;
        const inherited=mxWindow(type,equipo);
        const inicio=safeDate(a.fecha_desde)||inherited.inicio;
        const fin=safeDate(a.fecha_hasta)||inherited.fin;
        return {id_asignacion:a.id_asignacion,id_personal:a.id_personal,id_ins_fl:a.id_ins_fl,
          inicio,fin,valida:Boolean(inicio&&fin&&fin>=inicio),
          visible:Number(equipo.id_sup)===Number(req.informationAccess.scopeId),
          proyecto:null,equipo:null};
      }).filter(Boolean);
  }
}};
const registered=[];
const express={Router(){const router={};for(const method of ['get','post','put','delete']){
  router[method]=(pattern,...handlers)=>{registered.push({method,pattern,handlers});return router;};
}return router;}};
function guard(opt){
  assert.equal(opt.domain,'CORELLIAN');
  assert.match(opt.permissionCode,/\.VER$/);
  return [(req,res,next)=>req.user?.id_SB&&req.informationAccess?.empresa==='CORELLIAN'
    ? next() : res.status(403).json({ok:false,code:'FORBIDDEN'})];
}
const original=Module._load;
Module._load=function(request,parent,isMain){
  if(parent?.filename===serviceFile){
    if(request==='../../config/db')return db;
    if(request==='./instalaciones-programacion-personal.asignaciones.service')return asignaciones;
  }
  if(parent?.filename===routesFile){
    if(request==='./instalaciones-programacion-personal.ajustadores-sync.service')return {reconciliarManual:async()=>({})};
    if(request==='express')return express;
    if(request==='./instalaciones-programacion-personal.service'||
       request==='./instalaciones-programacion-personal.asignaciones.service'||
       request==='./instalaciones-programacion-personal.analitica.service')return {};
    if(request==='../../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:guard};
    if(request==='../../middleware/integration-auth.middleware')return {requireIntegrationAuthFor:()=>()=>{}};
    if(request==='../../services/permissions/effective-permission.service'){
      return {hasEffectivePermission:async(userId,code)=>userId===42&&code.endsWith('.CREAR')};
    }
  }
  return original.call(this,request,parent,isMain);
};
let service;
try {service=require(serviceFile);require(routesFile);} finally {Module._load=original;}
function req(id=1,opts={}){return {body:{id_ins_fl:id},user:{id_SB:42},
  informationAccess:{empresa:'CORELLIAN',scopeId:10},...opts};}
function base(){equipos=[eq(1,'Ana López')];personas=[person(10,'Ana López')];}
async function routeRun(r){
  const route=registered.find(x=>x.pattern==='/programacion/ajustadores/asignaciones-automaticas'&&x.method==='post');
  assert.ok(route);
  const res={statusCode:200,body:null,ended:false,status(v){this.statusCode=v;return this;},
    json(v){this.body=v;this.ended=true;return this;}};
  for(const handler of route.handlers){
    let nextCalled=false,err=null;
    await handler(r,res,(ex)=>{nextCalled=true;err=ex;});
    if(err)throw err;
    if(res.ended)return res;
    assert.equal(nextCalled,true,'middleware sin next ni respuesta');
  }
  return res;
}
test.beforeEach(()=>{equipos=[];personas=[];asignadas=[];consultas=[];transactions=[];nextId=500;cambios={};});

test('POST con Guard CORELLIAN y permiso CREAR (sin afectar las rutas existentes)',()=>{
  const routes=registered.filter(x=>x.pattern==='/programacion/ajustadores/asignaciones-automaticas');
  assert.equal(routes.length,1);assert.equal(routes[0].method,'post');
  assert.equal(routes[0].handlers.length,3);
  assert.ok(registered.some(x=>x.method==='get'&&x.pattern==='/programacion/ajustadores/vinculaciones'));
  assert.ok(registered.some(x=>x.method==='post'&&x.pattern==='/programacion/asignaciones'));
});

test('creación: ID vinculado, fechas heredadas (NULL), auditoría actor y estatus 201',async()=>{
  base();
  const res=await routeRun(req());
  assert.equal(res.statusCode,201);
  assert.equal(res.body.data.estado,'ASIGNADO');
  assert.equal(res.body.data.creadas.length,1);
  assert.equal(asignadas.length,1);
  assert.equal(asignadas[0].id_personal,10);
  assert.equal(asignadas[0].id_ins_fl,1);
  assert.equal(asignadas[0].fecha_desde,null);assert.equal(asignadas[0].fecha_hasta,null);
  assert.equal(asignadas[0].created_by,42);assert.equal(asignadas[0].updated_by,42);
  assert.equal(transactions.length,1);
  assert.equal(transactions[0].committed,true);
  assert.equal(transactions[0].released,true);
});

test('dos nombres exactos separados por /: dos altas atómicas con fechas de ins_fl',async()=>{
  equipos=[eq(1,'Ana López / Luis Álvarez')];
  personas=[person(10,'Ana López'),person(11,'Luis Álvarez')];
  const data=await service.asignarAutomaticamente(req());
  assert.equal(data.estado,'ASIGNADO');
  assert.deepEqual(asignadas.map(x=>x.id_personal),[10,11]);
  assert.ok(asignadas.every(x=>x.fecha_desde===null&&x.fecha_hasta===null));
  assert.equal(consultas.filter(x=>x.phase==='read-assignments').length,1);
});

test('idempotencia: repetición del mismo equipo no duplica ni modifica asignación existente',async()=>{
  base();
  const first=await service.asignarAutomaticamente(req());
  const existing=deepCopy(asignadas);
  const result=await service.asignarAutomaticamente(req());
  assert.equal(first.estado,'ASIGNADO');assert.equal(result.estado,'SIN_CAMBIOS');
  assert.deepEqual(asignadas,existing);
  assert.equal(consultas.filter(x=>x.phase==='insert').length,1);
});

test('asignación manual tiene prioridad; crea sólo la persona faltante',async()=>{
  equipos=[eq(1,'Ana López / Luis Álvarez')];
  personas=[person(10,'Ana López'),person(11,'Luis Álvarez')];
  asignadas=[assignment(10,1,{fecha_desde:'2026-10-11',fecha_hasta:'2026-10-17',notas:'Manual especial'})];
  const result=await service.asignarAutomaticamente(req());
  assert.equal(result.estado,'ASIGNADO');
  assert.equal(result.existentes.length,1);assert.equal(result.creadas.length,1);
  assert.equal(result.creadas[0].id_personal,11);
  assert.equal(asignadas[0].notas,'Manual especial');
  assert.equal(asignadas[0].fecha_desde,'2026-10-11');
});

test('conflicto con otro equipo de alcance externo: bloquea TODO el equipo y oculta detalles',async()=>{
  equipos=[eq(1,'Ana López / Luis Álvarez'),eq(99,'Cualquiera',{id_sup:99,
    fecha_inicio_ajuste:'2026-10-15',fecha_fin_ajuste_planeado:'2026-10-25'})];
  personas=[person(10,'Ana López'),person(11,'Luis Álvarez')];
  asignadas=[assignment(10,99)];
  const result=await service.asignarAutomaticamente(req());
  assert.equal(result.estado,'CONFLICTO');
  assert.equal(result.conflictos[0].motivo,'TRASLAPE');
  assert.equal(asignadas.length,1);
  assert.equal(result.creadas.length,0);
  assert.doesNotMatch(JSON.stringify(result),/99|Cualquiera/);
  assert.equal(transactions[0].rolledBack,true);
});

test('sin traslape no bloquea una asignación válida en otro proyecto',async()=>{
  equipos=[eq(1,'Ana López'),eq(99,'Otro',{id_sup:99,
    fecha_inicio_ajuste:'2026-09-01',fecha_fin_ajuste_planeado:'2026-09-10'})];
  personas=[person(10,'Ana López')];
  asignadas=[assignment(10,99)];
  const data=await service.asignarAutomaticamente(req());
  assert.equal(data.estado,'ASIGNADO');assert.equal(asignadas.length,2);
});

test('ocupación externa sin fechas determinadas bloquea por seguridad',async()=>{
  equipos=[eq(1,'Ana López'),eq(99,'Otro',{id_sup:99,
    fecha_inicio_ajuste:null,fecha_fin_ajuste_planeado:null})];
  personas=[person(10,'Ana López')];asignadas=[assignment(10,99)];
  const data=await service.asignarAutomaticamente(req());
  assert.equal(data.estado,'CONFLICTO');
  assert.equal(data.conflictos[0].motivo,'OTRA_ASIGNACION_SIN_FECHAS');
  assert.equal(consultas.some(x=>x.phase==='insert'),false);
});

test('homónimos impiden alta, no abre transacción',async()=>{
  base();personas.push(person(11,' ANA  LÓPEZ '));
  const result=await service.asignarAutomaticamente(req());
  assert.equal(result.estado,'REQUIERE_REVISION');
  assert.equal(result.motivo,'AMBIGUO');
  assert.equal(transactions.length,0);
});

test('referencia parcial con dos nombres no permite alta parcial',async()=>{
  equipos=[eq(1,'Ana López / Desconocido')];personas=[person(10,'Ana López')];
  const result=await service.asignarAutomaticamente(req());
  assert.equal(result.motivo,'SIN_COINCIDENCIA');
  assert.equal(result.creadas.length,0);
  assert.equal(transactions.length,0);
});

test('fechas inválidas impiden creación; fuente real tiene prioridad',async()=>{
  base();equipos[0].fecha_fin_ajuste_real='2026-10-09';
  const blocked=await service.asignarAutomaticamente(req());
  assert.equal(blocked.motivo,'SIN_FECHAS_VALIDAS');
  assert.equal(transactions.length,0);
  equipos[0].fecha_fin_ajuste_real='2026-10-13';
  const done=await service.asignarAutomaticamente(req());
  assert.equal(done.estado,'ASIGNADO');assert.equal(done.fuente_fin,'real');assert.equal(done.fin,'2026-10-13');
});

test('sin referencia de ajustador, no crea nada',async()=>{
  equipos=[eq(1,'Sin ajustador')];personas=[person(10,'Ana López')];
  const r=await service.asignarAutomaticamente(req());
  assert.equal(r.estado,'REQUIERE_REVISION');assert.equal(r.motivo,'SIN_REFERENCIA');
});

test('fuera de alcance o equipo inexistente: 404 y cero escrituras',async()=>{
  base();equipos[0].id_sup=99;
  await assert.rejects(()=>service.asignarAutomaticamente(req()),{statusCode:404,code:'INT9_EQUIPO_NO_ENCONTRADO'});
  assert.equal(transactions.length,0);
  assert.equal(consultas.length,1);
});

test('ausencia de CORELLIAN: 403 sin consultas operativas',async()=>{
  base();
  await assert.rejects(()=>service.asignarAutomaticamente(req(1,{informationAccess:{empresa:'UNITED'}})),{statusCode:403});
  assert.equal(consultas.length,0);
});

test('Visor no puede escribir aun con permiso CREAR simulado',async()=>{
  base();const response=await routeRun(req(1,{viewerContext:{active:true}}));
  assert.equal(response.statusCode,403);
  assert.equal(consultas.length,0);
});

test('permiso CREAR efectivo obligatorio (403) y no ejecuta consultas',async()=>{
  base();const response=await routeRun(req(1,{user:{id_SB:99}}));
  assert.equal(response.statusCode,403);
  assert.equal(consultas.length,0);
});

test('sin sesión real falla cerrado (sin consultas)',async()=>{
  base();await assert.rejects(()=>service.asignarAutomaticamente(req(1,{user:null})),{statusCode:401});
  assert.equal(consultas.length,0);
});

test('payload estricto rechaza inyecciones, operaciones masivas y valores inválidos',async()=>{
  base();
  for(const body of [{id_ins_fl:1,permitir_traslape:true},{ids_ins_fl:[1,2]},
    {id_ins_fl:false},{id_ins_fl:'1 UNION SELECT * FROM usuarios'},
    {id_ins_fl:0},{},{id_ins_fl:[]},{id_ins_fl:[1]},
    {id_ins_fl:'1e2'},{id_ins_fl:1.5},[]]) {
    await assert.rejects(()=>service.asignarAutomaticamente(req(1,{body})),{statusCode:400});
  }
  assert.equal(consultas.length,0);
});

test('cambio de identidad bajo lock hace ROLLBACK, no se asigna a persona incorrecta',async()=>{
  base();cambios.alBloquearPersonal=()=>{personas[0].nombre='Persona actualizada';};
  await assert.rejects(()=>service.asignarAutomaticamente(req()),{statusCode:409,code:'INT9_AUTO_IDENTIDAD_CAMBIO'});
  assert.equal(asignadas.length,0);
  assert.equal(transactions[0].rolledBack,true);
});

test('cambio de ins_fl antes de bloquear equipo impide escritura obsoleta',async()=>{
  base();cambios.alBloquearEquipo=()=>{equipos[0].fecha_fin_ajuste_real='2026-10-12';};
  await assert.rejects(()=>service.asignarAutomaticamente(req()),{statusCode:409,code:'INT9_AUTO_INS_FL_CAMBIO'});
  assert.equal(asignadas.length,0);assert.equal(transactions[0].rolledBack,true);
});

test('cambio de scope durante transacción no amplía acceso',async()=>{
  base();cambios.alBloquearEquipo=()=>{equipos[0].id_sup=99;};
  await assert.rejects(()=>service.asignarAutomaticamente(req()),{statusCode:409,code:'INT9_AUTO_ALCANCE_CAMBIO'});
  assert.equal(asignadas.length,0);assert.equal(transactions[0].rolledBack,true);
});

test('error en segundo INSERT revierte todo el grupo multipersonal',async()=>{
  equipos=[eq(1,'Ana López / Luis Álvarez')];
  personas=[person(10,'Ana López'),person(11,'Luis Álvarez')];
  cambios.failInsert=11;
  await assert.rejects(()=>service.asignarAutomaticamente(req()),{code:'SIMULATED_INSERT_ERROR'});
  assert.equal(asignadas.length,0);assert.equal(transactions[0].rolledBack,true);
  assert.equal(transactions[0].released,true);
});

test('violación UNIQUE por carrera devuelve 409 y rollback',async()=>{
  base();cambios.failInsert=true;cambios.duplicate=true;
  await assert.rejects(()=>service.asignarAutomaticamente(req()),{statusCode:409,code:'INT9_AUTO_ASIGNACION_DUPLICADA'});
  assert.equal(asignadas.length,0);assert.equal(transactions[0].rolledBack,true);
});

test('previsualización Fase1 permanece de solo lectura',async()=>{
  base();
  const result=await service.vinculaciones(req(1,{query:{id_ins_fl:1}}));
  assert.equal(result.registros[0].estado,'VINCULABLE');
  assert.equal(transactions.length,0);assert.equal(asignadas.length,0);
});
