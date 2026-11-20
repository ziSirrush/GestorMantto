'use strict';
// INT9: validación de permisos de pestañas con mocks, sin datos de Aiven.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,
 '../backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.tab-permissions.js'),'utf8');
const routes=fs.readFileSync(path.join(__dirname,
 '../backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.routes.js'),'utf8');
const CODE_M='INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_MONTADORES.VER';
const CODE_A='INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_AJUSTADORES.VER';
function fixture(granted=[],tipoAsignacion='MONTADOR',effectiveId=101){
 const sql=[],lookups=[];
 const db={async query(statement,params){sql.push({statement,params});return [[{tipo_personal:tipoAsignacion}]];}};
 const userPermissions={async listEffectivePermissions(id,codes){
    lookups.push({id,codes});return new Map(codes.map(c=>[c,granted.includes(c)]));
 }};
 const obj={exports:{}};
 new Function('module','require',src)(obj,id=>{
    if(id==='../../config/db')return db;
    if(id==='../../services/permissions/effective-permission.service')return userPermissions;
    throw Error('Dependencia no simulada: '+id);
 });
 const req={user:{id_SB:777},contextUser:{id_SB:effectiveId},params:{id:'18'}};
 const res={code:200,status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
 return {api:obj.exports,db,req,res,sql,lookups};
}
async function guard(api,req,res,type){let next=0;await api.onlyTab(type)(req,res,()=>{next++;});return next;}
test('Autorización MONTADOR independiente de AJUSTADOR, usa usuario efectivo',async()=>{
 const f=fixture([CODE_M]);
 assert.equal(await guard(f.api,f.req,f.res,'MONTADOR'),1);
 assert.equal(await guard(f.api,f.req,f.res,'AJUSTADOR'),0);
 assert.equal(f.res.code,403);
 assert.equal(f.res.body.code,'INT9_TAB_SIN_PERMISO');
 assert.equal(f.lookups[0].id,101);
 assert.deepEqual(f.lookups[0].codes.sort(),[CODE_A,CODE_M].sort());
});
test('Visor: deniega consulta con permisos del actor si usuario efectivo no los tiene',async()=>{
 const f=fixture([]);
 assert.equal(await guard(f.api,f.req,f.res,'MONTADOR'),0);
 assert.equal(f.res.code,403);assert.equal(f.lookups[0].id,101);
});
test('Con ambos permisos ambas pestañas pasan; sin ninguno GET opciones denegado',async()=>{
 const both=fixture([CODE_M,CODE_A]);
 assert.equal(await guard(both.api,both.req,both.res,'MONTADOR'),1);
 assert.equal(await guard(both.api,both.req,both.res,'AJUSTADOR'),1);
 const none=fixture([]);
 let next=0;
 await none.api.oneTab(none.req,none.res,()=>{next++;});
 assert.equal(next,0);assert.equal(none.res.code,403);
 assert.equal(none.res.body.code,'INT9_TABS_SIN_ACCESO');
});
test('Manipular tipo o no proporcionarlo no permite saltarse los checks',async()=>{
 const f=fixture([CODE_M]);
 assert.equal(await guard(f.api,f.req,f.res,'ADMIN'),0);
 assert.equal(f.res.code,400);
 assert.equal(await guard(f.api,f.req,f.res,undefined),0);
});
test('PUT y DELETE sin tipo consultan tipo real de asignación por ID',async()=>{
 const f=fixture([CODE_M],'AJUSTADOR'),res=f.res;
 let called=0;await f.api.byAssignment(f.req,res,()=>{called++;});
 assert.equal(called,0);assert.equal(res.code,403);
 assert.equal(f.sql.length,1);assert.match(f.sql[0].statement,/JOIN instalaciones_personal p/);
 assert.deepEqual(f.sql[0].params,[18]);
});
test('Rutas de todos los recursos no aceptan la pestaña opuesta',()=>{
 const must=[
  '/programacion/personal','/programacion/asignaciones','/programacion/equipos',
  '/programacion/calendario','/programacion/historial','/programacion/disponibilidad',
  '/programacion/simulacion','/programacion/montadores/relaciones',
  '/programacion/montadores/equipo/:id/detalle','/programacion/montadores/agrupaciones/guardar',
  '/programacion/ajustadores/vinculaciones','/programacion/ajustadores/incidencias-fl',
  '/programacion/ajustadores/reconciliar'
 ];
 for(const url of must){
   const row=routes.split('\n').find(x=>x.includes("'"+url+"'"));
   assert.ok(row,'Ruta no encontrada: '+url);
   assert.match(row,/tabPermission\./,'Falta verificación: '+url);
 }
 assert.match(routes,/router\.get\('\/programacion\/accesos',\.\.\.readGuard/);
 assert.match(routes,/router\.get\('\/programacion\/opciones',\.\.\.readGuard,tabPermission\.oneTab/);
});
