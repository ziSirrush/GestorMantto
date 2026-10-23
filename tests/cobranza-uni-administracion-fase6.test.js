'use strict';
// [BLT NOW | 2026-10-23 | COBRANZA_UNI_ADMINISTRACION_FASE_6_V001]
// Pruebas de integridad con MySQL simulado: no conecta a Aiven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'..');
const prefix='backend/src/modules/cobranza-uni-administracion/';
const moduleDir=path.join(root,prefix);
const guard=require(path.join(moduleDir,'cobranza-uni-administracion.gc-sync-guard'));
const policy=require(path.join(moduleDir,'cobranza-uni-administracion.constants'));
const editServiceSource=fs.readFileSync(path.join(moduleDir,'cobranza-uni-administracion.gc-edit-service.js'),'utf8');
const ctrlSource=fs.readFileSync(path.join(root,'backend/src/controllers/cobranza-uni.controller.js'),'utf8');

function fakeController({guardReady=true,manualProtectedIds=[],rejectQuery=false}={}) {
  const state={tx:0,commit:0,rollback:0,releases:0,protectCalls:[],queries:[],fkFiltered:null};
  const rows=new Map();
  const fields=policy.GC_COLUMNS_UNI.map(c=>c.name).filter(c=>c!=='id_gc'&&c!=='id_proyecto_cobranza');
  function row(id,overrides={}){return {id_gc:id,...Object.fromEntries(fields.map(f=>[f,null])),...overrides};}
  rows.set('101',row('101',{idns:'MANUAL-101',proyecto:'ALFA'}));
  rows.set('102',row('102',{idns:'ORIGINAL-102',proyecto:'BRAVO'}));
  const conn={
    async beginTransaction(){state.tx++;},
    async commit(){state.commit++;},
    async rollback(){state.rollback++;},
    release(){state.releases++;},
    async query(sql, params=[]){
      state.queries.push({sql,params});
      if(rejectQuery && sql.includes('UPDATE gestion_credito'))throw Error('Fallo de actualizacion');
      if(/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT)\b/.test(sql.trim()))return [{affectedRows:0}];
      if(/SELECT id_gc, idns,/.test(sql)&&/FOR UPDATE/.test(sql)){
        return [rows.has(String(params[0]))?[structuredClone(rows.get(String(params[0])))]:[]];
      }
      if(/INSERT INTO gestion_credito \(/.test(sql)){
        rows.set(String(params[0]),row(String(params[0]),{idns:params[1]}));
        return [{affectedRows:1}];
      }
      if(/UPDATE gestion_credito\s+SET/.test(sql)){
        const id=String(params[params.length-1]);
        rows.set(id,row(id,{...rows.get(id),idns:params[0]}));
        return [{affectedRows:1}];
      }
      throw Error('SQL inesperado: '+sql);
    }
  };
  const guardDeps={
    async guardAvailable_uni(executor){assert.equal(executor,conn);return guardReady;},
    async isManuallyProtected_uni(executor,id){
      assert.equal(executor,conn);
      const last=state.queries[state.queries.length-1];
      assert.match(last.sql,/FOR UPDATE/); // fila bloqueada ANTES de consultar guard
      state.protectCalls.push(String(id));
      return manualProtectedIds.includes(String(id));
    }
  };
  const module={exports:{}};
  function requireMock(name){
    if(name==='../config/db')return {getConnection:async()=>conn};
    if(name.endsWith('fk-validator.service'))return {validarDespuesSync:async data=>{
      state.fkFiltered=data.rows.filter((r,i)=>!data.summary.errors.some(e=>e.index===i)).map(r=>r.id_gc);
    }};
    if(name.endsWith('gc-sync-guard'))return guardDeps;
    throw Error('Import desconocido controlador: '+name);
  }
  vm.runInNewContext(ctrlSource,{module,exports:module.exports,require:requireMock,Date,Map,Set,BigInt,Number,Array});
  const response={status:200,data:null,json(body){this.data=body;return this;},status(code){this.statusCode=code;return this;}};
  async function sync(incoming){await module.exports.syncCobranzaUni({body:{rows:incoming}},response);return response.data;}
  return {sync,state,rows,row};
}

test('F6: registro administrativo de proteccion se hace por connection de la transaccion',async()=>{
  let sql,args;
  const conn={async query(s,p){sql=s;args=p;return [{affectedRows:1}]}};
  const ok=await guard.markManualEdit_uni(conn,{id:'9007199254740993',actor:17,field:'idns'});
  assert.equal(ok,true);
  assert.match(sql,/INSERT INTO `cobranza_uni_gc_admin_guard`/);
  assert.match(sql,/ON DUPLICATE KEY UPDATE/);
  assert.deepEqual(args,['9007199254740993',17,'idns']);
  await assert.rejects(guard.markManualEdit_uni(conn,{id:'1 OR 1=1',actor:17,field:'idns'}),/ID/);
  await assert.rejects(guard.markManualEdit_uni(conn,{id:'2',actor:0,field:'idns'}),{code:'GC_ADMIN_PROTECCION_INVALIDA'});
});

