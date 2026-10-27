'use strict';

// Fase 1: pruebas aisladas sin Aiven, Azure, credenciales ni escrituras.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const base = path.resolve(__dirname,'../backend/src/modules/instalaciones-programacion-personal');
const serviceFile = path.join(base,'instalaciones-programacion-personal.ajustadores.service.js');
const routesFile = path.join(base,'instalaciones-programacion-personal.routes.js');
let equipos=[];
let personas=[];
let consultas=[];
const db={
  async query(sql,params=[]) {
    consultas.push({sql,params});
    if (sql.includes('FROM ins_fl f')) {
      assert.match(sql,/\(f\.id_sup=\?\)/);
      assert.match(sql,/f\.activo=1/);
      assert.match(sql,/ORDER BY f\.id_ins_fl ASC/);
      const scopeId=params[0];
      const isExact=sql.includes('f.id_ins_fl=?');
      const isCursor=sql.includes('f.id_ins_fl>?');
      const filtered=equipos.filter(x=>x.activo===1 && x.id_sup===scopeId &&
        x.ajustador && !['-','n/a','na','sin ajustador','sin asignar','null'].includes(x.ajustador.trim().toLowerCase()) &&
        (!isExact || x.id_ins_fl===params.at(-1)) && (!isCursor || x.id_ins_fl>params.at(-1)));
      const limit=Number(/LIMIT (\d+)\s*$/.exec(sql)?.[1]);
      return [filtered.sort((a,b)=>a.id_ins_fl-b.id_ins_fl).slice(0,limit)];
    }
    if (sql.includes('FROM instalaciones_personal')) {
      assert.deepEqual(params,['AJUSTADOR']);
      return [personas.filter(x=>x.activo===1 && x.tipo_personal==='AJUSTADOR')];
    }
    throw Error('Consulta no simulada: '+sql);
  },
  execute(){throw Error('Fase 1 no puede escribir en Aiven');},
  getConnection(){throw Error('Fase 1 no puede abrir transacciones de escritura');}
};
const dateValue=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?v:null;
const assignments={_read:{
  scope(req){
    if(req.informationAccess?.empresa!=='CORELLIAN'||!Number.isSafeInteger(req.informationAccess.scopeId)) {
      const error=new Error('Scope no disponible');error.statusCode=403;throw error;
    }
    return {sql:'f.id_sup=?',params:[req.informationAccess.scopeId]};
  },
  windowEquipo(tipo,row){
    assert.equal(tipo,'AJUSTADOR');
    const inicio=dateValue(row.fecha_inicio_ajuste);
    const sources=['real','modificado','planeado'];
    let fin=null,fuente_fin=null;
    for(const s of sources){
      const candidate=dateValue(row['fecha_fin_ajuste_'+s]);
      if(candidate){fin=candidate;fuente_fin=s;break;}
    }
    return {inicio,fin,fuente_fin,valida:Boolean(inicio&&fin&&inicio<=fin)};
  }
}};
const routeRegistry=[];
const express={Router(){const router={};for(const m of ['get','post','put','delete'])router[m]=(p,...handlers)=>{routeRegistry.push({m,p,handlers});return router;};return router;}};
const routeGuard=(options)=>{
  assert.equal(options.domain,'CORELLIAN');
  assert.match(options.permissionCode,/\.VER$/);
  return [(req,res,next)=>req.informationAccess?.empresa==='CORELLIAN' && req.user?.id_SB
    ? next() : res.status(403).json({ok:false,code:'FORBIDDEN'})];
};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(parent?.filename===serviceFile){
    if(request==='../../config/db')return db;
    if(request==='./instalaciones-programacion-personal.asignaciones.service')return assignments;
  }
  if(parent?.filename===routesFile){
    if(request==='./instalaciones-programacion-personal.ajustadores-sync.service')return {reconciliarManual:async()=>({})};
    if(request==='express')return express;
    if(request==='./instalaciones-programacion-personal.service')return {};
    if(request==='./instalaciones-programacion-personal.asignaciones.service')return {};
    if(request==='./instalaciones-programacion-personal.analitica.service')return {};
    if(request==='../../middleware/information-access-gnral.middleware')return {humanInformationGuard_gnral:routeGuard};
    if(request==='../../middleware/integration-auth.middleware')return {requireIntegrationAuthFor:()=>()=>{}};
    if(request==='../../services/permissions/effective-permission.service')return {hasEffectivePermission:async()=>false};
  }
  return originalLoad.call(this,request,parent,isMain);
};
let service;
try {
  service=require(serviceFile);
  require(routesFile);
} finally {Module._load=originalLoad;}

