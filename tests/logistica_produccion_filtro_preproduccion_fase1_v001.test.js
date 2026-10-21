'use strict';
// Pruebas aisladas: no hay conexion a MySQL, Azure ni escrituras remotas.
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');

const REPO_FILE=path.join(__dirname,'../backend/src/modules/logistica-produccion/logistica-produccion.repository.js');
const ALLOWED=Object.freeze([
  'SIN PRODUCCIÓN / Documentación Pendiente',
  'SIN PRODUCCIÓN / Primera Visita a Obra',
  'SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente',
  'SIN PRODUCCIÓN / Programados a Producción'
]);
const DISALLOWED=Object.freeze([
  'EN PRODUCCION','PARADOS POR CLIENTE','PENDIENTE PAGO LIBERACIÓN',
  'PROGRAMADO','EN TRANSITO','PROGRAMA ENTREGA','ENTREGADO','ALMACENADOS',
  'Estatus','',null,'SIN PRODUCCIÓN / Etapa desconocida'
]);
const calls=[];
const fakeDb={
  query:async(sql,params)=>{calls.push({sql,params});return [[]];},
  getConnection:async()=>{throw new Error('Debe configurar una conexion simulada para crear registros.');}
};
const originalLoad=Module._load;
let repo;
try{
  Module._load=function(request,parent,isMain){
    if(parent?.filename===REPO_FILE && request==='../../config/db')return fakeDb;
    if(parent?.filename===REPO_FILE && request==='./logistica-produccion-integridad'){
      return {assertSamePpns(a,b){if(String(a).trim()!==String(b).trim()){
        const error=new Error('PPNS diferentes: bloqueo de integridad.');error.status=409;throw error;
      }}};
    }
    return originalLoad.call(this,request,parent,isMain);
  };
  delete require.cache[require.resolve(REPO_FILE)];
  repo=require(REPO_FILE);
}finally{Module._load=originalLoad;}

function configureTransaction(currentStatus,{idPpns='P101'}={}){
  const tx={begun:0,commits:0,rollbacks:0,releases:0,locked:false,inserts:0,queries:[]};
  fakeDb.getConnection=async()=>({
    beginTransaction:async()=>{tx.begun++;},
    query:async(sql,params)=>{
      tx.queries.push({sql,params});
      if(/WHERE\s+l\.id_log_ops=\?/i.test(sql)){
        tx.locked=sql.includes('FOR UPDATE');
        return [[{id_log_ops:101,id_ppns:idPpns,proyecto:'Proyecto Prueba',estatus:currentStatus}]];
      }
      if(/INSERT INTO logistica_produccion\s/i.test(sql)){
        tx.inserts++;
        return [{insertId:707}];
      }
      throw new Error(`Consulta inesperada en mock: ${sql.slice(0,100)}`);
    },
    commit:async()=>{tx.commits++;},
    rollback:async()=>{tx.rollbacks++;},
    release:()=>{tx.releases++;}
  });
  return tx;
}
function createInput(ppns='P101'){
  return {id_log_ops:101,ppns,modo_registro:'MANUAL',id_estatus_produccion:null,semana:43,anio:2026};
}

test('busqueda manual: consulta exclusivamente las cuatro etapas previas con parametros SQL',async()=>{
  calls.length=0;
  await repo.projectOptions('');
  assert.equal(calls.length,1);
  const {sql,params}=calls[0];
  assert.match(sql,/FROM log_ops l/);
  assert.match(sql,/AND TRIM\(l\.estatus\) IN \(\?,\?,\?,\?\)/);
  assert.deepEqual(params,ALLOWED);
  assert.match(sql,/WHERE l\.proyecto IS NOT NULL AND TRIM\(l\.proyecto\)<>''/);
  assert.match(sql,/ORDER BY l\.proyecto,l\.id_log_ops/);
  assert.match(sql,/AS ya_registrado/);
});
test('busqueda manual: respeta busqueda original por proyecto o PPNS y la parametriza',async()=>{
  calls.length=0;
  await repo.projectOptions('  P2026  ');
  const {sql,params}=calls.at(-1);
  assert.deepEqual(params,[...ALLOWED,'%P2026%','%P2026%']);
  assert.match(sql,/l\.proyecto LIKE \? OR l\.id_ppns LIKE \?/);
});
test('consulta semiautomatica de PPNS sigue sin filtro de etapas (fuera de alcance)',async()=>{
  calls.length=0;
  await repo.ppnsOptions('P101');
  const {sql,params}=calls.at(-1);
  assert.doesNotMatch(sql,/TRIM\(l\.estatus\) IN/);
  assert.deepEqual(params,['%P101%','%P101%']);
});
test('consulta de detalle historico por ID permanece sin filtro de estatus',async()=>{
  calls.length=0;
  await repo.byId(707);
  const {sql,params}=calls.at(-1);
  assert.match(sql,/WHERE p\.id_produccion=\? AND p\.activo=1 LIMIT 1/);
  assert.doesNotMatch(sql,/TRIM\(l\.estatus\) IN/);
  assert.deepEqual(params,[707]);
});
for(const status of ALLOWED){
  test(`permite alta si el estatus actual es '${status}'`,async()=>{
    const tx=configureTransaction(status);
    const id=await repo.create(createInput(),10);
    assert.equal(id,707);
    assert.equal(tx.begun,1);assert.equal(tx.commits,1);assert.equal(tx.rollbacks,0);
    assert.equal(tx.releases,1);assert.equal(tx.inserts,1);assert.equal(tx.locked,true);
    assert(tx.queries.find(x=>/INSERT INTO logistica_produccion\s/i.test(x.sql)));
  });
}
for(const status of DISALLOWED){
  test(`rechaza alta cuando estatus actual NO es preproduccion: ${JSON.stringify(status)}`,async()=>{
    const tx=configureTransaction(status);
    await assert.rejects(repo.create(createInput(),10),error=>{
      assert.equal(error.status,409);
      assert.match(error.message,/etapa previa a Produccion/);
      return true;
    });
    assert.equal(tx.begun,1);assert.equal(tx.commits,0);assert.equal(tx.rollbacks,1);
    assert.equal(tx.inserts,0);assert.equal(tx.releases,1);assert.equal(tx.locked,true);
  });
}
test('rechaza proyectos que cambiaron de etapa entre la busqueda y el guardado',async()=>{
  const tx=configureTransaction('EN PRODUCCION');
  await assert.rejects(repo.create(createInput(),10),error=>error.status===409);
  assert.equal(tx.inserts,0);
  assert.equal(tx.rollbacks,1);
});
test('normaliza mayusculas, espacios y acentos cuando el estatus permitido varia en la fuente',async()=>{
  const tx=configureTransaction('  sin produccion / primera visita a obra  ');
  await repo.create(createInput(),10);
  assert.equal(tx.inserts,1);
  assert.equal(tx.commits,1);
});
test('se mantiene el bloqueo original de integridad PPNS en alta',async()=>{
  const tx=configureTransaction(ALLOWED[0],{idPpns:'P999'});
  await assert.rejects(repo.create(createInput('P101'),10),/PPNS diferentes/);
  assert.equal(tx.inserts,0);
  assert.equal(tx.rollbacks,1);
});
