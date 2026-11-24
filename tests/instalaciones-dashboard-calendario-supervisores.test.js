'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Calendario Ajustadores filtra por supervisor sin ampliar alcance',async()=>{
 const source=read('backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.asignaciones.service.js'),issues=read('backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.ajustadores.service.js');
 const check=(ok,message)=>assert.ok(ok,message);

const mod={exports:{}},calls=[];
const refs=new Function(issues.slice(issues.indexOf('const MAX_PAGINA'),issues.indexOf('function enteroOpcional('))+'\nreturn {indicePersonal,resolverReferencia};')();
const people=[{id_personal:1,tipo_personal:'AJUSTADOR',nombre:'Ana'},{id_personal:2,tipo_personal:'AJUSTADOR',nombre:'Luis'},{id_personal:3,tipo_personal:'AJUSTADOR',nombre:'Libre'},{id_personal:4,tipo_personal:'AJUSTADOR',nombre:'Asignado otro periodo'}];
const db={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes('FROM instalaciones_personal p WHERE'))return [people];
  if(sql.includes('SELECT DISTINCT CAST(f.ajustador AS BINARY)'))return [[...(params.includes('AB')?[{ajustador:'Ana / Libre'}]:[]),...(params.includes('CD')?[{ajustador:'Luis'}]:[])]];
  if(sql.includes('FROM instalaciones_programacion_asignaciones a')){
    const filtered=sql.includes("UPPER(TRIM(COALESCE(f.supervisor_fl,'')))");
    const rec=(id,p,s,desde,hasta)=>({id_asignacion:id,id_personal:p,id_ins_fl:id,visible:s==='AB'?1:0,origen:'MANUAL',es_historico:0,proyecto:'Proyecto '+s,referencia_sitio:'EQ'+id,fecha_desde:desde,fecha_hasta:hasta});
    return [[rec(10,1,'AB','2026-11-20','2026-11-30'),rec(11,1,'CD','2026-11-21','2026-11-30'),rec(12,2,'CD','2026-11-20','2026-11-30'),rec(13,4,'AB','2026-12-20','2026-12-30')].filter(row=>params.slice(filtered?3:2).includes(row.id_personal))];
  }
  if(sql.includes('FROM ins_fl f WHERE'))return [[]];
  throw Error('SQL inesperado: '+sql);
}};
new Function('require','module',source)(name=>{
  if(name==='../../config/db')return db;
  if(name.endsWith('information-record-scope-gnral.service'))return {buildInsFlScopeSql_gnral:()=>({sql:'f.id_sup=?',params:[38]})};
  if(name.endsWith('ajustadores.service'))return {_shared:refs};
  return {};
},mod);
const service=mod.exports;
const req=(supervisores)=>({informationAccess:{empresa:'CORELLIAN'},query:{tipo:'AJUSTADOR',desde:'2026-11-20',hasta:'2026-11-30',...(supervisores===undefined?{}:{supervisores})}});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const filtered=await service.calendario(req('AB'));
check(equal(filtered.supervisores,['AB']),'Confirma filtro');
check(equal(filtered.personal.map(p=>p.id_personal),[1,3]),'Nombres FL aunque no tengan barras; excluye vínculos antiguos');
check(filtered.asignaciones.length===2&&filtered.asignaciones.some(x=>x.visible&&x.proyecto==='Proyecto AB'),'Conserva asignación propia');
check(filtered.asignaciones.some(x=>!x.visible&&x.proyecto===null&&x.id_ins_fl===null),'Ocupación ajena redactada');
check(!JSON.stringify(filtered).includes('Proyecto CD'),'No expone detalle ajeno');
check(calls.some(c=>c.sql.includes("TRIM(f.estatus)='06-A'")&&c.sql.includes('f.activo=1')),'Origen FL activo 06-A');
check(calls.some(c=>c.sql.includes("(f.id_sup=?) AND UPPER(TRIM(COALESCE(f.supervisor_fl,''))) IN (?)")&&c.params[0]===38&&c.params[1]==='AB'),'Intersección con alcance y SQL parametrizado');
const all=await service.calendario(req());
check(all.personal.length===4&&!Object.hasOwn(all,'supervisores'),'AFL/INT9 sin filtro mantiene catálogo completo autorizado');
const two=await service.calendario(req(' CD,ab,AB '));
check(equal(two.supervisores,['AB','CD'])&&equal(two.personal.map(p=>p.id_personal),[1,2,3]),'Normaliza selección múltiple');
const empty=await service.calendario(req('ZZ'));
check(empty.personal.length===0&&empty.asignaciones.length===0,'Sin nombres no carga barras');
const eq=await service.equipos(req('AB'));
check(equal(eq.supervisores,['AB']),'Selector de equipos confirma filtro');
check(calls.some(c=>c.sql.includes('FROM ins_fl f WHERE')&&c.params.includes('AB')),'Cobertura/equipos filtran SQL');
let failed=false;try{await service.calendario(req(' , '));}catch(e){failed=e.code==='INT9_SUPERVISORES_INVALIDOS';}
check(failed,'No convierte selección vacía en todos');
check(issues.includes("asignaciones._read.calendarScope(req,'AJUSTADOR')")&&issues.includes('supervisores:access.supervisores'),'Incidencias usan el mismo alcance y confirman filtro');

});