function eq(id,ajustador,options={}) {
  return {id_ins_fl:id,activo:1,id_sup:10,proyecto:'Proyecto de prueba',referencia_sitio:'Equipo '+id,
    ajustador,fecha_inicio_ajuste:'2026-10-10',fecha_fin_ajuste_real:null,
    fecha_fin_ajuste_modificado:null,fecha_fin_ajuste_planeado:'2026-10-20',...options};
}
function person(id,nombre,options={}) {
  return {id_personal:id,nombre,activo:1,tipo_personal:'AJUSTADOR',...options};
}
function req(query={},scopeId=10){return{query,informationAccess:{empresa:'CORELLIAN',scopeId}};}
test.beforeEach(()=>{equipos=[];personas=[];consultas=[];});

test('nombre único, mayúsculas y espacios: vinculación exacta por ID',async()=>{
  equipos=[eq(1,'  JOSÉ   GARCÍA  ')];
  personas=[person(101,'José García')];
  const result=await service.vinculaciones(req());
  assert.equal(result.registros[0].estado,'VINCULABLE');
  assert.deepEqual(result.registros[0].personas,[{id_personal:101,nombre:'José García'}]);
  assert.equal(result.registros[0].inicio,'2026-10-10');
  assert.equal(result.registros[0].fin,'2026-10-20');
  assert.equal(result.registros[0].fuente_fin,'planeado');
  assert.equal(consultas.length,2);
});

test('dos ajustadores separados por /: ambos deben coincidir',async()=>{
  equipos=[eq(2,'Ana López / Juan Pérez')];
  personas=[person(201,'Ana López'),person(202,'Juan Pérez')];
  const [match]=(await service.vinculaciones(req())).registros;
  assert.equal(match.estado,'VINCULABLE');
  assert.deepEqual(match.personas.map(p=>p.id_personal),[201,202]);
});

test('referencia parcial no puede autoasignarse',async()=>{
  equipos=[eq(3,'Ana López / Persona desconocida')];personas=[person(201,'Ana López')];
  const [match]=(await service.vinculaciones(req())).registros;
  assert.equal(match.estado,'SIN_COINCIDENCIA');
  assert.deepEqual(match.personas,[]);
});

test('homónimos con mismo nombre: bloquear vinculación',async()=>{
  equipos=[eq(4,'Jose Garcia')];personas=[person(1,'Jose Garcia'),person(2,'JOSE  GARCIA')];
  const [match]=(await service.vinculaciones(req())).registros;
  assert.equal(match.estado,'AMBIGUO');
  assert.deepEqual(match.personas,[]);
});

test('nombre repetido en origen: no crear coincidencias duplicadas',async()=>{
  equipos=[eq(5,'Ana López / Ana López')];personas=[person(1,'Ana López')];
  const [match]=(await service.vinculaciones(req())).registros;
  assert.equal(match.estado,'AMBIGUO');
});

test('sin fechas válidas: identificar persona pero impedir estado VINCULABLE',async()=>{
  equipos=[eq(6,'Ana López',{fecha_inicio_ajuste:'2026-10-21',fecha_fin_ajuste_planeado:'2026-10-20'})];
  personas=[person(1,'Ana López')];
  const [match]=(await service.vinculaciones(req())).registros;
  assert.equal(match.estado,'SIN_FECHAS_VALIDAS');
  assert.equal(match.fechas_validas,false);
});

test('fecha real prevalece sobre modificada y planeada',async()=>{
  equipos=[eq(7,'Ana López',{fecha_fin_ajuste_real:'2026-10-12',
    fecha_fin_ajuste_modificado:'2026-10-15',fecha_fin_ajuste_planeado:'2026-10-20'})];
  personas=[person(1,'Ana López')];
  const [match]=(await service.vinculaciones(req())).registros;
  assert.equal(match.fin,'2026-10-12');assert.equal(match.fuente_fin,'real');
});

test('alcance por registro: no consulta equipos ajenos, sin ámbito falla cerrado',async()=>{
  equipos=[eq(8,'Ana López'),eq(9,'Ana López',{id_sup:99})];personas=[person(1,'Ana López')];
  assert.deepEqual((await service.vinculaciones(req())).registros.map(x=>x.id_ins_fl),[8]);
  await assert.rejects(()=>service.vinculaciones({query:{}}),{statusCode:403});
  assert.equal(consultas.length,2);
});

