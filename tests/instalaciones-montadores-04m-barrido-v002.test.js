'use strict';
// INT9 04-M V002 - aislamiento del barrido: sin Azure ni Aiven productivos.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const jobs=fs.readFileSync(path.join(__dirname,
  '../backend/src/jobs/instalacionesProgramacionMontadores.job.js'),'utf8');
const controls=fs.readFileSync(path.join(__dirname,
  '../backend/src/controllers/panel-control-montadores-scripts.controller.js'),'utf8');
const routes=fs.readFileSync(path.join(__dirname,
  '../backend/src/routes/panel-control.routes.js'),'utf8');
function fixture({equipos=[],relaciones=[],slow=false}={}){
  const called=[],sqls=[],released=[];
  let shouldHang=false;
  const db={async getConnection(){
    if(shouldHang)return new Promise(()=>{});
    const conn={release(){released.push(1);},async query(options,params){
      const sql=typeof options==='string'?options:options.sql;
      sqls.push({sql,params,timeout:options?.timeout});
      if(slow)return new Promise(()=>{});
      const source=sql.includes('LEFT JOIN ins_fl f')?
        relaciones.filter(x=>!equipos.includes(x)):equipos;
      return [source.filter(x=>x>params[0]).sort((a,b)=>a-b).slice(0,params[1])
        .map(id_ins_fl=>({id_ins_fl}))];
    }};
    return conn;
  }};
  const service={async reconcile(id,opts){
    called.push({id,opts});
    return {estado:'SIN_CAMBIOS',creadas:0,historicas:0};
  }};
  const holder={exports:{}};
  new Function('module','require','setTimeout','clearTimeout',jobs)(
    holder,name=>name==='../config/db'?db:
      name.endsWith('instalaciones-programacion-personal.montadores.service')?service:
      (()=>{throw Error('Dependencia de QA no declarada: '+name)})(),
    (fn)=>setTimeout(fn,0),clearTimeout
  );
  return {job:holder.exports,called,sqls,released,setHang(v){shouldHang=v;}};
}
test('04-M: la segunda capa solo inspecciona vinculos obsoletos, no vuelve a recorrer los 04-M',async()=>{
  const f=fixture({equipos:[10,20,30],relaciones:[10,20,42]});
  const result=await f.job.scanEquipos();
  assert.equal(result.interrumpida,false);
  assert.deepEqual(f.called.map(x=>x.id),[10,20,30,42]);
  assert.equal(result.total_equipos,4);
  assert.equal(result.fase,'FINALIZADA');
  assert.equal(f.released.length,f.sqls.length);
  assert.ok(f.sqls.every(x=>x.timeout===12000));
  assert.ok(f.called.every(x=>x.opts.poolTimeoutMs===8000&&x.opts.queryTimeoutMs===12000));
  assert.match(f.job._test.SOURCE_SQL.RELACIONES_OBSOLETAS,/LEFT JOIN ins_fl f/);
  assert.match(f.job._test.SOURCE_SQL.RELACIONES_OBSOLETAS,/TRIM\(f\.estatus\)<>'04-M'/);
});
test('04-M: cancelar detiene al terminar un lote sin repetir ni borrar datos previos',async()=>{
  const f=fixture({equipos:Array.from({length:18},(_,i)=>i+1)});
  let cancel=false;
  const r=await f.job.scanEquipos({onProgress:data=>{
    if(data.lotes_completados===1)cancel=true;
  },shouldStop:()=>cancel});
  assert.equal(r.interrumpida,true);
  assert.equal(r.motivo_interrupcion,'CANCELADO');
  assert.equal(r.total_equipos,5);
  assert.equal(f.called.length,5);
  assert.equal(r.lotes_completados,1);
});
test('04-M: las consultas y conexiones tienen limites de espera definidos',()=>{
  const f=fixture({equipos:[1]});
  assert.equal(f.job._test.stopReason(()=>true,Date.now(),0),'CANCELADO');
  assert.equal(f.job._test.stopReason(()=>false,Date.now()-9*60*1000,0),'TIEMPO_MAXIMO');
  assert.equal(f.job._test.stopReason(()=>false,Date.now(),3000),'LIMITE_EQUIPOS');
  assert.equal(f.job._test.stopReason(()=>false,Date.now(),0),null);
});
test('04-M: cancelacion requiere el ID exacto, no libera otra ejecucion',async()=>{
  let callbacks;
  const mockJob={scanEquipos:async({shouldStop,onProgress})=>{
    callbacks={shouldStop,onProgress};
    return new Promise(resolve=>{callbacks.resolve=resolve;});
  }};
  const holder={exports:{}};
  new Function('module','require',controls)(holder,name=>{
    if(name==='node:crypto')return {randomUUID:()=> '11111111-1111-4111-8111-111111111111'};
    if(name==='./panel-control-scripts.controller')return {authorize:()=>{}};
    if(name==='../jobs/instalacionesProgramacionMontadores.job')return mockJob;
    throw Error(name);
  });
  const control=holder.exports;
  function response(){return {code:200,status(n){this.code=n;return this;},
    json(x){this.body=x;return this;}};}
  const started=response();
  control.start({},started);
  assert.equal(started.code,202);
  const bad=response();
  control.cancel({body:{id:'22222222-2222-4222-8222-222222222222'}},bad);
  assert.equal(bad.code,404);assert.equal(callbacks.shouldStop(),false);
  const good=response();
  control.cancel({body:{id:started.body.data.id}},good);
  assert.equal(good.code,202);assert.equal(good.body.data.estado,'CANCELANDO');
  assert.equal(callbacks.shouldStop(),true);
  callbacks.resolve({interrumpida:true,motivo_interrupcion:'CANCELADO',
    total_equipos:5,creadas:2,historicas:0,revisiones:0,errores:0,detalles:[]});
  await new Promise(resolve=>setImmediate(resolve));
  const ended=response();control.status({},ended);
  assert.equal(ended.body.data.estado,'CANCELADO');
  assert.equal(ended.body.data.creadas,2);
});
test('04-M: el endpoint de cancelar comparte autenticacion y permiso del Programador',()=>{
  assert.match(routes,/router\.post\('\/pruebas-scripts\/conciliacion-montadores\/cancelar', requireAuth, montageTests\.authorize, montageTests\.cancel\)/);
});