test('F6: sin migracion el sync anterior sigue activo y el editor no puede marcar',async()=>{
  const conn={async query(){const e=new Error('tabla inexistente');e.code='ER_NO_SUCH_TABLE';throw e;}};
  assert.equal(await guard.guardAvailable_uni(conn),false);
  await assert.rejects(guard.markManualEdit_uni(conn,{id:'2',actor:1,field:'cliente'}),/tabla inexistente/);
  const bad={async query(){throw new Error('Fallo inesperado de BD');}};
  await assert.rejects(guard.guardAvailable_uni(bad),/Fallo inesperado/);
});

test('F6: proteccion positiva y negativa por id',async()=>{
  const conn={async query(sql,params){assert.match(sql,/WHERE id_gc = \? LIMIT 1/);
    return [String(params[0])==='2'?[{id_gc:'2'}]:[]];}};
  assert.equal(await guard.isManuallyProtected_uni(conn,'2'),true);
  assert.equal(await guard.isManuallyProtected_uni(conn,'3'),false);
});

test('F6: GAS no sobrescribe registro humano, continua con otros y omite FK posterior',async()=>{
  const f=fakeController({manualProtectedIds:['101']});
  const result=await f.sync([
    f.row('101',{idns:'DATO ANTIGUO',proyecto:'ALFA'}),
    f.row('102',{idns:'NUEVO 102',proyecto:'BRAVO'}),
    f.row('103',{idns:'NUEVO 103',proyecto:'CHARLIE'})
  ]);
  assert.equal(result.ok,true);
  assert.equal(result.proteccion_administrativa,'ACTIVA');
  assert.equal(result.protected_manual,1);
  assert.equal(result.rejected,1);
  assert.equal(result.updated,1);
  assert.equal(result.inserted,1);
  assert.equal(f.rows.get('101').idns,'MANUAL-101');
  assert.equal(f.rows.get('102').idns,'NUEVO 102');
  assert.equal(f.rows.get('103').idns,'NUEVO 103');
  assert.equal(result.errors[0].code,'GC_ADMIN_CONFLICTO_SYNC_HUMANO');
  assert.deepEqual(f.state.fkFiltered,['102','103']);
  assert.equal(f.state.commit,1);
  assert.equal(f.state.rollback,0);
  assert.equal(f.state.releases,1);
});

test('F6: GAS tampoco reconcilia FK de un registro protegido sin diferencias',async()=>{
  const f=fakeController({manualProtectedIds:['101']});
  const result=await f.sync([f.row('101',{idns:'MANUAL-101',proyecto:'ALFA'})]);
  assert.equal(result.protected_manual,1);
  assert.equal(result.rejected,1);
  assert.equal(result.unchanged,0);
  assert.equal(f.rows.get('101').idns,'MANUAL-101');
  assert.deepEqual(f.state.fkFiltered,[]);
});

test('F6: sin proteccion desplegada GAS conserva comportamiento original',async()=>{
  const f=fakeController({guardReady:false});
  const result=await f.sync([f.row('101',{idns:'ORIGEN GAS',proyecto:'ALFA'})]);
  assert.equal(result.proteccion_administrativa,'MIGRACION_PENDIENTE');
  assert.equal(result.updated,1);
  assert.equal(result.protected_manual,0);
  assert.equal(f.rows.get('101').idns,'ORIGEN GAS');
});

test('F6: motor de edicion exige marcador dentro de la transaccion y antes de audit',()=>{
  assert.match(editServiceSource,/await protect\(conn,\{id,field,actor:effectiveId_uni\(req\)\}\)/);
  assert.ok(editServiceSource.indexOf('await protect(')<editServiceSource.indexOf('await audit('));
  assert.match(editServiceSource,/conn\.rollback/);
  assert.match(ctrlSource,/FOR UPDATE/);
});

test('F6: SQL de tabla guard no toca tablas financieras ni concede permisos',()=>{
  const sql=fs.readFileSync(path.join(root,'database/migrations/20261023_cobranza_uni_administracion_fase6_proteccion_sync.sql'),'utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS `cobranza_uni_gc_admin_guard`/);
  assert.match(sql,/PRIMARY KEY \(`id_gc`\)/);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|DROP|TRUNCATE)\s+`?gestion_credito/i);
  assert.doesNotMatch(sql,/\bINSERT INTO rol_permisos\b/i);
});