test('cursor de paginación y límites solo usan enteros validados',async()=>{
  equipos=[eq(1,'Ana López'),eq(2,'Ana López'),eq(3,'Ana López')];personas=[person(1,'Ana López')];
  const first=await service.vinculaciones(req({limit:'2'}));
  assert.deepEqual(first.registros.map(x=>x.id_ins_fl),[1,2]);
  assert.equal(first.siguiente_cursor,2);assert.equal(first.hay_mas,true);
  const second=await service.vinculaciones(req({limit:2,cursor:2}));
  assert.deepEqual(second.registros.map(x=>x.id_ins_fl),[3]);
  assert.equal(second.hay_mas,false);
  const single=await service.vinculaciones(req({id_ins_fl:3}));
  assert.deepEqual(single.registros.map(x=>x.id_ins_fl),[3]);
  await assert.rejects(()=>service.vinculaciones(req({limit:101})),{statusCode:400});
  await assert.rejects(()=>service.vinculaciones(req({cursor:'1 OR 1=1'})),{statusCode:400});
  await assert.rejects(()=>service.vinculaciones(req({cursor:1,id_ins_fl:2})),{statusCode:400});
});

test('página vacía no consulta catálogo ni escribe datos',async()=>{
  const result=await service.vinculaciones(req());
  assert.deepEqual(result.registros,[]);
  assert.equal(consultas.length,1);
  assert.match(consultas[0].sql,/SELECT f\.id_ins_fl/);
  assert.doesNotMatch(consultas[0].sql,/SELECT \*/);
});

test('endpoint agregado solo GET con Guard CORELLIAN (regresión rutas previas)',async()=>{
  const endpoint=routeRegistry.find(r=>r.p==='/programacion/ajustadores/vinculaciones');
  assert.ok(endpoint);assert.equal(endpoint.m,'get');
  assert.equal(routeRegistry.filter(r=>r.p==='/programacion/personal' && r.m==='post').length,2);
  assert.ok(routeRegistry.some(r=>r.p==='/programacion/calendario'&&r.m==='get'));
  const res={statusCode:200,body:null,status(x){this.statusCode=x;return this;},json(v){this.body=v;return this;}};
  endpoint.handlers[0]({informationAccess:{empresa:'UNITED'}},res,()=>{throw Error('Puerta abierta');});
  assert.equal(res.statusCode,403);
  equipos=[eq(15,'Ana López')];personas=[person(5,'Ana López')];
  const good={...req(),user:{id_SB:42}};
  await new Promise((resolve,reject)=>endpoint.handlers[0](good,res,()=>resolve())).then(()=>
    endpoint.handlers[1](good,res,e=>e?Promise.reject(e):undefined));
  assert.equal(res.statusCode,200);
  assert.equal(res.body.data.registros[0].estado,'VINCULABLE');
});

test('solo ajustadores activos: no reutiliza nombres de montadores o de bajas',async()=>{
  equipos=[eq(20,'Persona Activa'),eq(21,'Persona Baja'),eq(22,'Solo Montador')];
  personas=[person(1,'Persona Activa'),person(2,'Persona Baja',{activo:0}),
    person(3,'Solo Montador',{tipo_personal:'MONTADOR'})];
  const r=await service.vinculaciones(req());
  assert.deepEqual(r.registros.map(x=>x.estado),['VINCULABLE','SIN_COINCIDENCIA','SIN_COINCIDENCIA']);
});

test('no acepta una referencia multipersonal truncada o incompleta',()=>{
  const idx=service._test.indicePersonal([person(1,'Ana López')]);
  assert.equal(service._test.resolverReferencia('Ana López /  / Ana López',idx).estado,'AMBIGUO');
  assert.equal(service._test.resolverReferencia('A/B/C/D/E/F',idx).estado,'AMBIGUO');
  assert.equal(service._test.resolverReferencia('Sin ajustador',idx).estado,'SIN_REFERENCIA');
});

test('si el catálogo contiene el nombre con / completo no se divide',()=>{
  const idx=service._test.indicePersonal([person(55,'Nombre / Apellido')]);
  const match=service._test.resolverReferencia('Nombre / Apellido',idx);
  assert.equal(match.estado,'IDENTIFICADO');
  assert.deepEqual(match.personas.map(x=>x.id_personal),[55]);
});

test('no elimina acentos ni ñ: no confunde identidades diferentes',async()=>{
  equipos=[eq(25,'Jose Garcia'),eq(26,'Pena')];
  personas=[person(101,'José García'),person(102,'Peña')];
  const result=await service.vinculaciones(req());
  assert.deepEqual(result.registros.map(x=>x.estado),['SIN_COINCIDENCIA','SIN_COINCIDENCIA']);
  assert.ok(result.registros.every(x=>x.personas.length===0));
});

test('identificador de ins_fl mayor a entero seguro: falla cerrado',()=>{
  const idx=service._test.indicePersonal([person(1,'Ana López')]);
  assert.throws(()=>service._test.presentarEquipo(eq('9007199254740993','Ana López'),idx),
    {statusCode:422,code:'INT9_EQUIPO_ID_FUERA_RANGO'});
});
